import cron from "node-cron";
import { AppDataSource } from "../config/data-source.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { LessThan } from "typeorm";

// 1 MINUTE FOR TESTING
const cronTime = process.env.CRON_TIME || "*/30 * * * *";

cron.schedule(cronTime, async () => {
    try {
        const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
        const orderVendors = await orderVendorRepo.find({
            where: {
                status: "PENDING",
                createdAt: LessThan(new Date(Date.now() - 24 * 60 * 60 * 1000))
            }
        });
        for (const orderVendor of orderVendors) {
            orderVendor.status = "EXPIRED";
            await orderVendorRepo.save(orderVendor);
        }
        logger.info(`Expired ${orderVendors.length} pending vendors at ${new Date().toISOString()}`);

    } catch (error) {
        logger.error("Error in expirePendingVendors cron job", error);
    }
});