import { EntitySchema } from "typeorm";
// import { User } from "./User.mjs";

export const Vendor = new EntitySchema({
    name: "Vendor",
    tableName: "vendor",
    indices: [
        { name: "vendor_location_gix", columns: ["location"], spatial: true },
        { name: "vendor_rating_idx", columns: ["rating"] },
        { name: "vendor_name_idx", columns: ["fullName"] },
        { name: "vendor_shopname_idx", columns: ["shopName"] },
        { name: "vendor_servicetype_idx", columns: ["serviceType"] },
        { name: "vendor_rating_idx", columns: ["rating"] }
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
        fullName: {
            type: "varchar",
            nullable: false 
        },
        email: {
            type: "varchar",
            unique: true,
            nullable: false 
        },
        phoneNumber: {
            type: "varchar",
            nullable: false 
        },
        profilePictureUrl: {
            type: "varchar",
            nullable: true 
        },
        aadhaarUrl: {
            type: "varchar",
            nullable: false 
        },
        aadhaarNumber: {
            type: "varchar",
            unique: true,
            nullable: false 
        },
        bankPassbookUrl: {
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
        accountHolderName: {
            type: "varchar",
            nullable: false 
        },
        serviceType: {
            type: "varchar",
            nullable: false 
        },
        shopName: {
            type: "varchar",
            nullable: false 
        },
        shopType: {
            type: "varchar",
            nullable: false 
        },
        targetGender: {
            type: "varchar",
            nullable: false 
        },
        shopLocationName: {
            type: "varchar",
            nullable: false 
        },
        shopAddress: {
            type: "varchar",
            nullable: false 
        },
        city: {
            type: "varchar",
            nullable: false 
        },
        postalCode: {
            type: "varchar",
            nullable: false 
        },
        shopImageUrl: {
            type: "varchar",
            nullable: false 
        },
        shopDescription: {
            type: "varchar",
            nullable: true 
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
        popularityScore: {
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