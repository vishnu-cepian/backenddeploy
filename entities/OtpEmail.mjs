import { EntitySchema } from "typeorm";

export const OtpEmail = new EntitySchema({
    name: "OtpEmail",
    tableName: "otpEmail",
    columns: {
        id: {
            type: "uuid",
            primary: true,
            generated: "uuid",
        },
        email: {
            type: "varchar",
            unique: true,
            nullable: false,
        },
        otp: {
            type: "varchar",
            nullable: false,
        },
        expiresAt: {
            type: "timestamp",
            nullable: false,
        },
    },
});