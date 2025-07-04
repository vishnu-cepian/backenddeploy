import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as searchService from '../services/searchService.mjs';

export const searchVendorsByRating = async (req, res, next) => {
    try {
        const params = {serviceType: req.params.serviceType, page: parseInt(req.params.page)};
        const response = await searchService.searchVendorsByRating(params);
        if (!response) {
            throw new Error(formatError("Vendors not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
};

export const searchVendorsByNearestLocation = async (req, res, next) => {
    try {
        const params = {serviceType: req.params.serviceType, lng: req.params.lng, lat: req.params.lat, radiusKm: req.params.radiusKm, page: parseInt(req.params.page)};
        const response = await searchService.searchVendorByNearestLocation(params);
        if (!response) {
            throw new Error(formatError("Vendors not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
};

export const searchVendorsByRatingAndLocation = async (req, res, next) => {
    try {
        const params = {serviceType: req.params.serviceType, lng: req.params.lng, lat: req.params.lat, radiusKm: req.params.radiusKm, page: parseInt(req.params.page)};
        const response = await searchService.searchVendorsByRatingAndLocation(params);
        if (!response) {
            throw new Error(formatError("Vendors not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
};

export const searchVendorsByShopName = async (req, res, next) => {
    try {
        const params = {serviceType: req.params.serviceType, query: req.params.query, page: parseInt(req.params.page)};
        const response = await searchService.searchVendorsByShopName(params);
        if (!response) {
            throw new Error(formatError("Vendors not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
};