import { EntitySchema } from "typeorm";

export const VendorAudit = new EntitySchema({
    name: "VendorAudit",
    tableName: "vendor_audit",
    columns: {
        id: { type: "uuid", primary: true, generated: "uuid" },
        vendorId: { type: "uuid", nullable: false },
        otpVerifiedAt: { type: "timestamp", nullable: true },
        toc: { type: "boolean", default: false },
        ip: { type: "varchar", nullable: false },
        deviceInfo: { type: "jsonb", nullable: false },
        createdAt: { type: "timestamp", createDate: true },
        updatedAt: { type: "timestamp", updateDate: true },
    },
    relations: {
        vendor: {
            type: "many-to-one",
            target: "Vendors",
            joinColumn: { name: "vendorId" },
        },
    },
});
