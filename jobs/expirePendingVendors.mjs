import cron from "node-cron";
import { AppDataSource } from "../config/data-source.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { ORDER_VENDOR_STATUS } from "../types/enums/index.mjs";

// 1 MINUTE FOR TESTING
const cronTime = process.env.CRON_TIME || "*/30 * * * *";

cron.schedule(cronTime, async () => {
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
        logger.error("Error in expirePendingVendors cron job", error);
    }
});