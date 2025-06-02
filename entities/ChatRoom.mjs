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
        customerId: {
            type: "uuid",
            nullable: false
        },
        vendorId: {
            type: "uuid",
            nullable: false
        },
        lastMessage: {
            type: "text",
            nullable: true
        },
        lastMessageAt : {
            type: "timestamp",
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
            target: "Customers",
            joinColumn: {
                name: "customerId"
            },
            cascade: true,
            onDelete: "CASCADE"
        },
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: {
                name: "vendorId"
            },
            cascade: true,
            onDelete: "CASCADE"
        }
    }
});