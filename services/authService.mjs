import { z } from "zod";
import jwt from 'jsonwebtoken';
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

import { ROLE } from "../types/enums/index.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { hashPassword, comparePassword } from "../utils/auth-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { Customers } from "../entities/Customers.mjs";
import { OtpEmail } from "../entities/OtpEmail.mjs";
import { OtpPhone } from "../entities/OtpPhone.mjs";
import { emailQueue, phoneQueue } from "../queues/index.mjs";
import { redis } from "../config/redis-config.mjs";
import { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, OTP_TOKEN_SECRET } from '../config/auth-config.mjs';

//============================ ZOD VALIDATION SCHEMAS ==============================================
/**
 * Zod schema for data validation.
 * Ensures that all incoming data is in the correct format.
 */

const refreshTokenSchema = z.string().min(1, { message: "Refresh token cannot be empty" });

const signupSchema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
    name: z.string().min(2, { message: "Name must be at least 2 characters long" }),
    password: z.string().min(8, { message: "Password must be at least 8 characters long" }),
    role: z.enum([ROLE.CUSTOMER, ROLE.VENDOR], { message: "Role must be either 'customer' or 'vendor'" }),
    phoneNumber: z.string().regex(/^(?:\+91|91)?[6789]\d{9}$/, { message: "Invalid phone number format" }), 
});

const loginSchema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
    password: z.string().min(8, { message: "Password must be at least 8 characters long" }),
});

const checkEmailSchema = z.object({
    email: z.string().email({ message: "Invalid email format" }),
});

const googleLoginSchema = z.string().min(1, { message: "ID token cannot be empty" });

const emailSchema = z.object({
    email: z.string().email({ message: "Invalid email format" }),
});

const verifyOtpSchema = z.object({
    email: z.string().email({ message: "Invalid email format" }),
    otp: z.string().length(6, { message: "OTP must be 6 digits" }).regex(/^\d+$/, { message: "OTP must only contain digits" }),
});

const phoneSchema = z.object({
    phoneNumber: z.string().min(10, { message: "Phone number must be at least 10 digits" }).max(15, { message: "Phone number must be less than 15 digits" }),
});

const verifyPhoneOtpSchema = z.object({
    phoneNumber: z.string().min(10, { message: "Phone number must be at least 10 digits" }).max(15, { message: "Phone number must be less than 15 digits" }),
    otp: z.string().length(6, { message: "OTP must be 6 digits" }).regex(/^\d+$/, { message: "OTP must only contain digits" }),
});

const resetPasswordSchema = z.object({
    email: z.string().email(),
    newPassword: z.string().min(8, { message: "Password must be at least 8 characters long" }),
});

const logoutSchema = z.object({
    userId: z.string().uuid({ message: "Invalid User ID format" }),
});

//========================================CONSTANTS=====================================================

const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 2;   // Max 2 requests per minute per email
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 300; // 5 minutes
const ATTEMPT_WINDOW_SECONDS = 300; // 5 mins window for counting attempts


//========================================JWT HELPERS=====================================================

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '7d' });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '30d' });
};

//=================================REFRESH TOKEN SERVICES=====================================================

/**
 * 
 * @param {string} refreshToken 
 * @returns {Promise<Object>} An object containing the new access token, refresh token, and a message
 */
export const refreshAccessToken = async (refreshToken) => { 
    try {
        const validatedToken = refreshTokenSchema.parse(refreshToken);

        const decoded = jwt.decode(validatedToken);
        if (!decoded || !decoded.id) throw sendError('Invalid token payload', 401);

        const { id: userId } = decoded;

        const userRepository = AppDataSource.getRepository(User);

        const user = await userRepository.createQueryBuilder('user')
        .select([
            'user.id',
            'user.email',
            'user.role',
            'user.isBlocked',
            'user.refreshToken',
        ])
        .where('user.id = :userId', { userId })
        .getOne();

        if (!user || !user.refreshToken) throw sendError('Invalid refresh token. Please log in again.', 401);

        if (user.refreshToken !== validatedToken) {
            await userRepository.update(
                { id: user.id },
                { refreshToken: null, pushToken: null }
            );
            logger.warn('Invalid refresh token detected. User ID:', userId);
            throw sendError('Authentication error. Please log in again.', 401);
        }

        jwt.verify(validatedToken, REFRESH_TOKEN_SECRET, async (err, decoded) => {
            if (err) {
                logger.warn('Invalid refresh token detected. User ID:', userId);
                await userRepository.update(
                    { id: user.id },
                    { refreshToken: null, pushToken: null }
                );
                throw sendError('Authentication error. Please log in again.', 401);
            }
        });

        if (user.isBlocked) throw sendError('This account has been blocked', 403);

        // Generate new tokens
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
        if (err instanceof jwt.TokenExpiredError) {
            logger.warn('Expired refresh token used.', { error: err.message });
            throw sendError('Refresh token has expired. Please log in again.', 401);
        }
        if (err instanceof jwt.JsonWebTokenError) {
            logger.warn('Malformed refresh token used.', { error: err.message });
            throw sendError('Invalid refresh token. Please log in again.', 401);
        }
         if (err instanceof z.ZodError) {
            logger.error("Refresh token validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Validation failed", 400, err.flatten().fieldErrors);
        }
        logger.error("Error during refresh access token:",err);
        throw err;
    }
};


