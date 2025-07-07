import { EntitySchema } from "typeorm";
import { ORDER_STATUS } from "../types/enums/index.mjs";

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
        selectedVendorId: {
            type: "uuid",
            nullable: true
        },
        finalQuoteId: {
            type: "uuid",
            nullable: true
        },
        paymentId: {
            type: "uuid",
            nullable: true
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
        isPaid: {
            type: "boolean",
            default: false,
            nullable: false
        },
        isRefunded: {
            type: "boolean",
            default: false,
            nullable: false
        },
        orderStatus: {
            type: "varchar",
            enum: Object.values(ORDER_STATUS),
            default: ORDER_STATUS.PENDING,
            nullable: false
        },
        orderStatusTimestamp: {
            type: "jsonb",
            nullable: true
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        },
        updatedAt: {
            type: "timestamp",
            updateDate: true
        }
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