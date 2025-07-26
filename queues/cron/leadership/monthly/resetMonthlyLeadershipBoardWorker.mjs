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