//=======================================AUTHENTICATION SERVICES=====================================================

/**
 * Creates a new user and, if the role is 'customer', a corresponding customer profile.
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @param {string} data.name 
 * @param {string} data.password 
 * @param {string} data.role 
 * @param {string} data.phoneNumber 
 * @returns {Promise<Object>}
 */
export const signup = async (data) => { 

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { email, name, password, role, phoneNumber } = signupSchema.parse(data);

        // Check if user already exists
        const existingUser = await queryRunner.manager.exists(User, { where: { email } });
        if (existingUser) throw sendError('User already exists with this email',400);

        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Save user to db 
        const newUser = queryRunner.manager.create(User, {
            email,
            name,
            password: hashedPassword,   
            role,
            phoneNumber,
        });
        await queryRunner.manager.save(User, newUser);

        // If the role is customer, create a customer profile
        if (role === ROLE.CUSTOMER) {   
            const newCustomer = queryRunner.manager.create(Customers, {
                userId: newUser.id,
            });
            await queryRunner.manager.save(Customers, newCustomer);

            if (!newCustomer) throw sendError("Customer profile creation failed", 400);
        }

        await queryRunner.commitTransaction();

        // welcome email
        if (role === ROLE.CUSTOMER) {
            emailQueue.add('sendWelcomeEmail', {
                email,
                name: "Nexs",
                template_id: "welcome_email_customer",
                variables: { name: name }
            });
        } else if (role === ROLE.VENDOR) {
            // send welcome email to vendor
            emailQueue.add('sendWelcomeEmail', {
                email,
                name: "Nexs",
                template_id: "welcome_email_vendor",
                variables: { name: name }
            });
        }
        return {
            message: "User created successfully",
            status: true,
        };
    } catch (err) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }

        if (err instanceof z.ZodError) {
            logger.error("Signup validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Validation failed", 400, err.flatten().fieldErrors);
        }

        logger.error("Error during signup:",err);
        throw err;
    } finally {
        await queryRunner.release();
    } 
};

/**
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @param {string} data.password 
 * @returns {Promise<Object>} User details, accessToken, refreshToken, message
 */
export const loginWithEmail = async (data) => {
    /*
        - The user dashboard will be rendered by the ROLE
    */
    try {
        const validatedData = loginSchema.parse(data);
        const { email, password } = validatedData;
            
        const userRepository = AppDataSource.getRepository(User);

        const user = await userRepository.createQueryBuilder('user')
        .select([
            'user.id',
            'user.email',
            'user.password',
            'user.role',
            'user.isBlocked',
            'user.name',
            'user.phoneNumber',
            'user.createdAt',
            'user.updatedAt',
        ])
        .where('user.email = :email', { email })
        .getOne();

        if (!user) throw sendError('User not found', 404);

        if (user.isBlocked) throw sendError('This account has been blocked', 403);

        // Check if password is correct
        const isPasswordValid = await comparePassword(password, user.password);
        if (!isPasswordValid) throw sendError('Invalid password',401);

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
                lastLogin: user.updatedAt,
            },
            accessToken,
            refreshToken,
            message: "Login successful",
        };
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.error("Login validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Validation failed", 400, err.flatten().fieldErrors);
        }

        logger.error("Error during login:",err.message);
        throw err;
    }
};

/**
 * Checks if a user exists in the database
 * 
 * @param {Object} data 
 * @param {string} data.email 
 * @returns {Promise<Object>} An object with a boolean 'exists' property
 * 
 */

