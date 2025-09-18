import { EntitySchema } from "typeorm";

export const PaymentAttempts = new EntitySchema({
    name: "PaymentAttempts",
    tableName: "payment_attempts",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        quoteId: {
            type: "uuid",
            nullable: false
        },
        razorpayOrderId: {
            type: "varchar",
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
            nullable: false
        },
        expiresAt: {
            type: "timestamp",
            nullable: false
        },
        createdAt: {
            type: "timestamp",
            createDate: true
        }
    },
    relations: {
        quote: {
            type: "many-to-one",
            target: "OrderQuotes",
            joinColumn: { name: "quoteId" },
            onDelete: "SET NULL",
            cascade: true
        }
    }

});

export default PaymentAttempts;
