import { EntitySchema } from "typeorm";

export const AdminLoginHistory = new EntitySchema({
    name: "AdminLoginHistory",
    tableName: "adminLoginHistory",
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
        adminEmail: {
            type: "varchar",
            nullable: false
        },
        ipAddress: {
            type: "varchar",
            nullable: false
        },
        loginTime: {
            type: "timestamp",
            nullable: false
        },
        logoutTime: {
            type: "timestamp",
            nullable: true
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