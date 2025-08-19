import { EntitySchema } from "typeorm";

export const OtpPhone = new EntitySchema({
    name: "OtpPhone",
    tableName: "otp_phone",
    indices: [
        { name: "IDX_OTP_PHONE_PHONE", columns: ["phone"], unique: true },
    ],
    columns: {
        id: {
            type: "uuid",
            primary: true,
            generated: "uuid",
        },
        phone: {
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