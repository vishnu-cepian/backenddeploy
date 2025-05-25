import { EntitySchema } from "typeorm";

export const OrderItemMeasurementByVendor = new EntitySchema({
    name: "OrderItemMeasurementByVendor",
    tableName: "orderItemMeasurementByVendor",
    columns: {
        id: {
            type: "uuid",
            primary: true,
            generated: "uuid"
        },
        orderItemId: {
            type: "uuid",
            nullable: false
        },
        vendorId: {
            type: "uuid",
            nullable: false
        },
        measurement: {
            type: "jsonb",
            nullable: false
        },
        filledByCustomer: {
            type: "boolean",
            default: false
        }
    },
    relations: {
        orderItem: {
            type: "many-to-one",
            target: "OrderItems",
            joinColumn: { name: "orderItemId" }
        },
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: { name: "vendorId" }
        }
    }
});

export default OrderItemMeasurementByVendor;
