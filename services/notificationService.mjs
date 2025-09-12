import { firebaseAdmin } from "../config/firebase-admin.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { Not, IsNull } from "typeorm";
import { NotificationHistory } from "../entities/NotificationHistory.mjs";

/**
 * @api {post} /api/notification/save-push-token Save Push Token
 * @apiName SavePushToken
 * @apiGroup Notification
 * @apiDescription Saves or updates the Firebase Cloud Messaging (FCM) push token for the authenticated user
 * 
 * @apiBody {string} pushToken - The push token
 * 
 * @param {Object} data - The data
 * @param {string} data.pushToken - The push token
 * @param {string} data.userId - The user ID
 * 
 * @apiSuccess {string} message - The message indicating the success of the operation
 * @apiSuccess {boolean} status - Whether the operation was successful
 * 
 * @apiError {Error} 400 - If the validation fails
 * @apiError {Error} 404 - If the user is not found
 * @apiError {Error} 500 - If an internal server error occurs
 * 
 */
export const savePushToken = async (data) => {
    try {
      const { pushToken, userId } = data;
      if(!pushToken) {
        throw sendError("pushToken required", 400);
      }
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
            where: {
                id: userId
            }
        });
        if (!user) {
            throw sendError("User not found", 404);
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
 * @api {get} /api/notification/get-user-fcm-token Get User FCM Token
 * @apiName GetUserFcmToken
 * @apiGroup Notification
 * @apiDescription (For Testing) Retrieves the currently stored FCM token for a user.
 * 
 * @param {Object} data - The data
 * @param {string} data.userId - The user ID
 * 
 * @apiSuccess {string} pushToken - The push token
 * @apiError {Error} 404 - If the user is not found
 * @apiError {Error} 500 - If an internal server error occurs
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
        if (!user) {
            throw sendError("User not found", 404);
        }
        return user.pushToken;
    } catch (error) {
        logger.error("Error getting user FCM token", error);
        throw error;
    }
}

/**
 * @description An internal service function to send a single push notification via Firebase.
 * @param {string} token - The FCM token of the recipient device.
 * @param {string} title - The notification title.
 * @param {string} message - The notification body message.
 * @param {string} [url=""] - An optional deep link or URL to open on notification click.
 * @returns {Promise<object>} The response from the Firebase Admin SDK.
 */
