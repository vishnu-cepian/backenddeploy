import { Worker } from "bullmq";
import { bullRedis } from "../../../config/redis-config.mjs";
import { saveNotificationHistory } from "../../../services/notificationService.mjs";
import { AppDataSource } from "../../../config/data-source.mjs";
import { QueueLogs } from "../../../entities/queueLogs.mjs";
import { logger } from "../../../utils/logger-utils.mjs";

let notificationHistoryWorker;

export function initNotificationHistoryWorker() {
    notificationHistoryWorker = new Worker("notificationHistoryQueue", async (job) => {

        const { userId, title, body, timestamp } = job.data;
        if (!userId || !title || !body ) {
            throw new Error("Invalid data in job");
        }

        try {
            await saveNotificationHistory(userId, title, body, timestamp);
        } catch (error) {
            logger.error(`Failed to save notification history to ${email}: ${error.message}`, {
                error,
                jobId: job.id,
                email
            });
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

    notificationHistoryWorker.on("error", (error) => {
        logger.error("Error in notificationHistory worker:", error);
    });

    notificationHistoryWorker.on("completed", (job) => {
        logger.info(`Job ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    notificationHistoryWorker.on("failed", (job, error) => {
        logger.error(`Job ${job.id} failed: ${error.message}`);
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

    notificationHistoryWorker.on('drained', () => {
        logger.info('All jobs in notificationHistoryQueue have been processed.');
    });
      
    return notificationHistoryWorker;
}