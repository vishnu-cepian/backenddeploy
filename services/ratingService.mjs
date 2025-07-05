import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Orders } from "../entities/Orders.mjs";
import { Rating } from "../entities/Rating.mjs";
import { Customers } from "../entities/Customers.mjs";
import { ORDER_STATUS } from "../types/enums/index.mjs";
import { LeaderboardHistory } from "../entities/LeaderboardHistory.mjs";
import { Not } from "typeorm";
import { cacheOrFetch } from "../utils/cache.mjs";
import { getPresignedViewUrl } from "./s3service.mjs";

const ratingRepo = AppDataSource.getRepository(Rating);
const vendorRepo = AppDataSource.getRepository(Vendors);
const orderRepo = AppDataSource.getRepository(Orders);
const customerRepo = AppDataSource.getRepository(Customers);
const leaderBoardHistoryRepo = AppDataSource.getRepository(LeaderboardHistory);

export const updateVendorRating = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { userId, vendorId, orderId, rating, review } = data;

        const customer = await customerRepo.findOne({ where: { userId } });
        if(!customer) throw sendError("Customer not found");
        const customerId = customer.id;
        // check if the customer has already rated the vendor for this order
        const existingRating = await ratingRepo.findOne({ where: { vendorId, customerId, orderId } });
        if(existingRating) throw sendError("Rating already exists");

        // check if order exist with the orderId, customerId, vendorId
        const order = await orderRepo.findOne({ where: { id: orderId, customerId, selectedVendorId : vendorId } });
        if(!order) throw sendError("Rating not allowed for this order");
        if(order.orderStatus !== ORDER_STATUS.COMPLETED) throw sendError("Rating not allowed for this order");

        if (rating < 1 || rating > 5) throw sendError("Invalid rating");
        if (review && review.length > 200) throw sendError("Review must be less than 200 characters");
        if (review && review.length < 2) throw sendError("Review must be at least 2 characters");

        const monthYear = new Date().toISOString().split("T")[0].split("-").slice(0, 2).join("-");
        await queryRunner.manager.save(Rating, {
            vendorId,
            customerId,
            orderId,
            rating,
            review,
            monthYear
        });

        const vendor = await vendorRepo.findOne({ where: { id: vendorId } });
        if(!vendor) throw sendError("Vendor not found");

        // update all time status
        vendor.allTimeRating = (parseFloat(vendor.allTimeRating) * parseInt(vendor.allTimeReviewCount) + parseFloat(rating)) / (parseInt(vendor.allTimeReviewCount) + 1);
        vendor.allTimeReviewCount += 1;

        // update current month status
        vendor.currentMonthRating = (parseFloat(vendor.currentMonthRating) * parseInt(vendor.currentMonthReviewCount) + parseFloat(rating)) / (parseInt(vendor.currentMonthReviewCount) + 1);
        vendor.currentMonthReviewCount += 1;

        await queryRunner.manager.save(Vendors, vendor);

        await queryRunner.commitTransaction();

        return {
            message: "Rating updated successfully"
        }
    } catch(err) {
        await queryRunner.rollbackTransaction();
        logger.error(err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}
//
//
//   CACHE SHOULD BE UPDATED BY THE CRON JOB EVERY DAY
//   CACHE TTL IS 1 DAY
//
//
export const getDailyLeadershipBoard = async () => {
    try {
        const limit = 10;

        return cacheOrFetch(`getDailyLeadershipBoard`, async () => {
           
            const vendors = await vendorRepo.find({ where: {
                status: "VERIFIED",
                currentMonthRating: Not(0),
                },
                order: {
                    currentMonthBayesianScore: "DESC"
                },
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
        }, 3600); // 1 hr
    } catch (error) {
        logger.error("Error in getDailyLeadershipBoard", error);
        throw error;
    }
}

export const getMonthlyLeadershipBoard = async (data) => {
    try {
        const { serviceType, monthYear, limit = 25 } = data;

        if(!serviceType) throw sendError("service type required");
        if(!monthYear) throw sendError("month and year required");

        return cacheOrFetch(`getMonthlyLeadershipBoard:${serviceType.toLowerCase()}:${monthYear}`, async () => {
            const history = await leaderBoardHistoryRepo.find({ where: { serviceType: serviceType.toLowerCase(), monthYear }, order: { bayesianScore: "DESC" }, take: limit });
            return history;
        }, 3600); // 1 hr
    } catch (error) {
        logger.error("Error in getMonthlyLeadershipBoard", error);
        throw error;
    }
}