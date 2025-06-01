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
import { In } from "typeorm";

const orderRepo = AppDataSource.getRepository(Orders);
const orderItemRepo = AppDataSource.getRepository(OrderItems);
const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
const orderItemMeasurementByVendorRepo = AppDataSource.getRepository(OrderItemMeasurementByVendor);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);
const paymentRepo = AppDataSource.getRepository(Payments);

export const createOrder = async (data) => {
    try {
        const { userId , requiredByDate, clothProvided, orderItems } = data;

        const customer = await customerRepo.findOne({ where: { userId: userId } });
        if (!customer) {
            throw sendError("Customer not found");
        }
        const order = orderRepo.create({
            customerId: customer.id,
            requiredByDate: requiredByDate,
            clothProvided: clothProvided,
            orderItems: orderItems
        });
        await orderRepo.save(order);

        if (!order) {
            throw sendError("Order not created");
        }

        for (const item of orderItems) {
            const {quantity , measurements} = item;
            if (quantity > 5) {
                throw sendError("Quantity cannot be greater than 5");
            }
            if (!measurements) {
                throw sendError("Measurements are required");
            }
            const orderItem = orderItemRepo.create({
                orderId: order.id,
                itemId: item.itemId,
                itemType: item.itemType,
                quantity: item.quantity,
                measurements: item.measurements
            });
            await orderItemRepo.save(orderItem);
        }

        return {
            message: "Order created successfully",
            orderId: order.id
        }
    }catch(err) {
     logger.error(err);
     throw err;
    }
}

