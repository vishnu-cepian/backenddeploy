import { EntitySchema } from "typeorm";

export const ChatRoom = new EntitySchema({
    name: "ChatRoom",
    tableName: "chat_rooms",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        customerUserId: {
            type: "uuid",
            nullable: false
        },
        vendorUserId: {
            type: "uuid",
            nullable: false
        },
        lastMessage: {
            type: "text",
            nullable: true
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        },
        updatedAt: {
            type: "timestamp",
            updateDate: true
        }
    },
    relations: {
        customer: {
            type: "many-to-one",
            target: "User",
            joinColumn: {
                name: "customerUserId"
            },
            cascade: true,
            onDelete: "CASCADE"
        },
        vendor: {
            type: "many-to-one",
            target: "User",
            joinColumn: {
                name: "vendorUserId"
            },
            cascade: true,
            onDelete: "CASCADE"
        }
    }
});