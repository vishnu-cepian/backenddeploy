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

export const sendOrderToVendor = async (req, res, next) => {
    try {
        const data = {userId: req.user.id, ...req.body};
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

export const updateOrderStatus = async (req, res, next) => {
    try {
        const data = { userId: req.user.id, orderId: req.body.orderId, status: req.body.status };
        const response = await orderService.updateOrderStatus(data);
        if (!response) {
            throw new Error(formatError("Order status not updated", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};


export const getOrderTimeline = async (req, res, next) => {
    try {
        const data = { userId: req.user.id, orderId: req.params.orderId };
        const response = await orderService.getOrderTimeline(data);
        if (!response) {
            throw new Error(formatError("Order timeline not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
  };