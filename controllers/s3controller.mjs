import * as s3Service from "../services/s3service.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { MESSAGE } from "../types/enums/index.mjs";

export const getPresignedUrl = async (req, res) => {
    try {
        const { fileName, fileType } = req.body;
        if (!fileName || !fileType) {
            throw new Error(formatError("File name and file type are required", null));
        }
        const presignedUrl = await s3Service.getPresignedUrl(fileName, fileType);
        if (!presignedUrl) {
            throw new Error(formatError("Failed to generate presigned url", presignedUrl));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, presignedUrl));
    } catch (error) {
        logger.error(error);
        // next(error);
    }
};

export const getPresignedViewUrl = async (req, res) => {
    try {
        const { fileName } = req.body;
        if (!fileName) {
            throw new Error(formatError("File name is required", null));
        }
        const presignedUrl = await s3Service.getPresignedViewUrl(fileName);
        if (!presignedUrl) {
            throw new Error(formatError("Failed to generate presigned url", presignedUrl));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, presignedUrl));
    } catch (error) {
        logger.error(error);
        // next(error);
    }
}   

export const deleteFile = async (req, res) => {
    try {
        const fileName = req.params.fileName;
        if (!fileName) {
            throw new Error(formatError("File name is required", null));
        }
        const response = await s3Service.deleteFile(fileName);
        if (!response) {
            throw new Error(formatError("Failed to delete file", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        // next(error);
    }
}   