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
        orderName: {
            type: "varchar",
            nullable: false
        },
        orderType: {
            type: "varchar",
            nullable: false
        },
        orderPreference: {
            type: "varchar",
            nullable: false
        },
        requiredByDate: {
            type: "date",
            nullable: false
        },
        clothProvided: {
            type: "boolean",
            default: false,
        },
        fullName: {
            type: "varchar",
            nullable: false
        },
        phoneNumber: {
            type: "varchar",
            nullable: false
        },
        addressLine1: {
            type: "varchar",
            nullable: false
        },
        addressLine2: {
            type: "varchar",
            nullable: true
        },
        district: {
            type: "varchar",
            nullable: false
        },
        state: {
            type: "varchar",
            nullable: false
        },
        street: {
            type: "varchar",
            nullable: false
        },
        city: {
            type: "varchar",
            nullable: false
        },
        pincode: {
            type: "varchar",
            nullable: false
        },
        landmark: {
            type: "varchar",
            nullable: true
        },
        addressType: {
            type: "varchar",
            nullable: true
        },
        isPaid: {
            type: "boolean",
            default: false
        },
        isRefunded: {
            type: "boolean",
            default: false
        },
        serviceType: {
            type: "varchar",
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