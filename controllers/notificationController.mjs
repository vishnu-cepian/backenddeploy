import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as notificationService from "../services/notificationService.mjs";

export const savePushToken = async (req, res, next) => {
    try {
        const data = {
            pushToken : req.body.pushToken,
            userId : req.user.id
        }
        
        const response = await notificationService.savePushToken(data);
        if (!response) {
            throw new Error(formatError("Error in response",response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}

export const getUserFcmToken = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const response = await notificationService.getUserFcmToken(userId);
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}

export const sendPushNotification = async (req, res, next) => {
    try {
        const {token, title, message, url} = req.body;
        if (!token || !title || !message) {
            throw new Error(formatError("Token, title, and message are required"));
        }
        const response = await notificationService.sendPushNotification(token,title,message,url);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const broadcastPushNotification = async (req, res, next) => {
    try {
        const {role, title, body} = req.body;
        if (!role || !title || !body) {
            throw new Error(formatError("Role, title, and body are required"));
          }
        const response = await notificationService.broadcastPushNotification(role,title,body);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}

export const sendEmail = async (req, res, next) => {
    try {
        const {email, name, template_id, variables} = req.body;
        if (!email || !name || !template_id || !variables) {
            throw new Error(formatError("Email, name, template_id, and variables are required"));
        }
        const response = await notificationService.sendEmail(email, name, template_id, variables);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}

export const broadcastEmail = async (req, res, next) => {
    try {
        const {role, template_id, variables} = req.body;
        if (!role || !template_id || !variables) {
            throw new Error(formatError("Role, template_id, and variables are required"));
        }
        const response = await notificationService.broadcastEmail(role, template_id, variables);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}

export const getNotificationHistory = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const page = req.params.page;
        const limit = req.params.limit;
        const response = await notificationService.getNotificationHistory(userId, page, limit);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}

export const getNotificationUnreadCount = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const response = await notificationService.getNotificationUnreadCount(userId);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}