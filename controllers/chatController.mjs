import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import * as chatService from "../services/chatService.mjs";

export const getOrCreateChatRoom = async (req, res, next) => {
    try {
        const data = {
            currentUserId: req.user.id,
            currentUserRole: req.user.role,
            receiverId: req.params.receiverId
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

export const getChatRoomsForUser = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const response = await chatService.getChatRoomsForUser(userId);
        if (!response) {
            throw new Error(formatError("Chat rooms not found", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
    } catch(err) {
        logger.error(err);
        next(err);
    }
}

export const getMessages = async (req, res, next) => {
    try {
        const data = {
            userId: req.user.id,
            chatRoomId: req.params.chatRoomId,
            page: parseInt(req.params.page),
            limit: parseInt(req.params.limit)
        }
        const response = await chatService.getMessages(data);
        if (!response) {
            throw new Error(formatError("error reading message", response));
        }
        res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response))
    } catch (err) {
        logger.error(err);
        next(err);
    }
}

