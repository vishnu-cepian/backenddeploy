import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as pushService from "../services/notificationService.mjs";

export const savePushToken = async (req, res, next) => {
    try {
        const data = {
            token : req.body.token,
            userId : req.user.id
        }
        
        const response = await pushService.savePushToken(data);
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
        const response = await pushService.getUserFcmToken(userId);
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}

export const sendPushNotification = async (req, res, next) => {
    try {
        const {token, title, message} = req.body;
        if (!token || !title || !message) {
            throw new Error(formatError("Token, title, and message are required"));
        }
        const response = await pushService.sendPushNotification(token,title,message);
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
        const response = await pushService.broadcastPushNotification(role,title,body);
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
        // const variables = {
        //     "otp" : req.body.body
        // }
        const {body} = req.body;
        console.log(body)
        const variables = body;

        console.log(variables);

        const {email, name, template_id} = req.body;
        if (!email || !name || !template_id || !variables) {
            throw new Error(formatError("Email, name, template_id, and variables are required"));
        }
        const response = await pushService.sendEmail(email, name, template_id, variables);
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
        const response = await pushService.broadcastEmail(role, template_id, variables);
        if (!response) {
            throw new Error(formatError("Error in response", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
}