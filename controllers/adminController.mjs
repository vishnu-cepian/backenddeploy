import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as adminService from "../services/adminService.mjs";

export const login = async (req, res, next) => {
    try {
        const data = req.body;
        const response = await adminService.login(data);
        if (!response) {
            throw new Error(formatError("No login response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const refreshAccessToken = async (req, res, next) => {
    try {
        const data = req.body.refreshToken;
        const response = await adminService.refreshAccessToken(data);
        if (!response) {
            throw new Error(formatError("No login response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const stats = async (req, res, next) => {
    try {
        const response = await adminService.stats();
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};