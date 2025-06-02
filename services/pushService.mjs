import { firebaseAdmin } from "../config/firebase-admin.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { Not, IsNull } from "typeorm";

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
        return user;
    } catch (error) {
        logger.error(error);
        throw error;
    }
}

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

export const broadcastNotification = async (role, title, body) => {
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
