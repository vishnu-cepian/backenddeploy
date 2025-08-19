import { EntitySchema } from "typeorm";

export const VendorImages = new EntitySchema({
    name: "VendorImages",
    tableName: "vendor_images",
    indices: [
        { name: "vendor_images_vendor_id_idx", columns: ["vendorId"] },
    ],
    unique: [
        { name: "vendor_images_vendor_id_s3key_idx", columns: ["vendorId", "s3Key"] },
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
            joinColumn: { name: "vendorId" },
            onDelete: "CASCADE",
            cascade: true
        }
    }
});
