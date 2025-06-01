import { EntitySchema } from "typeorm";

export const Orders = new EntitySchema({
    name: "Orders",
    tableName: "orders",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },     
        customerId: {
            type: "uuid",
            nullable: false
        },
        requiredByDate: {
            type: "date",
            nullable: false
        },
        clothProvided: {
            type: "boolean",
            default: false,
            nullable: false
        },
        orderStatus: {
            type: "varchar",
            enum: ["PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
            default: "PENDING",
            nullable: false
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
            joinColumn: { name: "customerId" },
            onDelete: "CASCADE",
            cascade: true
        },
    }
});

export default Orders;