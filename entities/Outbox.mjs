import { EntitySchema } from "typeorm";


export const Outbox = new EntitySchema({
    name: "Outbox",
    tableName: "outbox",
    indices: [
        { name: "IDX_OUTBOX_PENDING_MESSAGES", columns: ["status", "createdAt"] },
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        eventType: {
            type: "varchar",
            nullable: false
        },
        payload: {
            type: "jsonb",
            nullable: false
        },
        status: {
            type: "varchar",
            nullable: false
        },
        failureReason: {
            type: "text",
            nullable: true
        },
        statusUpdatedAt: {
            type: "timestamp",
            nullable: true
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        },
    },
});
