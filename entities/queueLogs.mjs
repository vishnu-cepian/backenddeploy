import { EntitySchema } from "typeorm";

export const QueueLogs = new EntitySchema({
    name: "QueueLogs",
    tableName: "queueLogs",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        queueName: {
            type: "varchar",
            nullable: false
        },
        jobId: {
            type: "varchar",
            nullable: false
        },
        jobData: {
            type: "json",
            nullable: false
        },
        reason: {
            type: "varchar",
            nullable: false
        },
        failedAt: {
            type: "timestamp",
            createDate: true
        },
    },
});
