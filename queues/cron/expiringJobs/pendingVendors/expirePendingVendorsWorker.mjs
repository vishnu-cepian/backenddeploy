import { Worker } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";
import { AppDataSource } from "../../../../config/data-source.mjs";
import { QueueLogs } from "../../../../entities/queueLogs.mjs";
import { logger } from "../../../../utils/logger-utils.mjs";
import { OrderVendors } from "../../../../entities/OrderVendors.mjs";
import { ORDER_VENDOR_STATUS } from "../../../../types/enums/index.mjs";

let expirePendingVendorsWorker;

/**
 * @file expirePendingVendorsWorker.mjs
 * @description This cron job worker enforces the 24-hour response window for vendors.
 * When a customer sends an order request to a vendor, the vendor has 24 hours to respond.
 * If they fail to do so, this worker automatically expires the request.
 *
 * ### Business Logic Flow:
 * 1.  The worker runs periodically (e.g., every 30 minutes).
 * 2.  It executes a single, highly efficient bulk `UPDATE` query on the `OrderVendors` table.
 * 3.  The query finds all records that are still in `PENDING` status and were created more than 24 hours ago.
 * 4.  It changes the status of these records from `PENDING` to `EXPIRED`.
 *
 * ### Consequence:
 * - Expiring the request frees up one of the customer's 10 active vendor slots for that order,
 * allowing them to send the request to a different vendor.
 * - It keeps the system clean by removing stale, unanswered requests from the vendor's active queue.
 *
 * @returns {Worker} The initialized BullMQ worker instance.
 */
export function initExpirePendingVendorsWorker() {
    expirePendingVendorsWorker = new Worker("expirePendingVendorsQueue", async (job) => {
        if (job.name !== "processExpirePendingVendors") return;
        try {
            const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
            // Bulk update all pending vendors older than 24 hours
            const result = await orderVendorRepo.createQueryBuilder()
                .update()
                .set({ status: ORDER_VENDOR_STATUS.EXPIRED })
                .where("status = :status", { status: ORDER_VENDOR_STATUS.PENDING })
                .andWhere("createdAt < :date", { date: new Date(Date.now() - 24 * 60 * 60 * 1000) })
                .execute();
            logger.info(`Expired ${result.affected} pending vendors at ${new Date().toISOString()}`);
        } catch (error) {
            logger.error(`Expire pending vendors processing failed: ${error.message}`, {
                error,
                jobId: job.id
            })
            // Allow BullMQ to handle retries based on the queue's default job options.
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

    expirePendingVendorsWorker.on("error", (error) => {
        logger.error("Error in expire pending vendors worker:", error);
    });

    expirePendingVendorsWorker.on("completed", (job) => {
        logger.info(`Job ${job.queueName} ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    expirePendingVendorsWorker.on("failed", (job, error) => {
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

    expirePendingVendorsWorker.on('drained', () => {
        logger.info('All jobs in expirePendingVendorsQueue have been processed.');
    });
      
    return expirePendingVendorsWorker;
}