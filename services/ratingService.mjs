import { z } from "zod";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Orders } from "../entities/Orders.mjs";
import { Rating } from "../entities/Rating.mjs";
import { Customers } from "../entities/Customers.mjs";
import { ORDER_STATUS, SERVICE_TYPE, VENDOR_STATUS } from "../types/enums/index.mjs";
import { LeaderboardHistory } from "../entities/LeaderboardHistory.mjs";
import { Not } from "typeorm";
import { cacheOrFetch } from "../utils/cache.mjs";
import { getPresignedViewUrl } from "./s3service.mjs";

const vendorRepo = AppDataSource.getRepository(Vendors);
const leaderBoardHistoryRepo = AppDataSource.getRepository(LeaderboardHistory);

//========================= ZOD VALIDATION SCHEMAS =========================

const updateRatingSchema = z.object({
    userId: z.string().uuid(),
    vendorId: z.string().uuid(),
    orderId: z.string().uuid(),
    rating: z.number().int().min(1).max(5).refine(val => val >= 1 && val <= 5, { message: "Rating must be between 1 and 5" }),
    review: z.string().min(2).max(200).optional().refine(val => val === undefined || val.length >= 2 && val.length <= 200, { message: "Review must be between 2 and 200 characters" }),
  });

const getMonthlyLeaderboardSchema = z.object({
    serviceType: z.enum([SERVICE_TYPE.TAILORS, SERVICE_TYPE.LAUNDRY]),
    monthYear: z.string().regex(/^\d{4}-\d{2}$/, { message: "Month/Year must be in YYYY-MM format" }),
    limit: z.number().int().positive().default(25),
});

//========================= RATING SERVICES =========================

export const updateVendorRating = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { userId, vendorId, orderId, rating, review } = updateRatingSchema.parse(data);

        const customer = await queryRunner.manager.findOne(Customers, { where: { userId }, select: { id: true } });
        if(!customer) throw sendError("Customer not found", 404);
        const customerId = customer.id;

        // check if the customer has already rated the vendor for this order
        const ratingExists = await queryRunner.manager.exists(Rating, { where: { vendorId, customerId, orderId } });
        if(ratingExists) throw sendError("You have already rated this vendor for this order", 409);

        // check if order exist with the orderId, customerId, vendorId
        const order = await queryRunner.manager.findOne(Orders, { 
            where: { id: orderId, customerId, selectedVendorId : vendorId, orderStatus: ORDER_STATUS.COMPLETED },
            select: { id: true }
        });
        if(!order) throw sendError("This order is not eligible for rating", 403);

        const monthYear = new Date().toISOString().split("T")[0].split("-").slice(0, 2).join("-");
        await queryRunner.manager.save(Rating, {
            vendorId,
            customerId,
            orderId,
            rating,
            review: review || null,
            monthYear
        });

        // ATOMIC UPDATE: Prevent race condition

        await queryRunner.manager.update(Vendors, vendorId, {
            allTimeRating: () => `(("allTimeRating" * "allTimeReviewCount") + ${rating}) / ("allTimeReviewCount" + 1)`,
            allTimeReviewCount: () => `"allTimeReviewCount" + 1`,
            currentMonthRating: () => `(("currentMonthRating" * "currentMonthReviewCount") + ${rating}) / ("currentMonthReviewCount" + 1)`,
            currentMonthReviewCount: () => `"currentMonthReviewCount" + 1`
        });

        await queryRunner.commitTransaction();

        return {
            message: "Rating updated successfully"
        }
    } catch(err) {
        await queryRunner.rollbackTransaction();
        if (err instanceof z.ZodError) {
            logger.warn("updateVendorRating validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid data provided.", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in updateVendorRating", err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}

export const getDailyLeadershipBoard = async () => {
    try {
        const limit = 10;
        return await cacheOrFetch(`getDailyLeadershipBoard`, async () => {
            const vendors = await vendorRepo.find({ 
                where: {
                    status: VENDOR_STATUS.VERIFIED,
                    currentMonthRating: Not(0),
                },
                order: { currentMonthBayesianScore: "DESC" },
                take: limit,
                select: {
                    id: true,
                    shopName: true,
                    currentMonthRating: true,
                    currentMonthBayesianScore: true,
                    serviceType: true,
                    vendorAvatarUrlPath: true,
                }
             });

            const standings = await Promise.all(
                vendors.map(async vendor => ({
                    id: vendor.id,
                    shopName: vendor.shopName,
                    currentMonthRating: vendor.currentMonthRating,
                    currentMonthBayesianScore: vendor.currentMonthBayesianScore,
                    serviceType: vendor.serviceType,
                    vendorAvatarUrl: vendor.vendorAvatarUrlPath 
                        ? await getPresignedViewUrl(vendor.vendorAvatarUrlPath) 
                        : null
            })));

            return standings;
        }, 3600); // 1 hr // this cache will be cleared by the resetDailyLeadershipWorker
    } catch (error) {
        logger.error("Error in getDailyLeadershipBoard", error);
        throw error;
    }
}

export const getMonthlyLeadershipBoard = async (data) => {
    try {
        const { serviceType, monthYear, limit = 25 } = getMonthlyLeaderboardSchema.parse(data);

        return cacheOrFetch(`getMonthlyLeadershipBoard:${serviceType}:${monthYear}`, async () => {
            const history = await leaderBoardHistoryRepo.find({ where: { serviceType, monthYear }, order: { rank: "ASC" }, take: limit });
            return history;
        }, 3600); // 1 hr
    } catch (error) {
        logger.error("Error in getMonthlyLeadershipBoard", error);
        if (error instanceof z.ZodError) {
            throw sendError("Invalid parameters.", 400, error.flatten().fieldErrors);
        }
        throw error;
    }
}