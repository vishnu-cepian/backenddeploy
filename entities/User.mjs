import { EntitySchema } from "typeorm";
import { Vendor } from "./Vendor.mjs";

export const User = new EntitySchema({
    name: "User",
    tableName: "user",
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
            nullable: true
        },
        role: {
            type: "varchar"
        },
        name: {
            type: "varchar",
            nullable: true
        },
        refreshToken: {
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
