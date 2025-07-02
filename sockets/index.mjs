import jwt from "jsonwebtoken";
import { sendMessage, markAsRead, getChatRoom, getUser } from "../services/chatService.mjs";
import { sendPushNotification } from "../services/notificationService.mjs";
import { ACCESS_TOKEN_SECRET } from '../config/auth-config.mjs';
import { pubClient, subClient } from '../config/redis-config.mjs';
import { createAdapter  } from "@socket.io/redis-adapter";
import { sendError } from "../utils/core-utils.mjs";

export const initializeSocket = (io) => {

    const pubAdapter = createAdapter(pubClient, subClient);
    io.adapter(pubAdapter);

    // ======================= AUTHENTICATION MIDDLEWARE =======================
    io.use(async(Socket, next) => {
        const token = Socket.handshake.auth?.token || Socket.handshake.query?.token; 
        if(!token) {
            return next(new Error("Authentication error: No token"))
        }
        try {
            const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
            Socket.userId = decoded.id;
            Socket.role = decoded.role;
            next();
        } catch (error) {
            console.error(error)
            next(new Error("Authentication error"));
        }
    });

    // ============================ CONNECTION HANDLER ===========================

    io.on("connection_error", (Socket, error) => {
        console.log("Connection error", error);
    });
    io.on("connection", async (Socket) => {

        if (!Socket.userId || !Socket.role) {
            Socket.disconnect(true);
            return;
        }
        console.log("User connected", Socket.userId, Socket.role);

        await pubClient.hset('online_users', Socket.userId, Socket.id);

        Socket.on("joinRoom", async (roomId) => {
            try {

                await Socket.join(roomId);
                await markAsRead(roomId, Socket.userId);
                console.log("User joined room", Socket.userId, roomId);

            } catch (error) {
                console.error("Error joining room", error);
                Socket.emit("error", "Failed to join room");
            }
        }); 

        Socket.on("sendMessage", async ({ roomId, content}, acknowledge) => { 
            let message;
            try {
                
                if(!roomId || !content?.trim()) {
                    throw sendError("Invalid message");
                }
                // saving msg to db
                /**
                 * 
                 * 
                 * USE BULL MQ TO SAVE MESSAGE TO DB
                 *  const message = await messageQueue.add('save_message', {
                    roomId,
                    senderId: socket.userId,
                    content
                });
                 * 
                 */
                message = await sendMessage({
                    chatRoomId: roomId,
                    senderId: Socket.userId,
                    content,
                });

                io.to(roomId).emit("newMessage", message);

                const room = await getChatRoom(roomId);
                if(!room) return;

                const receiverId = Socket.role.toLowerCase() === "customer" ? room.vendorId : room.customerId;
                const receiverUser = await getUser(receiverId);
               
                if(receiverId) {
                    const receiver = await pubClient.hget('online_users', receiverUser.id);
                    console.log("receiver",receiver)
                    const isReceiverOnline = receiver !== null;
                   
                    if(receiverUser.pushToken && !isReceiverOnline) {
                        const fcmToken = receiverUser.pushToken;
                        const title = "New message";
                        const body = message.content;
                        const url = '/chat/' + roomId;    // CHANGE IT LATER
                        await sendPushNotification(fcmToken, title, body, url);
                    }
                }


                acknowledge?.({ status: 'success', message: "Message sent successfully"});
               
            } catch (error) {
                console.error("Error sending message", error);
                Socket.emit("error", "Failed to send message");
                acknowledge?.({ status: 'error', tempId: message.id, message: "Failed to send message"});
            }
        });
        Socket.on("disconnect", async () => {
            console.log("Client disconnected", Socket.id);
            await pubClient.hdel('online_users', Socket.userId);
        }); 
    });

    // ============================ DISCONNECTION HANDLER ===========================
    // NOT USED
    io.on("disconnect", async (Socket) => {
        console.log("Client disconnected", Socket.id);
        await pubClient.hdel('online_users', Socket.userId, Socket.id);
    });

};