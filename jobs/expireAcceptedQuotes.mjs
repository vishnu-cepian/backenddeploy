import cron from "node-cron";
import { AppDataSource } from "../config/data-source.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { ORDER_VENDOR_STATUS } from "../types/enums/index.mjs";

// 1 MINUTE FOR TESTING
const cronTime = process.env.CRON_TIME || "*/30 * * * *";

cron.schedule(cronTime, async () => {
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
        logger.error("Error in expireAcceptedQuotes cron job", error);
    }
});