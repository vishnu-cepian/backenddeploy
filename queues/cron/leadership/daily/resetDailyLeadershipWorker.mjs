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

export function initResetDailyLeadershipWorker() {
    resetDailyLeadershipWorker = new Worker("resetDailyLeadershipQueue", async (job) => {
        if (job.name !== "processResetDailyLeadership") return;
        try {
            const globalStats = await vendorRepo.createQueryBuilder("vendor")
            .where("vendor.status = :status", { status: VENDOR_STATUS.VERIFIED })
            .andWhere("vendor.currentMonthRating > 0")
            .select("AVG(vendor.currentMonthRating)", "averageRating")
            .addSelect("COUNT(vendor.id)", "totalReviewCount")
            .getRawOne();

            const C = parseFloat(globalStats.averageRating) || 3.5;
            const m = 5;

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