import jwt from "jsonwebtoken";
import { sendMessage, markAsRead, getChatRoom, getUser } from "../services/chatService.mjs";
import { sendPushNotification } from "../services/notificationService.mjs";
import { ACCESS_TOKEN_SECRET } from '../config/auth-config.mjs';
/*

    for postman testing do-> file->new->websocket
    uri:- ws://localhost:8000/socket.io/?EIO=4&transport=websocket
    add token as params
    after connecting first send 40 as text for initiating handshake
    then send the message by 42 (ex:- 42["joinRoom", "roomId"])


*/

export const initializeSocket = (io) => {

    // ======================= AUTHENTICATION MIDDLEWARE =======================
    io.use(async(Socket, next) => {
        const token = Socket.handshake.auth?.token || Socket.handshake.query?.token; 
        if(!token) {
            return next(new Error("Authentication error: No token"))
        }
        try {
            const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
            // const user = await AppDataSource.getRepository(User).findOne({
            //     where: {
            //         id: payload.id
            //     }
            // });
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
    io.on("connection", (Socket) => {
        console.log("connected")
        Socket.on("joinRoom", async (roomId) => {
            Socket.join(roomId);
            await markAsRead(roomId, Socket.userId);
            console.log("User joined room", Socket.userId, roomId);
        }); 
        //42["sendMessage",{"roomId":"746d331a-9191-4141-ba5d-8f8a424f92c0","content":"HELLO"}]
        Socket.on("sendMessage", async ({ roomId, content}) => { 
            try {
                // saving msg to db
                const message = await sendMessage({
                    chatRoomId: roomId,
                    senderId: Socket.userId,
                    content,
                });
                // Emit to room via socket
                io.to(roomId).emit("newMessage", message);

                // Get receiver user
                const room = await getChatRoom(roomId);
                if(!room) {
                    throw new Error("Room not found");
                }
                const receiverId = Socket.role === "CUSTOMER" ? room.vendorId : room.customerId;
                const receiverUser = await getUser(receiverId);
                
                // check if receiver is online
                
                if(receiverUser) {
                const roomSockets = await io.in(roomId).fetchSockets();
                const isReceiverOnline = roomSockets.some(socket => socket.userId === receiverUser.id);
                // console.log(isReceiverOnline, receiverUser.pushToken)
                // send FCM if offline
                if(receiverUser.pushToken && !isReceiverOnline) {
                    // console.log("sending FCM")
                    const fcmToken = receiverUser.pushToken;
                    const title = "New message";
                    const body = content;
                    await sendPushNotification(fcmToken, title, body);
                    }
                }
            } catch (error) {
                console.error("Error sending message", error);
                Socket.emit("error", "Failed to send message");
            }
        });
    });

    // ============================ DISCONNECTION HANDLER ===========================

    io.on("disconnect", (Socket) => {
        console.log("Client disconnected", Socket.id);
    });

};