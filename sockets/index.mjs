import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source.mjs";
import { ChatRoom } from "../entities/ChatRoom.mjs";
import { ChatMessage } from "../entities/ChatMessage.mjs";
import { User } from "../entities/User.mjs";

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
            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
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
        console.log(Socket)
        // const {id, role} = Socket.user;
        // console.log("New client connected", id, role);

        // Socket.on("joinRoom", async (roomId) => {
        //     const room = await AppDataSource.getRepository(ChatRoom).findOne({
        //         where: {
        //             id: roomId
        //         }
        //     });
        //     if (!room) {
        //         Socket.emit("error", "Room not found");
        //         return;
        //     }
        //     Socket.join(roomId);
        //     Socket.roomId = roomId;
        // }); 

        Socket.on("sendMessage", async (content) => {
            console.log(content)
            
            Socket.emit("receiveMessage", content);
        });

        Socket.on("disconnect", () => {
            console.log("Client disconnected",Socket.id);
        });
        
        
    });
};


