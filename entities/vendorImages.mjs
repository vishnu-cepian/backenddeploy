import { EntitySchema } from "typeorm";

export const vendorImages = new EntitySchema({
    name: "vendorImages",
    tableName: "vendor_images",
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
        s3Key: {
            type: "varchar",
            nullable: false
        },
        uploadedAt: {
            type: "timestamp",
            createDate: true
        },
    },
    relations: {
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: true
        }
    }
});