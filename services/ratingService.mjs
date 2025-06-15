import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Orders } from "../entities/Orders.mjs";
import { Rating } from "../entities/Rating.mjs";
import { Customers } from "../entities/Customers.mjs";
import { ORDER_STATUS } from "../types/enums/index.mjs";
import { Not } from "typeorm";

const ratingRepo = AppDataSource.getRepository(Rating);
const vendorRepo = AppDataSource.getRepository(Vendors);
const orderRepo = AppDataSource.getRepository(Orders);
const customerRepo = AppDataSource.getRepository(Customers);

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

export const getDailyLeadershipBoard = async (data) => {
    try {
        const { serviceType, limit = 25 } = data;
        const vendors = await vendorRepo.find({ where: { status: "VERIFIED", serviceType, currentMonthRating: Not(0) } });

        const standings = vendors.sort((a, b) => b.currentMonthBayesianScore - a.currentMonthBayesianScore).slice(0, limit);
        return standings.map(vendor => ({
            id: vendor.id,
            shopName: vendor.shopName,
            currentMonthRating: vendor.currentMonthRating,
            currentMonthReviewCount: vendor.currentMonthReviewCount,
            currentMonthBayesianScore: vendor.currentMonthBayesianScore,
            serviceType: vendor.serviceType
        }));
    } catch (error) {
        logger.error("Error in getDailyLeadershipBoard", error);
        throw error;
    }
}