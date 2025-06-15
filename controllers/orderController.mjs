import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as orderService from "../services/orderService.mjs";

export const createOrder = async (req, res, next) => {
    try {
        const data = {
            userId: req.user.id,
            ...req.body,
          };
        const response = await orderService.createOrder(data);
        if (!response) {
            throw new Error(formatError("Order not created", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getOrders = async (req, res, next) => {
    try {
        const data = { userId: req.user.id };
        const response = await orderService.getOrders(data);
        if (!response) {
            throw new Error(formatError("Orders not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};  

export const getOrderById = async (req, res, next) => {
    try {
        const data = { userId: req.user.id, orderId: req.params.orderId };
        const response = await orderService.getOrderById(data);
        if (!response) {
            throw new Error(formatError("Order not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const deleteOrder = async (req, res, next) => {
    try {
        const data = { orderId: req.params.orderId };
        const response = await orderService.deleteOrder(data);
        if (!response) {
            throw new Error(formatError("Order not deleted", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const sendOrderToVendor = async (req, res, next) => {
    try {
        const data = req.body;
        const response = await orderService.sendOrderToVendor(data);
        if (!response) {
            throw new Error(formatError("Order not sent to vendor", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const viewOrderVendorStatus = async (req, res, next) => {
    try {
        const data = { orderId: req.params.orderId };
        const response = await orderService.viewOrderVendorStatus(data);
        if (!response) {
            throw new Error(formatError("Order vendor status not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const vendorOrderResponse = async (req, res, next) => {
    try {
        const data = {userId: req.user.id, ...req.body};
        const response = await orderService.vendorOrderResponse(data);
        if (!response) {
            throw new Error(formatError("Order vendor response not sent", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }   
};

export const createRazorpayOrder = async (req, res, next) => {
    try {
        const data = {userId: req.user.id, ...req.body};
        const response = await orderService.createRazorpayOrder(data);
        if (!response) {
            throw new Error(formatError("Order vendor response not sent", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }   
};

export const viewAcceptedOrderDetails = async (req, res, next) => {
    try {
        const data = { orderId: req.params.orderId, vendorId: req.params.vendorId };
        const response = await orderService.viewAcceptedOrderDetails(data);
        if (!response) {
            throw new Error(formatError("Order details not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const viewReceivedOrderDetails = async (req, res, next) => {
    try {
        const data = { vendorId: req.params.vendorId };
        const response = await orderService.viewReceivedOrderDetails(data);
        if (!response) {
            throw new Error(formatError("Order details not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const initiateVendorPayment = async (req, res, next) => {
    try {
        const data = { orderId: req.params.orderId, vendorId: req.params.vendorId, customerId: req.params.customerId };
        const response = await orderService.initiateVendorPayment(data);
        if (!response) {
            throw new Error(formatError("Payment not initiated", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const confirmVendorPayment = async (req, res, next) => {
    try {
        const data = { paymentId: req.params.paymentId };
        const response = await orderService.confirmVendorPayment(data);
        if (!response) {
            throw new Error(formatError("Payment not confirmed", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const freezeOrderVendors = async (req, res, next) => {
    try {
        const data = { orderId: req.params.orderId, vendorId: req.params.vendorId };
        const response = await orderService.freezeOrderVendors(data);
        if (!response) {
            throw new Error(formatError("Failed to freeze order vendors", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};
