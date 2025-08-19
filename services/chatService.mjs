import { z } from 'zod';
import { AppDataSource } from "../config/data-source.mjs";
import { ChatMessage } from "../entities/ChatMessage.mjs";
import { ChatRoom } from "../entities/ChatRoom.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { ROLE } from '../types/enums/index.mjs';
import { ChatReadState } from '../entities/ChatReadState.mjs';
import { getPresignedViewUrl } from "./s3service.mjs";
import { Not } from "typeorm";
//=================== ZOD VALIDATION SCHEMAS ====================

const getOrCreateChatRoomSchema = z.object({
  currentUserId: z.string().uuid(),
  currentUserRole: z.enum([ROLE.CUSTOMER, ROLE.VENDOR]),
  receiverId: z.string().uuid(),
});

const getMessagesSchema = z.object({
    userId: z.string().uuid(),
    chatRoomId: z.string().uuid(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(30),
});

//=================== CHAT SERVICES ====================

/**
 * Gets an existing chat room or creates a new one between a customer and a vendor.
 *
 * @param {Object} data - The input data containing user and receiver IDs.
 * @returns {Promise<ChatRoom>} The found or newly created chat room entity.
 */
export const getOrCreateChatRoom = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { currentUserId, currentUserRole, receiverId } = getOrCreateChatRoomSchema.parse(data);

        if (currentUserId === receiverId) {
            throw sendError("Cannot create a chat room with yourself.", 400);
        }
        
        let customerId, vendorId, customerUserId, vendorUserId;

        // Determine who is the customer and who is the vendor based on the role
        if (currentUserRole === ROLE.CUSTOMER) {
            const customer = await queryRunner.manager.findOne(Customers, { where: { userId: currentUserId }, select: ['id', 'userId'] });
            const vendor = await queryRunner.manager.findOne(Vendors, { where: { id: receiverId }, select: ['id', 'userId'] });
            if (!customer || !vendor) throw sendError("Invalid customer or vendor.", 404);
            customerId = customer.id;
            vendorId = vendor.id;
            customerUserId = customer.userId;
            vendorUserId = vendor.userId;
        } else { // currentUserRole is VENDOR
            const vendor = await queryRunner.manager.findOne(Vendors, { where: { userId: currentUserId }, select: ['id', 'userId'] });
            const customer = await queryRunner.manager.findOne(Customers, { where: { id: receiverId }, select: ['id', 'userId'] });
            if (!customer || !vendor) throw sendError("Invalid customer or vendor.", 404);
            vendorId = vendor.id;
            customerId = customer.id;
            customerUserId = customer.userId;
            vendorUserId = vendor.userId;
        }

        let room = await queryRunner.manager.findOne(ChatRoom, { where: { customerId, vendorId } });

        if (!room) {
            room = queryRunner.manager.create(ChatRoom, { customerId, vendorId, customerUserId, vendorUserId });
            await queryRunner.manager.save(ChatRoom, room);
        }

        await queryRunner.commitTransaction();
        return room;

    } catch (err) {
        if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
        }
        if (err instanceof z.ZodError) {
            logger.warn("getOrCreateChatRoom validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid data provided.", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in getOrCreateChatRoom:", err);
        throw err;
    } finally {
        await queryRunner.release();
    }
};

/**
 * Fetches all chat rooms for a user, optimized to avoid N+1 queries.
 *
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Array>} A list of the user's chat rooms with metadata.
 */
export const getChatRoomsForUser = async (userId) => {
    try {
        // This complex query is highly performant. It uses subqueries to get
        // the last message and unread count for every chat room in a single database call.
        const rooms = await AppDataSource.getRepository(ChatRoom).createQueryBuilder("room")
            .leftJoinAndSelect("room.customer", "customer")
            .leftJoinAndSelect("room.vendor", "vendor")
            .leftJoinAndSelect("customer.user", "customerUser")
            .leftJoinAndSelect("vendor.user", "vendorUser")
            .select([
                "room.id",
                "room.updatedAt",
            ])
            .addSelect(subQuery => {
                return subQuery.select("msg.content").from(ChatMessage, "msg").where("msg.chatRoomId = room.id").orderBy("msg.createdAt", "DESC").limit(1);
            }, "lastMessageContent")
            .addSelect(subQuery => {
                return subQuery
                    .select("COUNT(msg.id)")
                    .from(ChatMessage, "msg")
                    .where("msg.chatRoomId = room.id")
                    .andWhere("msg.senderUserId != :userId", { userId })
                    .andWhere(`msg."createdAt" > COALESCE((
                            SELECT "lastReadAt"
                            FROM chat_read_state
                            WHERE "chatRoomId" = room.id AND "userId" = :userId
                        ), '1970-01-01 00:00:00')`);
            }, "unreadCount")
            .addSelect(`CASE 
                            WHEN customerUser.id = :userId  THEN 
                                vendorUser.name 
                            ELSE 
                                customerUser.name 
                        END`, "receiverName")
            .addSelect(`CASE 
                            WHEN customerUser.id = :userId  THEN 
                                vendor."shopImageUrlPath"
                            ELSE 
                                customer."profilePicture"
                        END`, "receiverImage")
            .addSelect(`CASE    
                            WHEN customerUser.id = :userId  THEN 
                                vendor."userId"
                            ELSE 
                                customer."userId"
                        END`, "receiverUserId")
            .where("customerUser.id = :userId OR vendorUser.id = :userId", { userId })
            .orderBy("room.updatedAt", "DESC")
            .getRawAndEntities();

        // The query returns both raw data (for our custom fields) and entities. We need to merge them.
        return await Promise.all(rooms.entities.map(async (room, index) => {
            const raw = rooms.raw[index];
            return {
                ...room,
                id: raw.room_id,
                receiverName: raw.receiverName,
                receiverImage: raw.receiverImage ? await getPresignedViewUrl(raw.receiverImage) : null,
                receiverUserId: raw.receiverUserId,
                updatedAt: raw.room_updatedAt,
                lastMessage: raw.lastMessageContent,
                unreadCount: parseInt(raw.unreadCount, 10) || 0,
            };
        }));
    } catch(err) {
        logger.error("Error in getChatRoomsForUser:", err);
        throw err;
    }
};

