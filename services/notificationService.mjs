import { firebaseAdmin } from "../config/firebase-admin.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { Not, IsNull } from "typeorm";
import { NotificationHistory } from "../entities/NotificationHistory.mjs";

/**
 * Saves the push token for a user
 * 
 * @param {Object} data 
 * @param {string} data.token  // FCM token
 * @param {string} data.userId // User ID
 * @returns {Promise<User>} 
 * 
 */
export const savePushToken = async (data) => {
    try {
      const { pushToken, userId } = data;
      if(!pushToken) {
        throw sendError("pushToken required");
      }
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
            where: {
                id: userId
            }
        });
        if (!user) {
            throw sendError("User not found");
        }
        user.pushToken = pushToken;
        await userRepository.save(user);
        return {
            message: "Push token saved successfully",
            status: true
        }
    } catch (error) {
        logger.error("Error saving push token", error);
        throw error;
    }
}

/**
 * Gets the push token for a user
 * currently only used for testing
 * @param {string} userId // User ID
 * @returns {Promise<string>} 
 * 
 */
export const getUserFcmToken = async (userId) => {
    try {
        
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: {
                id: userId
            }
        });
        return user.pushToken;
    } catch (error) {
        logger.error("Error getting user FCM token", error);
        throw error;
    }
}

/**
 * Sends a push notification to a user
 * 
 * @param {string} token // FCM token
 * @param {string} title // Notification title
 * @param {string} message // Notification message
 * @param {string} url //deep link of app
 * @returns {Promise<Object>} 
 * 
 */
export const sendPushNotification =  async (token, title, message, url) => {
    try {
      const payload = {
        notification: {
        title,
        body: message,
      },
      token,
      data: {
        "url" : url
      }
    };
      const response = await firebaseAdmin.messaging().send(payload);
      return response;
    } catch (error) {
      logger.error("Error sending push notification", error);
      throw error;
    }
}

/**
 * Broadcasts a push notification to all users of a role
 * 
 * @param {string} role // User role
 * @param {string} title // Notification title
 * @param {string} body // Notification body
 * @param {number} batchSize // Batch size
 * @returns {Promise<Object>} 
 * 
 */
export const broadcastPushNotification = async (role, title, body, batchSize = 1000) => {
    try {
        const userRepository = AppDataSource.getRepository(User);
        let offset = 0;
        let hasMoreUsers = true;
        const message = {
            notification: {
                title,
                body
            }
        };
        while (hasMoreUsers) {
            const users = await userRepository.find({
                where: {
                    role,
                    pushToken: Not(IsNull())
                },
                skip: offset,
                take: batchSize
            });
            if (users.length === 0) {
                hasMoreUsers = false;
                break;
            }
            const tokens = users.map(user => user.pushToken);
            const response = await firebaseAdmin.messaging().sendEachForMulticast({
                tokens,
                ...message
            });
            console.log(`Batch sent: ${response.successCount} notifications sent.`)
            offset += batchSize;
        }
        return {
            success: true,
            message: "Push notification sent successfully"
        }
    } catch (error) {
        logger.error("Error sending push notification", error);
        throw error;
    }
}

/**
 * Sends an email to a user
 * Currently used service is MSG91
 * @param {string} email // User email
 * @param {string} name // User name
 * @param {string} template_id // Email template ID
 * @param {Object} variables // Email variables
 * @returns {Promise<Object>} 
 * 
 */
export const sendEmail = async (email, name, template_id, variables) => {
    try {
    const url = new URL(
        'https://control.msg91.com/api/v5/email/send'
    );

    let headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "authkey": process.env.MSG91_AUTH_KEY
    };

    let body = {
    "recipients": [
        {
        "to": [
            {
            "email": email,
            "name": name
            }
        ],
        "variables": variables
        }
    ],
    "from": {
        "email": "no-reply@nexs.co.in"
    },
    "domain": "nexs.co.in",
    "template_id": template_id
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });
    const json = await response.json();
    if (json.status === "success") {
      return json;
    }
    logger.error("Failed to send email", json);
    return {
        success: false,
        message: "Failed to send email"
    }
    } catch (error) {
        logger.error("Error sending email",error);
        throw error;
    }
}

