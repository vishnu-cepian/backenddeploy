import { logger } from "../utils/logger-utils.mjs";
import { hashPassword, comparePassword } from "../utils/auth-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, OTP_TOKEN_SECRET } from '../config/auth-config.mjs';
import { OAuth2Client } from "google-auth-library";
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { Customers } from "../entities/Customers.mjs";
import { sendEmail } from "./notificationService.mjs";

//===================JWT UTILS====================

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch (err) {
    return null;
  }
}

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * 
 * @param {string} refreshToken 
 * @returns {Promise<Object>} { accessToken: newAccessToken, refreshToken: newRefreshToken, message: "Token refreshed successfully" } or { error: "Invalid refresh token" }
 */
export const refreshAccessToken = async (refreshToken) => {  //if token is expired, ie., 401, then refresh token will be used to get new access token
  /*
    To get new access token when current one is expired and to extend the validity of refresh token on each function call
    - if refresh token is valid then generate new access token and refresh token
    - update the new refresh token in the database
    - return the new access token, refresh token, message
  */
    try {
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
        throw sendError('Invalid refresh token', 401);
    }
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: decoded.id } });
    if (!user) {
        throw sendError('User not found', 404);
    }
    if (user.refreshToken !== refreshToken) {
        throw sendError('Invalid refresh token', 401);
    }
    const newAccessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });
    const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });
    await userRepository.update(
        { id: user.id },
        { refreshToken: newRefreshToken }
    );
    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        message: "Token refreshed successfully",
    };
    } catch (err) {
        logger.error(err);
        throw err;
    }
};


//===================AUTH UTILS====================

/**
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @param {string} data.name 
 * @param {string} data.password 
 * @param {string} data.role 
 * @param {string} data.phoneNumber 
 * @returns {Promise<Object>} { message: "User created successfully", status: true } or { message: "User already exists with this email", statusCode: 400 }
 */
export const signup = async (data) => { 
    try {
            const { email, name, password, role, phoneNumber } = data;

            if (!email || !name || !password || !role || !phoneNumber) {
                throw sendError('Email, name, password, role, and phoneNumber are required', 400);
            }
            // // Check if user already exists
            const userRepository = AppDataSource.getRepository(User);
            const existingUser = await userRepository.findOne({ where: { email } });
            if (existingUser) throw sendError('User already exists with this email',400);

            
            const hashedPassword = await hashPassword(password);
            // Save user to database 
            const newUser = userRepository.create({
                email,
                name,
                password: hashedPassword,
                role,
                phoneNumber,
            });
            await userRepository.save(newUser);

            if (role.toUpperCase() === "CUSTOMER") {
                const customerRepo = AppDataSource.getRepository(Customers);
                const newCustomer = customerRepo.create({
                    userId: newUser.id,
                });
                await customerRepo.save(newCustomer);

                if (!newCustomer) throw sendError("Customer profile creation failed", 400);
            }
            const response = await sendEmail(email, "Nexs", "global_otp", { text: "WELCOME" });

            if (response.status !== "success") throw sendError("Failed to send email", 500);
              
            return {
                message: "User created successfully",
                status: true,
            };
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

/**
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @param {string} data.password 
 * @returns {Promise<Object>} { message: "Login successful", status: true } or { message: "User not found", status: false }
 */
export const loginWithEmail = async (data) => {
    /*
        - The user dashboard will be rendered by the ROLE
        - If the user is blocked then the user will not be able to login
    */
    try {
            const {email, password } = data;
            
            if (!email || !password) throw sendError('Email and password are required',400);
            
            const userRepository = AppDataSource.getRepository(User);
            const user = await userRepository.findOne({ where: { email } });

            if (!user) throw sendError('User not found', 404);

            if (user.isBlocked) throw sendError('User is blocked', 403);

            // Check if password is correct
            const isPasswordValid = await comparePassword(password, user.password);
            if (!isPasswordValid) throw sendError('Invalid password',401);

            // Generate JWT token
            const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });
            const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });

            await userRepository.update(
                { id: user.id },
                { refreshToken } // add refreshToken field to User entity
            );

            return {
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    name: user.name,
                    phoneNumber: user.phoneNumber,
                    createdAt: user.createdAt,
                    lastLogin: user.updatedAt,
                },
                accessToken,
                refreshToken,
                message: "Login successful",
            };
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

/**
 * Checks if a user exists in the database
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @returns {Promise<Object>} { message: "USER EXISTS", status: true, exist: true } or { message: "NO USER FOUND", status: false, exist: false }
 * 
 */

