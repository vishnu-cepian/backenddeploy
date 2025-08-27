import { EntitySchema } from "typeorm";

export const Payouts = new EntitySchema({
    name: "Payouts",
    tableName: "payouts",
    indices: [
        { name: "IDX_PAYOUTS_RAZORPAY_FUND_ACCOUNT_ID", columns: ["razorpay_fund_account_id"] },
        { name: "IDX_PAYOUTS_STATUS", columns: ["status"] },
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
        razorpay_fund_account_id: {
            type: "varchar",
            nullable: false
        },
        expected_amount: {
            type: "decimal",
            precision: 10,
            scale: 2,
            nullable: false
        },
        actual_paid_amount: {
            type: "decimal",
            precision: 10,
            scale: 2,
            nullable: true
        },
        status: {
            type: "varchar",
            nullable: false
        },
        payout_id: {
            type: "varchar",
            nullable: true,
            unique: true
        },
        utr: {
            type: "varchar",
            nullable: true
        },
        payout_created_at: {
            type: "timestamp",
            nullable: true
        },
        payout_status_history: {
            type: "jsonb",
            nullable: true
        },
        retry_count: {
            type: "integer",
            nullable: false,
            default: 0
        },
        retry_at: {
            type: "timestamp",
            nullable: true
        },
        failure_reason: {
            type: "varchar",
            nullable: true
        },
        retry_details: {
            type: "jsonb",
            nullable: true
        },
        entry_created_at: {
            type: "timestamp",
            createDate: true
        }
    },
    relations: {
        order: {
            type: "many-to-one",
            target: "Orders",
            joinColumn: { name: "orderId" },
            onDelete: "SET NULL",
            cascade: true
        },
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: { name: "vendorId" },
            onDelete: "SET NULL",
            cascade: true
        }, 
    }
});