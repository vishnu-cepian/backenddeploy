import { EntitySchema } from "typeorm";

export const VendorStats = new EntitySchema({
    name: "VendorStats",
    tableName: "vendor_stats",
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        vendorId: {
            type: "uuid",
            unique: true
        },
        totalInProgressOrders: {
            type: "int",
            default: 0
        },
        totalCompletedOrders: {
            type: "int",
            default: 0
        },
        totalEarnings: {
            type: "numeric",
            precision: 10,
            scale: 2,
            default: 0
        },
        totalDeductions: {
            type: "numeric",
            precision: 10,
            scale: 2,
            default: 0
        },
        updatedAt: {
            type: "timestamp",
            updateDate: true
        }
    },
    relations: {
        vendor: {
            type: "one-to-one",
            target: "Vendors",
            joinColumn: {
                name: "vendorId"
            },
            cascade: true,
            onDelete: "CASCADE"
        }
    }
});

export default VendorStats;