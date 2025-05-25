import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
import * as orderService from "../services/orderService.mjs";

export const createOrder = async (req, res, next) => {
    try {
        const data = {
            userId: req.user.id,
            ...req.body,
          };
        const response = await orderService.createOrder(data);
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