export const getOrders = async (data) => {
    try {
        const { userId } = data;
        const customer = await customerRepo.findOne({ where: { userId: userId } });
        if (!customer) {
            throw sendError("Customer not found");
        }
        const orders = await orderRepo.find({ where: { customerId: customer.id } });
        if (!orders) {
            throw sendError("Orders not found");
        }
        return orders;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const getOrderById = async (data) => {
    try {
        const { orderId } = data;
        const orderItems = await orderItemRepo.find({ where: { orderId: orderId } });
        if (!orderItems) {
            throw sendError("Order items not found");
        }
        return orderItems;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const deleteOrder = async (data) => {
    try {
        const { orderId } = data;
        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order) {
            throw sendError("Order not found");
        }
        await orderRepo.remove(order);
        return {
            message: "Order deleted successfully"
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const sendOrderToVendor = async (data) => {
    try {
        const { orderId, customerId, vendorIds } = data;

        // Validating Order existance and status

        const order = await orderRepo.findOne({ where: { id: orderId, customerId: customerId } });
        if (!order) {
            throw sendError("Order not found or doesn't belong to the customer");
        }

        if (order.orderStatus !== "PENDING") {
            throw sendError("Order cannot be sent. Status is not valid");
        }

        // Validating Vendor ids

        if(!Array.isArray(vendorIds) || vendorIds.length === 0) {
            throw sendError("Vendor ids are required");
        }

        if (vendorIds.length > 10) {
            throw sendError("Vendor ids cannot be greater than 10");
        }

        const uniqueVendorIds = [...new Set(vendorIds)];

        // Validating Vendor existance and status

        const vendors = await vendorRepo.find({
            where: {
                id: In(uniqueVendorIds),
                isActive: true,
                isVerified: true
            }
        });

        if (vendors.length !== uniqueVendorIds.length) {
            throw sendError("One or more vendors are invalid.");
        }

       // checking already assigned vendors

       const existingEntries = await orderVendorRepo.find({ where: { orderId: orderId } });
      
       const alreadySentVendorIds = existingEntries.map((entry) => entry.vendorId);
       const newVendorIds = uniqueVendorIds.filter((id) => !alreadySentVendorIds.includes(id));
   
       if (alreadySentVendorIds.length + newVendorIds.length > 10) {
        throw sendError(`Order already sent orders to ${alreadySentVendorIds.length} vendor(s) + ${newVendorIds.length} new vendor(s) exceeds maximum limit of 10`);
       }

       if (newVendorIds.length === 0) {
        throw sendError("All vendors are already assigned to this order");
       }

       // creating new order vendors

        const newEntries = newVendorIds.map((vendorId) => {
        const entry = orderVendorRepo.create({
            orderId: orderId,
            vendorId: vendorId,
        });

        return entry;
        });

        await orderVendorRepo.save(newEntries);

        /*
        //
        //
        //
        //  send notification to vendors
        //
        //
        //
        //
        //
        //
        */

        return {
            message: `Order sent to ${newVendorIds.length} vendor(s) successfully.`,
            sentVendorIds: newVendorIds
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const viewOrderVendorStatus = async (data) => {
    try {
        const { orderId } = data;
        // Find order by ID
        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order) {
            throw sendError("Order not found");
        }
        
        // Get all vendors associated with this order
        const orderVendors = await orderVendorRepo.find({ where: { orderId: orderId } });
        
        for (const vendor of orderVendors) {
            if (vendor.status === "PENDING") {
                // Calculate hours elapsed since vendor was assigned (adjusted for timezone)
                const hoursElapsed = (new Date() - new Date(vendor.createdAt)) / (1000 * 60 * 60) - 5.5;
                const hour = Math.floor(hoursElapsed);
                const minute = Math.floor((hoursElapsed - hour) * 60);
             
                // console.log(hour+" hr "+ minute +" min");
                
                // If more than 24 hours have passed, mark vendor status as EXPIRED
                if (hour >= 24) {
                    vendor.status = "EXPIRED";
                    await orderVendorRepo.save(vendor);
                }
            }
        }
        
        if (!orderVendors) {
            throw sendError("Order vendors not found");
        }

        return orderVendors;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const viewAcceptedOrderDetails = async (data) => {
    try {
        const { orderId, vendorId } = data;
        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order) {
            throw sendError("Order not found");
        }

        const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
        if (!orderVendor) {
            throw sendError("Order vendor not found");
        }

        if (orderVendor.status !== "ACCEPTED") {
            throw sendError("Order vendor status is not ACCEPTED");
        }
        
        return orderVendor;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const viewReceivedOrderDetails = async (data) => {
    try {
        const { vendorId } = data;
        const orderVendor = await orderVendorRepo.find({ where: { vendorId: vendorId } });
        if (!orderVendor) {
            throw sendError("Order vendor not found");
        }

        return orderVendor;
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const vendorOrderResponse = async (data) => {
    try {
        const { orderId, vendorId, status, quotedPrice, quotedDays } = data;

        const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
        if (!orderVendor) {
            throw sendError("Order vendor not found");
        }

        // Check if order is in PENDING status and handle expiry
        if (orderVendor.status === "PENDING") {
            // Calculate hours elapsed since vendor was assigned (adjusted for timezone)
            const hoursElapsed = (new Date() - new Date(orderVendor.createdAt)) / (1000 * 60 * 60) - 5.5;
            const hour = Math.floor(hoursElapsed);
            const minute = Math.floor((hoursElapsed - hour) * 60);
         
            // console.log(hour+" hr "+ minute +" min");
            
            // If more than 24 hours have passed, mark vendor status as EXPIRED
            if (hour >= 24) {
                orderVendor.status = "EXPIRED";
                await orderVendorRepo.save(orderVendor);
                throw sendError("Response window expired. Order automatically marked as expired.")
            }
        }

        // Verify order is still in PENDING status
        if (orderVendor.status !== "PENDING") {
            throw sendError(`Order is in ${orderVendor.status} status`);
        }

        // Handle vendor response based on status
        if (status === "ACCEPTED" && orderVendor.status === "PENDING") {
            if (!quotedPrice || !quotedDays) {
                throw sendError("Quoted price and quoted days are required");
            }

            // Update order status to ACCEPTED and save quote details 
            orderVendor.status = "ACCEPTED";
            orderVendor.quotedPrice = quotedPrice;
            orderVendor.quotedDays = quotedDays;
            orderVendor.lockedAt = new Date();
            await orderVendorRepo.save(orderVendor);
        } else if (status === "REJECTED" && orderVendor.status === "PENDING") {
            // Update order status to REJECTED
            orderVendor.status = "REJECTED";
            await orderVendorRepo.save(orderVendor);
        } else {
            throw sendError("Invalid Action: choose between ACCEPTED or REJECTED");
        }
        /*
        //
        //
        //
        //  send notification to customer
        //
        //
        */
        return {
            message: "Order vendor response set successfully",
        }

    } catch (error) {
        logger.error(error);
        throw error;
    }
}

export const initiateVendorPayment = async (data) => {
    try {
        const {customerId, orderId, vendorId } = data;

        const order = await orderRepo.findOne({ where: { id: orderId, customerId: customerId } });
        if (!order) {
            throw sendError("Order not found or doesn't belong to the customer");
        }

        if (order.orderStatus !== "PENDING") {
            throw sendError("Order is not in PENDING status");
        }

        const orderVendor = await orderVendorRepo.findOne({ where: { orderId: orderId, vendorId: vendorId } });
        if (!orderVendor) {
            throw sendError("No accepted quote found for this vendor");
        }

        if (orderVendor.status !== "ACCEPTED") {
            throw sendError("Vendor quote is not accepted");
        }

        // check for existing payment in payments table

        const existingPayment = await paymentRepo.findOne({ where: { orderId: orderId, vendorId: vendorId, customerId: customerId } });
        if ( existingPayment.status === "PENDING" || existingPayment.status === "PAID") {
            throw sendError("Payment already exists");
        }

        // create new payment

        const payment = paymentRepo.create({
            orderId: orderId,
            vendorId: vendorId,
            customerId: customerId,
            amount: orderVendor.quotedPrice,
            status: "PENDING"
        });

        await paymentRepo.save(payment);

        return {
            message: "Payment initiated successfully",
            paymentId: payment.id,
            amount: orderVendor.quotedPrice
        }

    } catch (error) {
        logger.error(error);
        throw error;
    }
}

export const confirmVendorPayment = async (data) => {
    try {
        const { paymentId } = data;

        const payment = await paymentRepo.findOne({ where: { id: paymentId } });
        if (!payment || payment.status === "PAID") {
            throw sendError("Payment not found or already confirmed");
        }

        payment.status = "PAID";
        payment.paidAt = new Date();
        await paymentRepo.save(payment);

        const orderVendor = await orderVendorRepo.findOne({ where: { orderId: payment.orderId, vendorId: payment.vendorId } });
        if (!orderVendor) {
            throw sendError("Order vendor not found");
        }

        const order = await orderRepo.findOne({ where: { id: payment.orderId } });
        if (!order) {
            throw sendError("Order not found");
        }
        // UPDATE ORDER STATUS TO IN-PROGRESS
        order.orderStatus = "IN-PROGRESS";
        await orderRepo.save(order);

        // UPDATE ORDER VENDOR STATUS TO FINALIZED
        orderVendor.status = "FINALIZED";
        await orderVendorRepo.save(orderVendor);

        // FREEZE OTHER VENDOR QUOTES

        const otherVendors = await orderVendorRepo.find({ where: { orderId: payment.orderId, vendorId: Not(payment.vendorId), status: "ACCEPTED" } });
        if (otherVendors.length > 0) {
            for (const vendor of otherVendors) {
                vendor.status = "FROZEN";
                await orderVendorRepo.save(vendor);
            }
        }

        /*
        //
        //
        //  unlock measurements table
        //  send notification to customer
        //
        //
        */
        return {
            message: "Payment confirmed successfully",
            paymentId: payment.id,
            amount: payment.amount
        }
    } catch (error) {
        logger.error(error);
        throw error;
    }
}