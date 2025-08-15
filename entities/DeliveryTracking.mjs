import { EntitySchema } from "typeorm";


export const DeliveryTracking = new EntitySchema({
    name: "DeliveryTracking",
    tableName: "deliveryTracking",

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
        deliveryType: {
            type: "varchar",
            nullable: false,
            enum: ["TO_VENDOR", "TO_CUSTOMER"]
        }, 
        from: {
            type: "varchar",
            nullable: false,
            enum: ["CUSTOMER", "VENDOR"]
        },
        to: {
            type: "varchar",
            nullable: false,
            enum: ["CUSTOMER", "VENDOR"]
        },
        // deliveryTrackingId: {
        //     type: "varchar",
        //     nullable: false
        // },
        status: {
            type: "varchar",
            nullable: false,
            enum: ["PENDING", "IN_TRANSIT", "DELIVERED", "CANCELLED"]
        },
        statusUpdateTimeStamp: {
            type: "jsonb",
            nullable: true
        },
    },
});
