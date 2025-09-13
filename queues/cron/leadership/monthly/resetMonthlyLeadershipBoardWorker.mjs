import { Worker } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";
import { AppDataSource } from "../../../../config/data-source.mjs";
import { QueueLogs } from "../../../../entities/queueLogs.mjs";
import { logger } from "../../../../utils/logger-utils.mjs";
import { Vendors } from "../../../../entities/Vendors.mjs";
import { deleteByPattern } from "../../../../utils/cache.mjs";
import { Not } from "typeorm";
import { LeaderboardHistory } from "../../../../entities/LeaderboardHistory.mjs";
import { SERVICE_TYPE, VENDOR_STATUS } from "../../../../types/enums/index.mjs";

const vendorRepo = AppDataSource.getRepository(Vendors);

let resetMonthlyLeadershipBoardWorker;

/**
 * @file resetMonthlyLeadershipBoardWorker.mjs
 * @description This cron job worker runs on the first day of every month to perform two critical tasks:
 * 1.  Archive the previous month's top performers to a permanent history table.
 * 2.  Reset the monthly performance counters for all vendors to zero for the new month.
 *
 * ### Business Logic Flow:
 * 1.  **Execution Time**: The worker is scheduled to run at midnight (00:00) on the 1st day of each month.
 * 2.  **Determine Previous Month**: It calculates the correct `YYYY-MM` string for the month that just ended. For example, when it runs on February 1st, it will process data for January.
 * 3.  **Process Each Service Type**: It iterates through all defined service types (e.g., 'tailors', 'laundry').
 * 4.  **Identify Top Vendors**: For each service type, it finds the top 25 vendors based on their `currentMonthBayesianScore` from the previous month.
 * 5.  **Archive Leaderboard**: It takes a snapshot of these top vendors' performance (ratings, review counts, scores, and rank) and performs a bulk insert into the `LeaderboardHistory` table. This preserves the historical data for future queries.
 * 6.  **Reset Monthly Scores**: After archiving, it performs a bulk `UPDATE` on the `Vendors` table to reset `currentMonthRating`, `currentMonthReviewCount`, and `currentMonthBayesianScore` to zero for all vendors who had activity. This ensures a clean slate for the new month's rankings.
 * 7.  **Cache Invalidation**: Finally, it clears the Redis cache for the `getMonthlyLeadershipBoard` API endpoint to ensure that any API calls for the previous month will now correctly fetch the newly archived data.
 *
 * This entire process is wrapped in a database transaction to ensure atomicity. If any step fails, the entire operation is rolled back to maintain data integrity.
 *
 * @returns {Worker} The initialized BullMQ worker instance.
 */
export function initResetMonthlyLeadershipBoardWorker() {
    resetMonthlyLeadershipBoardWorker = new Worker("resetMonthlyLeadershipBoardQueue", async (job) => {
        if (job.name !== "processResetMonthlyLeadershipBoard") return;

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const serviceTypes = Object.values(SERVICE_TYPE);
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
                        status: VENDOR_STATUS.VERIFIED, 
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
            await deleteByPattern("getMonthlyLeadershipBoard:*");
            logger.info(`Monthly job executed at ${new Date().toISOString()}`);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            logger.error(`Monthly leadership processing failed: ${error.message}`, {
                error,
                jobId: job.id
            })
            throw error;
        } finally {
            await queryRunner.release();
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

    resetMonthlyLeadershipBoardWorker.on("error", (error) => {
        logger.error("Error in reset monthly leadership board worker:", error);
    });

    resetMonthlyLeadershipBoardWorker.on("completed", (job) => {
        logger.info(`Job ${job.queueName} ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    resetMonthlyLeadershipBoardWorker.on("failed", (job, error) => {
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

    resetMonthlyLeadershipBoardWorker.on('drained', () => {
        logger.info('All jobs in resetMonthlyLeadershipBoardQueue have been processed.');
    });
      
    return resetMonthlyLeadershipBoardWorker;
}