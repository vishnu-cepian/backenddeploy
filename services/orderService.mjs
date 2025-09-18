import { z } from "zod";
import Razorpay from "razorpay";
import { In } from "typeorm";

// Local imports
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Orders } from "../entities/Orders.mjs";
import { OrderItems } from "../entities/OrderItems.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { ORDER_VENDOR_STATUS, ORDER_STATUS, SERVICE_TYPE, ROLE, PAYMENT_ATTEMPT } from "../types/enums/index.mjs";
import { calculateVendorPayoutAmount, calculateOrderAmount } from "../utils/pricing_utils.mjs";
import { Outbox } from "../entities/Outbox.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { pushQueue, emailQueue, notificationHistoryQueue } from "../queues/index.mjs";
import { OrderStatusTimeline } from "../entities/orderStatusTimeline.mjs";
import { PaymentAttempts } from "../entities/PaymentAttempts.mjs";

const orderRepo = AppDataSource.getRepository(Orders);
const orderStatusTimelineRepo = AppDataSource.getRepository(OrderStatusTimeline);
//========================= ZOD VALIDATION SCHEMAS =========================

/**
 * @description Zod schema for validating a single item within an order.
 * It contains a `refine` block with conditional logic for measurements:
 * - If it's not a laundry service:
 * - If measurementType is 'refCloth', no further measurement validation is needed.
 * - Both standard and custom measurements cannot be provided simultaneously.
 * - For 5 or fewer items, either custom or standard measurements are required.
 * - For more than 5 items, standard measurements are required.
 */
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
    clothProvided: z.boolean().optional().nullable().default(false),
    tailorService: z.string().optional().nullable().default(null),
}).refine(data => {
    if (!data.laundryService) {
        if(data.measurementType === "refCloth") {
            return true;
        }
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
    notes: z.string().max(500).optional().nullable(),
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

//========================= ORDER CREATION AND MANAGEMENT =========================

/**
 * @api {post} /api/order/createOrder Create a New Order (customer route)
 * @apiName CreateOrder
 * @apiGroup Order
 * @apiDescription The first step in the order lifecycle. A customer submits their order details and items. The order is created in a 'PENDING' state. This entire operation is performed within a database transaction.
 * - The created orders will be saved in the orders table and can be viewed by the customer from saved designs (in app). 
 * - For tailoring services, upto 5 items per order can be added with standard measurements or custom measurements. But for more than 5 items, standard measurements are required.
 * - If the service type is laundry, then no measurements are required.
 * - If measurementType is 'refCloth', then no measurements are required. if the reference cloth is provided then it is an 2-way order. (The frontend will mark clothProvided as true on this action).
 * - If clothProvied is true, then its a 2-way order else its a 1-way order which means the vendor will start the work when the order is confirmed and ships the finished cloth to the customer.
 * - If any one of the orderItems has clothProvided as true, then clothProvided is true for the order. (handled by frontend)
 * 
 * @apiBody {string} orderName - The name of the order.
 * @apiBody {string} orderType - The type of the order.
 * @apiBody {string} serviceType - The type of the service (tailors, laundry).
 * @apiBody {string} orderPreference - The preference of the order.
 * @apiBody {string} requiredByDate - The date by which the order is required (must be in the future).
 * @apiBody {boolean} clothProvided - Whether the cloth is provided. (handled by frontend)
 * @apiBody {string} fullName - The full name of the customer.
 * @apiBody {string} phoneNumber - The phone number of the customer.
 * @apiBody {string} addressLine1 - The first line of the address.
 * @apiBody {string} addressLine2 - The second line of the address.(optional)
 * @apiBody {string} district - The district of the address.
 * @apiBody {string} state - The state of the address.
 * @apiBody {string} street - The street of the address.
 * @apiBody {string} city - The city of the address.
 * @apiBody {string} pincode - The pincode of the address.
 * @apiBody {string} landmark - The landmark of the address.(optional)
 * @apiBody {string} addressType - The type of the address.(optional)
 * 
 * @apiBody {array} orderItems - The items of the order.
 * @apiBody {string} orderItems.itemName - The name of the item.
 * @apiBody {string} orderItems.itemType - The type of the item.
 * @apiBody {number} orderItems.itemCount - The count of the item.
 * @apiBody {string} orderItems.fabricType - The fabric type of the item.
 * @apiBody {string} orderItems.instructions - The instructions of the item.(optional) (default is null)
 * @apiBody {string} orderItems.dressCustomisations - The dress customisations of the item.(optional) (default is null)
 * @apiBody {string} orderItems.measurementType - The measurement type of the item.
 * @apiBody {string} orderItems.tailorService - The tailor service of the item.(optional) (default is null) (Stitching, Alteration)
 * @apiBody {string} orderItems.laundryService - The laundry service of the item.(optional) (default is null) ( Dry Cleaning, Wash and Fold, Wash and Iron, ironing)
 * @apiBody {string} orderItems.stdMeasurements - The standard measurements of the item.(optional) (default is null)
 * @apiBody {string} orderItems.customMeasurements - The custom measurements of the item.(optional) (default is null)
 * @apiBody {string} orderItems.designImage1 - The first design image of the item.(optional) (default is null)
 * @apiBody {string} orderItems.designImage2 - The second design image of the item.(optional) (default is null)
 * @apiBody {boolean} orderItems.clothProvided - Whether the cloth is provided for the item.(optional) (default is false)
 *
 * @param {Object} data - The order data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderName - The name of the order.
 * @param {string} data.orderType - The type of the order.
 * @param {string} data.serviceType - The type of the service.
 * @param {string} data.orderPreference - The preference of the order.
 * @param {string} data.requiredByDate - The date by which the order is required.
 * @param {boolean} data.clothProvided - Whether the cloth is provided.
 * @param {string} data.fullName - The full name of the customer.
 * @param {string} data.phoneNumber - The phone number of the customer.
 * @param {string} data.addressLine1 - The first line of the address.
 * @param {string} data.addressLine2 - The second line of the address.
 * @param {string} data.district - The district of the address.
 * @param {string} data.state - The state of the address.
 * @param {string} data.street - The street of the address.
 * @param {string} data.city - The city of the address.
 * @param {string} data.pincode - The pincode of the address.
 * @param {string} data.landmark - The landmark of the address.
 * @param {string} data.addressType - The type of the address.
 * @param {array} data.orderItems - The items of the order.
 * @param {string} data.orderItems.itemName - The name of the item.
 * @param {string} data.orderItems.itemType - The type of the item.
 * @param {number} data.orderItems.itemCount - The count of the item.
 * @param {string} data.orderItems.fabricType - The fabric type of the item.
 * @param {string} data.orderItems.instructions - The instructions of the item.
 * @param {string} data.orderItems.dressCustomisations - The dress customisations of the item.
 * @param {string} data.orderItems.measurementType - The measurement type of the item.
 * @param {string} data.orderItems.tailorService - The tailor service of the item. (Stitching, Alteration)
 * @param {string} data.orderItems.laundryService - The laundry service of the item. ( Dry Cleaning, Wash and Fold, Wash and Iron, ironing)
 * @param {string} data.orderItems.stdMeasurements - The standard measurements of the item.
 * @param {string} data.orderItems.customMeasurements - The custom measurements of the item.
 * @param {string} data.orderItems.designImage1 - The first design image of the item.
 * @param {string} data.orderItems.designImage2 - The second design image of the item.
 * @param {boolean} data.orderItems.clothProvided - Whether the cloth is provided for the item.
 *
 * @returns {Promise<Object>} { message: "Order created successfully", orderId: string }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {string} orderId - The UUID of the newly created order.
 *
 * @apiError {Error} 400 - If the input data fails Zod validation.
 * @apiError {Error} 404 - If the customer profile is not found for the user.
 * @apiError {Error} 500 - If the order fails to be created for any reason.
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
            orderStatusTimestamp: {
                pendingAt: new Date().toString(),
                inProgressAt: null,
                completedAt: null,
                cancelledAt: null,
                refundedAt: null,
            }
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


/**
 * @api {post} /api/order/sendOrderToVendor Send Order to Vendors (customer route)
 * @apiName SendOrderToVendor
 * @apiGroup Order
 * @apiDescription Allows a customer to send a 'PENDING' order to a list of vendors to request quotes. sends push notification to the vendors.
 * @apiDescription **Business Rule:** A customer has a pool of 10 "active" vendor slots per order. An active slot is one that is 'PENDING' or 'ACCEPTED'. A slot is freed if a vendor 'REJECTS' the request or if the request 'EXPIRES' (after 24 hours) having no response from the vendor or if the vendor has ACCEPTED but the customer fails to make payment within 24 hours. This prevents spamming vendors.
 * - If an order is send to vendor once, it cannot be sent to the same vendor again (even if the request is expired or rejected).
 * 
 * @apiBody {string} orderId - The UUID of the 'PENDING' order.
 * @apiBody {string[]} vendorIds - An array of vendor UUIDs to send the request to (max 10).
 * 
 * @param {Object} data - The data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string[]} vendorIds - An array of vendor UUIDs to send the request to (max 10).
 *
 * @apiSuccess {string} message - A success message indicating how many new vendors received the request.
 * @apiSuccess {string[]} sentTo - An array of vendor UUIDs the request was successfully sent to.
 *
 * @apiError {Error} 400 - If order is not 'PENDING', or if one or more vendor IDs are invalid.
 * @apiError {Error} 403 - If the user is not the owner of the order.
 * @apiError {Error} 404 - If the customer profile or order is not found.
 * @apiError {Error} 409 - If the request has already been sent to all specified vendors, or if sending to the new vendors would exceed the 10-slot limit.
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
                .select(["user.pushToken", "user.id"])
                .where("vendors.id IN (:...vendorIds)", { vendorIds: newVendorIdsToSend })
                .getRawMany();


            vendorsToNotify.forEach(vendor => {
                if(vendor.user_pushToken) {
                pushQueue.add("sendNewOrderNotification", {
                    token: vendor.user_pushToken,
                    title: "New Order Request",
                    message: `You have a new order to quote. Please respond within 24 hours.`,
                    data: { url: '/(vendor)/(portal)/orders'}
                });
                }
                notificationHistoryQueue.add("saveNotificationHistory", {
                    userId: vendor.user_id,
                    title: "New Order Request",
                    body: `You have a new order to quote. Please respond within 24 hours.`,
                    timestamp: new Date(),
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
 * @api {post} /api/order/vendorOrderResponse Vendor Responds to Order (vendor route)
 * @apiName VendorOrderResponse
 * @apiGroup Order
 * @apiDescription Allows a vendor to 'ACCEPT' (and provide a quote) or 'REJECT' an order request from a customer. sends push notification to the customer.
 * @apiDescription **Business Rule:** A vendor must respond within 24 hours of receiving the request. After 24 hours, the request is considered 'EXPIRED' and cannot be acted upon. If accepted, the service calculates all pricing and fees and creates a formal quote.
 *
 * @apiBody {string} orderVendorId - The unique UUID for the order-vendor relationship.
 * @apiBody {string} action - The vendor's response: 'ACCEPTED' or 'REJECTED'.
 * @apiBody {number} [quotedPrice] - The price quoted by the vendor (Required if action is 'ACCEPTED').
 * @apiBody {number} [quotedDays] - The number of days the vendor estimates for completion (Required if action is 'ACCEPTED').
 * @apiBody {string} [notes] - Optional notes from the vendor.
 *
 * @param {Object} data - The data containing the user ID, order vendor ID, action, quoted price, quoted days, and notes.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderVendorId - The unique UUID for the order-vendor relationship.
 * @param {string} data.action - The vendor's response: 'ACCEPTED' or 'REJECTED'.
 * @param {number} [data.quotedPrice] - The price quoted by the vendor (Required if action is 'ACCEPTED').
 * @param {number} [data.quotedDays] - The number of days the vendor estimates for completion (Required if action is 'ACCEPTED').
 * @param {string} [data.notes] - Optional notes from the vendor.
 * 
 * @returns {Promise<Object>} - The result of the response.
 * 
 * @apiSuccess {string} message - A success confirmation message.
 *
 * @apiError {Error} 400 - If the order is no longer 'PENDING', or for invalid input.
 * @apiError {Error} 403 - If the vendor is not authorized for this request or if the 24-hour response window has expired.
 * @apiError {Error} 404 - If the vendor profile or order request is not found.
 * @apiError {Error} 409 - If the vendor has already responded to this request.
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

        if (action === ORDER_VENDOR_STATUS.REJECTED) {
            orderVendor.notes = notes || null;
        }

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

            const vendorPayoutAfterCommission = await calculateVendorPayoutAmount(quotedPrice);
            const priceAfterPlatformFee = await calculateOrderAmount(quotedPrice);
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
                data: { url: '/(customer)/(portal)/orders'}
            };
        }

        try {
            notificationHistoryQueue.add("saveNotificationHistory", {
                userId: customerUser.id,
                title: action === ORDER_VENDOR_STATUS.ACCEPTED ? "You Have a New Quote!" : "Order Update",
                body: action === ORDER_VENDOR_STATUS.ACCEPTED ? `${vendor.shopName} has sent you a quote for your order. Please respond within 24 hours.` : `${vendor.shopName} is unable to take your order at this time.`,
                timestamp: new Date(),
            });
        } catch (notificationError) {
            logger.error("Failed to queue notification history for customer", notificationError);
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
 * @api {post} /api/order/createRazorpayOrder Create Razorpay Order (customer route)
 * @apiName CreateRazorpayOrder
 * @apiGroup Order
 * @apiDescription After a customer chooses an accepted quote, this function creates a server-side order with Razorpay. The returned `razorpayOrderId` is then used by the client-side Razorpay checkout SDK to initiate payment.
 * @apiDescription (idempotency check) The payment attempt is created and saved to the database. If an existing payment attempt is found, it is reused if it is not expired(60 mins).
 *
 * @apiBody {string} orderId - The UUID of the main order.
 * @apiBody {string} quoteId - The UUID of the accepted quote the customer wants to pay for.
 *
 * @param {Object} data - The data containing the user ID, order ID, and quote ID.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderId - The UUID of the main order.
 * @param {string} data.quoteId - The UUID of the accepted quote the customer wants to pay for.
 * 
 * @returns {Promise<Object>} - The result of the creation.
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {string} razorpayOrderId - The ID of the order created on Razorpay's servers.
 * @apiSuccess {number} amount - The final amount in the smallest currency unit (e.g., paise).
 * @apiSuccess {string} currency - The currency code (e.g., 'INR').
 * @apiSuccess {string} key_id - The public Razorpay key ID for the client SDK.
 *
 * @apiError {Error} 400 - If the selected quote is no longer valid for payment.
 * @apiError {Error} 404 - If the customer profile is not found.
 * @apiError {Error} 500 - If the Razorpay API call fails.
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

        // IDEMPOTENCY CHECK: Look for an existing, active payment attempt for this quote.
        const existingAttempt = await queryRunner.manager.findOne(PaymentAttempts, { where: { quoteId: quoteId, status: PAYMENT_ATTEMPT.PENDING } });

        // REUSE existing Razorpay order if it's not expired.
        if (existingAttempt && new Date() < new Date(existingAttempt.expiresAt)) {
            await queryRunner.commitTransaction(); // No changes needed, so commit immediately.
            logger.info(`Reusing existing Razorpay Order ID: ${existingAttempt.razorpayOrderId} for Quote ID: ${quote.id}`);
            return {
                message: "Existing Razorpay order found.",
                razorpayOrderId: existingAttempt.razorpayOrderId,
                amount: Math.round(existingAttempt.amount * 100),
                currency: "INR",
                key_id: process.env.RAZORPAY_KEY_ID,
            };
        }

        // EXPIRE old attempt if it exists and is now past its expiration.
        if (existingAttempt) {
            await queryRunner.manager.update(PaymentAttempts, existingAttempt.id, { status: PAYMENT_ATTEMPT.EXPIRED });
        }

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

        // SAVE the new payment attempt to our database.
        // Razorpay orders typically expire in 60 minutes.
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); 
        await queryRunner.manager.save( PaymentAttempts, {
            quoteId: quote.id,
            razorpayOrderId: razorpayOrder.id,
            amount: quote.finalPrice,
            status: PAYMENT_ATTEMPT.PENDING,
            expiresAt
        });

        await queryRunner.commitTransaction();

        return {
            message: "Razorpay order created successfully",
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: "INR",
            key_id: process.env.RAZORPAY_KEY_ID,
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

// export const cancelOrder = async (data) => {
//     try {
//         const { orderId } = data;

//         const order = await orderRepo.findOne({ where: { id: orderId } });
//         if (!order) throw sendError("Order not found");

//         if (order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("Order is not in PENDING status");

//         order.orderStatus = ORDER_STATUS.CANCELLED;
//         await orderRepo.save(order);

//         return {
//             message: "Order cancelled successfully",
//         }

//     } catch(err) {
//         logger.error(err);
//         throw err;
//     }
// }

/**
 * @api {post} /api/order/updateOrderStatus Update Order Status (vendor route)
 * @apiName UpdateOrderStatus
 * @apiGroup Order
 * @apiDescription
 * This is a critical, vendor-only endpoint that functions as a state machine for an active order.
 * It allows a vendor to advance the order through specific stages of the fulfillment process.
 * The entire operation is transactional to ensure data integrity.
 *
 * ---
 *
 * ### Order Flow and State Transitions:
 *
 * This function handles two primary state transitions initiated by the vendor:
 *
 * 1.  **`ITEM_RECEIVED`**:
 * - **Context**: This status is used **only** for orders where the customer provides the cloth (`clothProvided` is true).
 * - **Trigger**: The vendor calls this endpoint after the delivery partner has dropped off the customer's item(s) at their shop. It serves as the vendor's digital acknowledgment of receipt.
 * - **Pre-conditions**:
 * - The order must have a timeline entry for `ITEM_DELIVERED_TO_VENDOR`. The system will reject the update if the delivery isn't officially complete.
 * - **Idempotency**: The system checks if an `ITEM_RECEIVED` entry already exists for this order to prevent duplicate acknowledgments.
 * - **Actions**:
 * 1.  Creates a timeline entry for `ITEM_RECEIVED`.
 * 2.  Immediately creates a subsequent timeline entry for `WORK_STARTED`, as receiving the item signifies the start of the vendor's work.
 *
 * 2.  **`ITEM_READY_FOR_PICKUP`**:
 * - **Context**: This status is used when the vendor has completed all tailoring/laundry work on the items.
 * - **Trigger**: The vendor marks the order as ready, which initiates the return delivery process.
 * - **Pre-conditions**:
 * - The order's primary status must be `IN_PROGRESS`.
 * - A `WORK_STARTED` timeline entry must exist, ensuring the vendor can't mark an order as ready before they've even started.
 * - **Idempotency**: The system checks if an `ITEM_READY_FOR_PICKUP` entry already exists.
 * - **Actions**:
 * 1.  Creates a timeline entry for `ITEM_READY_FOR_PICKUP`.
 * 2.  **Initiates Return Logistics**: It creates a new `DeliveryTracking` entity for the return trip ("TO_CUSTOMER").
 * 3.  **Outbox Pattern**: It creates an `Outbox` event (`SEND_ITEM_DELIVERY`). This decouples the main order transaction from the external call to the delivery service. A separate worker process will handle the outbox event, ensuring that even if the delivery API call fails, the order transaction remains successful.
 *
 * ---
 *
 * @apiBody {string} orderId The UUID of the order to update.
 * @apiBody {string} status The new status to set (must be one of the handled statuses like 'ITEM_RECEIVED' or 'ITEM_READY_FOR_PICKUP').
 *
 * @param {Object} data - The data containing the user ID, order ID, and status.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderId - The UUID of the order to update.
 * @param {string} data.status - The new status to set (must be one of the handled statuses like 'ITEM_RECEIVED' or 'ITEM_READY_FOR_PICKUP').
 * 
 * @returns {Promise<Object>} - The result of the update.
 * 
 * @apiSuccess {string} message A success confirmation message.
 *
 * @apiError {Error} 400 - **Invalid Status or Pre-condition Failed**: Thrown if the requested status is not valid, if a required pre-condition is not met (e.g., trying to mark an item as received before it's delivered), or if the action has already been performed (idempotency failure).
 * @apiError {Error} 403 - **Forbidden**: Thrown if the order is not assigned to the vendor making the request.
 * @apiError {Error} 404 - **Not Found**: Thrown if the vendor or order cannot be found in the database.
 * @apiError {Error} 409 - **Idempotency Failed**: Thrown if the vendor attempts to update the status multiple times.
 * @apiError {Error} 500 - **Internal Server Error**: For any unexpected database or logic errors during the transaction.
 */
export const updateOrderStatus = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
        await queryRunner.startTransaction();

        const { userId, orderId, status } = data;

        if (!userId || !orderId || !status) throw sendError("Missing required fields: userId, orderId, or status", 400);

        const { id: vendorId, addressLine1: vendorAddress } = await queryRunner.manager.findOne(Vendors, { 
            where: { userId: userId },
            select: { id: true, addressLine1: true } 
        });
        if (!vendorId) throw sendError("Vendor not found", 404);

        const order = await queryRunner.manager.findOne(Orders, { 
            where: { id: orderId }, 
            select: { id: true, clothProvided: true, orderStatus: true, customerId: true, selectedVendorId: true }
        });
  
        if (!order) throw sendError("Order not found", 404);
        if (order.selectedVendorId !== vendorId) throw sendError("Order is not assigned to this vendor", 403);


        switch (status) {
            case ORDER_STATUS.ITEM_RECEIVED:
                // PRE-CONDITION: This flow is only for orders where the customer provides the materials.
                if (!order.clothProvided) throw sendError("This order does not involve item pickup from the customer", 400);

                // IDEMPOTENCY CHECK: Prevent the vendor from acknowledging receipt multiple times.
                const alreadyReceived = await queryRunner.manager.exists(OrderStatusTimeline, {
                    where: { orderId: orderId, newStatus: ORDER_STATUS.ITEM_RECEIVED }
                });

                if (alreadyReceived)  throw sendError("Item has already been marked as received by the vendor", 409);

                // PRE-CONDITION: Ensure the logistics partner has marked the item as delivered to the vendor.
                const itemDeliveredEvent = await queryRunner.manager.exists(OrderStatusTimeline, { 
                    where: { orderId: orderId, newStatus: ORDER_STATUS.ITEM_DELIVERED_TO_VENDOR }
                });
                if (!itemDeliveredEvent) throw sendError("Item has not yet been marked as delivered by the logistics partner", 400);

                // ACTIONS: Create timeline entries for both receiving the item and starting the work.
                await createTimelineEntry(queryRunner, orderId, ORDER_STATUS.ITEM_DELIVERED_TO_VENDOR, ORDER_STATUS.ITEM_RECEIVED, vendorId, ROLE.VENDOR, "Vendor acknowledged receipt of the item.");            
                await createTimelineEntry(queryRunner, orderId, ORDER_STATUS.ITEM_RECEIVED, ORDER_STATUS.WORK_STARTED, vendorId, ROLE.VENDOR, "Work started after item receipt acknowledgment.");  
                
                break;

            case ORDER_STATUS.ITEM_READY_FOR_PICKUP:
                // PRE-CONDITION: The order must be in the 'IN_PROGRESS' state.
                if (order.orderStatus !== ORDER_STATUS.IN_PROGRESS) throw sendError("Order is not currently in progress", 400);
                
                // IDEMPOTENCY CHECK: Prevent triggering return delivery multiple times.
                const alreadyReadyForPickup = await queryRunner.manager.exists(OrderStatusTimeline, {
                    where: { orderId: orderId, newStatus: ORDER_STATUS.ITEM_READY_FOR_PICKUP }
                });
                if (alreadyReadyForPickup) throw sendError("Order has already been marked as ready for pickup", 400);
                        
                // PRE-CONDITION: Ensure work has actually started before it can be finished.
                const workStartedEvent = await queryRunner.manager.exists(OrderStatusTimeline, {
                where: { orderId: orderId, newStatus: ORDER_STATUS.WORK_STARTED }
                });
                if (!workStartedEvent) throw sendError("Cannot mark as ready for pickup before work has started", 400);

                // ACTION: Create the timeline entry for this new status.
                await createTimelineEntry(queryRunner, orderId, ORDER_STATUS.WORK_STARTED, ORDER_STATUS.ITEM_READY_FOR_PICKUP, vendorId, ROLE.VENDOR, "Vendor marked item as ready for pickup.");

                // GENERATE DELIVERY TRACKING ID 
                // IF THE DELIVERY SERVICE NEED TO AVOID CHARACTERS, THEN ADD AN RANDOM/SEQUENTIAL NUMBER BY SETTING THE FIELD AS UNIQUE
                const deliveryTracking = await queryRunner.manager.save(DeliveryTracking, {
                    orderId: orderId, deliveryType: "TO_CUSTOMER", from: "VENDOR", to: "CUSTOMER", status: "PENDING",
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
                })

                // INITIATE CLOTH PICKUP FROM VENDOR, OUTBOX PATTERN: Create an event to be processed by a separate worker.
                // This ensures the external API call to the delivery service does not block or fail this transaction.
                await queryRunner.manager.save(Outbox, {
                eventType: "SEND_ITEM_DELIVERY",
                payload: {
                    deliveryTrackingId: deliveryTracking.id, //deliveryTrackingId or order_id depends on delivery service
                    orderId,
                    vendorId,
                    customerId: order.customerId,
                    pickupAddress: vendorAddress,
                    deliveryAddress: "test address 1",
                },
                status: "PENDING",
                createdAt: new Date()
                })

                break;
            default: throw sendError(`Invalid or unsupported status update: ${status}`, 400);
        }

        await queryRunner.commitTransaction();
        return {
            message: "Order status updated successfully",
        }
    } catch (err) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        logger.error("Error in updateOrderStatus:", err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}

/**
 * @api {get} /api/order/getOrderTimeline Get Order Timeline (customer and vendor route)
 * @apiName GetOrderTimeline
 * @apiGroup Order
 * @apiDescription Gets the timeline of the order status changes.
 * 
 * @apiParam {string} orderId - The UUID of the order.
 * 
 * @param {Object} data - The data containing the order ID.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderId - The UUID of the order.
 * 
 * @returns {Promise<Object>} - The timeline of the order status changes.
 * 
 * @apiSuccess {Object[]} response.orderTimeline - The timeline of the order status changes.
 * @apiSuccess {string} response.orderTimeline.id - The UUID of the order timeline.
 * @apiSuccess {string} response.orderTimeline.newStatus - The new status of the order.
 * @apiSuccess {string} response.orderTimeline.changedAt - The timestamp of the order status change.
 * 
 * @apiError {Error} 404 - If the order or order timeline is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getOrderTimeline = async (data) => {
    try {
        const { orderId } = data;

        const order = await orderRepo.findOne({
             where: { id: orderId },
             select: {id: true }, 
            });
        if (!order) throw sendError("Order not found", 404);

        const orderTimeline = await orderStatusTimelineRepo.find({ 
            where: { orderId: orderId },
            select: { id: true, newStatus: true, changedAt: true },
        });
        if (!orderTimeline) throw sendError("Order timeline not found", 404);
        return orderTimeline;

    } catch (error) {
        logger.error("Error getting order timeline", error);
        throw error;
    }
}
