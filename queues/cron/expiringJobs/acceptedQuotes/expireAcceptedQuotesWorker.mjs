import { Worker } from "bullmq";
import { bullRedis } from "../../../../config/redis-config.mjs";
import { AppDataSource } from "../../../../config/data-source.mjs";
import { QueueLogs } from "../../../../entities/queueLogs.mjs";
import { logger } from "../../../../utils/logger-utils.mjs";
import { OrderVendors } from "../../../../entities/OrderVendors.mjs";
import { OrderQuotes } from "../../../../entities/OrderQuote.mjs";
import { ORDER_VENDOR_STATUS } from "../../../../types/enums/index.mjs";

let expireAcceptedQuotesWorker;

/**
 * @file expireAcceptedQuotesWorker.mjs
 * @description This cron job worker is responsible for enforcing a critical business rule:
 * when a vendor accepts an order request and provides a quote, the customer has a 24-hour window to
 * act on it (i.e., make a payment).
 *
 * ### Business Logic Flow:
 * 1.  The worker runs periodically (e.g., every 30 minutes).
 * 2.  It queries the database for all `OrderQuotes` that are older than 24 hours and still marked as unprocessed (`isProcessed = false`).
 * 3.  Crucially, it only considers quotes where the associated `OrderVendors` status is still `ACCEPTED`.
 * 4.  If such quotes are found, it performs two bulk updates in a single operation:
 * a. It changes the status of the corresponding `OrderVendors` from `ACCEPTED` to `EXPIRED`. A expired request cannot be paid for by the customer, effectively freeing up the vendor from that commitment.
 * b. It marks the `OrderQuotes` as processed (`isProcessed = true`) to prevent them from being picked up by this worker in future runs.
 *
 * This automated process ensures the system remains clean and vendors are not indefinitely held responsible for quotes that customers do not act upon.
 *
 * @returns {Worker} The initialized BullMQ worker instance.
 */
export function initExpireAcceptedQuotesWorker() {
    expireAcceptedQuotesWorker = new Worker("expireAcceptedQuotesQueue", async (job) => {
        if (job.name !== "processExpireAcceptedQuotes") return;
        try {
            const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
            const orderQuoteRepo = AppDataSource.getRepository(OrderQuotes);

            // Find unprocessed quotes older than 24 hours with ACCEPTED vendors
            const orderQuotes = await orderQuoteRepo.createQueryBuilder("order_quotes")
                .leftJoinAndSelect("order_quotes.orderVendor", "orderVendor")
                .where("order_quotes.createdAt < :date", { date: new Date(Date.now() - 24 * 60 * 60 * 1000) })
                .andWhere("orderVendor.status = :status", { status: ORDER_VENDOR_STATUS.ACCEPTED })
                .andWhere("order_quotes.isProcessed = false")
                .getMany();

            if (orderQuotes.length > 0) {
                const orderVendorIds = orderQuotes.map(q => q.orderVendorId);

                // First, expire the OrderVendor status to prevent further action from the customer (bulk operation).
                await orderVendorRepo.createQueryBuilder()
                    .update()
                    .set({ status: ORDER_VENDOR_STATUS.EXPIRED })
                    .whereInIds(orderVendorIds)
                    .andWhere("status = :status", { status: ORDER_VENDOR_STATUS.ACCEPTED })
                    .execute();

                // Second, mark the quotes as processed so this job doesn't run on them again (bulk operation)
                const quoteIds = orderQuotes.map(q => q.id);
                await orderQuoteRepo.createQueryBuilder()
                    .update()
                    .set({ isProcessed: true })
                    .whereInIds(quoteIds)
                    .andWhere("isProcessed = false")
                    .execute();
            }

            logger.info(`Expired ${orderQuotes.length} accepted quotes at ${new Date().toISOString()}`);
        } catch (error) {
            logger.error(`Expire accepted quotes processing failed: ${error.message}`, {
                error,
                jobId: job.id
            })
            // Let BullMQ handle the retry based on job options
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

    expireAcceptedQuotesWorker.on("error", (error) => {
        logger.error("Error in expire accepted quotes worker:", error);
    });

    expireAcceptedQuotesWorker.on("completed", (job) => {
        logger.info(`Job ${job.queueName} ${job.id} completed`, {
            duration: job.finishedOn - job.processedOn,
        });
    });

    expireAcceptedQuotesWorker.on("failed", (job, error) => {
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

    expireAcceptedQuotesWorker.on('drained', () => {
        logger.info('All jobs in expireAcceptedQuotesQueue have been processed.');
    });
      
    return expireAcceptedQuotesWorker;
}