import { EntitySchema } from "typeorm";

export const AdminActions = new EntitySchema({
    name: "AdminActions",
    tableName: "adminActions",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        adminUserId: {
            type: "uuid",
            nullable: false
        },
        action: {
            type: "varchar",
            nullable: false
        },
        actionData: {
            type: "json",
            nullable: false
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        },
    },
    relations: {
        adminUser: {
            type: "many-to-one",
            target: "User",
            joinColumn: {
                name: "adminUserId"
            },
            cascade: true,
            onDelete: "SET NULL"
        }
    }
});