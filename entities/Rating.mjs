import { EntitySchema } from "typeorm";

export const Rating = new EntitySchema({
    name: "Rating",
    tableName: "rating",
    indices: [
        { name: "vendor_rating_idx", columns: ["vendorId"] },
        { name: "month_year_rating_idx", columns: ["monthYear"] }
    ],
    unique: [
        { columns: ["vendorId", "customerId", "orderId"], name: "vendor_customer_order_unique" }
    ],
    columns: {
        id: {
            type: "uuid",
            primary: true,
            generated: "uuid"
        },
        vendorId: {
            type: "uuid",
            nullable: false
        },
        customerId: {
            type: "uuid",
            nullable: false
        },
        orderId: {
            type: "uuid",
            nullable: false
        },
        rating: {
            type: "numeric",
            precision: 3,
            scale: 2,
            nullable: false
        },
        review: {
            type: "text",
            nullable: true
        },
        monthYear: {
            type: "varchar",
            nullable: false
        },
        createdAt: {    
            type: "timestamp",
            createDate: true
        }
    },
    relations: {
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: { name: "vendorId" },
            onDelete: "CASCADE",
            cascade: true
        },
        customer: {
            type: "many-to-one",
            target: "Customers",
            joinColumn: { name: "customerId" },
            onDelete: "CASCADE",
            cascade: true
        },
        order: {
            type: "one-to-one",
            target: "Orders",
            joinColumn: { name: "orderId" },
            onDelete: "CASCADE",
            cascade: true
        }
    }
})

export default Rating;