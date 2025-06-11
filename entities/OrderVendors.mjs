import { EntitySchema } from "typeorm";

export const OrderVendors = new EntitySchema({
    name: "OrderVendors",
    tableName: "orderVendors",
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
        status: {
            type: "varchar",
            enum: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"],
            default: "PENDING",
            nullable: false
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
        }
    }
});
export default OrderVendors;