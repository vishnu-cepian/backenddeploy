import { Worker } from "bullmq";
import { bullRedis } from "../../../config/redis-config.mjs";
import { sendSms } from "../../../services/notificationService.mjs";
import { AppDataSource } from "../../../config/data-source.mjs";
import { QueueLogs } from "../../../entities/queueLogs.mjs";
import { logger } from "../../../utils/logger-utils.mjs";

let smsWorker;

export function initSmsWorker() {
    smsWorker = new Worker("smsQueue", async (job) => {

        const { phoneNumber, template_id, variables } = job.data;
        if (!phoneNumber || !template_id || !variables) {
            throw new Error("Invalid data in job");
        }

        try {
            await sendSms(phoneNumber, template_id, variables);
        } catch (error) {
            logger.error(`Failed to send SMS to ${phoneNumber}: ${error.message}`, {
                error,
                jobId: job.id,
                phoneNumber
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

    smsWorker.on("error", (error) => {
        logger.error("Error in sms worker:", error);
    });

    smsWorker.on("completed", (job) => {
        logger.info(`Job ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    smsWorker.on("failed", (job, error) => {
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

    smsWorker.on('drained', () => {
        logger.info('All jobs in smsQueue have been processed.');
    });
      
    return smsWorker;
}