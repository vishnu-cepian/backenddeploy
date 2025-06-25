import cron from "node-cron";
import { logger } from "../utils/logger-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { Not } from "typeorm";
import { LeaderboardHistory } from "../entities/LeaderboardHistory.mjs";

const vendorRepo = AppDataSource.getRepository(Vendors);

// Run at midnight on the first day of every month
const cronTime = "0 0 1 * *";
// const cronTime = "*/1 * * * *"; //for testing

cron.schedule(cronTime, async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const serviceTypes = ["tailoring", "laundry"];
        const now = new Date();
        
        // now.getMonth() is 0-indexed, so leave it without subtracting 1 to get previous month

        const previousMonthYear = new Date(now.getFullYear(), now.getMonth(), 1)
            .toISOString()
            .split("T")[0]
            .split("-")
            .slice(0, 2)
            .join("-");

        for (const serviceType of serviceTypes) {
            // Get vendors with non-zero ratings
            const vendors = await vendorRepo.find({ 
                where: { 
                    status: "VERIFIED", 
                    serviceType, 
                    currentMonthRating: Not(0) 
                } 
            });

            if (vendors.length === 0) continue;

            // Sort and get top 25 vendors
            const standings = vendors
                .sort((a, b) => b.currentMonthBayesianScore - a.currentMonthBayesianScore)
                .slice(0, 25);

            // Bulk insert leaderboard history
            const leaderboardEntries = standings.map((vendor, index) => ({
                vendorId: vendor.id,
                serviceType,
                monthYear: previousMonthYear,
                currentMonthRating: vendor.currentMonthRating,
                currentMonthReviewCount: vendor.currentMonthReviewCount,
                bayesianScore: vendor.currentMonthBayesianScore,
                rank: index + 1
            }));

            await queryRunner.manager
                .createQueryBuilder()
                .insert()
                .into(LeaderboardHistory)
                .values(leaderboardEntries)
                .execute();

            // Bulk update vendors to reset their scores
            await queryRunner.manager
                .createQueryBuilder()
                .update(Vendors)
                .set({
                    currentMonthRating: 0,
                    currentMonthReviewCount: 0,
                    currentMonthBayesianScore: 0
                })
                .where("id IN (:...ids)", { ids: vendors.map(v => v.id) })
                .execute();
        }

        await queryRunner.commitTransaction();
        logger.info(`Monthly job executed at ${new Date().toISOString()}`);
    } catch (error) {
        await queryRunner.rollbackTransaction();
        logger.error("Error in monthly cron job", error);
    } finally {
        await queryRunner.release();
    }
}); 