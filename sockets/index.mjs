import jwt from "jsonwebtoken";
import { z } from 'zod';
import { createAdapter } from "@socket.io/redis-adapter";
import { ACCESS_TOKEN_SECRET } from '../config/auth-config.mjs';
import { pubClient, subClient } from '../config/redis-config.mjs';
import { chatQueue, pushQueue } from "../queues/index.mjs";
import * as chatService from "../services/chatService.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { ChatMessage } from "../entities/ChatMessage.mjs";
import { sendError } from "../utils/core-utils.mjs";

//=================== ZOD VALIDATION SCHEMAS ====================

const joinRoomSchema = z.string().uuid();

const sendMessageSchema = z.object({
  roomId: z.string().uuid(),
  content: z.string().min(1).max(2000), 
});

//=================== SOCKET INITIALIZATION ====================

export const initializeSocket = (io) => {
    io.adapter(createAdapter(pubClient, subClient));

    // AUTHENTICATION MIDDLEWARE
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }
        try {
            const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
            socket.user = { id: decoded.id, role: decoded.role };
            next();
        } catch (error) {
            logger.warn("Socket authentication failed:", error.message);
            next(new Error("Authentication error: Invalid token"));
        }
    });

    // CONNECTION HANDLER
    io.on("connection", (socket) => {
        if (!socket.user?.id) {
            return socket.disconnect(true);
        }
        logger.info(`User connected: ${socket.user.id}, Socket ID: ${socket.id}`);
        pubClient.hset('online_users', socket.user.id, socket.id);

        io.emit("userOnline", { userId: socket.user.id });

        // CENTRALIZED EVENT ERROR HANDLER
        const withErrorHandling = (handler) => async (payload, callback) => {
            try {
                await handler(payload, callback);
            } catch (error) {
                logger.error(`Socket Event Error for user ${socket.user.id}:`, error);
                const errorMessage = error instanceof z.ZodError ? "Invalid data provided." : "An error occurred.";
                if (typeof callback === 'function') {
                    callback({ status: 'error', message: errorMessage });
                }
            }
        };

        socket.on("checkUserOnline", async (targetUserId, callback) => {
            const socketId = await pubClient.hget("online_users", targetUserId);
            const isOnline = !!socketId;
            if (typeof callback === "function") {
                callback({ userId: targetUserId, online: isOnline });
            }
        });
        
        socket.on("joinRoom", withErrorHandling(async (roomId, callback) => {
            const validatedRoomId = joinRoomSchema.parse(roomId);
            await socket.join(validatedRoomId);
            io.to(validatedRoomId).emit("userJoinedRoom", { userId: socket.user.id, roomId: validatedRoomId });
            // fetch latest message id
            const lastMessage = await AppDataSource.getRepository(ChatMessage).findOne({
                where: { chatRoomId: validatedRoomId },
                order: { createdAt: "DESC" },
                select: ["id"],
            });
        
            if (lastMessage) {
                await chatService.markAsRead(validatedRoomId, socket.user.id, lastMessage.id);
            }
        
            logger.info(`User ${socket.user.id} joined room ${validatedRoomId}`);
            if (typeof callback === "function") callback({ status: "success" });
        }));

        socket.on("leaveRoom", withErrorHandling(async (roomId, callback) => {
            const validatedRoomId = joinRoomSchema.parse(roomId);
            await socket.leave(validatedRoomId);
            io.to(validatedRoomId).emit("userLeftRoom", { userId: socket.user.id, roomId: validatedRoomId });
            if (typeof callback === "function") callback({ status: "success" });
        }));
        

        socket.on("sendMessage", withErrorHandling(async (payload, callback) => {
            const { roomId, content } = sendMessageSchema.parse(payload);

            const message = {
                chatRoomId: roomId,
                senderId: socket.user.id,
                content,
                createdAt: new Date().toISOString(),
            };

            const saved = await chatService.sendMessage(message);

            /**
             * 
             * if any PROBLEM ARISE WITH UNREADCOUNT THEN USE THIS CODE LOGIC
             * 
             * await chatQueue.add('markSenderRead', {chatRoomId: roomId, senderId: socket.user.id, messageId: saved.id})  //also ensure markAsRead function to use the queue
             * 
             * 
             * 
             * 
             * 
             */
            // Emit to room for real-time delivery
            io.to(roomId).emit("newMessage", {id: saved.id, roomId: saved.chatRoomId, senderId: saved.senderUserId, content: saved.content, createdAt: saved.createdAt} );


            const room = await chatService.getChatRoom(roomId);
            if (!room) throw sendError("Chat room not found",404);

            const receiverUserId = socket.user.id === room.customerUserId ? room.vendorUserId : room.customerUserId;

            const socketInRoom = io.sockets.adapter.rooms.get(roomId) || new Set();

            let receiverPresent = false;

            for (const socketId of socketInRoom) {
                const s = io.sockets.sockets.get(socketId);
                if (s?.user?.id === receiverUserId) {
                    receiverPresent = true;
                    break;
                }
            }

            if (receiverPresent) {
                await chatService.markAsRead(roomId, socket.user.id, saved.id);
                io.to(roomId).emit("messageRead", {id: saved.id, roomId: saved.chatRoomId, senderId: saved.senderUserId, content: saved.content, createdAt: saved.createdAt});
            }

            const isReceiverOnline = await pubClient.hget('online_users', receiverUserId);

            if (isReceiverOnline && !receiverPresent) {
                io.to(isReceiverOnline).emit("chatNotification", {id: saved.id, roomId: saved.chatRoomId, senderId: saved.senderUserId, content: saved.content, createdAt: saved.createdAt});
            }

            if (!isReceiverOnline && receiverUserId) {
                const receiverUser = await AppDataSource.getRepository(User).findOne({ where: { id: receiverUserId }, select: ['pushToken'] });
                if (receiverUser?.pushToken) {
                    await pushQueue.add('sendChatMessageNotification', {
                        token: receiverUser.pushToken,
                        title: "New Message",
                        message: content,
                        data: { roomId, type: 'NEW_CHAT_MESSAGE' }
                    });
                }
            }

            if (typeof callback === 'function') callback({ status: 'success', message: "Message sent successfully" });
        }));

        // DISCONNECTION HANDLER
        socket.on("disconnect", () => {
            logger.info(`User disconnected: ${socket.user.id}, Socket ID: ${socket.id}`);
            pubClient.hdel('online_users', socket.user.id);

            io.emit("userOffline", { userId: socket.user.id });
        });
    });
};