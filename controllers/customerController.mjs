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