import { EntitySchema } from "typeorm";
import { SHOP_TYPE, OWNERSHIP_TYPE, SERVICE_TYPE, VENDOR_STATUS } from "../types/enums/index.mjs";

export const Vendors = new EntitySchema({
    name: "Vendors",
    tableName: "vendors",
    indices: [
        { name: "vendor_location_gix", columns: ["location"], spatial: true },
        { name: "vendor_current_month_rating_idx", columns: ["currentMonthRating"] },
        { name: "vendor_current_month_bayesian_score_idx", columns: ["currentMonthBayesianScore"] },
        { name: "vendor_current_month_review_count_idx", columns: ["currentMonthReviewCount"] },
        { name: "vendor_all_time_rating_idx", columns: ["allTimeRating"] },
        { name: "vendor_all_time_review_count_idx", columns: ["allTimeReviewCount"] },
        { name: "vendor_shopname_idx", columns: ["shopName"] },
        { name: "vendor_servicetype_idx", columns: ["serviceType"] },
        { name: "vendor_status_idx", columns: ["status"] }
    ],
    columns: {
        id: {
            primary: true,
            type: "uuid",
            generated: "uuid"
        },
        userId: {
            type: "uuid",
            unique: true
        },
        aadhaarNumber: {
            type: "varchar",
            length: 12,
            nullable: false
        },
        aadhaarUrlPath: {
            type: "varchar",
            nullable: false
        },
        shopType: {
            type: "varchar",
            enum: Object.values(SHOP_TYPE),
            nullable: false
        },
        ownershipType: {
            type: "varchar",
            enum: Object.values(OWNERSHIP_TYPE),
            nullable: true
        },
        serviceType: {
            type: "varchar",
            enum: Object.values(SERVICE_TYPE),
            nullable: false
        },
        vendorServices: {
            type: "varchar",
            nullable: true
        },
        shopName: {
            type: "varchar",
            nullable: false
        },
        address: {
            type: "varchar",
            nullable: false
        },
        street: {
            type: "varchar",
            nullable: false
        },
        city: {
            type: "varchar",
            nullable: false
        },
        state: {
            type: "varchar",
            nullable: false
        },
        pincode: {
            type: "varchar",
            nullable: false
        },
        shopDescription: {
            type: "text",
            nullable: false
        },
        shopDocumentUrlPath: {
            type: "varchar",
            nullable: true
        },
        accountHolderName: {
            type: "varchar",
            nullable: false
        },
        accountNumber: {
            type: "varchar",
            nullable: false
        },
        ifscCode: {
            type: "varchar",
            nullable: false
        },
        bankPassbookUrlPath: {
            type: "varchar",
            nullable: false
        },       
        location: {     //  { type: 'Point', coordinates: [lng, lat] }
            type: "geometry",
            spatialFeatureType: "Point", 
            srid: 4326,
            nullable: true
        },
        shopImageUrlPath: {
            type: "varchar",
            nullable: true
        },
        vendorAvatarUrlPath: {
            type: "varchar",
            nullable: true
        },
        allTimeRating: {
            type: "numeric",
            precision: 3,
            scale: 2,
            default: 0
        },
        allTimeReviewCount: {
            type: "int",
            default: 0,
        },
        currentMonthRating: { 
            type: "numeric", 
            precision: 3,
            scale: 2,
            default: 0
        },
        currentMonthReviewCount: {
            type: "int",
            default: 0,
        },
        currentMonthBayesianScore: {
            type: "numeric",
            precision: 3,
            scale: 2,
            default: 0
        },
        status: {
            type: "varchar",
            enum: Object.values(VENDOR_STATUS),
            default: "PENDING"
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
        user: {
            type: "one-to-one",
            target: "User",
            joinColumn: {
                name: "userId"
            },
            cascade: true,
            onDelete: "CASCADE"
        }
    }
});

export default Vendors;