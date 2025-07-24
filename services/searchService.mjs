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