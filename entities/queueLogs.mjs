import { EntitySchema } from "typeorm";

export const QueueLogs = new EntitySchema({
    name: "QueueLogs",
    tableName: "queueLogs",
    indices: [
        { name: "IDX_QUEUE_LOGS_LOOKUP", columns: ["queueName", "failedAt"] },
        { name: "IDX_QUEUE_LOGS_JOB_ID", columns: ["jobId"] },
    ],
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
