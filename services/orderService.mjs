import { z } from "zod";
import crypto from "crypto";
import Razorpay from "razorpay";
import { In, Not, IsNull } from "typeorm";
import QueryRunner from "typeorm";

// Local imports
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Orders } from "../entities/Orders.mjs";
import { OrderItems } from "../entities/OrderItems.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Payments } from "../entities/Payments.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { ORDER_VENDOR_STATUS, ORDER_STATUS, SERVICE_TYPE, ROLE, MISC } from "../types/enums/index.mjs";
import { calculateVendorPayoutAmount, calculateOrderAmount } from "../utils/pricing_utils.mjs";
import { PaymentFailures } from "../entities/PaymentFailures.mjs";
import { Outbox } from "../entities/Outbox.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { pushQueue, emailQueue } from "../queues/index.mjs";
import { getPresignedViewUrl } from "../services/s3service.mjs";
import { OrderStatusTimeline } from "../entities/orderStatusTimeline.mjs";
import { Refunds } from "../entities/Refunds.mjs";

const orderRepo = AppDataSource.getRepository(Orders);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);
const refundRepo = AppDataSource.getRepository(Refunds);

//========================= ZOD VALIDATION SCHEMAS =========================

const orderItemSchema = z.object({
    itemName: z.string().min(1, { message: "Item name is required" }),
    itemType: z.string().min(1, { message: "Item type is required" }),
    itemCount: z.number().int().positive({ message: "Item count must be a positive number" }),
    fabricType: z.string().min(1, { message: "Fabric type is required" }),
    instructions: z.string().optional().nullable().default(null),
    dressCustomisations: z.any().optional().nullable().default(null),
    measurementType: z.string().min(1, { message: "Measurement type is required" }).nullable(),
    laundryService: z.string().optional().nullable().default(null),
    stdMeasurements: z.string().optional().nullable().default(null),
    customMeasurements: z.any().optional().nullable().default(null),
    designImage1: z.string().optional().nullable().default(null),
    designImage2: z.string().optional().nullable().default(null),
}).refine(data => {
    if (!data.laundryService) {
        if (data.stdMeasurements && data.customMeasurements) {
            return false; // Only one of custom/standard measurements can be provided
        }
        if (data.itemCount <= 5 && !data.customMeasurements && !data.stdMeasurements) {
            return false; // Custom/standard measurements are required for small quantities
        } else if (data.itemCount > 5 && !data.stdMeasurements) {
            return false; // Standard measurements are required for large quantities
        }
    }
    return true;
}, {
    message: "Either custom/standard measurements (for quantity <= 5) or standard measurements (for quantity > 5) must be provided.",
});

const createOrderSchema = z.object({
    userId: z.string().uuid(),
    orderName: z.string().min(1, { message: "Order name is required" }),
    orderType: z.string().min(1, { message: "Order type is required" }),
    serviceType: z.enum(Object.values(SERVICE_TYPE), { message: "Invalid service type" }),
    orderPreference: z.string().min(1, { message: "Order preference is required" }),
    requiredByDate: z.string().refine((date) => new Date(date) > new Date(), {
        message: "Required by date must be in the future",
    }),
    clothProvided: z.boolean(),
    fullName: z.string().min(1, { message: "Full name is required" }),
    phoneNumber: z.string().regex(/^(?:\+91|91)?[6789]\d{9}$/, { message: "Invalid phone number format" }), // 91XXXXXXXXX
    addressLine1: z.string().min(1, { message: "Address line 1 is required" }),
    addressLine2: z.string().optional().nullable(),
    addressType: z.string().optional().nullable(),
    street: z.string().min(1, { message: "Street is required" }),
    city: z.string().min(1, { message: "City is required" }),
    district: z.string().min(1, { message: "District is required" }),
    landmark: z.string().optional().nullable(),
    state: z.string().min(1, { message: "State is required" }),
    pincode: z.string().regex(/^\d{6}$/, { message: "Invalid pincode format" }),
    orderItems: z.array(orderItemSchema).min(1, "At least one order item is required").max(5, "Cannot exceed 5 items per order"),
});