export const checkEmail = async (data) => {
    try {
            const { email } = data;
        
            if (!email) throw sendError('Email is required',400);

            // Check if user already exists
            const userRepository = AppDataSource.getRepository(User);
            const existingUser = await userRepository.findOne({ where: { email } });

            if (!existingUser) return {
                message: "NO USER FOUND",
                status: false,
                exist: false
            }

            return {
                message: "USER EXISTS",
                status: true,
                exist: true
            }
            
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/**
 * 
 * @param {Object} data 
 * @param {string} data.idToken 
 * @returns {Promise<Object>} { message: "Login successful", status: true, exist: true } or { message: "User not found", status: false, exist: false }
 */
export const loginWithGoogle = async (data) => { 
    /*
        1. For the first time login the user will need to go through the signup process. (handled by frontend, the server will respond by "No User found" and the email extracted from google payload)
        2. For the next time login the user will be logged in directly 
    */
    try {
        const idToken  = data;
       
        if (!idToken) {
            throw sendError('ID token is required');
        }

        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) {
            throw sendError('ID token has expired',401);
        }

        const { email } = payload;

        // Check if user already exists
        const userRepository = AppDataSource.getRepository(User);
        let user = await userRepository.findOne({ where: { email } });
        if (!user) {        /// IF THERE IS NO USER THEN THE NEW USER IS NOT CREATED INSTEAD signup ROUTE WILL HANDLE IT /// IT IS USED FOR GIVING USERS FLEXBILITY TO ACCESS WITH NORMAL EMAIL PASSWORD LOGIN WITH THE SAME EMAIL ID EXTRACTED FROM GOOGLE PAYLOAD
            return ({
                message: "User not found",
                status: false,
                email: email,
                exist: false
            });
        }
        if (user.isBlocked) {
            throw sendError('User is blocked', 403);
        }
        // Generate JWT token
        const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });
        const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });

        await userRepository.update(
            { id: user.id },
            { refreshToken }
        );

        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
                phoneNumber: user.phoneNumber,
                createdAt: user.createdAt,
            },
            accessToken,
            refreshToken,
            message: "Login successful",
            exist: true
        };

    } catch (err) {
        logger.error(err);
        throw err;
    }
};


/**
 * Sends an email OTP to the user
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @returns {Promise<Object>} { message: "OTP sent successfully", status: true } or { message: "Failed to send email", statusCode: 500 }
 */
