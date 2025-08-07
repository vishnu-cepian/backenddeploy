import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as customerService from "../services/customerService.mjs";

export const addCustomerAddress = async (req, res, next) => {
    try {
      const data = {
        userId: req.user.id,
        ...req.body
      };
  
      const response = await customerService.addCustomerAddress(data);
      if (!response) {
        throw new Error(formatError("Customer address not added", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  };

  export const getCustomerAddresses = async (req, res, next) => {
    try {
      const data = {
        userId: req.user.id
      };
  
      const response = await customerService.getCustomerAddresses(data);
      if (!response) {
        throw new Error(formatError("Customer addresses not fetched", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  };

  export const updateCustomerAddress = async (req, res, next) => {
    try {
      const data = {
        userId: req.user.id,
        ...req.body
      };
  
      const response = await customerService.updateCustomerAddress(data);
      if (!response) {
        throw new Error(formatError("Customer address not updated", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  };

  export const deleteCustomerAddress = async (req, res, next) => {
    try {
      const data = {
        addressId: req.params.addressId
      };
  
      const response = await customerService.deleteCustomerAddress(data);
      if (!response) {
        throw new Error(formatError("Customer address not deleted", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  };

  export const makeAddressDefault = async (req, res, next) => {
    try {
      const data = {
        userId: req.user.id,
        addressId: req.params.addressId
      };
  
      const response = await customerService.makeAddressDefault(data);
      if (!response) {
        throw new Error(formatError("Default address marking failed", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  };

  export const getVendorDetailsByVendorId = async (req, res, next) => {
    try {
      const data = {
        vendorId: req.params.vendorId
      };

      const response = await customerService.getVendorDetailsByVendorId(data);
      if (!response) {
        throw new Error(formatError("Vendor details not fetched", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  } 

  export const getVendorWorkImagesByVendorId = async (req, res, next) => {
    try {
      const data = {
        vendorId: req.params.vendorId
      };

      const response = await customerService.getVendorWorkImagesByVendorId(data);
      if (!response) {
        throw new Error(formatError("Vendor work images not fetched", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  } 

  export const getOrders = async (req, res, next) => {
    try {
        const data = { 
          userId: req.user.id, 
          serviceType: req.query.serviceType,
          orderStatus: req.query.orderStatus,
        };
        const response = await customerService.getOrders(data);
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
        const response = await customerService.getOrderById(data);
        if (!response) {
            throw new Error(formatError("Order not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getOrderRequests = async (req, res, next) => {
  try {
      const data = { userId: req.user.id, orderId: req.params.orderId };
      const response = await customerService.getOrderRequests(data);
      if (!response) {
          throw new Error(formatError("Order requests not found", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (error) {
      logger.error(error);
      next(error);
  }
};

export const getAcceptedQuoteById = async (req, res, next) => {
  try {
      const data = { userId: req.user.id, orderVendorId: req.params.orderVendorId };
      const response = await customerService.getAcceptedQuoteById(data);
      if (!response) {
          throw new Error(formatError("Accepted quote not found", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (error) {
      logger.error(error);
      next(error);
  }
};
