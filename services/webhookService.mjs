import crypto from "crypto";
import Razorpay from "razorpay";
import { Not } from "typeorm";

// Local imports
import { logger } from "../utils/logger-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Orders } from "../entities/Orders.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Payments } from "../entities/Payments.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { ORDER_VENDOR_STATUS, ORDER_STATUS, ROLE, MISC, PAYMENT_ATTEMPT } from "../types/enums/index.mjs";
import { PaymentFailures } from "../entities/PaymentFailures.mjs";
import { Outbox } from "../entities/Outbox.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { pushQueue, emailQueue, notificationHistoryQueue } from "../queues/index.mjs";
import { Refunds } from "../entities/Refunds.mjs";
import { VendorStats } from "../entities/VendorStats.mjs";
import { OrderStatusTimeline } from "../entities/orderStatusTimeline.mjs";
import { Payouts } from "../entities/Payouts.mjs";
import { PaymentAttempts } from "../entities/PaymentAttempts.mjs";

const refundRepo = AppDataSource.getRepository(Refunds);

//=================== HELPER FUNCTIONS ====================

/**
 * @description A crucial helper to create an audit trail entry in the OrderStatusTimeline table.
 * It records the transition of an order from one state to another, who changed it, and when.
 * THIS MUST ALWAYS BE CALLED WITHIN AN ACTIVE DATABASE TRANSACTION to ensure data consistency.
 * @param {import('typeorm').QueryRunner} queryRunner - The active TypeORM query runner.
 * @param {string} orderId - The UUID of the order being updated.
 * @param {string|null} previousStatus - The status the order is transitioning from (null for creation).
 * @param {string} newStatus - The new status of the order.
 * @param {string} changedById - The UUID of the user or system responsible for the change.
 * @param {string} changedByRole - The role of the entity making the change (e.g., 'CUSTOMER', 'SYSTEM').
 * @param {string|null} [notes=null] - Optional notes providing context for the status change.
 * @returns {Promise<void>}
 */
export const createTimelineEntry = async (queryRunner, orderId, previousStatus, newStatus, changedById, changedByRole, notes = null) => {
    const timelineEntry = queryRunner.manager.create(OrderStatusTimeline, {
        orderId,
        previousStatus,
        newStatus,
        changedBy: changedById,
        changedByRole,
        notes,
        changedAt: new Date()
    });
    await queryRunner.manager.save(OrderStatusTimeline, timelineEntry);
};

//=================== WEBHOOK HANDLER ====================


/**
 * @api {post} /api/webhook/handleRazorpayPaymentWebhook Razorpay Payment Webhook
 * @apiName HandleRazorpayPaymentWebhook
 * @apiGroup Webhook
 * @apiDescription
 * This is the primary endpoint for receiving and processing payment-related events from Razorpay.
 * It is designed to be secure, idempotent, and transactional.
 *
 * ### Event Flow:
 *
 * 1.  **Signature Verification**: The first step is to cryptographically verify the webhook signature to ensure the request is genuinely from Razorpay.
 *
 * 2.  **`payment.failed` Event**: If a payment fails, this webhook captures the failure details and logs them in the `PaymentFailures` table for auditing and analysis, without affecting any existing order data.
 *
 * 3.  **`payment.captured` Event**: This is the most critical flow. When a payment is successful, this block executes a large database transaction to:
 * -   **Validate**: It locks the order row to prevent race conditions and verifies that the order is still `PENDING` and the payment amount matches the final quote.
 * -   **Update Entities**: It creates a `Payments` record, marks the `OrderQuote` as processed, and updates the main `Order` entity with the selected vendor, payment details, and transitions its status to `IN_PROGRESS`.
 * -   **Update Related Entities**: It finalizes the order for the chosen vendor (`FINALIZED`), freezes the order for all other vendors who quoted (`FROZEN`), and increments the vendor's `in-progress` order stats.
 * -   **Trigger Logistics**: If the order requires the customer to provide cloth, it creates `DeliveryTracking` and `Outbox` records to initiate the pickup process via a separate worker.
 * -   **Queue Notifications**: After a successful transaction, it queues a series of push notifications and emails to both the customer and the vendor.
 *
 * @apiWarning **Fail-Safe Refund Mechanism**: If any step within the `payment.captured` database transaction fails, the entire transaction is rolled back. The `catch` block then immediately triggers an API call to Razorpay to refund the entire payment to the customer. This ensures the customer is never charged if the system fails to process their order correctly. This is a critical safety feature.
 *
 * @apiError {Error} 400 - If the webhook signature is invalid.
 * @apiError {Error} 500 - If processing fails and a refund is attempted.
 */