const sendOrderToVendorSchema = z.object({
    userId: z.string().uuid(),
    orderId: z.string().uuid(),
    vendorIds: z.array(z.string().uuid()).min(1, "At least one vendor ID is required").max(10, "Cannot send to more than 10 vendors at a time"),
});

const vendorOrderResponseSchema = z.object({
    userId: z.string().uuid(),
    orderVendorId: z.string().uuid(),
    action: z.enum([ORDER_VENDOR_STATUS.ACCEPTED, ORDER_VENDOR_STATUS.REJECTED]),
    quotedPrice: z.number().positive().optional(),
    quotedDays: z.number().int().positive().optional(),
    notes: z.string().max(500).optional(),
}).refine(data => {
    if (data.action === ORDER_VENDOR_STATUS.ACCEPTED) {
        return data.quotedPrice !== undefined && data.quotedDays !== undefined;
    }
    return true;
}, {
    message: "Quoted price and days are required when accepting an order.",
});

const createRazorpayOrderSchema = z.object({
    userId: z.string().uuid(),
    orderId: z.string().uuid(),
    quoteId: z.string().uuid(),
});

//=================== HELPER FUNCTIONS ====================

/**
 * A reusable helper to create an entry in the OrderStatusTimeline table.
 * Must be called within an active transaction.
 * @param {QueryRunner} queryRunner - The active TypeORM query runner.
 * @param {string} orderId - The ID of the order.
 * @param {string} newStatus - The new status of the order.
 * @param {string|null} previousStatus - The previous status of the order.
 * @param {string} changedById - The ID of the user/system making the change.
 * @param {string} changedByRole - The role of the user/system.
 * @param {string|null} notes - Optional notes about the status change.
 */

const createTimelineEntry = async (queryRunner, orderId, previousStatus, newStatus, changedById, changedByRole, notes = null) => {
    const timelineEntry = queryRunner.manager.create(OrderStatusTimeline, {
        orderId,
        previousStatus,
        newStatus,
        changedBy: changedById,
        changedByRole,
        notes,
    });
    await queryRunner.manager.save(OrderStatusTimeline, timelineEntry);
};

//========================= ORDER CREATION AND MANAGEMENT =========================

/**
 * Creates a new order
 *
 * @param {Object} data - The raw order data from the request.
 * @returns {Promise<Object>} An object containing the new order's ID.
 */
