import { EntitySchema } from "typeorm";

export const OrderVendors = new EntitySchema({
    name: "OrderVendors",
    tableName: "orderVendors",
    indices: [
        { name: "order_vendor_status_idx", columns: ["status"] },
        { name: "order_vendor_order_id_idx", columns: ["orderId"] },
        { name: "order_vendor_vendor_id_idx", columns: ["vendorId"] },
        { name: "order_vendor_created_at_idx", columns: ["createdAt"] }
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
        status: {
            type: "varchar",
            enum: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "FROZEN"],
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