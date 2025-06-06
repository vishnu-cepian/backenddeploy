import dotenv from "dotenv";
dotenv.config();

if(!process.env.ACCESS_TOKEN_SECRET || !process.env.REFRESH_TOKEN_SECRET || !process.env.OTP_TOKEN_SECRET || !process.env.ADMIN_ACCESS_TOKEN_SECRET || !process.env.ADMIN_REFRESH_TOKEN_SECRET){
    console.log("Missing environment variables");
}

export const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "default_access_token_secret";
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "default_refresh_token_secret";
export const OTP_TOKEN_SECRET = process.env.OTP_TOKEN_SECRET || "default_otp_token_secret"
export const ADMIN_ACCESS_TOKEN_SECRET = process.env.ADMIN_ACCESS_TOKEN_SECRET || "default_admin_access_token_secret";
export const ADMIN_REFRESH_TOKEN_SECRET = process.env.ADMIN_REFRESH_TOKEN_SECRET || "default_admin_refresh_token_secret";