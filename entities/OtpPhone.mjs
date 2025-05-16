import { EntitySchema } from "typeorm";

export const OtpPhone = new EntitySchema({
    name: "OtpPhone",
    tableName: "otp_phone",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        phone: {
            type: String,
            unique: true
        },
        verificationSid: {
            type: String
        },
        attempts: {
            type: Number,
            default: 0
        },
        expiresAt: {
            type: Date
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        }
    }
});