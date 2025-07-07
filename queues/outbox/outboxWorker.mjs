import { Worker } from "bullmq";
import { bullRedis } from "../../config/redis-config.mjs";
import { Outbox } from "../../entities/Outbox.mjs";
import { AppDataSource } from "../../config/data-source.mjs";
import { QueueLogs } from "../../entities/queueLogs.mjs";
import { logger } from "../../utils/logger-utils.mjs";
import { sendDeliveryRequest } from "../../services/deliveryService.mjs";

let outboxWorker;

export function initOutboxWorker() {
    outboxWorker = new Worker("outboxQueue", async (job) => {

        const outboxRepo = AppDataSource.getRepository(Outbox);

        const pendingMessages = await outboxRepo.find({
            where: { status: "PENDING" },
            order: { createdAt: "ASC" },
            take: 10 // batch size
        });

        for (const message of pendingMessages) {
            try {
                if (message.eventType === "SEND_ITEM_PICKUP") {
                    await sendDeliveryRequest(message.payload);
                }
                message.status= "SENT";
                message.statusUpdatedAt = new Date();
                await outboxRepo.save(message);
            } catch (error) {
                logger.error(`Outbox processing failed for message ${message.id}: ${error.message}`, {
                    error,
                    jobId: job.id,
                    messageId: message.id
                });
                message.status = "FAILED";
                message.failureReason = error.message;
                message.statusUpdatedAt = new Date();
                await outboxRepo.save(message);
            }
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

    outboxWorker.on("error", (error) => {
        logger.error("Error in outbox worker:", error);
    });

    outboxWorker.on("completed", (job) => {
        logger.info(`Job ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    outboxWorker.on("failed", (job, error) => {
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

    outboxWorker.on('drained', () => {
        logger.info('All jobs in outboxQueue have been processed.');
    });
      
    return outboxWorker;
}