/**
 * Fetches a paginated list of messages for a specific chat room.
 *
 * @param {Object} data - The input data.
 * @returns {Promise<Array>} A paginated list of messages.
 */
export const getMessages = async (data) => {
    try {
        const { userId, chatRoomId, page, limit } = getMessagesSchema.parse(data);
        const offset = (page - 1) * limit;

        // AUTHORIZATION
        const isMember = await AppDataSource.getRepository(ChatRoom).createQueryBuilder("room")
            .where("room.id = :chatRoomId", { chatRoomId })
            .andWhere("(room.customerUserId = :userId OR room.vendorUserId = :userId)", { userId })
            .getExists();

        if (!isMember) {
            throw sendError("You are not authorized to view these messages.", 403);
        }

        const [messages, totalCount] = await Promise.all ([
            AppDataSource.getRepository(ChatMessage).find({
            where: { chatRoomId },
            order: { createdAt: "DESC" },
            skip: offset,
            take: limit,
        }),
            AppDataSource.getRepository(ChatMessage).count({
                where: { chatRoomId },
            })
        ]);

        const readState = await AppDataSource.getRepository(ChatReadState).findOne({
            where: { chatRoomId, userId: Not(userId) },
        });

        return {
            messages: messages.map(m => ({
                id: m.id,
                chatRoomId: m.chatRoomId,
                content: m.content,
                createdAt: m.createdAt,
                senderId: m.senderUserId,
                isRead: readState ? m.createdAt <= readState.lastReadAt : false,
            })),
            pagination: {
                hasMore: offset + messages.length < totalCount,
                page,
                limit,
            }
        }
    } catch(err) {
        if (err instanceof z.ZodError) {
            logger.warn("getMessages validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid data provided.", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in getMessages:", err);
        throw err;
    }
};

/**
 * Marks messages in a room as read for a specific user.
 *
 * @param {string} chatRoomId - The ID of the chat room.
 * @param {string} userId - The ID of the user whose messages should be marked as read.
 * @param {string} lastReadMessageId - The ID of the last message that was read.
 */
export const markAsRead = async (chatRoomId, userId, lastReadMessageId) => {
    try {
        await AppDataSource.getRepository(ChatReadState).createQueryBuilder()
            .insert()
            .values({
                userId,
                chatRoomId,
                lastReadMessageId,
                lastReadAt: () => "NOW()",
            })
            .orUpdate(
                ["lastReadMessageId", "lastReadAt"],
                ["userId", "chatRoomId"]
                )
                .execute();
    } catch(err) {
        logger.error("Error in markAsRead:", err);
        throw err;
    }
};

export const sendMessage = async (data) => {
    try {
        const { chatRoomId, senderId, content } = data;

        if (!content || content.trim() === "") {
            throw sendError("Message cannot be empty",400);
        }

        const chatRoom = await AppDataSource.getRepository(ChatRoom).findOne({
            where: {
                id: chatRoomId
            }
        })
        if(!chatRoom) {
            throw sendError("Chat room not found",404);
        }
        const message = AppDataSource.getRepository(ChatMessage).create({
            chatRoom: chatRoom,
            senderUserId: senderId,
            content: content
        })
        await AppDataSource.getRepository(ChatMessage).save(message);

        return message;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}

export const getChatRoom = async (chatRoomId) => {
    try {
        const chatRoom = await AppDataSource.getRepository(ChatRoom).findOne({
            where: {
                id: chatRoomId
            },
            select: {
                customerUserId: true,
                vendorUserId: true
            }
        })
        return chatRoom;
    } catch(err) {
        logger.error(err);
        throw err;
    }
}