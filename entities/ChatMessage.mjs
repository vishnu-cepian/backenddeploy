import { EntitySchema } from "typeorm";

export const ChatMessage = new EntitySchema({
    name: "ChatMessage",
    tableName: "chat_messages",
    indices: [
        { name: "IDX_CHAT_MESSAGE_ROOM_ID_CREATED_AT", columns: ["chatRoomId", "createdAt"] }
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        chatRoomId: {
            type: "uuid",
            nullable: false
        },
        senderUserId: {
            type: "uuid",
            nullable: false
        },
        content: {
            type: "text",
            nullable: false
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        },
     
    },
    relations: {
        chatRoom: {
            type: "many-to-one",
            target: "ChatRoom",
            joinColumn: {
                name: "chatRoomId"
            },
            cascade: true,
            onDelete: "CASCADE"
        },
        sender: {
            type: "many-to-one",
            target: "User",
            joinColumn: {
                name: "senderUserId"
            },
            cascade: true,
            onDelete: "SET NULL"
        }
    }
});