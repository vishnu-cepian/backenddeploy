import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as pushService from "../services/pushService.mjs";

export const sendNotification = async (req, res, next) => {
    try {
        const { token, title, message } = req.body;
        if (!token || !title || !message) {
            throw new Error(formatError("Token, title, and message are required"));
          }
        const response = await pushService.sendNotifciation(token,title,message);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};