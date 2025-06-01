import { EntitySchema } from "typeorm";

export const Payments = new EntitySchema({
    name: "Payments",
    tableName: "payments",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        orderId: {
            type: "uuid",
            nullable: false
        },
        vendorId: {
            type: "uuid",
            nullable: false
        },
        customerId: {
            type: "uuid",
            nullable: false
        },
        amount: {
            type: "decimal",
            precision: 10,
            scale: 2,
            nullable: false
        },
        status: {
            type: "varchar",
            enum: ["PENDING", "PAID", "FAILED"],
            default: "PENDING"
        },
        paidAt: {
            type: "timestamp",
            nullable: true
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        }
    },
    relations: {
        order: {
            type: "many-to-one",
            target: "Orders",
            joinColumn: true
        },
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: true
        }, 
        customer: {
            type: "many-to-one",
            target: "Customers",
            joinColumn: true
        }
    }
});