/**
 * Broadcasts an email to all users of a role in batches
 * 
 * @param {string} role // User role
 * @param {string} template_id // Email template ID
 * @param {Object} variables // Email variables
 * @param {number} batchSize // Number of users to process in each batch
 * @param {number} concurrencyLimit // Number of concurrent email sends
 * @returns {Promise<Object>} 
 * 
 */
export const broadcastEmail = async (role, template_id, variables, batchSize = 1000, concurrencyLimit = 10) => {
    try {
        const userRepository = AppDataSource.getRepository(User);
        let offset = 0;
        let hasMoreUsers = true;

        while (hasMoreUsers) {
            const users = await userRepository.find({
                where: {
                    role,
                    email: Not(IsNull())
                },
                take: batchSize,
                skip: offset
            });

            if (users.length === 0) {
                hasMoreUsers = false; // No more users to process
                break;
            }

            // Create an array of email promises
            const emailPromises = users.map(user => sendEmail(user.email, user.name, template_id, variables));

            // Limit concurrency using Promise.allSettled
            const results = [];
            for (let i = 0; i < emailPromises.length; i += concurrencyLimit) {
                const batch = emailPromises.slice(i, i + concurrencyLimit);
                const batchResults = await Promise.allSettled(batch);
                results.push(...batchResults);
            }

            // Log results or handle errors as needed
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    console.log(`Email sent to: ${users[index].email}`);
                } else {
                    console.error(`Failed to send email to: ${users[index].email}`, result.reason);
                }
            });

            offset += batchSize; // Move to the next batch
        }

        return {
            success: true,
            message: "Emails sent successfully"
        };
    } catch (error) {
        logger.error("Error sending email", error);
        throw error;
    }
}

/**
 * Saves the notification history
 * 
 * @param {Object} data 
 * @param {string} data.userId // User ID
 * @param {string} data.title // Notification title
 * @param {string} data.body // Notification body
 * @param {Date} data.timestamp // Notification timestamp
 * @returns {Promise<Object>} 
 * 
 */
export const saveNotificationHistory = async (userId, title, body, timestamp = new Date()) => {
    try {
        const notificationHistoryRepository = AppDataSource.getRepository(NotificationHistory);
        const notificationHistory = notificationHistoryRepository.create({ userId, title, body, timestamp });
        await notificationHistoryRepository.save(notificationHistory);
    } catch (error) {
        logger.error("Error saving notification history", error);
        throw error;
    }
}

/**
 * Gets the notification history
 * 
 * @param {string} userId // User ID
 * @param {number} page // Page number
 * @param {number} limit // Limit number
 * @returns {Promise<Object>} 
 * 
 */
export const getNotificationHistory = async (userId, page = 1, limit = 10) => {
    try {
        const offset = (page - 1) * limit;

        const notificationHistoryRepository = AppDataSource.getRepository(NotificationHistory);
        
        const notificationHistory = await notificationHistoryRepository.find({ where: { userId }, skip: offset, take: limit, order: { timestamp: "DESC" } });

        // batch update isRead to true
        await notificationHistoryRepository.update({ userId }, { isRead: true });

        return {
            success: true,
            message: "Notification history fetched successfully",
            notifications: notificationHistory,
            pagination: {
                currentPage: page,
                hasMore: notificationHistory.length === limit,
                nextPage: notificationHistory.length === limit ? page + 1 : null,
            }
        }
    } catch (error) {
        logger.error("Error getting notification history", error);
        throw error;
    }
}

/**
 * Gets the notification unread count
 * 
 * @param {string} userId // User ID
 * @returns {Promise<Object>} 
 * 
 */
export const getNotificationUnreadCount = async (userId) => {
    try {
        const notificationHistoryRepository = AppDataSource.getRepository(NotificationHistory);
        const notificationHistoryUnreadCount = await notificationHistoryRepository.count({ where: { userId, isRead: false } });
        if (notificationHistoryUnreadCount === 0) {
            return {
                success: true,
                message: "No unread notifications",
                unreadCount: 0
            }
        }
        return {
            success: true,
            message: "Notification unread count fetched successfully",
            unreadCount: notificationHistoryUnreadCount
        }
    } catch (error) {
        logger.error("Error getting notification unread count", error);
        throw error;
    }
}