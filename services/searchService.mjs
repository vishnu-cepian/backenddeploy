import { z } from 'zod';
import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { cacheOrFetch } from "../utils/cache.mjs";
import { getPresignedViewUrl } from "./s3service.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { SERVICE_TYPE, VENDOR_STATUS } from '../types/enums/index.mjs';

const vendorRepo = AppDataSource.getRepository(Vendors);

//=================== ZOD VALIDATION SCHEMAS ====================

const baseSearchParamsSchema = z.object({
  serviceType: z.enum(Object.values(SERVICE_TYPE)),
  page: z.number().int().min(1).default(1),
});

const locationSearchParamsSchema = baseSearchParamsSchema.extend({
  lng: z.string().min(1),
  lat: z.string().min(1),
  radiusKm: z.string().min(1),
});

const shopNameSearchParamsSchema = baseSearchParamsSchema.extend({
  query: z.string().min(1),
});


//=================== HELPER FUNCTIONS ====================

/**
 * A central helper function to execute, paginate, and process the final results of a vendor search query.
 * It enriches the vendor data with presigned URLs for images.
 * @param {import('typeorm').SelectQueryBuilder<Vendors>} queryBuilder - The TypeORM query builder instance, pre-configured with WHERE and ORDER BY clauses.
 * @param {number} page - The current page number for pagination.
 * @param {number} [limit=10] - The number of items to fetch per page.
 * @returns {Promise<{data: object[], pagination: object}>} An object containing the processed vendor data and pagination info.
 */
const executeSearchQuery = async (queryBuilder, page, limit = 10) => {
    const offset = (page - 1) * limit;

    const vendors = await queryBuilder
        .andWhere("vendors.status = :status", { status: VENDOR_STATUS.VERIFIED })
        .andWhere("user.isBlocked = :isBlocked", { isBlocked: false })
        .limit(limit)
        .offset(offset)
        .getMany();

    const processedResults = await Promise.all(
        vendors.map(async (vendor) => {
            const [avatarUrl, shopImageUrl] = await Promise.all([
                vendor.vendorAvatarUrlPath ? getPresignedViewUrl(vendor.vendorAvatarUrlPath) : null,
                vendor.shopImageUrlPath ? getPresignedViewUrl(vendor.shopImageUrlPath) : null,
            ]);
            return {
                id: vendor.id,
                name: vendor.user.name,
                shopName: vendor.shopName,
                serviceType: vendor.serviceType,
                city: vendor.city,
                allTimeRating: vendor.allTimeRating,
                allTimeReviewCount: vendor.allTimeReviewCount,
                vendorAvatarUrl: avatarUrl,
                shopImageUrl: shopImageUrl,
            };
        })
    );
    
    return {
        data: processedResults,
        pagination: {
            currentPage: page,
            hasMore: processedResults.length === limit,
            nextPage: processedResults.length === limit ? page + 1 : null,
        },
    };
};


//=================== SEARCH SERVICES ====================

