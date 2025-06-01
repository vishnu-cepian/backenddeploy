import { EntitySchema } from "typeorm";


export const User = new EntitySchema({
    name: "User",
    tableName: "user",
    indices: [
        { name: "user_role_idx", columns: ["role"] },
        { name: "user_refreshtoken_idx", columns: ["refreshToken"] },
        { name: "user_fullname_idx", columns: ["name"] }
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        email: {
            type: "varchar",
            unique: true
        },
        password: {
            type: "varchar",
        },
        role: {
            type: "varchar"
        },
        name: {
            type: "varchar",
        },
        phoneNumber: {
            type: "varchar",
            nullable: true
        },
        refreshToken: {
            type: "varchar",
            nullable: true
        },
        pushToken: {
            type: "varchar",
            nullable: true      // make it false in prod
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