export const handleRazorpayPaymentWebhook = async(req, res) => {
    
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    if (signature !== expectedSignature) {
        logger.warn("Invalid Razorpay webhook signature received.");
        return res.status(400).json({ status: "Signature mismatch" });
    }

    const { event, payload } = req.body;
    const paymentEntity = payload.payment.entity;
    const paymentId = paymentEntity.id;
    let notificationDetails = null;

    if (event === 'payment.failed') {
        try {
            const { orderId, quoteId, customerId } = paymentEntity.notes;
            await AppDataSource.getRepository(PaymentFailures).save({
                orderId, quoteId, customerId,
                paymentId: paymentId,
                amount: paymentEntity.amount / 100,
                reason: paymentEntity.error_description || "Unknown reason",
                status: paymentEntity.status,
                timestamp: new Date(paymentEntity.created_at * 1000),
            });
            logger.info(`Recorded failed payment: ${paymentId}`);
            return res.status(200).json({ status: "Received" });
        } catch (err) {
            logger.error(`Error saving payment failure for ${paymentId}`, err);
            return res.status(500).json({ status: "Error" });
        }
    }

    if (event === 'payment.captured') {

        const paymentExists = await AppDataSource.getRepository(Payments).exists({ where: { razorpayPaymentId: paymentId } });
        if (paymentExists) {
            logger.info(`Duplicate webhook for already processed payment: ${paymentId}`);
            return res.status(200).json({ status: "Already processed" });
        }

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { orderId, quoteId, vendorId, customerId } = paymentEntity.notes;

            // ATOMIC VALIDATION: Fetch and lock the order and quote for update
            const order = await queryRunner.manager.findOne(Orders, {
                where: { id: orderId, orderStatus: ORDER_STATUS.PENDING },
                lock: { mode: "pessimistic_write" } // Lock the row to prevent race conditions
            });
            const quote = await queryRunner.manager.findOne(OrderQuotes, { where: { id: quoteId } });

            if (!order || !quote || (paymentEntity.amount !== Math.round(quote.finalPrice * 100))) {
                throw new Error("Validation failed: Order/quote mismatch or amount incorrect.");
            }

            const paymentDate = new Date(paymentEntity.created_at * 1000);
            const payment = queryRunner.manager.create(Payments, {
                orderId, 
                vendorId, 
                customerId, 
                quoteId,
                razorpayPaymentId: paymentId,
                paymentAmount: paymentEntity.amount / 100,
                paymentCurrency: paymentEntity.currency,
                paymentMethod: paymentEntity.method,
                paymentStatus: paymentEntity.status,
                paymentDate,
            });
            await queryRunner.manager.save(Payments, payment);

            quote.isProcessed = true;
            await queryRunner.manager.save(OrderQuotes, quote);

            order.selectedVendorId = vendorId;
            order.finalQuoteId = quoteId;
            order.paymentId = payment.id;
            order.isPaid = true;

            // IDEMPOTENCY UPDATE: Update the payment attempt to PAID which is having PENDING status. This is to ensure that the payment attempt is not created again.
            const paymentAttempt = await queryRunner.manager.findOne(PaymentAttempts, { where: { quoteId, status: PAYMENT_ATTEMPT.PENDING } });
            if (paymentAttempt) {
                await queryRunner.manager.update(PaymentAttempts, paymentAttempt.id, { status: PAYMENT_ATTEMPT.PAID });
            }

            await createTimelineEntry(queryRunner, orderId, order.orderStatus, ORDER_STATUS.IN_PROGRESS, MISC.PAYMENT_GATEWAY, ROLE.SYSTEM, `Payment successful. Razorpay ID: ${paymentId}`);

            if (order.clothProvided) {
                // Create Outbox event for 2-way delivery
                // GENERATE DELIVERY TRACKING ID 
                // IF THE DELIVERY SERVICE NEED TO AVOID CHARACTERS, THEN ADD AN RANDOM/SEQUENTIAL NUMBER BY SETTING THE FIELD AS UNIQUE
                const deliveryTracking = await queryRunner.manager.save(DeliveryTracking, { 
                    orderId, 
                    deliveryType: "TO_VENDOR", 
                    from: "CUSTOMER", 
                    to: "VENDOR", 
                    status: "PENDING",
                    statusUpdateTimeStamp: {
                        initiated_at: new Date(),
                        pickup_assigned_at: null,
                        pickup_in_transit_at: null,
                        pickup_completed_at: null,
                        delivery_in_transit_at: null,
                        delivery_completed_at: null,
                        delivery_failed_at: null,
                        delivery_cancelled_at: null,
                    },
                });

                // INITIATE CLOTH PICKUP FROM CUSTOMER, use OUTBOX pattern as this block is in a transaction
                await queryRunner.manager.save(Outbox, { 
                    eventType: "INITIATE_PICKUP", 
                    payload: { 
                        deliveryTrackingId: deliveryTracking.id, 
                        orderId 
                    } ,
                    status: "PENDING",
                    createdAt: new Date()
                });

                await createTimelineEntry(queryRunner, orderId, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED, MISC.LOGISTICS, ROLE.SYSTEM, "Pickup from customer scheduled");
            } else {
                await createTimelineEntry(queryRunner, orderId,  ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.WORK_STARTED, ROLE.SYSTEM, ROLE.SYSTEM, "Work started triggered by System for order with no cloth provided");
            }

            order.orderStatus = ORDER_STATUS.IN_PROGRESS;
            order.orderStatusTimestamp.inProgressAt = paymentDate.toString();

            await queryRunner.manager.save(Orders, order);
            await queryRunner.manager.update(VendorStats, { vendorId }, { totalInProgressOrders: () => "totalInProgressOrders + 1" });
            await queryRunner.manager.update(OrderVendors, { orderId, vendorId }, { status: ORDER_VENDOR_STATUS.FINALIZED });
            await queryRunner.manager.update(OrderVendors, { orderId, vendorId: Not(vendorId) }, { status: ORDER_VENDOR_STATUS.FROZEN });

            await queryRunner.commitTransaction();
            logger.info(`Successfully processed payment and updated order: ${paymentId}`);
            
            notificationDetails = { orderId, vendorId, customerId };

            res.status(200).json({ status: "Success" });

        } catch (err) {
            if (queryRunner.isTransactionActive) {
                await queryRunner.rollbackTransaction();
            }
            logger.error(`Webhook processing failed for payment ${paymentId}. Initiating refund.`, err);
            
            // FAIL-SAFE: If anything in DB fails, refund to the customer.
            try {
                const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
                const refund = await razorpay.payments.refund(paymentId, { speed: "normal", notes: { reason: "Internal server error during order processing." } });
                await refundRepo.save({
                    paymentId: paymentId,
                    amount: refund.amount,
                    status: refund.status,
                    speedRequested: refund.speed_requested,
                    speedProcessed: refund.speed_processed,
                    notes: "Internal server error during order processing.",
                });

                logger.info(`Successfully refunded payment ${paymentId}`);
            } catch (refundError) {
                try{
                    await refundRepo.save({
                        paymentId: paymentId,
                        status: "failed",
                        notes: "Internal server error during order processing.",
                        comment: refundError
                    });
                } catch(err2) {
                    logger.error("Error in refundRazorpayPayment service:", err2);
                }
                logger.error(`CRITICAL: FAILED TO REFUND PAYMENT ${paymentId}. MANUAL INTERVENTION REQUIRED.`, refundError);
            }
            
            res.status(500).json({ status: "Error processing webhook" });
        } finally {
            await queryRunner.release();
        }
    } else {
        res.status(200).json({ status: "Webhook received" });
    }

    // Queue notifications for customer and vendor about successful payment

    if (notificationDetails) {
        try {
            const { orderId, vendorId, customerId } = notificationDetails;

            const customerDetails = await AppDataSource.getRepository(Customers).findOne({ where: { id: customerId }, relations: { user: true } });
            
            const vendorDetails = await AppDataSource.getRepository(Vendors).findOne({ where: { id: vendorId }, relations: { user: true } });

            // Customer Notifications
            if (customerDetails?.user) {
                if (customerDetails.user.pushToken) {
                    pushQueue.add('paymentSuccessCustomer', {
                        token: customerDetails.user.pushToken,
                        title: "Order Confirmed!",
                        message: `Your payment for order #${orderId.substring(0, 8)} was successful.`,
                        data: { url: '/(customer)/(portal)/orders' }
                    });
                }
                emailQueue.add('paymentSuccessCustomerEmail', {
                    email: customerDetails.user.email,
                    name: customerDetails.user.name,
                    template_id: 'customer_order_confirmation',
                    variables: { orderId, paymentId }
                });

                notificationHistoryQueue.add("saveNotificationHistory", {
                    userId: customerDetails.user.id,
                    title: "Order Confirmed!",
                    body: `Your payment for order #${orderId.substring(0, 8)}... was successful.`,
                    timestamp: new Date(),
                });
            }

            // Vendor Notifications
            if (vendorDetails?.user) {
                if (vendorDetails.user.pushToken) {
                    pushQueue.add('newOrderForVendor', {
                        token: vendorDetails.user.pushToken,
                        title: "Order Confirmed !!!",
                        message: `You have received a new paid order: #${orderId.substring(0, 8)}.`,
                        data: { url: '/(vendor)/(portal)/orders' }
                    });
                }
                emailQueue.add('newOrderForVendorEmail', {
                    email: vendorDetails.user.email,
                    name: vendorDetails.user.name,
                    template_id: 'vendor_new_order_alert',
                    variables: { orderId }
                });

                notificationHistoryQueue.add("saveNotificationHistory", {
                    userId: vendorDetails.user.id,
                    title: "You Have a New Order!",
                    body: `You have received a new paid order: #${orderId.substring(0, 8)}...`,
                    timestamp: new Date(),
                });
            }

        } catch (notificationError) {
            logger.error(`Failed to queue notifications for order ${notificationDetails.orderId}`, notificationError);
        }
    }
}

