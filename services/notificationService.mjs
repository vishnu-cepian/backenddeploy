import { firebaseAdmin } from "../config/firebase-admin.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { Not, IsNull } from "typeorm";


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
      const { token, userId } = data;
      if(!token) {
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
        user.pushToken = token;
        await userRepository.save(user);
        return {
            message: "Push token saved successfully",
            status: true
        }
    } catch (error) {
        logger.error(error);
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
        logger.error(error);
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
      logger.error(error);
      throw error;
    }
}

/**
 * Broadcasts a push notification to all users of a role
 * 
 * @param {string} role // User role
 * @param {string} title // Notification title
 * @param {string} body // Notification body
 * @returns {Promise<Object>} 
 * 
 */
export const broadcastPushNotification = async (role, title, body) => {
    try {
        const userRepository = AppDataSource.getRepository(User);
        const users = await userRepository.find({
            where: {
                role,
                pushToken: Not(IsNull())
            }
        });
        const tokens = users.map(user => user.pushToken);
       
        const message = {
            notification: {
                title,
                body
            }
        };
      
        const response = await firebaseAdmin.messaging().sendEachForMulticast({   
            tokens,
            ...message
        });
        return response;
    } catch (error) {
        logger.error(error);
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
    console.log(variables)
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
    logger.error(json)
    return {
        success: false,
        message: "Failed to send email"
    }
    } catch (error) {
        logger.error(error);
        throw error;
    }
}

/**
 * Broadcasts an email to all users of a role
 * 
 * @param {string} role // User role
 * @param {string} template_id // Email template ID
 * @param {Object} variables // Email variables
 * @returns {Promise<Object>} 
 * 
 */
export const broadcastEmail = async (role, template_id, variables) => {
    try {
        const userRepository = AppDataSource.getRepository(User);
        const users = await userRepository.find({
            where: {
                role,
                email: Not(IsNull())
            }
        });

        const emailPromises = users.map(user => sendEmail(user.email, user.name, template_id, variables));
        await Promise.all(emailPromises);
        return {
            success: true,
            message: "Email sent successfully"
        }
    } catch (error) {
        logger.error(error);
        throw error;
    }
}