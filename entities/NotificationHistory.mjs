import { EntitySchema } from "typeorm";

export const NotificationHistory = new EntitySchema({
    name: "NotificationHistory",
    tableName: "notification_history",
    indices: [
        { name: "IDX_NOTIFICATION_HISTORY_USER_ID", columns: ["userId"] }
    ],
    columns: {
        id: {
            type: "uuid",
            primary: true,
            generated: "uuid"
        },
        userId: {
            type: "uuid",
            nullable: false
        },
        title: {
            type: "varchar",
            nullable: false
        },
        body: {
            type: "varchar",
            nullable: false
        },
        isRead: {
            type: "boolean",
            default: false
        },
        timestamp: {
            type: "timestamp",
            nullable: false
        },
    },
    relations: {
        user: {
            type: "many-to-one",
            target: "User",
            joinColumn: { name: "userId" },
            onDelete: "CASCADE",
            cascade: true
        }
    }
})
