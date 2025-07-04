import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as ratingService from "../services/ratingService.mjs";

export const updateVendorRating = async (req, res, next) => {
  try {
    const data = {userId: req.user.id, ...req.body};
    const response = await ratingService.updateVendorRating(data);
    if (!response) {
      throw new Error(formatError("Rating not updated", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const getDailyLeadershipBoard = async (req, res, next) => {
    try {
      const response = await ratingService.getDailyLeadershipBoard();
      if (!response) {
        throw new Error(formatError("Daily leadership board not found", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  };

  export const getMonthlyLeadershipBoard = async (req, res, next) => {
    try {
      const data = req.body;
      const response = await ratingService.getMonthlyLeadershipBoard(data);
      if (!response) {
        throw new Error(formatError("Daily leadership board not found", response));
      }
      res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
      logger.error(err);
      next(err);
    }
  };