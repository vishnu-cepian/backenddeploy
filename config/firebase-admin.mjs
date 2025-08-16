import admin from "firebase-admin";
import dotenv from "dotenv";

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

// check to ensure Firebase is not initialized multiple times
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        type: getRequiredEnv("FIREBASE_TYPE"),
        project_id: getRequiredEnv("FIREBASE_PROJECT_ID"),
        private_key_id: getRequiredEnv("FIREBASE_PRIVATE_KEY_ID"),
        private_key: getRequiredEnv("FIREBASE_PRIVATE_KEY"),
        client_email: getRequiredEnv("FIREBASE_CLIENT_EMAIL"),
        client_id: getRequiredEnv("FIREBASE_CLIENT_ID"),
        auth_uri: getRequiredEnv("FIREBASE_AUTH_URI"),
        token_uri: getRequiredEnv("FIREBASE_TOKEN_URI"),
        auth_provider_x509_cert_url: getRequiredEnv("FIREBASE_AUTH_PROVIDER_X509_CERT_URL"),
        client_x509_cert_url: getRequiredEnv("FIREBASE_CLIENT_X509_CERT_URL"),
        universe_domain: getRequiredEnv("FIREBASE_UNIVERSE_DOMAIN"),
      }),
    });
    console.log("Firebase Admin SDK initialized successfully.");
  } catch (error) {
    console.error("FATAL ERROR: Failed to initialize Firebase Admin SDK.", error);
    process.exit(1);
  }
}

export const firebaseAdmin = admin;