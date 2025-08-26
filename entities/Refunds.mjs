import { EntitySchema } from "typeorm";

export const Refunds = new EntitySchema({
    name: "Refunds",
    tableName: "refunds",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        paymentId: {
            type: "varchar",
            nullable: false
        },
        amount: {
            type: "int",
            nullable: true
        },
        status: {
            type: "varchar",
            nullable: true
        },
        speedRequested: {
            type: "varchar",
            nullable: true
        },
        speedProcessed: {
            type: "varchar",
            nullable:true
        },
        notes: {
            type: "varchar",
            nullable: true
        },
        comment: {
            type: "varchar",
            nullable: true
        },
        createdAt: {
            type: "timestamp",
            nullable: false,
            createDate: true
        }
    },
});

export default Refunds;