export const checkEmail = async (data) => {
    try {
        const validatedData = checkEmailSchema.parse(data);
        const { email } = validatedData;
        
        // Check if user already exists
        const userRepository = AppDataSource.getRepository(User);
        const existingUser = await userRepository.exists({ where: { email } });

        return {
            exist: existingUser
        }
            
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.warn("checkEmail validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid email format provided", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in checkEmail service:",err);
        throw err;
    }
}

/**
 * If the user exists, it returns their details and JWTs.
 * If the user does not exist, it returns the verified Google email to initiate a signup flow.
 * 
 * @param {Object} idToken 
 * @returns {Promise<Object>} { message: "Login successful", status: true, exist: true } or { message: "User not found", status: false, exist: false }
 */
export const loginWithGoogle = async (idToken) => { 
    try {
        const validatedToken = googleLoginSchema.parse(idToken);

        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({
            idToken: validatedToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) throw sendError('Invalid Google token: missing email payload',401);

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now) throw sendError('ID token has expired',401);

        const { email } = payload;

        // Check if user already exists
        const userRepository = AppDataSource.getRepository(User);
        
        const user = await userRepository.createQueryBuilder('user')
        .select([
            'user.id',
            'user.email',
            'user.role',
            'user.name',
            'user.phoneNumber',
            'user.createdAt',
            'user.updatedAt',
            'user.isBlocked',
        ])
        .where('user.email = :email', { email })
        .getOne();

        if (!user) {        /// IF THERE IS NO USER THEN THE NEW USER IS NOT CREATED INSTEAD signup ROUTE WILL HANDLE IT /// IT IS USED FOR GIVING USERS FLEXBILITY TO ACCESS WITH NORMAL EMAIL PASSWORD LOGIN WITH THE SAME EMAIL ID EXTRACTED FROM GOOGLE PAYLOAD
            return ({
                message: "User not found, Please complete registration.",
                status: false,
                email: email,
                exist: false
            });
        }
        if (user.isBlocked) throw sendError('This account has been blocked', 403);

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
        if (err instanceof z.ZodError) {
            logger.warn("loginWithGoogle validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid ID token format", 400, err.flatten().fieldErrors);
        }
        if (err.code === 'ERR_OSSL_PEM_NO_START_LINE' || err.message.includes('Token used too late')) {
            logger.warn('Google token verification failed', { error: err.message });
            throw sendError('Invalid or expired Google token.', 401);
        }
        logger.error("Error in loginWithGoogle service:",err);
        throw err;
    }
};

/**
 * A 6 digit OTP will be generated and sent to the user's email and also the OTP will be saved in OtpEmail table with an expiration time of 10 minutes
 * If the OTP is send mutliple times then the last send otp will remain in database
 * 
 * @param {Object} data 
 * @param {string} data.email - The recipient's email address.
 * @returns {Promise<Object>} { message: "OTP sent successfully", status: true } or { message: "Failed to send email", statusCode: 500 }
 */
export const sendEmailOtp = async (data) => {
    try {
        const { email } = emailSchema.parse(data);
        
        const rateLimitKey = `otp-limit:${email}`;
        const currentRequests = await redis.incr(rateLimitKey);

        if (currentRequests === 1) {
            await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
        }

        if (currentRequests > RATE_LIMIT_MAX_REQUESTS) {
            logger.warn(`Rate limit exceeded for email: ${email}`);
            throw sendError('Too many requests. Please wait a minute before trying again.', 429);
        }

        const otp = crypto.randomInt(100000, 999999).toString(); // Generate a 6-digit OTP
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

        const otpEmailRepository = AppDataSource.getRepository(OtpEmail);

        /**
         *  TypeOrm save method is giving unique constraint error when the email is already in the database in development
         *  So using findOne and update method to update the otp and expiresAt
         */

        let otpRecord = await otpEmailRepository.findOne({ where: { email } });
        if (otpRecord) {
            otpRecord.otp = otp;
            otpRecord.expiresAt = expiresAt;
            await otpEmailRepository.save(otpRecord);
        } else {
            await otpEmailRepository.save({
            email,
            otp,
            expiresAt
            });
        }

        emailQueue.add('sendEmailOtp', {
            email,
            name: "Nexs",
            template_id: "global_otp",
            variables: { otp: otp }
        });

        return {
            message: "An OTP has been sent to your email address.",
            status: true
        }
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.warn("sendEmailOtp validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid email format provided", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in sendEmailOtp service:",err);
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
        const { email, otp } = verifyOtpSchema.parse(data);

        //Check for an existing lockout
        const lockoutKey = `otp-lockout:${email}`;
        const isLockedOut = await redis.get(lockoutKey);
        if (isLockedOut) throw sendError(`Too many incorrect attempts. Please try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`, 429);


        const otpEmailRepository = AppDataSource.getRepository(OtpEmail);
        const otpRecord = await otpEmailRepository.findOne({ where: { email } });

        if (!otpRecord) throw sendError('Invalid or expired OTP. Please request a new one.', 400);


        if (new Date() > otpRecord.expiresAt) {
            // Clean up the expired record
            await otpEmailRepository.delete({ email });
            throw sendError('This OTP has expired. Please request a new one.', 400);
        }

        if (otpRecord.otp !== otp) {
            // Handle incorrect OTP attempt
            const attemptKey = `otp-attempt:${email}`;
            const attempts = await redis.incr(attemptKey);

            if (attempts === 1) {
                await redis.expire(attemptKey, ATTEMPT_WINDOW_SECONDS);
            }

            if (attempts >= MAX_OTP_ATTEMPTS) {
                // If max attempts reached, lock the user out and delete the OTP record
                await redis.set(lockoutKey, 'locked', 'EX', LOCKOUT_DURATION_SECONDS);
                await otpEmailRepository.delete({ email }); // Invalidate the current OTP
                await redis.del(attemptKey); // Clean up the attempt counter
                logger.warn(`OTP verification locked for email: ${email}`);
                throw sendError(`Too many incorrect attempts. Please try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`, 429);
            }
        
            throw sendError('Invalid OTP.', 400);
        }

        // Success! OTP is valid.
        // Clean up the OTP record and any attempt counters from Redis.
        await otpEmailRepository.delete({ email });
        const attemptKey = `otp-attempt:${email}`;
        await redis.del(attemptKey);

        const verificationToken = jwt.sign({ email }, OTP_TOKEN_SECRET, { expiresIn: '5m' });

        return {
        message: "OTP verified successfully",
        verificationToken,
        status: true
        };
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.warn("verifyEmailOtp validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid data format.", 400, err.flatten().fieldErrors);
        }

        logger.error("Error in verifyEmailOtp service:", err);
        throw err;
    }
}

/**
 * A 6 digit OTP will be generated and sent to the user's phone and also the OTP will be saved in OtpPhone table with an expiration time of 10 minutes
 * If the OTP is send mutliple times then the last send otp will remain in database
 * 
 * @param {Object} data 
 * @param {string} data.phoneNumber - The recipient's phone number.
 * @returns {Promise<Object>} { message: "OTP sent successfully", status: true } or { message: "Failed to send phone", statusCode: 500 }
 */
export const sendPhoneOtp = async (data) => {
    try {
        const { phoneNumber } = phoneSchema.parse(data);
        
        const rateLimitKey = `otp-limit:${phoneNumber}`;
        const currentRequests = await redis.incr(rateLimitKey);

        if (currentRequests === 1) {
            await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
        }

        if (currentRequests > RATE_LIMIT_MAX_REQUESTS) {
            logger.warn(`Rate limit exceeded for phone: ${phoneNumber}`);
            throw sendError('Too many requests. Please wait a minute before trying again.', 429);
        }

        const otp = crypto.randomInt(100000, 999999).toString(); // Generate a 6-digit OTP
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

        const otpPhoneRepository = AppDataSource.getRepository(OtpPhone);

        /**
         *  TypeOrm save method is giving unique constraint error when the phone is already in the database (in development)
         *  So using findOne and update method to update the otp and expiresAt
         */

        let otpRecord = await otpPhoneRepository.findOne({ where: { phoneNumber } });
        if (otpRecord) {
            otpRecord.otp = otp;
            otpRecord.expiresAt = expiresAt;
            await otpPhoneRepository.save(otpRecord);
        } else {
            await otpPhoneRepository.save({
            phoneNumber,
            otp,
            expiresAt
            });
        }

        phoneQueue.add('sendPhoneOtp', {
            phoneNumber,
            otp
        });

        return {
            message: "An OTP has been sent to your phone number.",
            status: true
        }
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.warn("sendPhoneOtp validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid phone number format provided", 400, err.flatten().fieldErrors);
        }
        logger.error("Error in sendPhoneOtp service:",err);
        throw err;
    }
}