export const sendPushNotification =  async (token, title, message, url="") => {
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
 * @api {post} /api/admin/broadcast-push-notification Broadcast Push Notification
 * @apiName BroadcastPushNotification
 * @apiGroup Notification
 * @apiDescription (Admin) Sends a push notification to all users of a specific role in batches.
 *
 * @apiBody {string} role - The user role to target ('customer', 'vendor').
 * @apiBody {string} title - The notification title.
 * @apiBody {string} body - The notification body.
 *
 * @param {Object} data - The data
 * @param {string} data.role - The user role to target ('customer', 'vendor').
 * @param {string} data.title - The notification title.
 * @param {string} data.body - The notification body.
 * @param {number} data.batchSize - The number of users to process in each batch.
 *
 * @apiSuccess {boolean} success - True if the broadcast was successfully queued.
 * @apiSuccess {string} message - A confirmation message.
 *
 * @apiError {Error} 500 - Internal Server Error.
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
 * @description An internal service function to send a transactional email via MSG91.
 * @param {string} email - The recipient's email address.
 * @param {string} name - The recipient's name.
 * @param {string} template_id - The MSG91 template ID.
 * @param {object} variables - Key-value pairs for template variables.
 * @returns {Promise<object>} The response from the email provider.
 * @throws {Error} If the email fails to send.
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

// /**
//  * Broadcasts an email to all users of a role in batches
//  * 
//  * @param {string} role // User role
//  * @param {string} template_id // Email template ID
//  * @param {Object} variables // Email variables
//  * @param {number} batchSize // Number of users to process in each batch
//  * @param {number} concurrencyLimit // Number of concurrent email sends
//  * @returns {Promise<Object>} 
//  * 
//  */
// export const broadcastEmail = async (role, template_id, variables, batchSize = 1000, concurrencyLimit = 10) => {
//     try {
//         const userRepository = AppDataSource.getRepository(User);
//         let offset = 0;
//         let hasMoreUsers = true;

//         while (hasMoreUsers) {
//             const users = await userRepository.find({
//                 where: {
//                     role,
//                     email: Not(IsNull())
//                 },
//                 take: batchSize,
//                 skip: offset
//             });

//             if (users.length === 0) {
//                 hasMoreUsers = false; // No more users to process
//                 break;
//             }

//             // Create an array of email promises
//             const emailPromises = users.map(user => sendEmail(user.email, user.name, template_id, variables));

//             // Limit concurrency using Promise.allSettled
//             const results = [];
//             for (let i = 0; i < emailPromises.length; i += concurrencyLimit) {
//                 const batch = emailPromises.slice(i, i + concurrencyLimit);
//                 const batchResults = await Promise.allSettled(batch);
//                 results.push(...batchResults);
//             }

//             // Log results or handle errors as needed
//             results.forEach((result, index) => {
//                 if (result.status === 'fulfilled') {
//                     console.log(`Email sent to: ${users[index].email}`);
//                 } else {
//                     console.error(`Failed to send email to: ${users[index].email}`, result.reason);
//                 }
//             });

//             offset += batchSize; // Move to the next batch
//         }

//         return {
//             success: true,
//             message: "Emails sent successfully"
//         };
//     } catch (error) {
//         logger.error("Error sending email", error);
//         throw error;
//     }
// }

/**
 * @description Saves a record of a sent notification to the database for user history.
 * @param {string} userId - The UUID of the user who received the notification.
 * @param {string} title - The notification title.
 * @param {string} body - The notification body.
 * @param {Date} [timestamp=new Date()] - The time the notification was sent.
 * @returns {Promise<void>}
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
 * @api {get} /api/notification/getNotificationHistory/:page/:limit Get Notification History
 * @apiName GetNotificationHistory
 * @apiGroup Notification
 * @apiDescription Retrieves a paginated list of notifications for the user. This action also marks the retrieved notifications as read.
 *
 * @apiParam {number} [page=1] - The page number for pagination.
 * @apiParam {number} [limit=10] - The number of notifications per page.
 * 
 * @param {Object} data - The data
 * @param {string} data.userId - The user's UUID.
 * @param {number} data.page - The page number for pagination.
 * @param {number} data.limit - The number of notifications per page.
 *
 * @apiSuccess {Object[]} notifications - An array of notification history objects.
 * @apiSuccess {string} notifications.id - The UUID of the notification.
 * @apiSuccess {string} notifications.title - The title of the notification.
 * @apiSuccess {string} notifications.body - The body of the notification.
 * @apiSuccess {string} notifications.timestamp - The timestamp of the notification.
 * @apiSuccess {boolean} notifications.isRead - Whether the notification has been read.
 * @apiSuccess {Object} pagination - Pagination details.
 * @apiSuccess {number} pagination.currentPage - The current page number.
 * @apiSuccess {number} pagination.hasMore - Whether there are more notifications to fetch.
 * @apiSuccess {number} pagination.nextPage - The next page number.
 *
 * @apiError {Error} 500 - Internal Server Error.
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
 * @api {get} /api/notification/getNotificationUnreadCount Get Unread Notification Count
 * @apiName GetNotificationUnreadCount
 * @apiGroup Notification
 * @apiDescription Gets the count of unread notifications for the authenticated user.
 *
 * @param {string} userId - The user's UUID.
 *
 * @apiSuccess {number} unreadCount - The number of unread notifications.
 *
 * @apiError {Error} 500 - Internal Server Error.
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