//=================== HELPER FUNCTION ====================
/**
 * @description Creates a standardized update payload for the Payouts entity based on the webhook data.
 * @param {object} payout - The existing payout entity from the database.
 * @param {object} payoutEntity - The `entity` object from the Razorpay webhook payload.
 * @param {string} statusKey - The internal key representing the current status.
 * @returns {object} The object to be used for updating the payout record.
 */
const createUpdatePayload = (payout, payoutEntity, statusKey) => {
    const dateObject = new Date(payoutEntity.created_at * 1000);
    const isoString = dateObject.toISOString();
    return {
        status: payoutEntity.status,
        payout_status_history: {
            ...payout.payout_status_history,
            [`${statusKey}_at`]: isoString,
        },
        payout_status_description: {
            ...payout.payout_status_description,
            [statusKey]: payoutEntity.status_details.description,
        },
    };
};
//=================== END OF HELPER FUNCTION ====================


/**
 * @api {post} /api/webhook/handleRazorpayPayoutWebhook Razorpay Payout Webhook
 * @apiName HandleRazorpayPayoutWebhook
 * @apiGroup Webhook
 * @apiDescription
 * This endpoint processes status updates for vendor payouts from RazorpayX. It tracks the entire lifecycle of a payout from creation to completion or failure.
 * The logic is designed to be secure, idempotent, and transactional.
 *
 * ### Payout Lifecycle Events Handled:
 * - `payout.pending`: Payout is created but pending approval.
 * - `payout.rejected`: Payout was rejected by an admin.
 * - `payout.queued`: Payout is approved and in the queue for processing by the bank.
 * - `payout.initiated`: Bank processing has started.
 * - `payout.processed`: Payout was successful. The UTR is recorded.
 * - `payout.reversed`: Payout was reversed by the bank after being marked successful.
 * - `payout.failed`: Payout failed. The failure reason is recorded.
 * - `payout.updated`: A generic event that can signify a change to any of the above states.
 *
 * ### Event Flow:
 *
 * 1.  **Signature Verification**: Cryptographically verifies the webhook signature to ensure authenticity.
 * 2.  **Find Payout**: Locates the corresponding payout record in the database using the `payout_id` from the webhook.
 * 3.  **Event Mapping**: Uses an `eventHandlers` map to translate the incoming Razorpay event into a consistent internal key (e.g., `payout.rejected` maps to `payout_rejected`). A separate map (`statusToDbKeyMap`) is used for the generic `payout.updated` event to ensure the correct key is used.
 * 4.  **Idempotency Check**: Before processing, it checks the `payout_status_history` JSONB field. If a timestamp already exists for the current event (e.g., `payout_rejected_at` is not null), the webhook is considered a duplicate and is ignored.
 * 5.  **Transactional Update**: All database changes occur within a transaction. It updates the payout's `status`, and adds a new timestamp and description to the `payout_status_history` and `payout_status_description` JSONB columns.
 *
 * @apiError {Error} 400 - If the webhook signature is invalid or the payload is missing required fields.
 * @apiError {Error} 500 - If any part of the database transaction fails.
 */
