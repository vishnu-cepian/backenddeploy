import { EntitySchema } from "typeorm";

export const PaymentFailures = new EntitySchema({
    name: "PaymentFailures",
    tableName: "paymentFailures",
    indices: [
        { name: "IDX_PAYMENT_FAILURES_PAYMENT_ID", columns: ["paymentId"] },
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        orderId: {
            type: "uuid",
            nullable: false,
        },
        quoteId: {
            type: "uuid",
            nullable: false,
        },
        customerId: {
            type: "uuid",
            nullable: false,
        },
        paymentId: {
            type: "varchar",
            nullable: false,
        },
        amount: {
            type: "decimal",
            precision: 10,
            scale: 2,
            nullable: false,
        },
        reason: {
            type: "varchar",
            nullable: false,
        },
        status: {
            type: "varchar",
            nullable: false,
        },
        timestamp: {
            type: "timestamp",
            nullable: false,
        },
    },
    relations: {    
        order: {
            type: "many-to-one",
            target: "Orders",
            joinColumn: { name: "orderId" },
            onDelete: "CASCADE",
            cascade: true
        },
        quote: {
            type: "many-to-one",
            target: "OrderQuotes",
            joinColumn: { name: "quoteId" },
            onDelete: "CASCADE",
            cascade: true
        },
        customer: {
            type: "many-to-one",
            target: "Customers",
            joinColumn: { name: "customerId" },
            onDelete: "CASCADE",
            cascade: true
        },
    },
});