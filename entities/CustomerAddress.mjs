import { EntitySchema } from "typeorm";

export const CustomerAddress = new EntitySchema({
    name: "CustomerAddress",
    tableName: "customerAddresses",
    indices: [
        { name: "customer_address_customer_id_idx", columns: ["customerId"] },
        { name: "customer_address_customer_default_idx", columns: ["customerId", "isDefault"] },
        { name: "customer_address_customer_active_idx", columns: ["customerId", "isDeleted"] }
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },     
        customerId: {
            type: "uuid",
            nullable: false
        },
        fullName: {
            type: "varchar",
            nullable: false
        },
        phoneNumber: {
            type: "varchar",
            nullable: false
        },
        addressLine1: {
            type: "varchar",
            nullable: false
        },
        addressLine2: {
            type: "varchar",
            nullable: true
        },
        addressType: {
            type: "varchar",
            nullable: true
        },
        street: {
            type: "varchar",
            nullable: false
        },
        city: {
            type: "varchar",
            nullable: false
        },
        district: {
            type: "varchar",
            nullable: false
        },
        landmark: {
            type: "varchar",
            nullable: true
        },
        state: {
            type: "varchar",
            nullable: false
        },
        pincode: {
            type: "varchar",
            nullable: false
        },
        isDefault: {
            type: "boolean",
            default: false
        },
        isDeleted: {
            type: "boolean",
            default: false
        },
        deletedAt: {
            type: "timestamp",
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
        customer: {
            type: "many-to-one",
            target: "Customers",
            joinColumn: { name: "customerId" },
            onDelete: "CASCADE",
            cascade: true
        },
    }
});

export default CustomerAddress;