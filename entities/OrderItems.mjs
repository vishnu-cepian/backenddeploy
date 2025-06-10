import { EntitySchema } from "typeorm";

export const OrderItems = new EntitySchema({
    name: "OrderItems",
    tableName: "orderItems",
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
        itemType: {
            type: "varchar",
            nullable: false
        },
        quantity: {
            type: "integer",
            nullable: false
        },
        measurements: {
            type: "jsonb",
            nullable: true
        },
        universalSize: {
            type: "varchar",
            nullable: true
        },
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

export default OrderItems;