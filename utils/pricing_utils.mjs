import { DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_VENDOR_FEE_PERCENT } from "../config/constants.mjs";

export const calculatePlatformFee = (amount) => {
    return amount * (DEFAULT_PLATFORM_FEE_PERCENT / 100);
}

export const calculateVendorFee = (amount) => {
    return amount * (DEFAULT_VENDOR_FEE_PERCENT / 100);
}

export const calculateVendorPayoutAmount = (amount) => {
    amount = parseFloat(amount);
    return amount - calculateVendorFee(amount);
}

export const calculateOrderAmount = (amount) => {
    amount = parseFloat(amount);
    return amount + calculatePlatformFee(amount);
}