/**
 * @api {get} /api/search/searchByRating/:serviceType/:page Search by Rating
 * @apiName SearchVendorsByRating
 * @apiGroup Search
 * @apiDescription Searches for verified vendors of a specific service type, ordered by their all-time rating in descending order. Results are cached for 5 minutes.
 *
 * @apiParam {string} serviceType - The type of service to search for ('tailors', 'laundry').
 * @apiParam {number} page - The page number for pagination.
 *
 * @param {object} params - The search parameters.
 * @param {string} params.serviceType - The type of service to search for ('tailors', 'laundry').
 * @param {number} params.page - The page number for pagination.
 *
 * @apiSuccess {Object[]} data - An array of vendor objects.
 * @apiSuccess {Object} data.id - The UUID of the vendor.
 * @apiSuccess {Object} data.name - The name of the vendor.
 * @apiSuccess {Object} data.shopName - The name of the vendor's shop.
 * @apiSuccess {Object} data.serviceType - The type of service the vendor offers.
 * @apiSuccess {Object} data.city - The city of the vendor.
 * @apiSuccess {Object} data.allTimeRating - The all-time rating of the vendor.
 * @apiSuccess {Object} data.allTimeReviewCount - The number of reviews the vendor has received.
 * @apiSuccess {Object} data.vendorAvatarUrl - The presigned URL for the vendor's avatar image.
 * @apiSuccess {Object} data.shopImageUrl - The presigned URL for the vendor's shop image.
 *
 * @apiSuccess {Object} pagination - Pagination details.
 * @apiSuccess {Object} pagination.currentPage - The current page number.
 * @apiSuccess {Object} pagination.hasMore - Whether there are more pages.
 * @apiSuccess {Object} pagination.nextPage - The next page number.
 *
 * @apiError {Error} 400 - If search parameters are invalid.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const searchVendorsByRating = async (params) => {
  try {
    const { serviceType, page } = baseSearchParamsSchema.parse(params);
    const cacheKey = `search:rating:${serviceType}:${page}`;

    return await cacheOrFetch(cacheKey, async () => {
        const queryBuilder = vendorRepo.createQueryBuilder("vendors")
            .leftJoinAndSelect("vendors.user", "user")
            .where("vendors.serviceType = :serviceType", { serviceType })
            .orderBy("vendors.allTimeRating", "DESC");

        return executeSearchQuery(queryBuilder, page);
    }, 300); // 5 minutes

  } catch (err) {
    logger.error("Error in searchVendorsByRating:", err);
    if (err instanceof z.ZodError) {
        throw sendError("Invalid search parameters.", 400, err.flatten().fieldErrors);
    }
    throw err;
  }
};

/**
 * @api {get} /api/search/searchByNearestLocation/:serviceType/:lng/:lat/:radiusKm/:page Search by Location
 * @apiName SearchVendorByNearestLocation
 * @apiGroup Search
 * @apiDescription Performs a geospatial search to find verified vendors within a given radius of a coordinate point, ordered by proximity. Results are cached for 1 minute.
 *
 * @apiParam {string} serviceType - The type of service to search for ('tailors', 'laundry').
 * @apiParam {string} lng - The longitude of the search center.
 * @apiParam {string} lat - The latitude of the search center.
 * @apiParam {string} radiusKm - The search radius in kilometers.
 * @apiParam {number} page - The page number.
 *
 * @param {object} params - The search parameters.
 * @param {string} params.serviceType - The type of service to search for ('tailors', 'laundry').
 * @param {string} params.lng - The longitude of the search center.
 * @param {string} params.lat - The latitude of the search center.
 * @param {string} params.radiusKm - The search radius in kilometers.
 * @param {number} params.page - The page number.

 * @apiSuccess {Object[]} data - An array of vendor objects.
 * @apiSuccess {Object} data.id - The UUID of the vendor.
 * @apiSuccess {Object} data.name - The name of the vendor.
 * @apiSuccess {Object} data.shopName - The name of the vendor's shop.
 * @apiSuccess {Object} data.serviceType - The type of service the vendor offers.
 * @apiSuccess {Object} data.city - The city of the vendor.
 * @apiSuccess {Object} data.allTimeRating - The all-time rating of the vendor.
 * @apiSuccess {Object} data.allTimeReviewCount - The number of reviews the vendor has received.
 * @apiSuccess {Object} data.vendorAvatarUrl - The presigned URL for the vendor's avatar image.
 * @apiSuccess {Object} data.shopImageUrl - The presigned URL for the vendor's shop image.

 * @apiSuccess {Object} pagination - Pagination details.
 * @apiSuccess {Object} pagination.currentPage - The current page number.
 * @apiSuccess {Object} pagination.hasMore - Whether there are more pages.
 * @apiSuccess {Object} pagination.nextPage - The next page number.
 *
 * @apiError {Error} 400 - If search parameters are invalid.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const searchVendorByNearestLocation = async (params) => {
    try {
        const { serviceType, lng, lat, radiusKm, page } = locationSearchParamsSchema.parse(params);
        const cacheKey = `search:location:${serviceType}:${lng}:${lat}:${radiusKm}:${page}`;

        return await cacheOrFetch(cacheKey, async () => {
            const queryBuilder = vendorRepo.createQueryBuilder("vendors")
                .leftJoinAndSelect("vendors.user", "user")
                .where("vendors.serviceType = :serviceType", { serviceType })
                // PostGIS function to find vendors within a radius
                .andWhere(`ST_DWithin(vendors.location, ST_MakePoint(:lng, :lat)::geography, :radius)`)
                .orderBy(`ST_Distance(vendors.location, ST_MakePoint(:lng, :lat)::geography)`)
                .setParameters({
                    lng,
                    lat,
                    radius: radiusKm * 1000, // km to meters
                });

            return executeSearchQuery(queryBuilder, page);
        }, 60); // 1 minute 

    } catch (err) {
        logger.error("Error in searchVendorsByNearestLocation:", err);
        if (err instanceof z.ZodError) {
            throw sendError("Invalid search parameters.", 400, err.flatten().fieldErrors);
        }
        throw err;
    }
};

/**
 * @api {get} /api/search/searchByRatingAndLocation/:serviceType/:lng/:lat/:radiusKm/:page Search by Hybrid Score
 * @apiName SearchVendorsByRatingAndLocation
 * @apiGroup Search
 * @apiDescription Searches for vendors using a hybrid score that balances high ratings and close proximity, providing the most relevant results. Results are cached for 1 minute.
 *
 * @apiParam {string} serviceType - The type of service to search for ('tailors', 'laundry').
 * @apiParam {string} lng - The longitude of the search center.
 * @apiParam {string} lat - The latitude of the search center.
 * @apiParam {string} radiusKm - The search radius in kilometers.
 * @apiParam {number} page - The page number.

 * @param {object} params - The search parameters.
 * @param {string} params.serviceType - The type of service to search for ('tailors', 'laundry').
 * @param {string} params.lng - The longitude of the search center.
 * @param {string} params.lat - The latitude of the search center.
 * @param {string} params.radiusKm - The search radius in kilometers.
 * @param {number} params.page - The page number.
 *
 * @apiSuccess {Object[]} data - An array of vendor objects.
 * @apiSuccess {Object} data.id - The UUID of the vendor.
 * @apiSuccess {Object} data.name - The name of the vendor.
 * @apiSuccess {Object} data.shopName - The name of the vendor's shop.
 * @apiSuccess {Object} data.serviceType - The type of service the vendor offers.
 * @apiSuccess {Object} data.city - The city of the vendor.
 * @apiSuccess {Object} data.allTimeRating - The all-time rating of the vendor.
 * @apiSuccess {Object} data.allTimeReviewCount - The number of reviews the vendor has received.
 * @apiSuccess {Object} data.vendorAvatarUrl - The presigned URL for the vendor's avatar image.
 * @apiSuccess {Object} data.shopImageUrl - The presigned URL for the vendor's shop image.

 * @apiSuccess {Object} pagination - Pagination details.
 * @apiSuccess {Object} pagination.currentPage - The current page number.
 * @apiSuccess {Object} pagination.hasMore - Whether there are more pages.
 * @apiSuccess {Object} pagination.nextPage - The next page number.
 *
 * @apiError {Error} 400 - If search parameters are invalid.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const searchVendorsByRatingAndLocation = async (params) => {
    try {
        const { serviceType, lng, lat, radiusKm, page } = locationSearchParamsSchema.parse(params);
        const cacheKey = `search:ratingAndLocation:${serviceType}:${lng}:${lat}:${radiusKm}:${page}`;

        return await cacheOrFetch(cacheKey, async () => {
            const radiusInMeters = radiusKm * 1000;

            const queryBuilder = vendorRepo.createQueryBuilder("vendors")
                .leftJoinAndSelect("vendors.user", "user")
                .addSelect(`
                    (0.6 * (vendors."allTimeRating" / 5.0)) +
                    (0.4 * (1 - LEAST(ST_Distance(vendors.location::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) / :radius, 1.0)))
                `, "hybridScore")
                .where("vendors.serviceType = :serviceType", { serviceType })
                .andWhere(`ST_DWithin(vendors.location, ST_MakePoint(:lng, :lat)::geography, :radius)`)
                .orderBy("\"hybridScore\"", "DESC")
                .setParameters({
                    lng,
                    lat,
                    radius: radiusInMeters,
                });

            return executeSearchQuery(queryBuilder, page);
        }, 60); // 1 minute

    } catch (err) {
        logger.error("Error in searchVendorsByHybridScore:", err);
        if (err instanceof z.ZodError) {
            throw sendError("Invalid search parameters.", 400, err.flatten().fieldErrors);
        }
        throw err;
    }
};

/**
 * @api {get} /api/search/searchByShopName/:serviceType/:query/:page Search by Shop Name
 * @apiName SearchVendorsByShopName
 * @apiGroup Search
 * @apiDescription Performs a case-insensitive search for vendors by their shop name. Results are cached for 5 minutes.
 *
 * @apiParam {string} serviceType - The type of service to search for ('tailors', 'laundry').
 * @apiParam {string} query - The query to search for.
 * @apiParam {number} page - The page number.

 * @param {object} params - The search parameters.
 * @param {string} params.serviceType - The type of service to search for ('tailors', 'laundry').
 * @param {string} params.query - The query to search for.
 * @param {number} params.page - The page number.
 *
 * @apiSuccess {Object[]} data - An array of vendor objects.
 * @apiSuccess {Object} data.id - The UUID of the vendor.
 * @apiSuccess {Object} data.name - The name of the vendor.
 * @apiSuccess {Object} data.shopName - The name of the vendor's shop.
 * @apiSuccess {Object} data.serviceType - The type of service the vendor offers.
 * @apiSuccess {Object} data.city - The city of the vendor.
 * @apiSuccess {Object} data.allTimeRating - The all-time rating of the vendor.
 * @apiSuccess {Object} data.allTimeReviewCount - The number of reviews the vendor has received.
 * @apiSuccess {Object} data.vendorAvatarUrl - The presigned URL for the vendor's avatar image.
 * @apiSuccess {Object} data.shopImageUrl - The presigned URL for the vendor's shop image.

 * @apiSuccess {Object} pagination - Pagination details.
 * @apiSuccess {Object} pagination.currentPage - The current page number.
 * @apiSuccess {Object} pagination.hasMore - Whether there are more pages.
 * @apiSuccess {Object} pagination.nextPage - The next page number.
 *
 * @apiError {Error} 400 - If search parameters are invalid.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const searchVendorsByShopName = async (params) => {
    try {
        const { serviceType, query, page } = shopNameSearchParamsSchema.parse(params);
        const cacheKey = `search:shopName:${serviceType}:${query}:${page}`;

        return await cacheOrFetch(cacheKey, async () => {
            const queryBuilder = vendorRepo.createQueryBuilder("vendors")
                .leftJoinAndSelect("vendors.user", "user")
                .where("vendors.serviceType = :serviceType", { serviceType })
                .andWhere("vendors.shopName ILIKE :query", { query: `%${query}%` })
                .orderBy("vendors.allTimeRating", "DESC");

            return executeSearchQuery(queryBuilder, page);
        }, 300); // 5 minutes

    } catch (err) {
        logger.error("Error in searchVendorsByShopName:", err);
        if (err instanceof z.ZodError) {
            throw sendError("Invalid search parameters.", 400, err.flatten().fieldErrors);
        }
        throw err;
    }
};