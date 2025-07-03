import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { cacheOrFetch } from "../utils/cache.mjs";
import { getPresignedViewUrl } from "./s3service.mjs";
import { sendError } from "../utils/core-utils.mjs";

// --------------------------------------------SEARCH HELPER FUNCTIONS----------------------------------------------------------------------------------------------

export const searchResults = async (serviceType, lng, lat, radiusKm, searchType, searchValue, limit, offset ) => {
    
    // USE POSTGIS EXTENSION
    // CREATE EXTENSION IF NOT EXISTS postgis;  (IN pgAdmin or any other tool)

    const vendorRepo = AppDataSource.getRepository(Vendors);

    let baseQuery = `
            SELECT vendors.id, "user".name, vendors."serviceType", vendors."shopName", vendors."shopType", vendors.city, vendors."allTimeRating", vendors."allTimeReviewCount", vendors."shopImageUrlPath",
            ST_Distance(vendors.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)/1000 AS distance,
            (0.6 * (vendors."allTimeRating"/5.0)) +
            (0.4 * (1 - LEAST(ST_Distance(vendors.location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / ($3), 1.0))) AS hybrid_score
            FROM vendors 
            JOIN "user" ON vendors."userId" = "user".id
            WHERE 
            vendors.location IS NOT NULL
            AND vendors.status = 'VERIFIED'
            AND "user"."isBlocked" = false
            AND vendors."serviceType" = $4
        `

    let conditions = [];
    let params = [lng, lat, radiusKm * 1000, serviceType];
    let orderClause = "";

    switch(searchType) {  
        case "rating":
            baseQuery = `
            SELECT vendors.id, "user".name, vendors."serviceType", vendors."shopName", vendors."shopType", vendors.city, vendors."allTimeRating", vendors."allTimeReviewCount", vendors."shopImageUrlPath"
            FROM vendors
            INNER JOIN "user" ON vendors."userId" = "user".id
            WHERE vendors.location IS NOT NULL
            AND vendors.status = 'VERIFIED'
            AND "user"."isBlocked" = false
            AND vendors."serviceType" = $1
            `;
            orderClause = ` ORDER BY "allTimeRating" DESC`;
            params = [];
            params.push(serviceType);
            break;

        case "location":
            orderClause = "ORDER BY distance ASC";
            break;

        case "ratingAndLocation":
            orderClause = "ORDER BY hybrid_score DESC, distance ASC";
            break;

        case "shopName":
            conditions.push(`"shopName" ILIKE $5`);
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
        const { serviceType, page = 1 } = params;

        const limit = 5;
        const offset = (page - 1) * limit;

        if (!serviceType || typeof serviceType !== 'string') {
            throw sendError('Invalid serviceType parameter');
        }
        if (page < 1 || !Number.isInteger(page)) {
            throw sendError('Page must be a positive integer');
        }

        return cacheOrFetch(`searchVendorsByRating:${serviceType.toLowerCase()}:${page}:${limit}`, async () => {
        const result = await searchResults( serviceType.toLowerCase(),0, 0, 0, "rating", "",limit + 1, offset);
 
        if(!result || result.length === 0) {
            return {
                data: [],
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    hasMore: false
                },
                message: "No vendors found"
            }
        }

        const processedResults = await Promise.all(
            result.slice(0, limit).map(async vendor => ({
                ...vendor,
                shopImageUrlPath: vendor.shopImageUrlPath 
                    ? await getPresignedViewUrl(vendor.shopImageUrlPath)
                    : null
            }))
        );

        return {
            data: processedResults,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(result.length / limit),
                hasMore: result.length > limit,
                nextPage: result.length > limit ? page + 1 : null
            }
        };
        }, 300);
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

export const searchVendorByNearestLocation = async (params) => {
    try {
        const { serviceType, lng, lat, radiusKm, page = 1 } = params;

        const limit = 5;
        const offset = (page - 1) * limit;

        return cacheOrFetch(`searchVendorsByLocation:${serviceType.toLowerCase()}:${lng}:${lat}:${radiusKm}:${page}:${limit}`, async () => {
        const result = await searchResults(serviceType.toLowerCase(), parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "location", "", limit + 1, offset);

        const processedResults = await Promise.all(
            result.slice(0, limit).map(async vendor => ({
                ...vendor,
                shopImageUrlPath: vendor.shopImageUrlPath 
                    ? await getPresignedViewUrl(vendor.shopImageUrlPath)
                    : null
            }))
        );

        return {
            data: processedResults,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(result.length / limit),
                hasMore: result.length > limit,
                nextPage: result.length > limit ? page + 1 : null
            }
        };
        }, 60);
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const searchVendorsByRatingAndLocation = async (params) => {
    try {
        const { serviceType, lng, lat, radiusKm, page = 1 } = params;

        const limit = 5;
        const offset = (page - 1) * limit;

        return cacheOrFetch(`searchVendorsByRatingAndLocation:${serviceType.toLowerCase()}:${lng}:${lat}:${radiusKm}:${page}:${limit}`, async () => {
            const result = await searchResults(serviceType.toLowerCase(), parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "ratingAndLocation", "", limit + 1, offset);

            const processedResults = await Promise.all(
                result.slice(0, limit).map(async vendor => ({
                    ...vendor,
                    shopImageUrlPath: vendor.shopImageUrlPath 
                        ? await getPresignedViewUrl(vendor.shopImageUrlPath)
                        : null
                }))
            );

            return {
                data: processedResults,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(result.length / limit),
                    hasMore: result.length > limit,
                    nextPage: result.length > limit ? page + 1 : null
                }
            };
        }, 60);
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

export const searchVendorsByShopName = async (params) => {
    try {
        const { serviceType, query, lng, lat, radiusKm, page = 1 } = params;

        const limit = 5;
        const offset = (page - 1) * limit;

        return cacheOrFetch(`searchVendorsByShopName:${serviceType.toLowerCase()}:${query}:${lng}:${lat}:${radiusKm}:${page}:${limit}`, async () => {
            const result = await searchResults(serviceType.toLowerCase(), parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "shopName", query, limit + 1, offset);

            const processedResults = await Promise.all(
                result.slice(0, limit).map(async vendor => ({
                    ...vendor,
                    shopImageUrlPath: vendor.shopImageUrlPath 
                        ? await getPresignedViewUrl(vendor.shopImageUrlPath)
                        : null
                }))
            );

            return {
                data: processedResults,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(result.length / limit),
                    hasMore: result.length > limit,
                    nextPage: result.length > limit ? page + 1 : null
                }
            };
        }, 60);
    } catch (err) {
        logger.error(err);
        throw err;
    }
};  