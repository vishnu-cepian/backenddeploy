import { z } from "zod";
import crypto from "crypto";
import Razorpay from "razorpay";
import { In, Not } from "typeorm";

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
import { ORDER_VENDOR_STATUS, ORDER_STATUS, SERVICE_TYPE } from "../types/enums/index.mjs";
import { calculateVendorPayoutAmount, calculateOrderAmount } from "../utils/pricing_utils.mjs";
import { PaymentFailures } from "../entities/PaymentFailures.mjs";
import { Outbox } from "../entities/Outbox.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { pushQueue } from "../queues/notification/push/pushQueue.mjs";

const orderRepo = AppDataSource.getRepository(Orders);
const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);
const orderQuoteRepo = AppDataSource.getRepository(OrderQuotes);
const paymentRepo = AppDataSource.getRepository(Payments);
// const paymentFailureRepo = AppDataSource.getRepository(PaymentFailures);

//========================= ZOD VALIDATION SCHEMAS =========================

const orderItemSchema = z.object({
    itemName: z.string().min(1, { message: "Item name is required" }),
    itemType: z.string().min(1, { message: "Item type is required" }),
    itemCount: z.number().int().positive({ message: "Item count must be a positive number" }),
    fabricType: z.string().min(1, { message: "Fabric type is required" }),
    instructions: z.string().optional().nullable().default(null),
    dressCustomisations: z.any().optional().nullable().default(null),
    measurementType: z.string().min(1, { message: "Measurement type is required" }),
    laundryService: z.string().optional().nullable().default(null),
    stdMeasurements: z.string().optional().nullable().default(null),
    customMeasurements: z.any().optional().nullable().default(null),
    designImage1: z.string().optional().nullable().default(null),
    designImage2: z.string().optional().nullable().default(null),
}).refine(data => {
    if (data.stdMeasurements && data.customMeasurements) {
        return false; // Only one of custom/standard measurements can be provided
    }
    if (data.itemCount <= 5 && !data.customMeasurements && !data.stdMeasurements) {
        return false; // Custom/standard measurements are required for small quantities
    } else if (data.itemCount > 5 && !data.stdMeasurements) {
        return false; // Standard measurements are required for large quantities
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

        const initialTimeStamp = {
            paidAt: null,
            orderConfirmedAt: null,
            orderInProgressAt: null,
            taskCompletedAt: null,
            completedAt: null,
            cancelled: false,           // if cancelled
            cancelledAt: null,
            refundRequestedAt: null,
            refundProcessedAt: null,
            ...(clothProvided ? {
                readyForPickupFromCustomer: false, // a flag, set true when assigned for pickup
                outForPickupFromCustomerAt: null, // timestamp when delivery partner picks it
                itemPickedFromCustomerAt: null, // timestamp when delivery partner picks it
                itemDeliveredToVendorAt: null, // timestamp when vendor receives it
                vendorAcknowledgedItemAt: null, // vendor confirms receipt
            } : {}),
            readyForPickupFromVendor: false, // a flag, set true when vendor marks ready
            outForPickupFromVendorAt: null, // timestamp when delivery partner picks it
            itemPickedFromVendorAt: null, // delivery partner picks it up
            itemDeliveredToCustomerAt: null, // customer receives it

        };

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
            orderStatusTimestamp: initialTimeStamp
        });
        
        if (!order) throw sendError("Order not created");

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
        await queryRunner.rollbackTransaction();
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
        await queryRunner.rollbackTransaction();
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

export const vendorOrderResponse = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { orderId, userId, action, quotedPrice, quotedDays, notes } = data;

        const vendor = await vendorRepo.findOne({ where: { userId: userId } });
        if (!vendor) throw sendError("Vendor not found");
        const vendorId = vendor.id;

        if (!orderId) throw sendError("Order ID is required");
        if (!action) throw sendError("Action is required");
        if (action === "ACCEPTED" && (!quotedPrice || !quotedDays)) throw sendError("Quoted price and quoted days are required");

        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw sendError("Order not found");
        if (order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("Order is not in PENDING status");

        if(order.selectedVendorId) throw sendError("Order is already assigned to a vendor");
        
        const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
        if (!orderVendor) throw sendError("Order vendor not found");

        const now = new Date();
        const diff = (now.getTime() - new Date(orderVendor.createdAt).getTime()) / (1000 * 60 * 60);
        if(diff > 24 && orderVendor.status === ORDER_VENDOR_STATUS.PENDING) {
            orderVendor.status = ORDER_VENDOR_STATUS.EXPIRED;
            await orderVendorRepo.save(orderVendor);
            throw sendError("Response window expired. Order automatically marked as expired.");
        }
        if(orderVendor.status !== ORDER_VENDOR_STATUS.PENDING) throw sendError(`Order is in ${orderVendor.status} status`);

        if(action === "REJECTED") {
            orderVendor.status = ORDER_VENDOR_STATUS.REJECTED;
            await orderVendorRepo.save(orderVendor);
            return {
                message: "Order rejected successfully",
            }
        }

        if(action === "ACCEPTED") {
            const existingQuote = await orderQuoteRepo.findOne({ where: { orderVendorId: orderVendor.id } });
            if(existingQuote) throw sendError("Quote already exists");

            orderVendor.status = ORDER_VENDOR_STATUS.ACCEPTED;
            await queryRunner.manager.save(OrderVendors, orderVendor);

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

        if(action !== "ACCEPTED" && action !== "REJECTED") throw sendError("Invalid action");

        await queryRunner.commitTransaction();
        return {
            message: "Order vendor response set successfully",
        }

//         /*
//         //
//         //
//         //
//         //  send notification to customer
//         //
//         //
//         */

        } catch (err) {
            await queryRunner.rollbackTransaction();
            logger.error(err);
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

export const createRazorpayOrder = async (data) => {
    try {
        const { userId, orderId, quoteId } = data;

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        const customer = await customerRepo.findOne({ where: { userId: userId } });
        if (!customer) throw sendError("Customer not found");

        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order || order.customerId !== customer.id) throw sendError("Order not found or doesn't belong to the customer");

        if (order.selectedVendorId || order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("Order is already assigned to a vendor or is not in PENDING status");

        const quote = await orderQuoteRepo.findOne({ where: { id: quoteId } });
        if (!quote) throw sendError("Quote not found");

        const orderVendor = await orderVendorRepo.findOne({ where: { id: quote.orderVendorId } });
        if (!orderVendor || orderVendor.status !== ORDER_VENDOR_STATUS.ACCEPTED) throw sendError("No accepted quote found for this vendor");

        const quoteAgeHours = (new Date() - new Date(quote.createdAt)) / (1000 * 60 * 60);
        if (quoteAgeHours > 24) throw sendError("Quote is expired");
     
        const razorpayOrder = await razorpay.orders.create({
            amount: quote.finalPrice * 100,
            currency: "INR",
            receipt: quoteId,
            notes: {
                orderId: orderId.toString(),
                quoteId: quote.id.toString(),
                vendorId: orderVendor.vendorId.toString(),
                customerId: customer.id.toString(),
                amount: quote.finalPrice.toString(),
            }
        })

        if (!razorpayOrder) throw sendError("Failed to create Razorpay order");

        return {
            message: "Razorpay order created successfully",
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: "INR",
            key_id: process.env.RAZORPAY_KEY_ID, // FOR TESTING
        }
    } catch(err) {
        logger.error(err);
        throw err;
    }
}


export const refundRazorpayPayment = async (paymentId, reason) => {
    /*
    *
    *
    *   
    *   CREATE A TABLE TO TRACK THE REFUNDS (FAILURE AND SUCCESS)
    * 
    * 
    */ 
    try {
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        const refund = await razorpay.payments.refund(paymentId, {
            speed: "normal",
            notes: { reason: reason }
        });
        console.log(refund)
        logger.info(`Refunded payment ${paymentId} for reason ${reason}`);
    } catch(err) {
        logger.error(`Error refunding payment ${paymentId} for reason ${reason}`);
        logger.error(err);
        throw err;
    }
}

/*
*   CODE IS NOT COMPLETED AND TESTED
*   
*/
export const handleRazorpayWebhook = async (req, res) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let paymentId = null;
    let event = null;

    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

        const signature = req.headers["x-razorpay-signature"];
        const body = JSON.stringify(req.body);

        const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("hex");

        if (signature !== expectedSignature) throw sendError("Invalid signature");

        event = req.body.event;
        paymentId = req.body.payload.payment.entity.id;

        if (event === "payment.captured") {
            const payment = req.body.payload.payment.entity;
            const { orderId, quoteId, vendorId, customerId, amount } = payment.notes;
            const order = await orderRepo.findOne({ where: { id: orderId } });
            const quote = await orderQuoteRepo.findOne({ where: { id: quoteId } });

            if(!order || !quote || order.selectedVendorId || order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("Order is already assigned to a vendor or is not in PENDING status");

            const existingPayment = await paymentRepo.findOne({ where: { razorpayPaymentId: payment.id } });
            if (existingPayment) {
                logger.info(`Duplicate webhook received for payment ${payment.id}`);
                return res.status(200).json({
                    message: "Payment already exists",
                });
            }

            if (Number(amount) !== Number(quote.finalPrice)) throw sendError("Payment amount does not match the order amount");

            const paymentDate = new Date(payment.created_at * 1000);

            const paymentDetails = await queryRunner.manager.save(Payments, {
                orderId: orderId,
                vendorId: vendorId,
                customerId: customerId,
                quoteId: quoteId,
                razorpayPaymentId: payment.id,
                paymentAmount: amount,
                paymentCurrency: payment.currency,
                paymentMethod: payment.method,
                paymentStatus: payment.status,
                paymentDate: paymentDate
            });

            order.selectedVendorId = vendorId;
            order.finalQuoteId = quoteId;
            order.paymentId = paymentDetails.id;
            order.orderStatus = ORDER_STATUS.ORDER_CONFIRMED;
            order.isPaid = true;  
            // UPDATE THE VENDOR ADDRESS ALSO 
            order.orderStatusTimestamp.paidAt = paymentDate.toString();
            order.orderStatusTimestamp.orderConfirmedAt = paymentDate.toString();

            quote.isProcessed = true;
            await queryRunner.manager.save(OrderQuotes, quote);

            const {address: vendorAddress} = await vendorRepo.findOne({ where: { id: vendorId }, select: { address: true } });

            if(order.clothProvided === true) {
                order.orderStatusTimestamp.readyForPickupFromCustomer = true;

                // GENERATE DELIVERY TRACKING ID 
                // IF THE DELIVERY SERVICE NEED TO AVOID CHARACTERS, THEN ADD AN RANDOM/SEQUENTIAL NUMBER BY SETTING THE FIELD AS UNIQUE
                const deliveryTracking = await queryRunner.manager.save(DeliveryTracking, {
                    orderId: orderId,
                    deliveryType: "TO_VENDOR",
                    from: "CUSTOMER",
                    to: "VENDOR",
                    status: "PENDING",
                    createdAt: new Date(),
                    updatedAt: new Date()
                })

                // INITIATE CLOTH PICKUP FROM CUSTOMER, use OUTBOX pattern as this block is in a transaction

                await queryRunner.manager.save(Outbox, {
                eventType: "SEND_ITEM_PICKUP",
                payload: {
                      deliveryTrackingId: deliveryTracking.id, //deliveryTrackingId or order_id depends on delivery service
                      orderId,
                      vendorId,
                      customerId,
                      pickupAddress: "test address 1",
                      deliveryAddress: vendorAddress,
                 },
                 status: "PENDING",
                 createdAt: new Date()
                })
            } else {
                order.orderStatusTimestamp.orderInProgressAt = paymentDate.toString();
                order.orderStatus = ORDER_STATUS.IN_PROGRESS;
                // send notification to vendor 
            }


            await queryRunner.manager.save(Orders, order);

            const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
            if (!orderVendor) throw sendError("Order vendor not found");

            orderVendor.status = ORDER_VENDOR_STATUS.FINALIZED;
            await queryRunner.manager.save(OrderVendors, orderVendor);

            // freeze other vendors
            await queryRunner.manager.update(OrderVendors, {
                orderId,
                vendorId: Not(vendorId)
            }, {
                status: ORDER_VENDOR_STATUS.FROZEN
            });

            await queryRunner.commitTransaction();
            res.status(200).json({
                message: "Order confirmed successfully",
            })
        } else if (event === "payment.failed") {
            const payment = req.body.payload.payment.entity;
            const { orderId, quoteId, customerId, amount } = payment.notes;
            
            await queryRunner.manager.save(PaymentFailures, {
                orderId: orderId,
                quoteId: quoteId,
                customerId: customerId,
                paymentId: payment.id,
                amount: amount,
                reason: payment.error_description || "unknown",
                status: payment.status,
                timestamp: new Date(payment.created_at * 1000),
            });
            await queryRunner.commitTransaction();
            // send notification to customer

            return res.status(200).json({
                message: "Payment failed recorded",
            })
        }
    } catch(err) {
        console.log(paymentId, event)
        if (paymentId && event === "payment.captured") {
            await refundRazorpayPayment(paymentId, "Order Validation failed after payment");
        }
        await queryRunner.rollbackTransaction();
        logger.error(err);
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

// export const updateOrderStatus = async (data) => {
//     try {
//         const { orderId, status } = data;

//         if (!orderId || !status) throw sendError("Order ID and status are required");

//         const order = await orderRepo.findOne({ where: { id: orderId } });
//         if (!order) throw sendError("Order not found");
        
//         switch (order.orderStatus) {
//             case ORDER_STATUS.ORDER_CONFIRMED:
//                 if (status === ORDER_STATUS.IN_PROGRESS) {
//                     order.orderStatus = ORDER_STATUS.IN_PROGRESS;
//                     await orderRepo.save(order);

//                     // notify 

//                     return {
//                         message: "Order status updated to IN_PROGRESS successfully",
//                         newStatus: ORDER_STATUS.IN_PROGRESS
//                     }
//                 }
//                 break;

//             case ORDER_STATUS.IN_PROGRESS:
//                 if (status === ORDER_STATUS.READY_FOR_PICKUP) {
//                     order.orderStatus = ORDER_STATUS.READY_FOR_PICKUP;
//                     await orderRepo.save(order);

//                     // notify 

//                     return {
//                         message: "Order status updated to READY_FOR_PICKUP successfully",
//                         newStatus: ORDER_STATUS.READY_FOR_PICKUP
//                     }
//                 }
//                 break;
//             default:
//                 throw sendError(`Invalid current order status: ${order.orderStatus}`);
//         }
//         throw sendError(`Invalid status transition from ${order.orderStatus} to ${status}`);



//         ////    IF WEBHOOK AVAILABLE FOR DELIVERY THEN USE ORDER_STATUS.COMPLTED $ ORDER_STATUS.OUT_FOR_DELIVERY  IN THAT
    
    
    
    
    
    
    
//     } catch (err) {
//         logger.error(err);
//         throw err;
//     }
// }


// export const getOrders = async (data) => {
//     try {
//         const { userId } = data;
//         const customer = await customerRepo.findOne({ where: { userId: userId } });
//         if (!customer) {
//             throw sendError("Customer not found");
//         }
//         const orders = await orderRepo.find({ where: { customerId: customer.id } });
//         if (!orders) {
//             throw sendError("Orders not found");
//         }
//         return orders;
//     } catch (err) {
//         logger.error(err);
//         throw err;
//     }
// }

export const getOrderById = async (data) => {
    try {
        const { orderId } = data;
        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order) {
            throw sendError("Order not found");
        }
        console.log(order);
        return order;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

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