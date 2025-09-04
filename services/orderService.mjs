import { z } from "zod";
import Razorpay from "razorpay";
import { In } from "typeorm";
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
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { ORDER_VENDOR_STATUS, ORDER_STATUS, SERVICE_TYPE, ROLE, MISC } from "../types/enums/index.mjs";
import { calculateVendorPayoutAmount, calculateOrderAmount } from "../utils/pricing_utils.mjs";
import { Outbox } from "../entities/Outbox.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { pushQueue, emailQueue, notificationHistoryQueue } from "../queues/index.mjs";
import { OrderStatusTimeline } from "../entities/orderStatusTimeline.mjs";

const orderRepo = AppDataSource.getRepository(Orders);
const orderStatusTimelineRepo = AppDataSource.getRepository(OrderStatusTimeline);
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
                .select(["user.pushToken", "user.id"])
                .where("vendors.id IN (:...vendorIds)", { vendorIds: newVendorIdsToSend })
                .getRawMany();


            vendorsToNotify.forEach(vendor => {
                if(vendor.user_pushToken) {
                pushQueue.add("sendNewOrderNotification", {
                    token: vendor.user_pushToken,
                    title: "New Order Request",
                    message: `You have a new order to quote. Please respond within 24 hours.`,
                    url: "",
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
                url: "",
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

        const { id: vendorId, addressLine1: vendorAddress } = await queryRunner.manager.findOne(Vendors, { 
            where: { userId: userId },
            select: { id: true, addressLine1: true } 
        });
        if (!vendorId) throw sendError("Vendor not found");

        const order = await queryRunner.manager.findOne(Orders, { 
            where: { id: orderId }, 
            select: { id: true, clothProvided: true, orderStatus: true, customerId: true, selectedVendorId: true }
        });
  
        if (!order) throw sendError("Order not found");
        
        if (order.selectedVendorId !== vendorId) throw sendError("Order is not assigned to this vendor");

        switch (status) {
            case ORDER_STATUS.ITEM_RECEIVED:
                        // 2 way and if the itemDeliveredToVendorAt is null, it means that the item is yet to be delivered to the vendor (hence the first phase of delivery is not yet finished)
                        if (!order.clothProvided) {
                            throw sendError("no Item is provided by the customer");
                        }

                        const alreadyReceived = await queryRunner.manager.findOne(OrderStatusTimeline, {
                            where: { orderId: orderId, newStatus: ORDER_STATUS.ITEM_RECEIVED },
                            select: { id: true }
                        });
                        
                        if (alreadyReceived) {
                            throw sendError("Item is already delivered to the vendor and vendor has acknowledged it", 400);
                        }

                        const itemDeliveredEvent = await queryRunner.manager.findOne(OrderStatusTimeline, { 
                            where: { orderId: orderId, newStatus: ORDER_STATUS.ITEM_DELIVERED_TO_VENDOR },
                            select: { id: true }
                        });

                        if (!itemDeliveredEvent) {
                            throw sendError("Item is not yet delivered to the vendor or please wait for the delivery partner to update the status", 400);
                        }

                        await createTimelineEntry(
                            queryRunner,
                            orderId,
                            ORDER_STATUS.ITEM_DELIVERED_TO_VENDOR,
                            ORDER_STATUS.ITEM_RECEIVED,
                            vendorId,
                            ROLE.VENDOR,
                            "Item received by the vendor"
                        )            
                        
                        await createTimelineEntry(
                            queryRunner,
                            orderId,
                            ORDER_STATUS.ITEM_RECEIVED,
                            ORDER_STATUS.WORK_STARTED,
                            vendorId,
                            ROLE.VENDOR,
                            "Vendor ack received"
                        )  
                        
                        break;

            case ORDER_STATUS.ITEM_READY_FOR_PICKUP:

                        if (order.orderStatus !== ORDER_STATUS.IN_PROGRESS) {
                            throw sendError("Order is not in IN_PROGRESS status");
                        }
                        
                        const alreadyReadyForPickup = await queryRunner.manager.findOne(OrderStatusTimeline, {
                            where: { orderId: orderId, newStatus: ORDER_STATUS.ITEM_READY_FOR_PICKUP },
                            select: { id: true }
                        });

                        if (alreadyReadyForPickup) {
                            throw sendError("Item is already in the ready for pickup state", 400);
                        }
                        

                        if (order.clothProvided ) {
                            const itemReceivedEvent = await queryRunner.manager.findOne(OrderStatusTimeline, {
                                where: { orderId: orderId, newStatus: ORDER_STATUS.WORK_STARTED },
                                select: { id: true }
                            });

                            if (!itemReceivedEvent) {
                                throw sendError("Item is not yet received by the vendor", 400);
                            }
                        } 

                        await createTimelineEntry(
                            queryRunner,
                            orderId,
                            ORDER_STATUS.WORK_STARTED,
                            ORDER_STATUS.ITEM_READY_FOR_PICKUP,
                            vendorId,
                            ROLE.VENDOR,
                            "Item ready for pickup from vendor"
                        )

                        // GENERATE DELIVERY TRACKING ID 
                        // IF THE DELIVERY SERVICE NEED TO AVOID CHARACTERS, THEN ADD AN RANDOM/SEQUENTIAL NUMBER BY SETTING THE FIELD AS UNIQUE
                        const deliveryTracking = await queryRunner.manager.save(DeliveryTracking, {
                            orderId: orderId,
                            deliveryType: "TO_CUSTOMER",
                            from: "VENDOR",
                            to: "CUSTOMER",
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
                        })

                        // INITIATE CLOTH PICKUP FROM VENDOR, use OUTBOX pattern as this block is in a transaction

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
            default: throw sendError("Invalid status");
        }

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
