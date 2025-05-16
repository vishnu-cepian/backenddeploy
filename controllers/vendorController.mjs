import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
import * as vendorService from "../services/vendorService.mjs";

export const checkProfile = controllerWrapper(async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
    };

    const response = await vendorService.checkProfile(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

export const completeProfile = controllerWrapper(async (req, res, next) => {
  try {
    const data = {
      userId: req.user.id,
      ...req.body,
    };

    const response = await vendorService.completeProfile(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
});