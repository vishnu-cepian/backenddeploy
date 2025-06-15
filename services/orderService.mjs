import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Orders } from "../entities/Orders.mjs";
import { OrderItems } from "../entities/OrderItems.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { OrderItemMeasurementByVendor } from "../entities/OrderItemMeasurementByVendor.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Payments } from "../entities/Payments.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { In, Not } from "typeorm";
import Razorpay from "razorpay";
import crypto from "crypto";
import { ORDER_VENDOR_STATUS, ORDER_STATUS } from "../types/enums/index.mjs";

const orderRepo = AppDataSource.getRepository(Orders);
const orderItemRepo = AppDataSource.getRepository(OrderItems);
const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
const orderItemMeasurementByVendorRepo = AppDataSource.getRepository(OrderItemMeasurementByVendor);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);
const paymentRepo = AppDataSource.getRepository(Payments);
const orderQuoteRepo = AppDataSource.getRepository(OrderQuotes);

export const createOrder = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { userId, requiredByDate, clothProvided, orderItems } = data;
        
        if (!userId) throw sendError("User ID is required");
        if (!requiredByDate) throw sendError("Required by date is required");
        if (clothProvided === undefined) throw sendError("Cloth provided status is required");
        if (!Array.isArray(orderItems) || orderItems.length === 0) throw sendError("Order items are required and must be a non-empty array");


        const requiredDate = new Date(requiredByDate);

        if (isNaN(requiredDate.getTime())) throw sendError("Invalid required by date format");
        if (requiredDate <= new Date()) throw sendError("Required by date must be in the future");


        const customer = await customerRepo.findOne({ where: { userId: userId } });
        if (!customer) throw sendError("Customer not found");


        const order = await queryRunner.manager.save(Orders, {
            customerId: customer.id,
            requiredByDate: requiredDate,
            clothProvided: clothProvided,
            orderStatus: ORDER_STATUS.PENDING,
            isPaid: false,
        });
        
        if (!order) throw sendError("Order not created");

        for (const item of orderItems) {
            const { quantity, measurements, universalSize, itemType } = item;
            
            if (!itemType) throw sendError("Item type is required for each order item");
            if (typeof quantity !== 'number' || quantity <= 0) throw sendError("Quantity must be a positive number");
            if (quantity > 5 && !universalSize) throw sendError("Universal size is required for quantity greater than 5");
            if (quantity > 5 && measurements) throw sendError("Measurements are not allowed for quantity greater than 5");
            if (quantity < 5 && !measurements) throw sendError("Measurements are required for quantity less than 5");
            if (!measurements && !universalSize) throw sendError("Measurements or universal size are required");

            await queryRunner.manager.save(OrderItems, {
                orderId: order.id,
                itemType: itemType,
                quantity: quantity,
                measurements: measurements || null,
                universalSize: universalSize || null
            });
        }
        await queryRunner.commitTransaction();
        return {
            message: "Order created successfully",
            orderId: order.id
        }
    } catch(err) {
        await queryRunner.rollbackTransaction();
        logger.error(err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}

export const sendOrderToVendor = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { orderId, vendorIds } = data;

        if(!Array.isArray(vendorIds) || vendorIds.length === 0) throw sendError("Vendor ids are required");
        if (vendorIds.length > 10) throw sendError("Vendor ids cannot be greater than 10");

        const order = await orderRepo.findOne({ where: { id: orderId} });

        if (!order) throw sendError("Order not found");
        if (order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("Order cannot be sent. Status is not valid");

        const uniqueVendorIds = [...new Set(vendorIds)];

        const vendors = await vendorRepo.find({
            where: {
                id: In(uniqueVendorIds),
                status: "VERIFIED"
            }
        });

        if (vendors.length !== uniqueVendorIds.length) throw sendError("One or more vendors are invalid.");

        const existingEntries = await orderVendorRepo.find({ where: { orderId: orderId } });
      
        const alreadySentVendorIds = existingEntries.map((entry) => entry.vendorId);
        const newVendorIds = uniqueVendorIds.filter((id) => !alreadySentVendorIds.includes(id));
   
        if (alreadySentVendorIds.length + newVendorIds.length > 10) throw sendError(`Customer already sent order to ${alreadySentVendorIds.length} vendor(s) + ${newVendorIds.length} new vendor(s) exceeds maximum limit of 10`);
        if (newVendorIds.length === 0) throw sendError("All vendors are already assigned to this order");

        for (const vendorId of newVendorIds) {
            await queryRunner.manager.save(OrderVendors, {
                orderId: orderId,
                vendorId: vendorId,
                status: ORDER_VENDOR_STATUS.PENDING
            });
        }
        await queryRunner.commitTransaction();

//         /*
//         //
//         //
//         //
//         //  send notification to vendors
//         //
//         //
//         //
//         //
//         //
//         //
//         */

        return {
            message: `Order sent to ${newVendorIds.length} vendor(s) successfully.`,
            sentVendorIds: newVendorIds
        }
    } catch (err) {
        await queryRunner.rollbackTransaction();
        logger.error(err);
        throw err;
    } finally {
        await queryRunner.release();
    }
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
            const existingQuote = await orderQuoteRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
            if(existingQuote) throw sendError("Quote already exists");

            orderVendor.status = ORDER_VENDOR_STATUS.ACCEPTED;
            await queryRunner.manager.save(OrderVendors, orderVendor);

            await queryRunner.manager.save(OrderQuotes, {
                orderId: orderId,
                vendorId: vendorId,
                quotedPrice: quotedPrice,
                quotedDays: quotedDays,
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
        if (!quote || quote.orderId !== orderId) throw sendError("Quote not found or doesn't belong to the order");

        const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: quote.vendorId } });
        if (!orderVendor || orderVendor.status !== ORDER_VENDOR_STATUS.ACCEPTED) throw sendError("No accepted quote found for this vendor");

        const quoteAgeHours = (new Date() - new Date(quote.createdAt)) / (1000 * 60 * 60);
        if (quoteAgeHours > 24) throw sendError("Quote is expired");

        const razorpayOrder = await razorpay.orders.create({
            amount: quote.quotedPrice * 100,
            currency: "INR",
            receipt: `order_${orderId}_quote_${quote.id}`,
            notes: {
                orderId: orderId.toString(),
                quoteId: quote.id.toString(),
                vendorId: quote.vendorId.toString(),
                customerId: customer.id.toString(),
                amount: quote.quotedPrice.toString(),
            }
        })

        if (!razorpayOrder) throw sendError("Failed to create Razorpay order");

        return {
            message: "Razorpay order created successfully",
            razorpayOrderId: razorpayOrder.id,
            amount: quote.quotedPrice,
            currency: "INR",
        }
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

