import { firebaseAdmin } from "../config/firebase-admin.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
export const sendNotifciation =  async (token, title, message) => {
    try {
      const payload = {
        notification: {
        title,
        body: message,
      },
      token,
    };
      const response = await firebaseAdmin.messaging().send(payload);
      return response;
    } catch (error) {
      logger.error(error);
      throw error;
    }
}
