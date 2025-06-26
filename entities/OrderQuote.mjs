import { EntitySchema } from "typeorm";

export const OrderQuotes = new EntitySchema({
    name: "OrderQuotes",
    tableName: "order_quotes",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },     
        orderVendorId: {
            type: "uuid",
            nullable: false
        },
        quotedDays: {
            type: "int",
            nullable: false
        },
        quotedPrice: {
            type: "float",
            nullable: false
        },
        vendorPayoutAfterCommission: {
            type: "float",
            nullable: false
        },
        priceAfterPlatformFee: {
            type: "float",
            nullable: false
        },
        deliveryCharge: {
            type: "float",
            nullable: false
        },
        finalPrice: {
            type: "float",
            nullable: false
        },
        notes: {
            type: "text",
            nullable: true
        },
        isProcessed: {
            type: "boolean",
            default: false,
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
        orderVendor: {
            type: "one-to-one",
            target: "OrderVendors",
            joinColumn: { name: "orderVendorId" },
            onDelete: "CASCADE",
            cascade: true
        }
    }
});

export default OrderQuotes;
