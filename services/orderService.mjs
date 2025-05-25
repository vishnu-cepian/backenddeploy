import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Orders } from "../entities/Orders.mjs";
import { OrderItems } from "../entities/OrderItems.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { OrderItemMeasurementByVendor } from "../entities/OrderItemMeasurementByVendor.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Vendors } from "../entities/Vendors.mjs";

const orderRepo = AppDataSource.getRepository(Orders);
const orderItemRepo = AppDataSource.getRepository(OrderItems);
const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
const orderItemMeasurementByVendorRepo = AppDataSource.getRepository(OrderItemMeasurementByVendor);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);

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