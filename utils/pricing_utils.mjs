import { PLATFORM_FEE_PERCENT, VENDOR_FEE_PERCENT } from "../config/constants.mjs";

export const calculatePlatformFee = (amount) => {
    return amount * (PLATFORM_FEE_PERCENT / 100);
}

export const calculateVendorFee = (amount) => {
    return amount * (VENDOR_FEE_PERCENT / 100);
}

export const calculateVendorPayoutAmount = (amount) => {
    return amount - calculateVendorFee(amount);
}

export const calculateOrderAmount = (amount) => {
    return amount + calculatePlatformFee(amount);
}



