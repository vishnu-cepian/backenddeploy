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
        itemName: {
            type: "varchar",
            nullable: false
        },
        itemType: {
            type: "varchar",
            nullable: false
        },
        itemCount: {
            type: "integer",
            nullable: false
        },
        clothProvided: {
            type: "boolean",
            nullable: false,
            default: false,
        },
        fabricType: {
            type: "varchar",
            nullable: false
        },
        instructions: {
            type: "varchar",
            nullable: true
        },
        dressCustomisations: {
            type: "jsonb",
            nullable: true
        },
        measurementType: {
            type: "varchar",
            nullable: true
        },
        tailorService: {
            type: "varchar",
            nullable: true
        },
        laundryService: {
            type: "varchar",
            nullable: true
        },
        stdMeasurements: {
            type: "varchar",
            nullable: true
        },
        customMeasurements: {
            type: "jsonb",
            nullable: true
        },
        designImage1: {
            type: "varchar",
            nullable: true
        },
        designImage2: {
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

export default OrderItems;