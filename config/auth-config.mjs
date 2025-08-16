import dotenv from "dotenv";
dotenv.config();

/**
 * A helper function to get a required environment variable.
 * Throws an error if the variable is not set, preventing the app from starting in an insecure state.
 * @param {string} name The name of the environment variable.
 * @returns {string} The value of the environment variable.
 */
const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`FATAL ERROR: Environment variable "${name}" is not set.`);
  }
  return value;
};

// --- JWT Secrets ---
export const ACCESS_TOKEN_SECRET = getRequiredEnv("ACCESS_TOKEN_SECRET");
export const REFRESH_TOKEN_SECRET = getRequiredEnv("REFRESH_TOKEN_SECRET");
export const OTP_TOKEN_SECRET = getRequiredEnv("OTP_TOKEN_SECRET");

// --- Admin JWT Secrets ---
export const ADMIN_ACCESS_TOKEN_SECRET = getRequiredEnv("ADMIN_ACCESS_TOKEN_SECRET");
export const ADMIN_REFRESH_TOKEN_SECRET = getRequiredEnv("ADMIN_REFRESH_TOKEN_SECRET");