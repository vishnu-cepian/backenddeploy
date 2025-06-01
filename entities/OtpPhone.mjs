import { EntitySchema } from "typeorm";

export const OtpPhone = new EntitySchema({
    name: "OtpPhone",
    tableName: "otp_phone",
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