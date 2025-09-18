import { Worker } from "bullmq";
import { bullRedis } from "../../../config/redis-config.mjs";
import { sendPushNotification } from "../../../services/notificationService.mjs";
import { AppDataSource } from "../../../config/data-source.mjs";
import { QueueLogs } from "../../../entities/queueLogs.mjs";
import { logger } from "../../../utils/logger-utils.mjs";

let pushWorker;

export function initPushWorker() {
    pushWorker = new Worker("pushQueue", async (job) => {

        const { token, title, message, data={} } = job.data;
        if (!token || !title || !message) {
            throw new Error("Invalid message data in job");
        }

        try {
            await sendPushNotification(token, title, message, data.url);
        } catch (error) {
            logger.error(`Failed to process push notification for token ${token}: ${error.message}`, {
                error,
                jobId: job.id,
                token
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

    pushWorker.on("error", (error) => {
        logger.error("Error in push worker:", error);
    });

    pushWorker.on("completed", (job) => {
        logger.info(`Job ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    pushWorker.on("failed", (job, error) => {
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

    pushWorker.on('drained', () => {
        logger.info('All jobs in pushQueue have been processed.');
    });
      
    return pushWorker;
}