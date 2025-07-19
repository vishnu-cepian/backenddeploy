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
 * This worker is used to expire accepted quotes after 24 hours (ie, when a vendor accepts a quote and if the customer hadn't responded within 24 hours, then the status of the orderVendor will be marked as FROZEN)
 * It will freeze the vendors and mark the quotes as processed
 * 
 * @returns {Worker}
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
                // Freeze vendors in bulk
                const orderVendorIds = orderQuotes.map(q => q.orderVendorId);
                await orderVendorRepo.createQueryBuilder()
                    .update()
                    .set({ status: ORDER_VENDOR_STATUS.FROZEN })
                    .whereInIds(orderVendorIds)
                    .andWhere("status = :status", { status: ORDER_VENDOR_STATUS.ACCEPTED })
                    .execute();

                // Mark quotes as processed in bulk
                const quoteIds = orderQuotes.map(q => q.id);
                await orderQuoteRepo.createQueryBuilder()
                    .update()
                    .set({ isProcessed: true })
                    .whereInIds(quoteIds)
                    .andWhere("isProcessed = false")
                    .execute();
            }

            logger.info(`Frozen ${orderQuotes.length} accepted quotes at ${new Date().toISOString()}`);
        } catch (error) {
            logger.error(`Expire accepted quotes processing failed: ${error.message}`, {
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