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
/**
 * Creates a Razorpay contact.
 * 
 * @param {string} name - The name of the contact.
 * @param {string} email - The email of the contact.
 * @param {string} phoneNumber - The phone number of the contact.
 * @param {string} type - The type of the contact.
 * @param {string} referenceId - The reference ID of the contact.
 * @returns {Promise<object>} The created contact.
 */
export const createRazorpayContact = async (name, email, phoneNumber, type, referenceId) => {
    try {
        const url = new URL("https://api.razorpay.com/v1/contacts");

        const authString = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

        let headers = {
            "Content-Type": "application/json",
            "Authorization": `Basic ${authString}`
        };

        let body = {
            name: name,
            email: email,
            contact: phoneNumber,
            type: type,
            reference_id: referenceId
        };

        const response = await fetch(url, { 
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return data;
    }
    catch(err) {
        logger.error("Error in createRazorpayContact service:", err);
        throw err;
    }
}

/**
 * Creates a Razorpay fund account.
 * 
 * @param {string} contactId - The ID of the contact.
 * @param {string} accountType - The type of the account.
 * @param {string} name - The name of the account.
 * @param {string} ifsc - The IFSC code of the account.
 * @param {string} accountNumber - The account number of the account.
 * @returns {Promise<object>} The created fund account.
 */
export const createFundAccount = async (contactId, accountType, name, ifsc, accountNumber) => {
    try {
        const url = new URL("https://api.razorpay.com/v1/fund_accounts");

        const authString = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

        let headers = {
            "Content-Type": "application/json",
            "Authorization": `Basic ${authString}`
        };

        let body = {
            contact_id: contactId,
            account_type: accountType,
            bank_account: {
                name: name,
                ifsc: ifsc,
                account_number: accountNumber
            }
        };

        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });
        const data = await response.json();
        return data;
    }
    catch(err) {
        logger.error("Error in createFundAccount service:", err);
        throw err;
    }
}

export const createPayout = async (
    idempotencyKey, 
    fundAccountId, 
    amount, 
    currency = "INR", 
    mode = "IMPS", 
    purpose = "payout", 
    queueIfLowBalance = true, 
    referenceId, 
    narration = "NEXS DEVELOPMENT PRIVATE LIMIT", 
    notes
) => {
    
    try {
        const url = new URL("https://api.razorpay.com/v1/payouts");

        const authString = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
 
        const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;

        let headers = {
            "Content-Type": "application/json",
            "Authorization": `Basic ${authString}`,
            "X-Payout-Idempotency": idempotencyKey
        };

        let body = {
            account_number: accountNumber,
            fund_account_id: fundAccountId,
            amount: amount*100,
            currency: currency,
            mode: mode,
            purpose: purpose,
            queue_if_low_balance: queueIfLowBalance,
            reference_id: referenceId,
            narration: narration,
            notes: notes || {}
        }

        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return data;
    }
    catch(err) {
        logger.error("Error in createPayout service:", err);
        throw err;
    }
}

