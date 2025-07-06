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

export const getAllVendors = async (req, res, next) => {
    try {
        const {pageNumber, limitNumber, status, serviceType} = req.query;
        const page = pageNumber ? parseInt(pageNumber) : 1;
        const limit = limitNumber ? parseInt(limitNumber) : 10;
        let response;
        if ( status || serviceType) {
            response = await adminService.getAllVendorsByFilter(parseInt(page), parseInt(limit), status, serviceType);
        } else {
            response = await adminService.getAllVendors(parseInt(page), parseInt(limit));
        }
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const searchByEmailorPhoneNumber = async (req, res, next) => {
    try {
        const {email, phoneNumber} = req.body;
        const response = await adminService.searchByEmailorPhoneNumber(email, phoneNumber);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getVendorById = async (req, res, next) => {
    try {
        const vendorId = req.params.id;
        const response = await adminService.getVendorById(vendorId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const blockOrUnblockVendor = async (req, res, next) => {
    try {
        const vendorId = req.params.id;
        const response = await adminService.blockOrUnblockVendor(vendorId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const verifyVendor = async (req, res, next) => {
    try {
        const vendorId = req.params.id;
        const response = await adminService.verifyVendor(vendorId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const rejectVendor = async (req, res, next) => {
    try {
        const vendorId = req.params.id;
        const response = await adminService.rejectVendor(vendorId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};