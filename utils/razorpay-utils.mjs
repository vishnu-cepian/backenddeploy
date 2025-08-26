import Razorpay from "razorpay";
import { logger } from "../utils/logger-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Refunds } from "../entities/Refunds.mjs";

const refundRepo = AppDataSource.getRepository(Refunds);

/**
 * Refunds a payment from Razorpay.
 * 
 * @param {string} paymentId - The ID of the payment to refund.
 * @param {string} reason - The reason for the refund.
 * @param {string} speed - The speed of the refund (default: normal).
 * @returns {Promise<void>}
 */
export const refundRazorpayPayment = async (paymentId, reason, speed = "normal") => {
    try {
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        const refund = await razorpay.payments.refund(paymentId, {
            speed: speed,
            notes: { reason: reason }
        });
        await refundRepo.save({
            paymentId: paymentId,
            amount: refund.amount,
            status: refund.status,
            speedRequested: refund.speed_requested,
            speedProcessed: refund.speed_processed,
            notes: reason
        });
        logger.info(`Refunded payment ${paymentId} for reason ${reason}`);
    } catch(err) {
        logger.error(`Error refunding payment ${paymentId} for reason ${reason}`);
        try{
            await refundRepo.save({
                paymentId: paymentId,
                status: "failed",
                notes: reason,
                comment: err
            });
        } catch(err2) {
            logger.error("Error in refundRazorpayPayment service:", err2);
        }
        logger.error("Error in refundRazorpayPayment service:", err);
        throw err;
    }
}