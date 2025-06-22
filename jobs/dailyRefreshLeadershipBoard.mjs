import cron from "node-cron";
import { logger } from "../utils/logger-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Not } from "typeorm";

const vendorRepo = AppDataSource.getRepository(Vendors);

// const cronTime = "0 0 * * *";
const cronTime = "*/1 * * * *"; //for testing

cron.schedule(cronTime, async () => {
    try {            
        const globalStats = await vendorRepo.createQueryBuilder("vendor")
            .where("vendor.status = :status", { status: "VERIFIED" })
            .andWhere("vendor.currentMonthRating > 0")
            .select("AVG(vendor.currentMonthRating)", "averageRating")
            .addSelect("COUNT(vendor.id)", "totalReviewCount")
            .getRawOne();

        const C = parseFloat(globalStats.averageRating) || 3.5;
        const m = 5;
        // const vendors = await vendorRepo.find({ where: { status: "VERIFIED", currentMonthRating: Not(0) } });

        // for (const vendor of vendors) {
        //     const V = parseInt(vendor.currentMonthReviewCount);
        //     const R = parseFloat(vendor.currentMonthRating); // average is already calculated
        //     const bayesianScore = (V * R + m * C) / (V + m);
        //     vendor.currentMonthBayesianScore = bayesianScore;
        //     await vendorRepo.save(vendor);
        // }


        // Bulk update: Use a single query to update all vendors
        await vendorRepo.createQueryBuilder()
            .update()
            .set({
                currentMonthBayesianScore: () =>
                    `(currentMonthReviewCount * currentMonthRating + ${m} * ${C}) / (currentMonthReviewCount + ${m})`
            })
            .where("status = :status", { status: "VERIFIED" })
            .andWhere("currentMonthRating > 0")
            .execute();

        logger.info(`Daily job executed at ${new Date().toISOString()}`);
    } catch (error) {
        logger.error("Error in daily cron job", error);
    }
}); 