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

export const getOrders = async (req, res, next) => {
    try {
        const {page, limit, sort, id, customerId, selectedVendorId, isPaid, isRefunded, orderStatus} = req.query;
        const pageNumber = page ? parseInt(page) : 1;
        const limitNumber = limit ? parseInt(limit) : 10;
        const response = await adminService.getOrders(pageNumber, limitNumber, sort, id, customerId, selectedVendorId, isPaid, isRefunded, orderStatus);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getAllCustomers = async (req, res, next) => {
    try {
        const {pageNumber, limitNumber, status} = req.query;
        const page = pageNumber ? parseInt(pageNumber) : 1;
        const limit = limitNumber ? parseInt(limitNumber) : 10;
        let response;
        if ( status) {
            response = await adminService.getAllCustomersByFilter(parseInt(page), parseInt(limit), status);
        } else {
            response = await adminService.getAllCustomers(parseInt(page), parseInt(limit));
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

export const searchCustomerByEmailorPhoneNumber = async (req, res, next) => {
    try {
        const {email, phoneNumber} = req.body;
        const response = await adminService.searchCustomerByEmailorPhoneNumber(email, phoneNumber);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getCustomerById = async (req, res, next) => {
    try {
        const customerId = req.params.id;
        const response = await adminService.getCustomerById(customerId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const updateCustomer = async (req, res, next) => {
    try {
        const data = {
            ...req.body,
            customerId: req.params.id
        }
        const response = await adminService.updateCustomer(data);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const blockOrUnblockCustomer = async (req, res, next) => {
    try {
        const customerId = req.params.id;
        const response = await adminService.blockOrUnblockCustomer(customerId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getOrderById = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const response = await adminService.getOrderById(orderId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getVendorResponse = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const response = await adminService.getVendorResponse(orderId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getQuotes = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const response = await adminService.getQuotes(orderId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getPayments = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const response = await adminService.getPayments(orderId);
        if (!response) {
            throw new Error(formatError("No response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};