import { EntitySchema } from "typeorm";

export const UpdateLog = new EntitySchema({
    name: "UpdateLog",
    tableName: "updateLogs",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        oldData: {
            type: "json",
            nullable: false
        },
        newData: {
            type: "json",
            nullable: false
        },
        reason: {
            type: "varchar",
            nullable: false
        },
        updatedAt: {
            type: "timestamp",
            createDate: true
        },
    },
});
