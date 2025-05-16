import { EntitySchema } from "typeorm";
import { User } from "./User.mjs"; 


export const Vendor = new EntitySchema({
    name: "Vendor",
    tableName: "vendor",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        userId: {
            type: "uuid",
            unique: true
        },
        fullName: {
            type: "varchar"
        },
        email: {
            type: "varchar",
            unique: true
        },
        phoneNumber: {
            type: "varchar"
        },
        profilePictureUrl: {
            type: "varchar"
        },
        aadhaarUrl: {
            type: "varchar"
        },
        aadhaarNumber: {
            type: "varchar",
            unique: true
        },
        bankPassbookUrl: {
            type: "varchar"
        },
        accountNumber: {
            type: "varchar"
        },
        ifscCode: {
            type: "varchar"
        },
        accountHolderName: {
            type: "varchar"
        },
        serviceType: {
            type: "varchar"
        },
        latitude: {
            type: "varchar"
        },
        longitude: {
            type: "varchar"
        },
        isVerified: {
            type: "boolean",
            default: false
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
        user: {
            type: "one-to-one",
            target: "User",
            joinColumn: {
                name: "userId"
            },
            cascade: true,
            onDelete: "CASCADE"
        }
    }
});