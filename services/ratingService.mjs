import { z } from "zod";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Orders } from "../entities/Orders.mjs";
import { Rating } from "../entities/Rating.mjs";
import { Customers } from "../entities/Customers.mjs";
import { ORDER_STATUS, VENDOR_STATUS } from "../types/enums/index.mjs";
import { Not } from "typeorm";
import { cacheOrFetch } from "../utils/cache.mjs";
import { getPresignedViewUrl } from "./s3service.mjs";

const vendorRepo = AppDataSource.getRepository(Vendors);

//========================= ZOD VALIDATION SCHEMAS =========================

const updateRatingSchema = z.object({
    userId: z.string().uuid(),
    vendorId: z.string().uuid(),
    orderId: z.string().uuid(),
    rating: z.number().int().min(1).max(5).refine(val => val >= 1 && val <= 5, { message: "Rating must be between 1 and 5" }),
    review: z.string().min(2).max(200).optional().refine(val => val === undefined || val.length >= 2 && val.length <= 200, { message: "Review must be between 2 and 200 characters" }),
  });

//========================= RATING SERVICES =========================

/**
 * @api {post} /api/rating/updateVendorRating Update Vendor Rating
 * @apiName UpdateVendorRating
 * @apiGroup Rating
 * @apiDescription Allows a customer to submit a rating and an optional review for a completed order. This operation is transactional and performs an atomic update on the vendor's aggregate rating scores.
 *
 * @apiBody {string} vendorId - The UUID of the vendor being rated.
 * @apiBody {string} orderId - The UUID of the completed order.
 * @apiBody {number} rating - An integer rating from 1 to 5.
 * @apiBody {string} [review] - An optional review text (2-200 characters).
 *
 * @param {string} data - The rating submission data.
 * @param {string} data.userId - The UUID of the customer submitting the rating.
 * @param {string} data.vendorId - The UUID of the vendor being rated.
 * @param {string} data.orderId - The UUID of the completed order.
 * @param {number} data.rating - An integer rating from 1 to 5.
 * @param {string} [data.review] - An optional review text (2-200 characters).
 *
 * @apiSuccess {string} message - A success confirmation message.
 *
 * @apiError {Error} 400 - If the input data fails validation.
 * @apiError {Error} 403 - If the order is not completed or does not belong to the user/vendor pair.
 * @apiError {Error} 404 - If the customer profile is not found.
 * @apiError {Error} 409 - If the user has already rated this specific order.
 * @apiError {Error} 500 - Internal Server Error.
 */
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
        if(order.isRated) throw sendError("You have already rated this vendor for this order", 409);

        await queryRunner.manager.update(Orders, orderId, { isRated: true });

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
        // This raw SQL calculation prevents race conditions by performing the recalculation directly in the database.
        // Formula: new_average = ((old_average * old_count) + new_value) / (old_count + 1)
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
/**
 * @api {get} /api/rating/getDailyLeadershipBoard Get Daily Leaderboard
 * @apiName GetDailyLeadershipBoard
 * @apiGroup Rating
 * @apiDescription Fetches the top 10 verified vendors for the daily leaderboard based on their current month's Bayesian score. Results are cached for 1 hour.
 *
 * @apiSuccess {Object[]} standings - An array of top vendor objects.
 * @apiSuccess {string} standings.id - The UUID of the vendor.
 * @apiSuccess {string} standings.shopName - The name of the vendor's shop.
 *
 * @apiSuccess {number} standings.currentMonthBayesianScore - The current month's Bayesian score of the vendor.
 * @apiSuccess {string} standings.serviceType - The type of service the vendor offers.
 * @apiSuccess {string} standings.vendorAvatarUrl - The URL of the vendor's avatar.
 *
 * @apiError {Error} 500 - Internal Server Error.
 */
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
                    // currentMonthRating: true,
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