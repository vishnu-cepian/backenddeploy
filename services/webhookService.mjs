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
import { ORDER_VENDOR_STATUS, ORDER_STATUS, ROLE, MISC } from "../types/enums/index.mjs";
import { PaymentFailures } from "../entities/PaymentFailures.mjs";
import { Outbox } from "../entities/Outbox.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { pushQueue, emailQueue } from "../queues/index.mjs";
import { Refunds } from "../entities/Refunds.mjs";
import { VendorStats } from "../entities/VendorStats.mjs";
import { OrderStatusTimeline } from "../entities/orderStatusTimeline.mjs";

const refundRepo = AppDataSource.getRepository(Refunds);

//=================== HELPER FUNCTIONS ====================

/**
 * A reusable helper to create an entry in the OrderStatusTimeline table.
 * Must be called within an active transaction.
 * @param {QueryRunner} queryRunner - The active TypeORM query runner.
 * @param {string} orderId - The ID of the order.
 * @param {string|null} previousStatus - The previous status of the order.
 * @param {string} newStatus - The new status of the order.
 * @param {string} changedById - The ID of the user/system making the change.
 * @param {string} changedByRole - The role of the user/system.
 * @param {string|null} notes - Optional notes about the status change.
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
 * Handles incoming webhooks from Razorpay to process payment events.
 * This function is secure, idempotent, and transactional.
 *
 * @param {Object} req 
 * @param {Object} res 
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
                        url: "/orders",
                        data: { orderId, type: 'PAYMENT_SUCCESS' }
                    });
                }
                emailQueue.add('paymentSuccessCustomerEmail', {
                    email: customerDetails.user.email,
                    name: customerDetails.user.name,
                    template_id: 'customer_order_confirmation',
                    variables: { orderId, paymentId }
                });
            }

            // Vendor Notifications
            if (vendorDetails?.user) {
                if (vendorDetails.user.pushToken) {
                    pushQueue.add('newOrderForVendor', {
                        token: vendorDetails.user.pushToken,
                        title: "You Have a New Order!",
                        message: `You have received a new paid order: #${orderId.substring(0, 8)}.`,
                        url: "/orders",
                        data: { orderId, type: 'NEW_PAID_ORDER' }
                    });
                }
                emailQueue.add('newOrderForVendorEmail', {
                    email: vendorDetails.user.email,
                    name: vendorDetails.user.name,
                    template_id: 'vendor_new_order_alert',
                    variables: { orderId }
                });
            }

        } catch (notificationError) {
            logger.error(`Failed to queue notifications for order ${notificationDetails.orderId}`, notificationError);
        }
    }
}