/*
*   CODE IS NOT COMPLETED AND TESTED
*   ALSO THIS CODE DOESNT HANDLE FAILURE CASES
*/
export const handleRazorpayWebhook = async (req, res) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

        const signature = req.headers["x-razorpay-signature"];
        const body = JSON.stringify(req.body);

        const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("hex");

        if (signature !== expectedSignature) throw sendError("Invalid signature");

        const { event, data } = req.body;

        if (event === "payment.captured") {
            const payment = req.body.payload.payment.entity;
            const { orderId, quoteId, vendorId, customerId, amount } = payment.notes;
            const order = await orderRepo.findOne({ where: { id: orderId } });
            const quote = await orderQuoteRepo.findOne({ where: { id: quoteId } });

            if(!order || !quote || order.selectedVendorId || order.orderStatus !== ORDER_STATUS.PENDING) throw sendError("Order is already assigned to a vendor or is not in PENDING status");

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
                paymentDate: payment.createdAt
            });

            order.selectedVendorId = quote.vendorId;
            order.finalQuoteId = quoteId;
            order.paymentId = paymentDetails.id;
            order.orderStatus = ORDER_STATUS.ORDER_CONFIRMED;
            order.isPaid = true;  
            // UPDATE THE VENDOR ADDRESS ALSO 
            order.orderStatusTimestamp.orderConfirmed = payment.createdAt;

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

            // INITIATE CLOTH PICKUP FROM CUSTOMER
            if(order.clothProvided) {
            }


            await queryRunner.commitTransaction();
        }
    } catch(err) {
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

// export const initiateVendorPayment = async (data) => {
//     try {
//         const {customerId, orderId, vendorId } = data;

//         const order = await orderRepo.findOne({ where: { id: orderId, customerId: customerId } });
//         if (!order) {
//             throw sendError("Order not found or doesn't belong to the customer");
//         }

//         if (order.orderStatus !== "PENDING") {
//             throw sendError("Order is not in PENDING status");
//         }

//         const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
//         if (!orderVendor) {
//             throw sendError("No accepted quote found for this vendor");
//         }

//         if (orderVendor.status !== "ACCEPTED") {
//             throw sendError("Vendor quote is not accepted");
//         }

//         // check for existing payment in payments table

//         const existingPayment = await paymentRepo.findOne({ where: { orderId: orderId, vendorId: vendorId, customerId: customerId } });
//         if ( existingPayment.status === "PENDING" || existingPayment.status === "PAID") {
//             throw sendError("Payment already exists");
//         }

//         // create new payment

//         const payment = paymentRepo.create({
//             orderId: orderId,
//             vendorId: vendorId,
//             customerId: customerId,
//             amount: orderVendor.quotedPrice,
//             status: "PENDING"
//         });

//         await paymentRepo.save(payment);

//         return {
//             message: "Payment initiated successfully",
//             paymentId: payment.id,
//             amount: orderVendor.quotedPrice
//         }

//     } catch (error) {
//         logger.error(error);
//         throw error;
//     }
// }

// export const confirmVendorPayment = async (data) => {
//     try {
//         const { paymentId } = data;

//         const payment = await paymentRepo.findOne({ where: { id: paymentId } });
//         if (!payment || payment.status === "PAID") {
//             throw sendError("Payment not found or already confirmed");
//         }

//         payment.status = "PAID";
//         payment.paidAt = new Date();
//         await paymentRepo.save(payment);

//         const orderVendor = await orderVendorRepo.findOne({ where: { orderId: payment.orderId, vendorId: payment.vendorId } });
//         if (!orderVendor) {
//             throw sendError("Order vendor not found");
//         }

//         const order = await orderRepo.findOne({ where: { id: payment.orderId } });
//         if (!order) {
//             throw sendError("Order not found");
//         }
//         // UPDATE ORDER STATUS TO IN-PROGRESS
//         order.orderStatus = "IN-PROGRESS";
//         await orderRepo.save(order);

//         // UPDATE ORDER VENDOR STATUS TO FINALIZED
//         orderVendor.status = "FINALIZED";
//         await orderVendorRepo.save(orderVendor);

//         // FREEZE OTHER VENDOR QUOTES

//         const otherVendors = await orderVendorRepo.find({ where: { orderId: payment.orderId, vendorId: Not(payment.vendorId), status: "ACCEPTED" } });
//         if (otherVendors.length > 0) {
//             for (const vendor of otherVendors) {
//                 vendor.status = "FROZEN";
//                 await orderVendorRepo.save(vendor);
//             }
//         }

//         /*
//         //
//         //
//         //  unlock measurements table
//         //  send notification to customer
//         //
//         //
//         */
//         return {
//             message: "Payment confirmed successfully",
//             paymentId: payment.id,
//             amount: payment.amount
//         }
//     } catch (error) {
//         logger.error(error);
//         throw error;
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

// export const getOrderById = async (data) => {
//     try {
//         const { orderId } = data;
//         const orderItems = await orderItemRepo.find({ where: { orderId: orderId } });
//         if (!orderItems) {
//             throw sendError("Order items not found");
//         }
//         return orderItems;
//     } catch (err) {
//         logger.error(err);
//         throw err;
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