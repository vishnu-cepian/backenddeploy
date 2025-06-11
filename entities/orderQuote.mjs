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
        orderId: {
            type: "uuid",
            nullable: false
        },
        vendorId: {
            type: "uuid",
            nullable: true
        },
        quotedPrice: {
            type: "float",
            nullable: false
        },
        quotedDays: {
            type: "int",
            nullable: false
        },
        notes: {
            type: "text",
            nullable: true
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

export default OrderQuotes;