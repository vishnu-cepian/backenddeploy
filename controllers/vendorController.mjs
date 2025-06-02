import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as vendorService from "../services/vendorService.mjs";
import {UAParser} from "ua-parser-js";

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
    const parser = new UAParser();
    parser.setUA(req.headers['user-agent']);
    const dI = parser.getResult();
    const deviceInfo = {
      ip : req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress,
      device: dI.device.type,
      browser: dI.browser.name,
      version: dI.browser.version,
      platform: dI.os.name,
    }

    const data = {
      userId: req.user.id,
      ...req.body,
    };
    const response = await vendorService.completeProfile(data, deviceInfo);
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
