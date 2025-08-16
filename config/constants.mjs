import dotenv from "dotenv";
dotenv.config();

/**
 * A helper function to get a required environment variable and parse it as a number.
 * Throws an error if the variable is not set or is not a valid number.
 * @param {string} name The name of the environment variable.
 * @returns {number} The value of the environment variable as a number.
 */
const getRequiredNumberEnv = (name) => {
  const value = process.env[name];
  if (value === undefined || value === null || value.trim() === '') {
    throw new Error(`FATAL ERROR: Environment variable "${name}" is not set.`);
  }
  
  const num = parseFloat(value);
  if (isNaN(num)) {
      throw new Error(`FATAL ERROR: Environment variable "${name}" is not a valid number.`);
  }
  
  return num;
};

// --- Financial Constants ---
export const PLATFORM_FEE_PERCENT = getRequiredNumberEnv("PLATFORM_FEE_PERCENTAGE");
export const VENDOR_FEE_PERCENT = getRequiredNumberEnv("VENDOR_FEE_PERCENTAGE");