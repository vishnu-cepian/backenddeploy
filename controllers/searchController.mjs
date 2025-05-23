import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
import * as searchService from '../services/searchService.mjs';

export const searchVendorsByRating = controllerWrapper(async (req, res, next) => {
    try {
        const params = req.params;
        const response = await searchService.searchVendorsByRating(params);
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
});

export const searchVendorsByRatingAndLocation = controllerWrapper(async (req, res, next) => {
    try {
        const params = req.params;
        const response = await searchService.searchVendorsByRatingAndLocation(params);
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
});

export const searchVendorsByQuery = controllerWrapper(async (req, res, next) => {
    try {
        const params = req.params;
        const response = await searchService.searchVendorsByQuery(params);
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
});