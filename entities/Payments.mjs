import { EntitySchema } from "typeorm";

export const Payments = new EntitySchema({
    name: "Payments",
    tableName: "payments",
    indices: [
        { name: "IDX_PAYMENTS_RAZORPAY_PAYMENT_ID", columns: ["razorpayPaymentId"] },
    ],
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
        quoteId: {
            type: "uuid",
            nullable: false
        },
        razorpayPaymentId: {
            type: "varchar",
            nullable: true
        },
        paymentAmount: {
            type: "decimal",
            precision: 10,
            scale: 2,
            nullable: false
        },
        paymentStatus: {
            type: "varchar",
            nullable: false
        },
        paymentMethod: {
            type: "varchar",
            nullable: false
        },
        paymentCurrency: {
            type: "varchar",
            nullable: false
        },
        paymentDate: {
            type: "timestamp",
        }
    },
    relations: {
        order: {
            type: "many-to-one",
            target: "Orders",
            joinColumn: { name: "orderId" },
            onDelete: "CASCADE",
            cascade: true
        },
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: { name: "vendorId" },
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
        quote: {
            type: "many-to-one",
            target: "OrderQuotes",
            joinColumn: { name: "quoteId" },
            onDelete: "CASCADE",
            cascade: true
        }
    }
});