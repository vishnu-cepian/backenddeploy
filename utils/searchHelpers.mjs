import { AppDataSource } from "../config/data-source.mjs";
import { Vendor } from "../entities/Vendor.mjs";

export const searchResults = async (lng, lat, radiusKm, searchType, searchValue) => {
    
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
            // conditions.push(`ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`);
            orderClause = "ORDER BY hybrid_score DESC, distance ASC";
            params.push(`%${searchValue}%`);
            break;
      
          case "shopName":
            conditions.push(`"shopName" ILIKE $4`);
            // conditions.push(`ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`);
            orderClause = "ORDER BY hybrid_score DESC, distance ASC";
            params.push(`%${searchValue}%`);
            break;
      
          case "serviceType":
            conditions.push(`"serviceType" ILIKE $4`);
            // conditions.push(`ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`);
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
