import { EntitySchema } from "typeorm";

export const OtpPhone = new EntitySchema({
    name: "OtpPhone",
    tableName: "otp_phone",
    indices: [
        { name: "IDX_OTP_PHONE_PHONE_NUMBER", columns: ["phoneNumber"], unique: true },
    ],
    columns: {
        id: {
            type: "uuid",
            primary: true,
            generated: "uuid",
        },
        phoneNumber: {
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