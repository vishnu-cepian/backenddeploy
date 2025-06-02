import { sendError } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { ChatMessage } from "../entities/ChatMessage.mjs";
import { ChatRoom } from "../entities/ChatRoom.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { User } from "../entities/User.mjs";
import { Not } from "typeorm";


const chatMessageRepo = AppDataSource.getRepository(ChatMessage);
const chatRoomRepo = AppDataSource.getRepository(ChatRoom);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);
const userRepo = AppDataSource.getRepository(User);

export const getOrCreateChatRoom = async (data) => {
    try {
        const { user, receiverId } = data;
        // Determine customerId and vendorId based on user role
        // If user is customer, they are customerId and receiver is vendorId
        // Otherwise user is vendorId and receiver is customerId
        let customerId, vendorId;
        if(user.role === "CUSTOMER") {
            customerId = user.id;
            vendorId = receiverId;

            const customer = await customerRepo.findOne({
                where: {
                    userId: customerId
                }
            })
            if (!customer) {
                throw sendError("No customer found",404);
            }
            customerId = customer.id;   // gets the customerId from the userId
        } else {
            vendorId = user.id;
            customerId = receiverId;
     
            const vendor = await vendorRepo.findOne({
                where: {
                    userId: vendorId
                }
            })
            if(!vendor) {
                throw sendError("No vendor found",404);
            }
            vendorId = vendor.id;   // gets the vendorId from the userId
        }

        // Ensure both IDs are defined before querying
        if (!customerId || !vendorId) {
            throw sendError('Both customerId and vendorId must be defined');
        }
        
        let room = await chatRoomRepo.findOne({
            where: {
                customerId: customerId,
                vendorId: vendorId
            }
        });

        if(!room) {          
            room = chatRoomRepo.create({
                customerId: customerId,
                vendorId: vendorId
            })
            await chatRoomRepo.save(room);
        }
        return room;
        
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const getChatRoom = async (chatRoomId) => {
    try {
        const chatRoom = await chatRoomRepo.findOne({
            where: {
                id: chatRoomId
            }
        })
        return chatRoom;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const getChatRoomsForUser = async (user) => {
    try {
        let chatRooms;
        const userId = user.id;
        if(user.role === "CUSTOMER") {
            const customer = await customerRepo.findOne({
                where: {
                    userId: userId
                }
            })
            if(!customer) {
                throw sendError("No customer found",404);
            }
            chatRooms = await chatRoomRepo.find({
                where: {
                    customerId: customer.id
                },
                order: {
                    updatedAt: "DESC"
                }
            })
        } else {
            const vendor = await vendorRepo.findOne({
                where: {
                    userId: userId
                }
            })
            if(!vendor) {
                throw sendError("No vendor found",404);
            }
            chatRooms = await chatRoomRepo.find({
                where: {
                    vendorId: vendor.id
                },
                order: {
                    updatedAt: "DESC"
                }
            })
        }

        // TO ADD LAST MESSAGE AND UNREAD COUNT 

        const enrichedRooms = await Promise.all(chatRooms.map(async (room) => {
            const lastMessage = await chatMessageRepo.findOne({
                where: {
                    chatRoomId: room.id
                },
                order: {
                    createdAt: "DESC"
                }
            })
            const unreadCount = await chatMessageRepo.count({
                where: {
                    chatRoomId: room.id,
                    senderId: Not(user.id),
                    isRead: false
                }
            })
            return {
                ...room,
                lastMessage: lastMessage,
                unreadCount: unreadCount
            }
        }))
        return enrichedRooms;


        return chatRooms;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const sendMessage = async (data) => {
    try {
        const { chatRoomId, senderId, content } = data;

        if (!content || content.trim() === "") {
            throw sendError("Message cannot be empty",400);
        }

        const chatRoom = await chatRoomRepo.findOne({
            where: {
                id: chatRoomId
            }
        })
        if(!chatRoom) {
            throw sendError("Chat room not found",404);
        }
        const message = chatMessageRepo.create({
            chatRoom: chatRoom,
            senderId: senderId,
            content: content
        })
        await chatMessageRepo.save(message);

        chatRoom.lastMessage = content;
        chatRoom.lastMessageAt = new Date();
        chatRoom.updatedAt = new Date();
        await chatRoomRepo.save(chatRoom);
        return message;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const getMessages = async (chatRoomId) => {
    try  {
        const messages = await chatMessageRepo.find({
            where: {
                chatRoomId: chatRoomId, 
            },
            order: {
                createdAt: "ASC"
            }
        })
        
        return messages;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const markAsRead = async (chatRoomId, senderId) => {
    try {
        const messages = await chatMessageRepo.find({
            where: {
                chatRoomId: chatRoomId,
                isRead: false,
                senderId: Not(senderId)
            }
        })
        messages.forEach(async (message) => {
            message.isRead = true;
            await chatMessageRepo.save(message);
        })
        return messages;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const getUser = async (userId) => {
    try {
        let uId;
        const customer = await customerRepo.findOne({
            where: {
                id: userId
            }
        })
        if(customer) {
            uId = customer.userId;
        }
        const vendor = await vendorRepo.findOne({
            where: {
                id: userId
            }
        })
        if(vendor) {
            uId = vendor.userId;
        }
        const user = await userRepo.findOne({
            where: {
                id: uId
            }
        })
        return user;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}