export const handleRazorpayPayoutWebhook = async(req, res) => {

    const secret = process.env.RAZORPAYX_PAYOUT_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    try {
        const expectedSignature = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
        if (signature !== expectedSignature) {
            logger.warn("Invalid Razorpay webhook signature received.");
            return res.status(400).json({ status: "Signature mismatch" });
        }
    } catch (err) {
        logger.error("Error during signature verification.", err);
        return res.status(400).json({ status: "Invalid request body" });
    }

    const { event, payload } = req.body;
    const payoutEntity = payload.payout.entity;
    const payoutId = payoutEntity.id;
    
    if (!event || !payoutId) {
        return res.status(400).json({ status: "Missing event or payout ID" });
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const payout = await queryRunner.manager.findOne(Payouts, {
            where: { payout_id: payoutId },
        });

        if (!payout) {
            logger.info(`Webhook received for a payout not found in our system: ${payoutId}`);
            // Return 200 OK as the webhook itself is valid
            return res.status(200).json({ status: "Payout not found" });
        }

        const eventHandlers = {
            'payout.pending':   { key: 'pending_for_approval' },
            'payout.rejected':  { key: 'payout_rejected' },
            'payout.queued':    { key: 'queued' },
            'payout.initiated': { key: 'processing' },
            'payout.reversed':  { key: 'reversed' },
            'payout.processed': { 
                key: 'processed', 
                extra: { utr: payoutEntity.utr } 
            },
            'payout.failed': { 
                key: 'failed', 
                extra: { failure_reason: payoutEntity.status_details.reason }
            },
            // The 'payout.updated' event is generic. We map its status to a key.
            'payout.updated': {
                key: payoutEntity.status, // e.g., 'processed', 'reversed'
                extra: { utr: payoutEntity.utr } // UTR might be updated
            }
        };

        const handler = eventHandlers[event];

        if (!handler) {
            logger.info(`No handler for webhook event: ${event}`);
            return res.status(200).json({ status: `No handler for ${event}` });
        }
        
        if (payout.payout_status_history[`${handler.key}_at`]) {
            logger.info(`Duplicate webhook for already processed payout: ${payoutId}, event: ${event}`);
            return res.status(200).json({ status: "Already processed" });
        }

        const updatePayload = createUpdatePayload(payout, payoutEntity, handler.key);
        const finalPayload = { ...updatePayload, ...handler.extra };

        await queryRunner.manager.update(Payouts, { payout_id: payoutId }, finalPayload);

        await queryRunner.commitTransaction();
        logger.info(`Successfully processed webhook for payout: ${payoutId}, event: ${event}`);

        return res.status(200).json({ status: "Success" });

    } catch (err) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        logger.error(`Webhook processing failed for payout ${payoutId}.`, err);
        return res.status(500).json({ status: "Error processing webhook" });
    } finally {
        await queryRunner.release();
    }
}