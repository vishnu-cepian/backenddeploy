import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as chatService from "../services/chatService.mjs";

export const getOrCreateChatRoom = async (req, res, next) => {
    try {

        // pass the user (from jwt) to determine if its customer or vendor
        const data = {
            user: req.user,
            receiverId: req.body.receiverId
        }
        const response = await chatService.getOrCreateChatRoom(data);
        if (!response) {
            throw new Error(formatError("Chat room not created", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (error) {
        logger.error(error);
        next(error);
    }
};

export const getChatRoom = async (req, res, next) => {
    try {
        const { chatRoomId } = req.body;
        const response = await chatService.getChatRoom(chatRoomId);
        if (!response) {
            throw new Error(formatError("Error fetching room", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
}

export const getChatRoomsForUser = async (req, res, next) => {
    try {
        const user = req.user;
        const response = await chatService.getChatRoomsForUser(user);
        if (!response) {
            throw new Error(formatError("Chat rooms not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch(err) {
        logger.error(err);
        next(err);
    }
}

export const sendMessage = async (req, res, next) => {
    try {
        const data = {
            chatRoomId: req.body.chatRoomId,
            senderId: req.user.id,
            content: req.body.content
        }
        const response = await chatService.sendMessage(data);
        if (!response) {
            throw new Error(formatError("Message not sent", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch(err) {
        logger.error(err);
        next(err);
    }
}

export const getMessages = async (req, res, next) => {
    try {
        const { chatRoomId } = req.body;
        const response = await chatService.getMessages(chatRoomId);
        if (!response) {
            throw new Error(formatError("error reading message", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response))
    } catch (err) {
        logger.error(err);
        next(err);
    }
}

export const markAsRead = async (req, res, next) => {
    try {
        const { chatRoomId } = req.body;
        const senderId = req.user.id;
        const response = await chatService.markAsRead(chatRoomId, senderId);
        if (!response) {
            throw new Error(formatError("Error marking as read", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch (err) {
        logger.error(err);
        next(err);
    }
}