export const createOrder = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { userId, orderName, orderType, serviceType, orderPreference, requiredByDate, clothProvided,
                fullName, phoneNumber, addressLine1, addressLine2, district, state, street, city, pincode, 
                landmark, addressType, orderItems } = createOrderSchema.parse(data);

        const customer = await queryRunner.manager.findOne(Customers, { where: { userId: userId }, select: { id: true} });
        if (!customer) throw sendError("Customer profile not found", 404);

        const order = await queryRunner.manager.save(Orders, {
            customerId: customer.id,
            orderName,
            orderType,
            serviceType,
            orderPreference,
            requiredByDate: new Date(requiredByDate),
            clothProvided: clothProvided,
            fullName,
            phoneNumber,
            addressLine1,
            addressLine2,
            addressType,
            street,
            city,
            district,
            state,
            pincode,
            landmark,
            orderStatus: ORDER_STATUS.PENDING,
            isPaid: false,
            orderStatusTimestamp: new Date()
        });
        
        if (!order) throw sendError("Order not created");

        // Create the first entry in the timeline table
        await createTimelineEntry(
            queryRunner,
            order.id,
            null, // No previous status
            ORDER_STATUS.PENDING,
            userId,
            ROLE.CUSTOMER,
            'Order created by customer.'
        );

        const itemToSave = orderItems.map(item => 
            queryRunner.manager.create(OrderItems, {
                orderId: order.id,
                ...item,
            })
        );

        await queryRunner.manager.save(OrderItems, itemToSave);

        await queryRunner.commitTransaction();

        return {
            message: "Order created successfully",
            orderId: order.id
        }
    } catch(err) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        if (err instanceof z.ZodError) {
            logger.warn("createOrder validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid order data provided.", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in createOrder service:", err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}

//========================= VENDOR INTERACTIONS =========================

/**
 * Sends a pending order to a list of specified vendors for quoting.
 * A customer has a pool of 10 "active" vendor slots per order.
 * A slot is freed if a vendor rejects or their request expires.
 *
 * @param {Object} data - The raw data from the request.
 * @returns {Promise<Object>} A success message with a list of vendors the order was sent to.
 */
export const sendOrderToVendor = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let newVendorIdsToSend = [];

    try {
        const { userId, orderId, vendorIds } = sendOrderToVendorSchema.parse(data);
        const uniqueVendorIds = [...new Set(vendorIds)];

        const customer = await queryRunner.manager.findOne(Customers, { where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer profile not found", 404);

        const order = await queryRunner.manager.findOne(Orders, { where: { id: orderId}, select: { id: true, customerId: true, orderStatus: true, requiredByDate: true } });
        if (!order) throw sendError("Order not found", 404);
        if (order.customerId !== customer.id) throw sendError("You are not authorized to access this order", 403);
        if (order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("This order is not pending and cannot be sent to vendors", 400);
        if (new Date(order.requiredByDate) < new Date()) throw sendError("This order's required by date is in the past", 400);

        // checking vendor validity and calculating available slots
        const [allAssignments, validVendors] = await Promise.all([
            queryRunner.manager.find(OrderVendors, { where: { orderId: orderId }, select: { vendorId: true, status: true } }),
            queryRunner.manager.find(Vendors, { where: { id: In(uniqueVendorIds), status: "VERIFIED" }, select: { id: true } })
        ]);

        if (validVendors.length !== uniqueVendorIds.length) throw sendError("One or more selected vendors are invalid or not verified.", 400);

        const activeAssignments = allAssignments.filter(a => 
            a.status === ORDER_VENDOR_STATUS.PENDING || a.status === ORDER_VENDOR_STATUS.ACCEPTED
        );

        const activeSlotCount = activeAssignments.length;
        const availableSlots = 10 - activeSlotCount;

        const alreadyContactedVendorIds = new Set(allAssignments.map(a => a.vendorId));
        newVendorIdsToSend = uniqueVendorIds.filter(id => !alreadyContactedVendorIds.has(id));

        if (newVendorIdsToSend.length === 0) throw sendError("This order is already sent to all the selected vendors", 409);

        if (availableSlots < newVendorIdsToSend.length) throw sendError(`You can only send this order to ${availableSlots} more vendor(s) at this time.`, 409);

        const newAssignments = newVendorIdsToSend.map(vendorId => 
            queryRunner.manager.create(OrderVendors, {
                orderId,
                vendorId,
                status: ORDER_VENDOR_STATUS.PENDING
            })
        );

        await queryRunner.manager.save(OrderVendors, newAssignments);
    
        await queryRunner.commitTransaction();

    } catch (err) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        if (err instanceof z.ZodError) {
            logger.warn("sendOrderToVendor validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid data provided.", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in sendOrderToVendor service:", err);
        throw err;
    } finally {
        await queryRunner.release();
    }

    // SENDING PUSH NOTIFICATION TO VENDORS

    if (newVendorIdsToSend.length > 0) {
        try {
            const vendorsToNotify = await AppDataSource.getRepository(Vendors).createQueryBuilder("vendors")
                .leftJoin("vendors.user", "user")
                .select(["user.pushToken"])
                .where("vendors.id IN (:...vendorIds)", { vendorIds: newVendorIdsToSend })
                .andWhere("user.pushToken IS NOT NULL")
                .getRawMany();

            vendorsToNotify.forEach(vendor => {
                pushQueue.add("sendNewOrderNotification", {
                    token: vendor.user_pushToken,
                    title: "New Order Request",
                    message: `You have a new order to quote. Please respond within 24 hours.`,
                    url: "",
                });
            });
        } catch (notificationError) {
            logger.error("Failed to queue push notifications for new vendors", notificationError);
        }
    }

    return {
        message: `Order successfully sent to ${newVendorIdsToSend.length} new vendor(s).`,
        sentTo: newVendorIdsToSend,
    };
}

/**
 * Allows a vendor to accept or reject an order request.
 * Creates a quote if the order is accepted.
 *
 * @param {Object} data - The raw data from the request.
 * @returns {Promise<Object>} A success message.
 */
export const vendorOrderResponse = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let notificationPayload = null;

    try {
        const { userId, orderVendorId, action, quotedPrice, quotedDays, notes } = vendorOrderResponseSchema.parse(data);

        const vendor = await queryRunner.manager.findOne(Vendors, { where: { userId: userId }, select: { id: true, shopName: true } });
        if (!vendor) throw sendError("Vendor profile not found", 404);

       const orderVendor = await queryRunner.manager.findOne(OrderVendors, { 
            where: { id: orderVendorId }, 
            relations: { order: { customer: { user: true } } }
        });

        if (!orderVendor) throw sendError("Order request not found", 404);
        if (orderVendor.vendorId !== vendor.id) throw sendError("You are not authorized to respond to this order request", 403);
        if (orderVendor.order.orderStatus !== ORDER_STATUS.PENDING)  throw sendError("This order is no longer pending", 400);
        if (orderVendor.status !== ORDER_VENDOR_STATUS.PENDING) throw sendError("You have already responded to this order request with status: " + orderVendor.status, 409);

        const hoursElapsed = (new Date() - new Date(orderVendor.createdAt)) / (1000 * 60 * 60);
        if(hoursElapsed > 24 && orderVendor.status === ORDER_VENDOR_STATUS.PENDING) {
            // orderVendor.status = ORDER_VENDOR_STATUS.EXPIRED;        // BACKGROUND JOB WILL UPDATE THE STATUS TO EXPIRED
            // await orderVendorRepo.save(orderVendor);
            throw sendError("The 24-hour response window has expired. Please contact the customer for a new request.", 403);
        }   

        orderVendor.status = action === ORDER_VENDOR_STATUS.ACCEPTED ? ORDER_VENDOR_STATUS.ACCEPTED : ORDER_VENDOR_STATUS.REJECTED;
        await queryRunner.manager.save(OrderVendors, orderVendor);

        if(action === ORDER_VENDOR_STATUS.ACCEPTED) {
            const existingQuote = await queryRunner.manager.findOne(OrderQuotes, { where: { orderVendorId: orderVendor.id }, select: { id: true } });
            if(existingQuote) throw sendError("Quote already exists", 409);

            /*
            * 
            *   Save the quotedPrice (By Vendor)
            *   Calculate and save the vendorPayoutAfterCommission  -- FOR VENDOR PAYOUTS VIA ADMIN / RAZORPAY DASHBOARD 
            *   Calculate and save the priceAfterPlatformFee
            *   Calculate and save the deliveryCharge -- USE DELIVERY SERVICE API TO FETCH FARE
            *   Calculate and save the finalPrice -- TO BE ADDED ON RAZORPAY ORDER
            * 
            */

            const vendorPayoutAfterCommission = calculateVendorPayoutAmount(quotedPrice);
            const priceAfterPlatformFee = calculateOrderAmount(quotedPrice);
            const deliveryCharge = 40;          ////////////////////////////// TO BE CHANGED
            const finalPrice = priceAfterPlatformFee + deliveryCharge;

            await queryRunner.manager.save(OrderQuotes, {
                orderVendorId: orderVendor.id,
                quotedDays: quotedDays,
                quotedPrice: quotedPrice,
                vendorPayoutAfterCommission: vendorPayoutAfterCommission,
                priceAfterPlatformFee: priceAfterPlatformFee,
                deliveryCharge: deliveryCharge,
                finalPrice: finalPrice,
                notes: notes || null
            });
        }

        await queryRunner.commitTransaction();

        const customerUser = orderVendor.order.customer.user;
        if (customerUser && customerUser.pushToken) {
            notificationPayload = {
                token: customerUser.pushToken,
                title: action === ORDER_VENDOR_STATUS.ACCEPTED ? "You Have a New Quote!" : "Order Update",
                message: action === ORDER_VENDOR_STATUS.ACCEPTED
                    ? `${vendor.shopName} has sent you a quote for your order. Please respond within 24 hours.`
                    : `${vendor.shopName} is unable to take your order at this time.`,
                orderId: orderVendor.order.id,
                url: "",
            };
        }

        } catch (err) {
            if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
            if (err instanceof z.ZodError) {
                logger.warn("vendorOrderResponse validation failed", { errors: err.flatten() });
                throw sendError("Invalid data provided.", 400, err.flatten());
            }
            logger.error("Error in vendorOrderResponse service:", err);
            throw err;
        } finally {
            await queryRunner.release();
        }

        if (notificationPayload) {
            try {
                pushQueue.add("sendVendorResponseNotification", notificationPayload);
            } catch (notificationError) {
                logger.error(`Failed to queue notification for order ${notificationPayload.orderId}`, notificationError);
            }
        }
        
        return {
            message: `Order vendor response ${data.action.toLowerCase()} set successfully`,
        }
}

/**
 * Creates a Razorpay order for a customer to pay for a selected quote.
 *
 * @param {Object} data - The raw data from the request.
 * @returns {Promise<Object>} The details required for the client to initiate Razorpay checkout.
 */
export const createRazorpayOrder = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { userId, orderId, quoteId } = createRazorpayOrderSchema.parse(data);

        const customer = await queryRunner.manager.findOne(Customers, { where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer profile not found", 404);

        const quote = await queryRunner.manager.getRepository(OrderQuotes).createQueryBuilder("order_quotes")
            .innerJoinAndSelect("order_quotes.orderVendor", "orderVendors")
            .innerJoin("orderVendors.order", "orders")
            .where("order_quotes.id = :quoteId", { quoteId: quoteId })
            .andWhere("orders.id = :orderId", { orderId: orderId })
            .andWhere("orders.customerId = :customerId", { customerId: customer.id })
            .andWhere("orders.orderStatus = :orderStatus", { orderStatus: ORDER_STATUS.PENDING })
            .andWhere("orderVendors.status = :ovStatus", { ovStatus: ORDER_VENDOR_STATUS.ACCEPTED })
            .getOne();

        if (!quote) throw sendError("This quote is not valid for payment. It may be expired, or the order may no longer be pending.", 400);

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
     
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(quote.finalPrice * 100),
            currency: "INR",
            receipt: quote.id,
            notes: {
                orderId: orderId.toString(),
                quoteId: quote.id.toString(),
                vendorId: quote.orderVendor.vendorId.toString(),
                customerId: customer.id.toString(),
                amount: quote.finalPrice.toString(),
            }
        })

        if (!razorpayOrder) throw sendError("Failed to create payment order with Razorpay", 500);

        await queryRunner.commitTransaction();

        return {
            message: "Razorpay order created successfully",
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: "INR",
            key_id: process.env.RAZORPAY_KEY_ID, // FOR TESTING
        }
    } catch(err) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        if (err instanceof z.ZodError) {
            logger.warn("createRazorpayOrder validation failed", { errors: err.flatten() });
            throw sendError("Invalid data provided.", 400, err.flatten());
        }
        logger.error("Error in createRazorpayOrder service:", err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}

/**
 * Refunds a payment from Razorpay.
 * 
 * @param {string} paymentId - The ID of the payment to refund.
 * @param {string} reason - The reason for the refund.
 * @returns {Promise<void>}
 */
export const refundRazorpayPayment = async (paymentId, reason) => {
    try {
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        const refund = await razorpay.payments.refund(paymentId, {
            speed: "normal",
            notes: { reason: reason }
        });
        await refundRepo.save({
            paymentId: paymentId,
            amount: refund.amount,
            status: refund.status,
            notes: reason
        });
        logger.info(`Refunded payment ${paymentId} for reason ${reason}`);
    } catch(err) {
        logger.error(`Error refunding payment ${paymentId} for reason ${reason}`);
        try{
            await refundRepo.save({
                paymentId: paymentId,
                status: "FAILED",
                notes: reason,
                comment: err
            });
        } catch(err2) {
            logger.error("Error in refundRazorpayPayment service:", err2);
        }
        logger.error("Error in refundRazorpayPayment service:", err);
        throw err;
    }
}

/**
 * Handles incoming webhooks from Razorpay to process payment events.
 * This function is secure, idempotent, and transactional.
 *
 * @param {Object} req 
 * @param {Object} res 
 */
export const handleRazorpayWebhook = async(req, res) => {
    
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

            let previousStatus;

            previousStatus = order.orderStatus;
            order.selectedVendorId = vendorId;
            order.finalQuoteId = quoteId;
            order.paymentId = payment.id;
            order.isPaid = true;
            order.orderStatus = ORDER_STATUS.ORDER_CONFIRMED;

            await createTimelineEntry(queryRunner, orderId, previousStatus, ORDER_STATUS.ORDER_CONFIRMED, MISC.PAYMENT_GATEWAY, ROLE.SYSTEM, `Payment successful. Razorpay ID: ${paymentId}`);

            previousStatus = order.orderStatus;

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
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                // INITIATE CLOTH PICKUP FROM CUSTOMER, use OUTBOX pattern as this block is in a transaction
                await queryRunner.manager.save(Outbox, { 
                    eventType: "INITIATE_PICKUP", 
                    payload: { 
                        deliveryTrackingId: 
                        deliveryTracking.id, 
                        orderId 
                    } ,
                    status: "PENDING",
                    createdAt: new Date()
                });

                await createTimelineEntry(queryRunner, orderId, previousStatus, ORDER_STATUS.ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED, MISC.LOGISTICS, ROLE.SYSTEM, "Pickup from customer scheduled");
                order.orderStatus = ORDER_STATUS.ITEM_PICKUP_FROM_CUSTOMER_SCHEDULED;
            } else {
                order.orderStatus = ORDER_STATUS.IN_PROGRESS;
                await createTimelineEntry(queryRunner, orderId, previousStatus, ORDER_STATUS.IN_PROGRESS, MISC.PAYMENT_GATEWAY, ROLE.SYSTEM, "Order process started")
            }
            order.orderStatusTimestamp = paymentDate.toISOString();
            await queryRunner.manager.save(Orders, order);

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
                    notes: "Internal server error during order processing.",
                });

                logger.info(`Successfully refunded payment ${paymentId}`);
            } catch (refundError) {
                try{
                    await refundRepo.save({
                        paymentId: paymentId,
                        status: "FAILED",
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

export const cancelOrder = async (data) => {
    try {
        const { orderId } = data;

        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw sendError("Order not found");

        if (order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("Order is not in PENDING status");

        order.orderStatus = ORDER_STATUS.CANCELLED;
        await orderRepo.save(order);

        return {
            message: "Order cancelled successfully",
        }

    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const updateOrderStatus = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
        await queryRunner.startTransaction();

        const { userId, orderId, status } = data;

        if (!userId || !orderId || !status) {
            throw sendError("Missing required fields: userId, orderId, or status");
        }

        const { id: vendorId, address: vendorAddress } = await vendorRepo.findOne({ 
            where: { userId: userId },
            select: { id: true, address: true } 
        });
        if (!vendorId) throw sendError("Vendor not found");

        const order = await orderRepo.findOne({ 
            where: { id: orderId }, 
        });
  
        if (!order) throw sendError("Order not found");
        
        if (order.selectedVendorId !== vendorId) throw sendError("Order is not assigned to this vendor");

        const timestamp = new Date().toString();

        switch (status) {
            case "ITEM_RECEIVED":
                        // 2 way and if the itemDeliveredToVendorAt is null, it means that the item is yet to be delivered to the vendor (hence the first phase of delivery is not yet finished)
                        if (!order.clothProvided) {
                            throw sendError("no Item is provided by the customer");
                        }

                        if (!order.orderStatusTimestamp.itemDeliveredToVendorAt) {
                            throw sendError("Item is not yet delivered to the vendor or please wait for the delivery partner to update the status");
                        }
                        
                        if (order.orderStatusTimestamp.vendorAcknowledgedItemAt) {
                            throw sendError("Item is already delivered to the vendor and vendor has acknowledged it");
                        }

                        order.orderStatusTimestamp.vendorAcknowledgedItemAt = timestamp;
                        order.orderStatusTimestamp.orderInProgressAt = timestamp;
                        order.orderStatus = ORDER_STATUS.IN_PROGRESS;
                        
                        break;

            case "READY_FOR_PICKUP":

                        if (order.orderStatus !== ORDER_STATUS.IN_PROGRESS) {
                            throw sendError("Order is not in IN_PROGRESS status");
                        }
                        
                        if (order.orderStatusTimestamp.readyForPickupFromVendor) {
                            throw sendError("Item is already in the ready for pickup state");
                        }
                        
                        order.orderStatusTimestamp.readyForPickupFromVendor = true;
                        order.orderStatusTimestamp.taskCompletedAt = timestamp;
                        order.orderStatus = ORDER_STATUS.OUT_FOR_DELIVERY;

                        // GENERATE DELIVERY TRACKING ID 
                        // IF THE DELIVERY SERVICE NEED TO AVOID CHARACTERS, THEN ADD AN RANDOM/SEQUENTIAL NUMBER BY SETTING THE FIELD AS UNIQUE
                        const deliveryTracking = await queryRunner.manager.save(DeliveryTracking, {
                            orderId: orderId,
                            deliveryType: "TO_CUSTOMER",
                            from: "VENDOR",
                            to: "CUSTOMER",
                            status: "PENDING",
                            createdAt: new Date(),
                            updatedAt: new Date()
                        })

                        // INITIATE CLOTH PICKUP FROM VENDOR, use OUTBOX pattern as this block is in a transaction

                        await queryRunner.manager.save(Outbox, {
                        eventType: "SEND_ITEM_DELIVERY",
                        payload: {
                            deliveryTrackingId: deliveryTracking.id, //deliveryTrackingId or order_id depends on delivery service
                            orderId,
                            vendorId,
                            customerId: order.customerId,
                            pickupAddress: "test address 1",
                            deliveryAddress: vendorAddress,
                        },
                        status: "PENDING",
                        createdAt: new Date()
                        })

                        break;
            default: throw sendError("Invalid status");
        }

        await queryRunner.manager.save(Orders, order);

        await queryRunner.commitTransaction();
        return {
            message: "Order status updated successfully",
        }
    } catch (err) {
        logger.error(err);
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        throw err;
    } finally {
        await queryRunner.release();
    }
}

// export const getOrders = async (data) => {
//     try {
//         const { userId } = data;
//         const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
//         if (!customer) throw sendError("Customer not found");

//         const orders = await orderRepo.find({ where: { customerId: customer.id }, select: { id: true, orderName: true, serviceType: true, orderStatus: true, requiredByDate: true, createdAt: true } });
//         if (!orders) throw sendError("Orders not found");

//         return orders;
//     } catch (err) {
//         logger.error(err);
//         throw err;
//     }
// }

// export const getOrderById = async (data) => {
//     const queryRunner = AppDataSource.createQueryRunner();
//     await queryRunner.connect();
//     await queryRunner.startTransaction();

//     try {
//         const { userId, orderId } = data;

//         const customer = await queryRunner.manager.findOne(Customers, { where: { userId: userId }, select: { id: true } });
//         if (!customer) throw sendError("Customer not found", 404);

//         const order = await queryRunner.manager.findOne(Orders, { where: { id: orderId } });
//         if (!order) throw sendError("Order not found", 404);

//         if (order.customerId !== customer.id) throw sendError("You are not authorized to view this order", 403);

//         const orderItems = await queryRunner.manager.find(OrderItems, { where: { orderId: orderId } });
//         if (!orderItems) throw sendError("Order items not found", 404);

//         const processedOrderItems = await Promise.all(orderItems.map(async item => {
//             const [designImage1Url, designImage2Url] = await Promise.all([
//                 item.designImage1 ? getPresignedViewUrl(item.designImage1) : null,
//                 item.designImage2? getPresignedViewUrl(item.designImage2) : null,
//             ]);
//             return {
//                 ...item,
//                 designImage1Url,
//                 designImage2Url
//             }
//         }));
//         const {fullName, phoneNumber, addressLine1, addressLine2, district, state, street, city, pincode, landmark, addressType, ...orderDetailsWithoutAddress } = order;

//         await queryRunner.commitTransaction();
        
//         return {
//             order: orderDetailsWithoutAddress,
//             address: {
//                 fullName,
//                 phoneNumber,
//                 addressLine1,
//                 addressLine2,
//                 district,
//                 state,
//                 street,
//                 city,
//                 pincode,
//                 landmark,
//                 addressType
//             },
//             orderItems: processedOrderItems
//         };
//     } catch (err) {
//         if (queryRunner.isTransactionActive) {
//             await queryRunner.rollbackTransaction();
//         }
//         logger.error(err);
//         throw err;
//     } finally {
//         await queryRunner.release();
//     }
// }

// export const deleteOrder = async (data) => {
//     try {
//         const { orderId } = data;
//         const order = await orderRepo.findOne({ where: { id: orderId } });
//         if (!order) {
//             throw sendError("Order not found");
//         }
//         await orderRepo.remove(order);
//         return {
//             message: "Order deleted successfully"
//         }
//     } catch (err) {
//         logger.error(err);
//         throw err;
//     }
// }

// export const viewOrderVendorStatus = async (data) => {
//     try {
//         const { orderId } = data;
//         // Find order by ID
//         const order = await orderRepo.findOne({ where: { id: orderId } });
//         if (!order) {
//             throw sendError("Order not found");
//         }
        
//         // Get all vendors associated with this order
//         const orderVendors = await orderVendorRepo.find({ where: { orderId: orderId } });
        
//         for (const vendor of orderVendors) {
//             if (vendor.status === "PENDING") {
//                 // Calculate hours elapsed since vendor was assigned (adjusted for timezone)
//                 const hoursElapsed = (new Date() - new Date(vendor.createdAt)) / (1000 * 60 * 60) - 5.5;
//                 const hour = Math.floor(hoursElapsed);
//                 const minute = Math.floor((hoursElapsed - hour) * 60);
             
//                 // console.log(hour+" hr "+ minute +" min");
                
//                 // If more than 24 hours have passed, mark vendor status as EXPIRED
//                 if (hour >= 24) {
//                     vendor.status = "EXPIRED";
//                     await orderVendorRepo.save(vendor);
//                 }
//             }
//         }
        
//         if (!orderVendors) {
//             throw sendError("Order vendors not found");
//         }

//         return orderVendors;
//     } catch (err) {
//         logger.error(err);
//         throw err;
//     }
// }

// export const viewAcceptedOrderDetails = async (data) => {
//     try {
//         const { orderId, vendorId } = data;
//         const order = await orderRepo.findOne({ where: { id: orderId } });
//         if (!order) {
//             throw sendError("Order not found");
//         }

//         const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
//         if (!orderVendor) {
//             throw sendError("Order vendor not found");
//         }

//         if (orderVendor.status !== "ACCEPTED") {
//             throw sendError("Order vendor status is not ACCEPTED");
//         }
        
//         return orderVendor;
//     } catch (err) {
//         logger.error(err);
//         throw err;
//     }
// }

// export const viewReceivedOrderDetails = async (data) => {
//     try {
//         const { vendorId } = data;
//         const orderVendor = await orderVendorRepo.find({ where: { vendorId: vendorId } });
//         if (!orderVendor) {
//             throw sendError("Order vendor not found");
//         }

//         return orderVendor;
//     } catch (err) {
//         logger.error(err);
//         throw err;
//     }
// }