export const sendEmailOtp = async (data) => {
    /*
        - A 6 digit OTP will be generated and sent to the user's email and also the OTP will be saved in OtpEmail table with an expiration time of 10 minutes
        - If the OTP is send mutliple times then the last send otp will remain in database
    */
    try {
        const { email } = data;
    
        if (!email) throw sendError('Email is required',400);
        
        const otp = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

        const otpEmailRepository = AppDataSource.getRepository('OtpEmail');
        let otpRecord = await otpEmailRepository.findOne({ where: { email } });
        if (otpRecord) {
            otpRecord.otp = otp.toString();
            otpRecord.expiresAt = expiresAt;
            await otpEmailRepository.save(otpRecord);
        } else {
            await otpEmailRepository.save({
            email,
            otp: otp.toString(),
            expiresAt
            });
        }

        // "Nexs" is the name of the sender
        // "global_otp" is the template name
        // { otp: otp } is the data to be sent to the template (variables)
        
        const response = await sendEmail(email, "Nexs", "global_otp", { otp: otp });
        if (response.status === "success") {
            return {
                message: "OTP sent successfully",
                status: true
            }
        } else {
            throw sendError("Failed to send email", 500);
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/**
 * Verifies an email OTP
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @param {string} data.otp 
 * @returns {Promise<Object>} { message: "OTP verified successfully", status: true } or { message: "OTP expired", statusCode: 400 }
 */
export const verifyEmailOtp = async (data) => {
    try {
        const { email, otp } = data;
    
        if (!email || !otp) throw sendError('Email and OTP are required',400);

        const otpEmailRepository = AppDataSource.getRepository('OtpEmail');
        const otpRecord = await otpEmailRepository.findOne({ where: { email } });

        if (!otpRecord) throw sendError('OTP Record not found');

        if (otpRecord.otp !== otp) throw sendError('Invalid OTP',400);

        if (new Date() > otpRecord.expiresAt) throw sendError('OTP expired');

        if(otpRecord.otp === otp) {
            await otpEmailRepository.delete({ email });
        }
        // OTP is valid
        const verificationToken = jwt.sign({ email }, OTP_TOKEN_SECRET, { expiresIn: '5m' });
        return ({
            message: "OTP verified successfully",
            verificationToken,
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/**
 * 
 * @param {Object} data 
 * @param {string} data.phone 
 * @returns {Promise<Object>} { message: "OTP sent successfully", status: true } or { message: "Failed to send OTP", statusCode: 500 }
 */
export const sendPhoneOtp = async (data) => {
    /*
        - A 6 digit OTP will be generated and sent to the user's email and also the OTP will be saved in OtpPhone table with an expiration time of 10 minutes
        - If the OTP is send mutliple times then the last send otp will remain in database
    */
    try {
        const { phone } = data;
    
        if (!phone) throw sendError('Phone number is required',400);

        const otp = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

        // Use TypeORM to upsert OTP for phone
        const otpPhoneRepository = AppDataSource.getRepository('OtpPhone');
        let otpRecord = await otpPhoneRepository.findOne({ where: { phone } });
        if (otpRecord) {
            otpRecord.otp = otp.toString();
            otpRecord.expiresAt = expiresAt;
            await otpPhoneRepository.save(otpRecord);
        } else {
            await otpPhoneRepository.save({
            phone,
            otp: otp.toString(),
            expiresAt
            });
        }
        /*






            INTEGRATE PHONE SMS SERVICE








        */
        // const normalizedPhone = phone.startsWith('+91') ? phone : `+91${phone}`;
       
        // const client = twilio(
        //     process.env.TWILIO_ACCOUNT_SID, 
        //     process.env.TWILIO_AUTH_TOKEN
        // );

        // // Rate limiting check
        // const otpPhoneRepository = AppDataSource.getRepository('OtpPhone');
        // const existingOtp = await otpPhoneRepository.findOne({ where: { phone: normalizedPhone } });

        // if (existingOtp && existingOtp.createdAt > new Date(Date.now() - 60 * 1000)) {
        //     throw sendError('OTP already sent. Please wait before requesting another.', 429);
        // }

        // // Send OTP via Twilio Verify (Twilio generates the OTP)
        // const verification = await client.verify.v2
        //     .services(process.env.TWILIO_SERVICE_SID)
        //     .verifications.create({
        //         to: normalizedPhone,
        //         channel: "sms",
        //         locale: "en"
        //     });

        // // Store verification SID (not OTP) in database
        // // Upsert OTP phone record using TypeORM
        // let otpPhoneRecord = await otpPhoneRepository.findOne({ where: { phone: normalizedPhone } });
        // const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
        // if (otpPhoneRecord) {
        //     otpPhoneRecord.verificationSid = verification.sid;
        //     otpPhoneRecord.expiresAt = expiresAt;
        //     otpPhoneRecord.attempts = 0;
        //     otpPhoneRecord.createdAt = new Date();
        //     await otpPhoneRepository.save(otpPhoneRecord);
        // } else {
        //     await otpPhoneRepository.save({
        //     phone: normalizedPhone,
        //     verificationSid: verification.sid,
        //     expiresAt,
        //     attempts: 0,
        //     createdAt: new Date()
        //     });
        // }

        // logger.info(`OTP verification started for ${normalizedPhone} (SID: ${verification.sid})`);

        return {
            message: "OTP sent successfully",
            status: true
        };
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/**
 * 
 * @param {Object} data 
 * @param {string} data.phone 
 * @param {string} data.otp 
 * @returns {Promise<Object>} { message: "OTP verified successfully",verificationToken,  status: true } or { message: "OTP expired", statusCode: 400 }
 */
export const verifyPhoneOtp = async(data) => {
    /*
        - The last send otp will be verified against the user input
    */
    try {
        const { phone, otp } = data;
    
        if (!phone || !otp) throw sendError('Phone and OTP are required');

        const otpPhoneRepository = AppDataSource.getRepository('OtpPhone');
        const otpRecord = await otpPhoneRepository.findOne({ where: { phone } });
        if (!otpRecord) throw sendError('OTP not found',400);

        if (otpRecord.otp !== otp) throw sendError('Invalid OTP',400);

        if (new Date() > otpRecord.expiresAt) throw sendError('OTP expired',400);

        if(otpRecord.otp === otp) {
            await otpPhoneRepository.delete({ phone });
        }
        // OTP is valid

        const verificationToken = jwt.sign({ phone }, OTP_TOKEN_SECRET, { expiresIn: '5m' });

        return ({
            message: "OTP verified successfully",
            verificationToken,
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/**
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @param {string} data.newPassword 
 * @returns {Promise<Object>} { message: "Password reset successfully", status: true } or { message: "User not found", statusCode: 404 }
 */
export const resetPassword = async (data) => {
    try {
        const { email, newPassword } = data;
    
        if (!email || !newPassword) throw sendError('Email and new password are required',400);

        // Check if user exists
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({ where: { email } });
        if (!user) throw sendError('User not found',404);

        // Hash the new password
        const hashedPassword = await hashPassword(newPassword);

        // Update user's password
        await userRepository.update(
            { email },
            { password: hashedPassword }
        );

        return ({
            message: "Password reset successfully",
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

/**
 * 
 * @param {Object} data 
 * @param {string} data.userId 
 * @returns {Promise<Object>} { message: "Logout successful", status: true } or { message: "User not found", statusCode: 404 }
 */
export const logout = async (data) => {
    try {
        const { userId } = data;
    
        if (!userId) throw sendError('User ID is required',400);

        // Check if user exists
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({ where: { id: userId } });
        if (!user) throw sendError('User not found',404);

        // Invalidate the refresh token
        await userRepository.update(
            { id: userId },
            { refreshToken: null }
        );

        return ({
            message: "Logout successful",
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}