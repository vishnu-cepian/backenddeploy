import { AppDataSource } from "../config/data-source.mjs";
import { Vendor } from "../entities/Vendor.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { ILike } from "typeorm";

// --------------------------------------------SEARCH HELPER FUNCTIONS----------------------------------------------------------------------------------------------

export const searchResults = async (lng, lat, radiusKm, searchType, searchValue) => {
    
    // USE POSTGIS EXTENSION
    // CREATE EXTENSION IF NOT EXISTS postgis;  (IN pgAdmin or any other tool)

    const vendorRepo = AppDataSource.getRepository(Vendor);

    let baseQuery = `
            SELECT *,
            ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)/1000 AS distance,
            (0.6 * (rating/5.0)) +
            (0.4 * (1 - LEAST(ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / ($3), 1.0))) AS hybrid_score
            FROM vendor 
            WHERE 
            location IS NOT NULL
            AND "isActive" = true
            AND "isVerified" = true
        `

    let conditions = [];
    let params = [lng, lat, radiusKm * 1000];
    let orderClause = "";

    switch(searchType) {
        case "ratingAndLocation":
            orderClause = "ORDER BY hybrid_score DESC, distance ASC";
            break;

        case "rating":
            baseQuery = `
                SELECT * FROM vendor
                WHERE 
                location IS NOT NULL
                AND "isActive" = true
                AND "isVerified" = true
            `;
            orderClause = ` ORDER BY rating DESC`;
            params = [];
            break;

        case "fullName":
            conditions.push(`"fullName" ILIKE $4`);
            orderClause = "ORDER BY hybrid_score DESC, distance ASC";
            params.push(`%${searchValue}%`);
            break;
      
        case "shopName":
            conditions.push(`"shopName" ILIKE $4`);
            orderClause = "ORDER BY hybrid_score DESC, distance ASC";
            params.push(`%${searchValue}%`);
            break;
      
        case "serviceType":
            conditions.push(`"serviceType" ILIKE $4`);
            orderClause = "ORDER BY hybrid_score DESC, distance ASC";
            params.push(`%${searchValue}%`);
            break;

        default:
            throw new Error("Invalid search type");
    }
    
    if(conditions.length > 0) {
        baseQuery += " AND " + conditions.join(" AND ");
    }
    const finalQuery = `${baseQuery} ${orderClause}`;
    
    const results = await vendorRepo.query(finalQuery, params);
    return results;
};



// --------------------------------------------SEARCH SERVICES ----------------------------------------------------------------------------------------------
export const searchVendorsByRating = async () => {
    try {
        const result = await searchResults(0, 0, 0, "rating","");
        if(result.length !== 0) 
            return result;
        return {"message": "no Vendors found"};
    } catch (err) {
        logger.error(err);
        sendError(err);
    }
};

export const searchVendorsByRatingAndLocation = async (params) => {
    try {
        const { lat, lng, radiusKm } = params;
        const result = await searchResults(parseFloat(lat), parseFloat(lng), parseFloat(radiusKm), "ratingAndLocation", "");
        if(result.length !== 0) 
            return result;
        return {"message": "no Vendors found"};
    } catch (err) {
        logger.error(err);
        sendError(err);
    }
};

export const searchVendorsByQuery = async (params) => {
    try {
        const { query, lat, lng, radiusKm } = params;

        const vendorRepo = AppDataSource.getRepository(Vendor);
        
        let vendors = await vendorRepo.find({       // Name wise search
            where: {
                fullName: ILike(`%${query}%`),      // ILIKE is case insensitive
            },
        });

        if(vendors.length !== 0) {
            console.log("name wise search")
            const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "fullName", query);
            return results;
        }
        else if(vendors.length === 0) {         // Shop name wise search
            vendors = await vendorRepo.find({
                where: {
                    shopName: ILike(`%${query}%`),
                },
            });
            if(vendors.length !== 0) {
                const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "shopName", query);
                return results;
            } else {
                vendors = await vendorRepo.find({   // serviceType wise search
                    where: {
                        serviceType: ILike(`%${query}%`),
                    },
                });

                if(vendors.length !== 0) {
                    const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "serviceType", query);
                    return results;
                }
            }
        }
        return {"message": "No vendors found"};
    } catch (err) {
        logger.error(err);
        sendError(err);
    }
};  