import { Worker } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";
import { AppDataSource } from "../../../../config/data-source.mjs";
import { QueueLogs } from "../../../../entities/queueLogs.mjs";
import { logger } from "../../../../utils/logger-utils.mjs";
import { Vendors } from "../../../../entities/Vendors.mjs";
import { deleteByPattern } from "../../../../utils/cache.mjs";
import { VENDOR_STATUS } from "../../../../types/enums/index.mjs";

const vendorRepo = AppDataSource.getRepository(Vendors);

let resetDailyLeadershipWorker;

/**
 * @file resetDailyLeadershipWorker.mjs
 * @description This cron job worker is responsible for calculating the daily leaderboard score for all verified vendors.
 *
 * ### The Problem with Simple Averages:
 * A simple average rating can be misleading. For example, a new vendor with a single 5-star review would rank higher than an established vendor with hundreds of reviews averaging 4.9 stars. This is statistically unreliable.
 *
 * ### The Solution: Bayesian Averaging
 * To solve this, the worker calculates a "Bayesian Score". This is a weighted average that pulls a vendor's score towards the global average rating of all vendors. This makes the leaderboard more fair and statistically sound, especially for vendors with a low number of reviews.
 * The formula used is: `Bayesian Score = ( (v * R) + (m * C) ) / (v + m)`
 * Where:
 * - `v`: The number of reviews for the vendor this month (`currentMonthReviewCount`).
 * - `R`: The vendor's average rating for this month (`currentMonthRating`).
 * - `m`: A constant representing the "minimum number of reviews to consider" (set to 5). This adds "ghost" ratings to stabilize the score for new vendors.
 * - `C`: The global average rating across all verified vendors with reviews this month.
 *
 * ### Business Logic Flow:
 * 1.  The worker runs once per day (at midnight).
 * 2.  It first calculates the global average rating (`C`) for all vendors who have received at least one rating in the current month.
 * 3.  It then executes a single, highly efficient bulk `UPDATE` query to calculate and set the `currentMonthBayesianScore` for every eligible vendor using the formula above.
 * 4.  Finally, it invalidates the Redis cache for the `getDailyLeadershipBoard` API endpoint to ensure that any subsequent API calls fetch the newly calculated scores.
 *
 * @returns {Worker} The initialized BullMQ worker instance.
 */
export function initResetDailyLeadershipWorker() {
    resetDailyLeadershipWorker = new Worker("resetDailyLeadershipQueue", async (job) => {
        if (job.name !== "processResetDailyLeadership") return;
        try {
            // Calculate the global average rating (C) and total reviews for all verified vendors
            // with at least one rating this month. This forms the baseline for our Bayesian average.
            const globalStats = await vendorRepo.createQueryBuilder("vendor")
            .where("vendor.status = :status", { status: VENDOR_STATUS.VERIFIED })
            .andWhere("vendor.currentMonthRating > 0")
            .select("AVG(vendor.currentMonthRating)", "averageRating")
            .addSelect("COUNT(vendor.id)", "totalReviewCount")
            .getRawOne();

            // C = The global average rating. We use 3.5 as a safe fallback if no ratings exist yet.
            const C = parseFloat(globalStats.averageRating) || 3.5;
            // m = The "confidence" constant. It's like adding 5 "ghost" reviews of average rating C to every vendor.
            const m = 5;

            // Perform a single bulk UPDATE on the Vendors table.
            // This is highly efficient as it calculates and updates the Bayesian score for all vendors in one database operation.
            await vendorRepo.createQueryBuilder()
            .update()
            .set({
                currentMonthBayesianScore: () =>
                    `(currentMonthReviewCount * currentMonthRating + ${m} * ${C}) / (currentMonthReviewCount + ${m})`
            })
            .where("status = :status", { status: VENDOR_STATUS.VERIFIED })
            .andWhere("currentMonthRating > 0")
            .execute();

            await deleteByPattern('getDailyLeadershipBoard:*'); //clear all cache for getDailyLeadershipBoard
        } catch (error) {
            logger.error(`Reset daily leadership processing failed: ${error.message}`, {
                error,
                jobId: job.id
            })
            throw error;
        }
        
        },
        {
            connection: bullRedis,
            concurrency: 5,
            removeOnComplete: {
                age: 30,
                count: 10
            },
            removeOnFail: {
                age: 30,
                count: 10
            }
        }
    );

    resetDailyLeadershipWorker.on("error", (error) => {
        logger.error("Error in reset daily leadership worker:", error);
    });

    resetDailyLeadershipWorker.on("completed", (job) => {
        logger.info(`Job ${job.queueName} ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    resetDailyLeadershipWorker.on("failed", (job, error) => {
        logger.error(`Job ${job.queueName} ${job.id} failed: ${error.message}`);
        if(job.attemptsMade >= job.opts.attempts) {
            (async () => {
                const queueLogsRepo = AppDataSource.getRepository(QueueLogs);
                await queueLogsRepo.save({
                    queueName: job.queueName,
                    jobId: job.id,
                    jobData: job.data,
                    reason: error.message,
                    failedAt: new Date()
                });
            })();
        }
    });

    resetDailyLeadershipWorker.on('drained', () => {
        logger.info('All jobs in resetDailyLeadershipQueue have been processed.');
    });
      
    return resetDailyLeadershipWorker;
}