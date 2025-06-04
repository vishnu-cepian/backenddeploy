import { EntitySchema } from "typeorm";

export const Vendors = new EntitySchema({
    name: "Vendors",
    tableName: "vendors",
    indices: [
        { name: "vendor_location_gix", columns: ["location"], spatial: true },
        { name: "vendor_rating_idx", columns: ["rating"] },
        { name: "vendor_shopname_idx", columns: ["shopName"] },
        { name: "vendor_servicetype_idx", columns: ["serviceType"] },
        { name: "vendor_status_idx", columns: ["isVerified", "isActive"] }
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
            enum: ["IN-HOME", "OUTLET"],
            nullable: false
        },
        ownershipType: {
            type: "varchar",
            enum: ["PARTNERSHIP", "SINGLE"],
            nullable: false
        },
        serviceType: {
            type: "varchar",
            enum: ["TAILORING", "LAUNDRY"],
            nullable: false
        },
        targetGender: {
            type: "varchar",
            enum: ["LADIES", "GENTS", "BOTH"],
            nullable: false
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
        rating: {
            type: "numeric",
            precision: 3,
            scale: 2,
            default: 0
        },
        ratingCount: {
            type: "int",
            default: 0,
        },
        popularityScore: {              // FOR FUTURE USE  
            type: "numeric", 
            precision: 6,
            scale: 2,
            default: 0
        },
        isVerified: {
            type: "boolean",
            default: false
        },
        isActive: {
            type: "boolean",
            default: true
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