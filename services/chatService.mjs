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
import { pubClient } from '../config/redis-config.mjs';

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
 * @api {post} /api/chat/getOrCreateChatRoom/:receiverId Get or Create Chat Room
 * @apiName GetOrCreateChatRoom
 * @apiGroup Chat
 * @apiDescription Gets an existing chat room or creates a new one between two users. This function is transactional, ensuring data integrity.
 *
 * @apiParam {object} data - The input data for creating or finding a chat room.
 * @param {string} data.currentUserId - The UUID of the user initiating the request.
 * @param {string} data.currentUserRole - The role of the initiating user ('customer' or 'vendor').
 * @param {string} data.receiverId - The UUID of the other participant.
 *
 * @apiSuccess {Object} ChatRoom The found or newly created chat room entity.
 *
 * @apiError {Error} 400 - If the user tries to create a chat room with themselves.
 * @apiError {Error} 400 - If the input data fails Zod validation.
 * @apiError {Error} 404 - If either the customer or vendor is not found.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const getOrCreateChatRoom = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { currentUserId, currentUserRole, receiverId } = getOrCreateChatRoomSchema.parse(data);

        if (currentUserId === receiverId) {
            throw sendError("Cannot create a chat room with yourself", 400);
        }

        // Helper to find a user by their user ID to handle different inputs.
        const findUser = async (repo, id, selectOptions) => {
            return await repo.findOne({ where: [{ id }, { userId: id }], select: selectOptions });
        };
        
        let customer, vendor;


        if (currentUserRole === ROLE.CUSTOMER) {
            customer = await findUser(queryRunner.manager.getRepository(Customers), currentUserId, ['id', 'userId']);
            vendor = await findUser(queryRunner.manager.getRepository(Vendors), receiverId, ['id', 'userId']);
        } else { // currentUserRole is VENDOR
            vendor = await findUser(queryRunner.manager.getRepository(Vendors), currentUserId, ['id', 'userId']);
            customer = await findUser(queryRunner.manager.getRepository(Customers), receiverId, ['id', 'userId']);
        }

        if (!customer || !vendor) {
            throw sendError("Invalid customer or vendor.", 404);
        }

        let room = await queryRunner.manager.findOne(ChatRoom, { 
            where: { customerId: customer.id, vendorId: vendor.id } 
        });

        if (!room) {
            room = queryRunner.manager.create(ChatRoom, { 
                customerId: customer.id, 
                vendorId: vendor.id, 
                customerUserId: customer.userId, 
                vendorUserId: vendor.userId 
            });
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
 * @api {get} /api/chat/getChatRoomsForUser Get Chat Rooms
 * @apiName GetChatRoomsForUser
 * @apiGroup Chat
 * @apiDescription Fetches all chat rooms for a user, optimized with a single, powerful query to avoid the N+1 problem. It retrieves the last message, unread count, and receiver details for each room.
 *
 * @apiParam {string} userId - The UUID of the user whose chat rooms are to be fetched.
 *
 * @apiSuccess {Object[]} rooms - A list of the user's chat rooms with enhanced metadata.
 * @apiSuccess {string} rooms.id - The chat room's UUID.
 * @apiSuccess {string} rooms.receiverName - The name of the other participant.
 * @apiSuccess {string} rooms.receiverImage - A presigned URL for the other participant's profile image.
 * @apiSuccess {string} rooms.receiverUserId - The UUID of the other participant.
 * @apiSuccess {string} rooms.status - The online status ('online' or 'offline').
 * @apiSuccess {string} rooms.updatedAt - The timestamp of the last activity.
 * @apiSuccess {string} rooms.lastMessage - The content of the last message sent.
 * @apiSuccess {number} rooms.unreadCount - The number of unread messages for the user.
 *
 * @apiError {Error} 500 - Internal Server Error.
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
                status: await pubClient.hget("online_users", raw.receiverUserId) ? "online" : "offline",
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