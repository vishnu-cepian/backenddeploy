import { DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_VENDOR_FEE_PERCENT } from "../config/constants.mjs";
import { Settings } from "../entities/Settings.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { cacheOrFetch } from "../utils/cache.mjs";

const getFeePercent = async (key, defaultValue) => {
    const feePercent = await cacheOrFetch(key, async () => {
        const settings = await AppDataSource.getRepository(Settings).findOne({
            where: { key }
        });

        if (settings && settings.value) {
            return parseFloat(settings.value);
        }

        return null;
    }, 60 * 60 * 24);

    if (feePercent !== null && !isNaN(feePercent)) {
        return feePercent;
    }
    return defaultValue;
}

const getPlatformFeePercent = async () => {
    return getFeePercent("platform_fee_percent", DEFAULT_PLATFORM_FEE_PERCENT);
}

const getVendorFeePercent = async () => {
    return getFeePercent("vendor_fee_percent", DEFAULT_VENDOR_FEE_PERCENT);
}

export const calculatePlatformFee = async (amount) => {
    const feePercent = await getPlatformFeePercent();
    return amount * (feePercent / 100);
}

export const calculateVendorFee = async (amount) => {
    const feePercent = await getVendorFeePercent();
    return amount * (feePercent / 100);
}

export const calculateVendorPayoutAmount = async (amount) => {
    amount = parseFloat(amount);
    const vendorFee = await calculateVendorFee(amount);
    return amount - vendorFee;
}

export const calculateOrderAmount = async (amount) => {
    amount = parseFloat(amount);
    const platformFee = await calculatePlatformFee(amount);
    return amount + platformFee;
}



