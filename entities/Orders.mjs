import { EntitySchema } from "typeorm";
import { ORDER_STATUS } from "../types/enums/index.mjs";

export const Orders = new EntitySchema({
    name: "Orders",
    tableName: "orders",
    indices: [
        { name: "IDX_ORDERS_CUSTOMER_ID", columns: ["customerId"] },
        { name: "IDX_ORDERS_SELECTED_VENDOR_ID", columns: ["selectedVendorId"] },
        { name: "IDX_ORDERS_FINAL_QUOTE_ID", columns: ["finalQuoteId"] },
        { name: "IDX_ORDERS_STATUS", columns: ["orderStatus"] },
        { name: "IDX_ORDERS_ORDER_STATUS_TIMESTAMP", columns: ["orderStatusTimestamp"] },
    ],
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
        finishByDate: {
            type: "date",
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
            nullable: false,
            default: false,
        },
        isPaid: {
            type: "boolean",
            nullable: false,
            default: false
        },
        isRefunded: {
            type: "boolean",
            nullable: false,
            default: false
        },
        serviceType: {
            type: "varchar",
            nullable: false
        },
        isRated: {
            type: "boolean",
            nullable: false,
            default: false
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

        fullName: { type: "varchar", nullable: false },
        phoneNumber: { type: "varchar", nullable: false },
        addressLine1: { type: "varchar", nullable: false },
        addressLine2: { type: "varchar", nullable: true },
        district: { type: "varchar", nullable: false },
        state: { type: "varchar", nullable: false },
        street: { type: "varchar", nullable: false },
        city: { type: "varchar", nullable: false },
        pincode: { type: "varchar", nullable: false },
        landmark: { type: "varchar", nullable: true },
        addressType: { type: "varchar", nullable: true },
       
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
        selectedVendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: { name: "selectedVendorId" },
            onDelete: "SET NULL",
            cascade: true
        },
        finalQuote: {
            type: "many-to-one",
            target: "OrderQuotes",
            joinColumn: { name: "finalQuoteId" },
            onDelete: "SET NULL",
            cascade: true
        },
        payment: {
            type: "many-to-one",
            target: "Payments",
            joinColumn: { name: "paymentId" },
            onDelete: "SET NULL",
            cascade: true
        },

        orderItems: {
            type: "one-to-many",
            target: "OrderItems",
            inverseSide: "order",
        },
        orderVendors: {
            type: "one-to-many",
            target: "OrderVendors",
            inverseSide: "order",
        },
        orderStatusTimeline: {
            type: "one-to-many",
            target: "OrderStatusTimeline",
            inverseSide: "order",
        },
        rating : {
            type: "one-to-one",
            target: "Rating",
            inverseSide: "order",
        },
    }
});

export default Orders;