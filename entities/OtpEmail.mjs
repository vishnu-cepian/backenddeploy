import { EntitySchema } from "typeorm";

export const OtpEmail = new EntitySchema({
    name: "OtpEmail",
    tableName: "otpEmail",
    indices: [
        { name: "IDX_OTP_EMAIL_EMAIL", columns: ["email"] },
    ],
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