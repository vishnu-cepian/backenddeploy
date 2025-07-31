import { EntitySchema } from "typeorm";

export const OrderStatusTimeline = new EntitySchema({
    name: "OrderStatusTimeline",
    tableName: "orderStatusTimeline",
    indices: [
        { name: "order_status_timeline_order_id_idx", columns: ["orderId"] },
        { name: "order_status_timeline_status_time_idx", columns: ["newStatus", "changedAt"] },
        { name: "order_status_timeline_changed_by_idx", columns: ["changedBy"] },
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
        previousStatus: {
            type: "varchar",
            nullable: true
        },
        newStatus: {
            type: "varchar",
            nullable: false
        },
        changedBy: {
            type: "varchar",
            nullable: true
        },
        changedByRole: {
            type: "varchar",
            nullable: true
        },
        changedAt: {
            type: "timestamp",
            nullable: false,
            createDate: true
        },
        notes: {
            type: "varchar",
            nullable: true
        }
    },
    relations: {
        order: {
            type: "many-to-one",
            target: "Orders",
            joinColumn: { name: "orderId" },
            onDelete: "CASCADE",
            cascade: true
        }
    }
});

export default OrderStatusTimeline;