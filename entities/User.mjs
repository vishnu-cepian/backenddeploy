import { EntitySchema } from "typeorm";
import { ROLE } from "../types/enums/index.mjs";

export const User = new EntitySchema({
    name: "User",
    tableName: "user",
    indices: [
        { name: "user_email_idx", columns: ["email"], unique: true },
        { name: "user_role_idx", columns: ["role"] },
        { name: "user_refreshtoken_idx", columns: ["refreshToken"] },
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        email: {
            type: "varchar",
            unique: true,
            nullable: false
        },
        password: {
            type: "varchar",
            nullable: false
        },
        role: {
            type: "varchar",
            enum: Object.values(ROLE),
            nullable: false
        },
        name: {
            type: "varchar",
            nullable: false
        },
        phoneNumber: {
            type: "varchar",
            nullable: false
        },
        isBlocked: {
            type: "boolean",
            default: false
        },
        refreshToken: {
            type: "varchar",
            nullable: true
        },
        pushToken: {
            type: "varchar",
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
});
