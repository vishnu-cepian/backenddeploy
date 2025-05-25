import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as vendorService from "../services/vendorService.mjs";

export const checkProfile = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.checkProfile(data);
    if (!response) {
      throw new Error(formatError("Vendor profile not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const completeProfile = async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      ...req.body,
    };
    const response = await vendorService.completeProfile(data);
    if (!response) {
      throw new Error(formatError("Vendor profile not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const getVendorDetails = async (req, res, next) => {
  try {
    const data = {
      vendorId: req.params.vendorId,
    };
    const response = await vendorService.getVendorDetails(data);
    if (!response) {
      throw new Error(formatError("Vendor profile not found", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};