/**
 * Verifies a phone OTP
 * 
 * @param {Object} data 
 * @param {string} data.phoneNumber 
 * @param {string} data.otp 
 * @returns {Promise<Object>} { message: "OTP verified successfully", status: true } or { message: "OTP expired", statusCode: 400 }
 */
export const verifyPhoneOtp = async (data) => {
    try {
        const { phoneNumber, otp } = verifyPhoneOtpSchema.parse(data);

        //Check for an existing lockout
        const lockoutKey = `otp-lockout:${phoneNumber}`;
        const isLockedOut = await redis.get(lockoutKey);
        if (isLockedOut) throw sendError(`Too many incorrect attempts. Please try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`, 429);


        const otpPhoneRepository = AppDataSource.getRepository(OtpPhone);
        const otpRecord = await otpPhoneRepository.findOne({ where: { phoneNumber } });

        if (!otpRecord) throw sendError('Invalid or expired OTP. Please request a new one.', 400);


        if (new Date() > otpRecord.expiresAt) {
            // Clean up the expired record
            await otpPhoneRepository.delete({ phoneNumber });
            throw sendError('This OTP has expired. Please request a new one.', 400);
        }

        if (otpRecord.otp !== otp) {
            // Handle incorrect OTP attempt
            const attemptKey = `otp-attempt:${phoneNumber}`;
            const attempts = await redis.incr(attemptKey);

            if (attempts === 1) {
                await redis.expire(attemptKey, ATTEMPT_WINDOW_SECONDS);
            }

            if (attempts >= MAX_OTP_ATTEMPTS) {
                // If max attempts reached, lock the user out and delete the OTP record
                await redis.set(lockoutKey, 'locked', 'EX', LOCKOUT_DURATION_SECONDS);
                await otpPhoneRepository.delete({ phoneNumber }); // Invalidate the current OTP
                await redis.del(attemptKey); // Clean up the attempt counter
                logger.warn(`OTP verification locked for phone: ${phoneNumber}`);
                throw sendError(`Too many incorrect attempts. Please try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`, 429);
            }
        
            throw sendError('Invalid OTP.', 400);
        }

        // Success! OTP is valid.
        // Clean up the OTP record and any attempt counters from Redis.
        await otpPhoneRepository.delete({ phoneNumber });
        const attemptKey = `otp-attempt:${phoneNumber}`;
        await redis.del(attemptKey);

        const verificationToken = jwt.sign({ phoneNumber }, OTP_TOKEN_SECRET, { expiresIn: '5m' });

        return {
        message: "OTP verified successfully",
        verificationToken,
        status: true
        };
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.warn("verifyPhoneOtp validation failed", { errors: err.flatten().fieldErrors });
            throw sendError("Invalid data format.", 400, err.flatten().fieldErrors);
        }

        logger.error("Error in verifyPhoneOtp service:", err);
        throw err;
    }
}

