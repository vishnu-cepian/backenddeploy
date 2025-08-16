import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

/**
 * A helper function to get a required environment variable.
 * Throws an error if the variable is not set.
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

// root directory of the project for correct pathing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..'); // since this file is in a 'config' subdirectory so going back one level

const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
    type: 'postgres',
    url: getRequiredEnv('DATABASE_URL'),
    
    synchronize: !isProduction,    // synchronize: NEVER use 'true' in production. Migrations are the safe way to handle schema changes.

    logging: isProduction ? ['error'] : true,    // logging: Enables full logging in development, but only log errors in production.

    // --- Entity and Migration Paths ---
    // Use glob patterns to automatically find all entity and migration files.
    entities: [path.join(rootDir, 'entities', '**', '*.mjs')],
    migrations: [path.join(rootDir, 'migrations', '**', '*.js')], // Note: Migrations need compiled to .js
    
    // --- SSL Configuration for Production ---
    ssl: isProduction 
        ? { rejectUnauthorized: false } // Adjust  based on your provider's requirements
        : false,
});