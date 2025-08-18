import { EntitySchema } from "typeorm";

export const ChatReadState = new EntitySchema({
    name: "ChatReadState",
    tableName: "chat_read_state",
    indices: [
        { name: "unique_user_chat_room", columns: ["userId", "chatRoomId"], unique: true }
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        userId: {
            type: "uuid",
            nullable: false
        },
        chatRoomId: {
            type: "uuid",
            nullable: false
        },
        lastReadMessageId: {
            type: "uuid",
            nullable: true
        },
        lastReadAt: {
            type: "timestamp",
            nullable: true
        },
        updatedAt: {
            type: "timestamp",
            updateDate: true
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
        user: {
            type: "many-to-one",
            target: "User",
            joinColumn: {
                name: "userId"
            },
            cascade: true,
            onDelete: "SET NULL"
        },
        lastReadMessage: {
            type: "many-to-one",
            target: "ChatMessage",
            joinColumn: {
                name: "lastReadMessageId"
            },
            cascade: true,
            onDelete: "SET NULL"
        }
    }
});