/**
 * Securely resets a user's password after they have verified an OTP.
 * This function MUST be protected by the `verifyOtpToken` middleware.
 * @param {Object} data 
 * @param {string} data.email - The email from the decoded, verified OTP token.
 * @param {string} data.newPassword 
 * @returns {Promise<Object>} 
 */
export const resetPassword = async (data) => {
    try {
        const { email, newPassword } = resetPasswordSchema.parse(data);
    
        const userRepository = AppDataSource.getRepository(User);
    
        const hashedPassword = await hashPassword(newPassword);
    
        const updateResult = await userRepository.update(
          { email },
          {
            password: hashedPassword,
            refreshToken: null, // Invalidate all sessions
          }
        );
    
        if (updateResult.affected === 0) throw sendError('User not found.', 404);
        

        emailQueue.add('sendPasswordChangeNotification', {
            email: email,
            name: "Nexs User",
            template_id: "password_changed_notification",
            variables: { timestamp: new Date().toUTCString() }
        });
    
        return {
          message: "Password has been reset successfully. Please log in again.",
          status: true,
        };
      } catch (err) {
        if (err instanceof z.ZodError) {
          logger.warn("resetPassword validation failed", { errors: err.flatten().fieldErrors });
          throw sendError("Invalid data provided.", 400, err.flatten().fieldErrors);
        }
    
        logger.error("Error in resetPassword service:", err);
        throw err;
      }
}

/**
 * This function MUST be called after the `verifyAccessToken` middleware.
 * 
 * @param {Object} data 
 * @param {string} data.userId 
 * @returns {Promise<Object>} { message: "Logout successful", status: true } or { message: "User not found", statusCode: 404 }
 */
export const logout = async (data) => {
    try {
        const { userId } = logoutSchema.parse(data);
    
        const userRepository = AppDataSource.getRepository(User);
    
        const updateResult = await userRepository.update(
          { id: userId },
          {
            refreshToken: null,
            pushToken: null,
          }
        );
    
        if (updateResult.affected === 0) {
          throw sendError('User not found or no active session to log out.', 404);
        }
    
        return {
          message: "Logout successful",
          status: true,
        };
      } catch (err) {
        if (err instanceof z.ZodError) {
          logger.warn("logout validation failed", { errors: err.flatten().fieldErrors });
          throw sendError("Invalid data provided.", 400, err.flatten().fieldErrors);
        }
    
        logger.error("Error during logout:", err);
        throw err;
      }
}