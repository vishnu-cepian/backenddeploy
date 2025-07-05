import { Worker } from "bullmq";
import { bullRedis } from "../../config/redis-config.mjs";
import { sendMessage } from "../../services/chatService.mjs";
import { AppDataSource } from "../../config/data-source.mjs";
import { QueueLogs } from "../../entities/queueLogs.mjs";
import { logger } from "../../utils/logger-utils.mjs";

let chatWorker;

export function initChatWorker() {
    chatWorker = new Worker("chatQueue", async (job) => {

        const { chatRoomId, senderId, content } = job.data;
        if (!chatRoomId || !senderId || !content) {
            throw new Error("Invalid message data in job");
        }

        try {
            await sendMessage({ chatRoomId, senderId, content });
        } catch (error) {
            logger.error(`Failed to process chat message for room ${chatRoomId}: ${error.message}`, {
                error,
                jobId: job.id,
                chatRoomId
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

    chatWorker.on("error", (error) => {
        logger.error("Error in chat worker:", error);
    });

    chatWorker.on("completed", (job) => {
        logger.info(`Job ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    chatWorker.on("failed", (job, error) => {
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

    chatWorker.on('drained', () => {
        logger.info('All jobs in chatQueue have been processed.');
    });
      
    return chatWorker;
}