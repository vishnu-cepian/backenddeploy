import { EntitySchema } from "typeorm";

export const Complaints = new EntitySchema({
    name: "Complaints",
    tableName: "complaints",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        customerId: {
            type: "uuid",
            nullable: true
        },
        vendorId: {
            type: "uuid",
            nullable: true
        },
        email: {
            type: "varchar",
            nullable: false
        },
        phoneNumber: {
            type: "varchar",
            nullable: false
        },
        name: {
            type: "varchar",
        },
        orderId: {
            type: "uuid",
            nullable: true
        },
        complaint: {
            type: "varchar",
            nullable: false
        },
        isResolved: {
            type: "boolean",
            default: false
        },
        resolvedAt: {
            type: "timestamp",
            nullable: true
        },
        resolutionNotes: {
            type: "varchar",
            nullable: true
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        },
    },
    relations: {
        customer: {
            type: "many-to-one",
            target: "Customers",
            joinColumn: {
                name: "customerId"
            },
            cascade: true,
            onDelete: "SET NULL"
        },
        order: {
            type: "many-to-one",
            target: "Orders",
            joinColumn: {
                name: "orderId"
            },
            cascade: true,
            onDelete: "SET NULL"
        },
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: {
                name: "vendorId"
            },
            cascade: true,
            onDelete: "SET NULL"
        }
    }
});