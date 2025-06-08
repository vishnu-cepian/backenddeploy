import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { ILike } from "typeorm";

// --------------------------------------------SEARCH HELPER FUNCTIONS----------------------------------------------------------------------------------------------

export const searchResults = async (lng, lat, radiusKm, searchType, searchValue, limit = 10, offset = 0) => {
    
    // USE POSTGIS EXTENSION
    // CREATE EXTENSION IF NOT EXISTS postgis;  (IN pgAdmin or any other tool)

    const vendorRepo = AppDataSource.getRepository(Vendors);

    let baseQuery = `
            SELECT vendors.id, "user".name, vendors."serviceType", vendors."shopName", vendors."shopType", vendors.city, vendors."shopImageUrl", vendors.rating, vendors."ratingCount",
            ST_Distance(vendors.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)/1000 AS distance,
            (0.6 * (vendors.rating/5.0)) +
            (0.4 * (1 - LEAST(ST_Distance(vendors.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / ($3), 1.0))) AS hybrid_score
            FROM vendors 
            JOIN "user" ON vendors."userId" = "user".id
            WHERE 
            vendors.location IS NOT NULL
            AND vendors.status = 'VERIFIED'
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
            SELECT vendors.id, "user".name, vendors."serviceType", vendors."shopName", vendors."shopType", vendors.city, vendors."shopImageUrl", vendors.rating, vendors."ratingCount"
            FROM vendors
            INNER JOIN "user" ON vendors."userId" = "user".id
            WHERE vendors.location IS NOT NULL
            AND vendors.status = 'VERIFIED'
            `;
            orderClause = ` ORDER BY rating DESC`;
            params = [];
            break;

        case "name":
            conditions.push(`"user".name ILIKE $4`);
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
    const finalQuery = `${baseQuery} ${orderClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const results = await vendorRepo.query(finalQuery, params);
    return results;
};



// --------------------------------------------SEARCH SERVICES ----------------------------------------------------------------------------------------------
export const searchVendorsByRating = async (params) => {
    try {
        const { limit = 10, offset = 0 } = params;
        const result = await searchResults(0, 0, 0, "rating", "", limit, offset);
        if(result.length !== 0) 
            return result;
        return {"message": "no Vendors found"};
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

export const searchVendorsByRatingAndLocation = async (params) => {
    try {
        const { lat, lng, radiusKm, limit = 10, offset = 0 } = params;
        const result = await searchResults(parseFloat(lat), parseFloat(lng), parseFloat(radiusKm), "ratingAndLocation", "", limit, offset);
        if(result.length !== 0) 
            return result;
        return {"message": "no Vendors found"};
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

export const searchVendorsByQuery = async (params) => {
    try {
        const { query, lat, lng, radiusKm, limit = 10, offset = 0 } = params;

        const vendorRepo = AppDataSource.getRepository(Vendors);
        
        let vendors = await vendorRepo                      // Name wise search
            .createQueryBuilder("vendors")
            .leftJoinAndSelect("user", "user", "vendors.userId = user.id")
            .where("user.name ILIKE :query", { query: `%${query}%` })
            .getMany();

        if(vendors.length !== 0) {
            const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "name", query, limit, offset);
            return results;
        }
        else if(vendors.length === 0) {         // Shop name wise search
            vendors = await vendorRepo.find({
                where: {
                    shopName: ILike(`%${query}%`),
                },
            });
            if(vendors.length !== 0) {
                const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "shopName", query, limit, offset);
                return results;
            } else {
                vendors = await vendorRepo.find({   // serviceType wise search
                    where: {
                        serviceType: ILike(`%${query}%`),
                    },
                });

                if(vendors.length !== 0) {
                    const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "serviceType", query, limit, offset);
                    return results;
                }
            }
        }
        return {"message": "No vendors found"};
    } catch (err) {
        logger.error(err);
        throw err;
    }
};  