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
import { emailQueue, smsQueue } from "../queues/index.mjs";
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

/**
 * Generates a short-lived access token for a user.
 * @param {object} payload - The user data to include in the token.
 * @returns {string} The generated JWT access token.
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '7d' });
};

/**
 * Generates a long-lived refresh token for a user.
 * @param {object} payload - The user data to include in the token.
 * @returns {string} The generated JWT refresh token.
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '30d' });
};

//================================= INTERNAL HELPERS =====================================================

/**
 * Checks if a given identifier (email/phone) has exceeded the rate limit for OTP requests.
 * @param {string} identifier - The email or phone number to check.
 * @throws {Error} 429 - If the rate limit is exceeded.
 */
const _checkRateLimit = async (identifier) => {
    const rateLimitKey = `otp-limit:${identifier}`;
    const currentRequests = await redis.incr(rateLimitKey);
    if (currentRequests === 1) {
        await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (currentRequests > RATE_LIMIT_MAX_REQUESTS) {
        logger.warn(`Rate limit exceeded for identifier: ${identifier}`);
        throw sendError('Too many requests. Please wait a minute before trying again.', 429);
    }
};

/**
 * Handles an incorrect OTP attempt, tracking attempts and enforcing lockouts.
 * @param {string} identifier - The email or phone number.
 * @param {import('typeorm').Repository} otpRepo - The repository for the OTP entity.
 * @throws {Error} 429 - If max attempts are reached and the user is locked out.
 * @throws {Error} 400 - For an invalid OTP attempt.
 */
const _handleIncorrectOtpAttempt = async (identifier, otpRepo) => {
    const attemptKey = `otp-attempt:${identifier}`;
    const attempts = await redis.incr(attemptKey);

    if (attempts === 1) {
        await redis.expire(attemptKey, ATTEMPT_WINDOW_SECONDS);
    }

    if (attempts >= MAX_OTP_ATTEMPTS) {
        const lockoutKey = `otp-lockout:${identifier}`;
        await redis.set(lockoutKey, 'locked', 'EX', LOCKOUT_DURATION_SECONDS);
        await otpRepo.delete({ [otpRepo.metadata.columns[1].propertyName]: identifier }); // Invalidate current OTP
        await redis.del(attemptKey);
        logger.warn(`OTP verification locked for identifier: ${identifier}`);
        throw sendError(`Too many incorrect attempts. Please try again in 5 minutes.`, 429);
    }

    throw sendError('Invalid OTP.', 400);
};

//=================================REFRESH TOKEN SERVICES=====================================================

/**
 * @api {post} /api/auth/refreshAccessToken Refresh Access Token
 * @apiName RefreshAccessToken
 * @apiGroup Authentication
 * @apiDescription Refreshes a user's access token, if the refresh token is expired, it will be used to get new access token.
 *
 * @apiBody {string} refreshToken - The user's refresh token.
 *
 * @param {Object} data 
 * @param {string} data.refreshToken - The user's refresh token.
 * @returns {Promise<Object>} { newAccessToken: string, newRefreshToken: string, message: string }
 * 
 * @apiSuccess {string} newAccessToken - The user's new access token.
 * @apiSuccess {string} newRefreshToken - The user's new refresh token.
 * @apiSuccess {string} message - A success confirmation message.
 *
 * @apiError {Error} 400 - For invalid data format.
 * @apiError {Error} 401 - For invalid refresh token.
 * @apiError {Error} 403 - If the user is blocked.
 * @apiError {Error} 500 - Internal Server Error.
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

        if (user.isBlocked) throw sendError('This account has been blocked. Please contact support.', 403);

        // Generate new tokens
        const newAccessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });
        const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role, isBlocked: user.isBlocked });
        await userRepository.update(
            { id: user.id },
            { refreshToken: newRefreshToken }
        );
        return {
            newAccessToken,
            newRefreshToken,
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
 * @api {post} /api/auth/signup Signup
 * @apiName Signup
 * @apiGroup Authentication
 * @apiDescription Creates a new user and, if the role is 'customer', a corresponding customer profile auto generated, if the role is 'vendor', a corresponding vendor profile has to be completed.
 *
 * @apiBody {string} email - The user's email.
 * @apiBody {string} name - The user's name.
 * @apiBody {string} password - The user's password.
 * @apiBody {string} role - The user's role.
 * @apiBody {string} phoneNumber - The user's phone number.
 *
 * @param {Object} data 
 * @param {string} data.email - The user's email.
 * @param {string} data.name - The user's name.
 * @param {string} data.password - The user's password.
 * @param {string} data.role - The user's role.
 * @param {string} data.phoneNumber - The user's phone number.
 * @returns {Promise<Object>} { message: "User created successfully", status: true }
 *
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {boolean} status - True indicating success.
 *
 * @apiError {Error} 400 - If the user already exists.
 * @apiError {Error} 401 - If the password is not hashed.
 * @apiError {Error} 403 - If the role is not valid.
 * @apiError {Error} 404 - If the phone number is not valid.
 * @apiError {Error} 500 - Internal Server Error.
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
 * @api {post} /api/auth/loginWithEmail Login With Email
 * @apiName LoginWithEmail
 * @apiGroup Authentication
 * @apiDescription Logs in a user with their email and password.
 *
 * @apiBody {string} email - The user's email.
 * @apiBody {string} password - The user's password.
 *
 * @param {Object} data 
 * @param {string} data.email - The user's email.
 * @param {string} data.password - The user's password.
 * @returns {Promise<Object>} { user: { id: string, email: string, role: string, name: string, phoneNumber: string, createdAt: string, lastLogin: string }, accessToken: string, refreshToken: string, message: string }
 * 
 * @apiSuccess {Object} user - The user's details.
 * @apiSuccess {string} user.id - The user's ID.
 * @apiSuccess {string} user.email - The user's email.
 * @apiSuccess {string} user.role - The user's role.
 * @apiSuccess {string} user.name - The user's name.
 * @apiSuccess {string} user.phoneNumber - The user's phone number.
 * @apiSuccess {string} user.createdAt - The user's creation date.
 * @apiSuccess {string} user.lastLogin - The user's last login date.
 * @apiSuccess {string} accessToken - The user's access token.
 * @apiSuccess {string} refreshToken - The user's refresh token.
 * @apiSuccess {string} message - A success confirmation message.
 *
 * @apiError {Error} 400 - For invalid data format.
 * @apiError {Error} 401 - For invalid password.
 * @apiError {Error} 403 - If the user is blocked.
 * @apiError {Error} 404 - If the user is not found.
 * @apiError {Error} 500 - Internal Server Error.
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
 * @api {post} /api/auth/checkEmail Check Email
 * @apiName CheckEmail
 * @apiGroup Authentication
 * @apiDescription Checks if a user exists in the database.
 *
 * @apiBody {string} email - The user's email.
 *
 * @param {Object} data 
 * @param {string} data.email - The user's email.
 * @returns {Promise<Object>} { exist: boolean }
 * 
 * @apiSuccess {boolean} exist - True if the user exists, false if they don't.
 *
 * @apiError {Error} 400 - For invalid data format.
 * @apiError {Error} 500 - Internal Server Error.
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
 * @api {post} /api/auth/loginWithGoogle Login With Google
 * @apiName LoginWithGoogle
 * @apiGroup Authentication
 * @apiDescription Logs in a user with a Google ID token, if the user exists, it returns their details and JWTs.
 * If the user does not exist, it returns the verified Google email to initiate a signup flow.
 *
 * @apiBody {string} idToken - The user's Google ID token.
 *
 * @param {Object} data 
 * @param {string} data.idToken - The user's Google ID token.
 * @returns {Promise<Object>} { message: "Login successful", status: true, exist: true, user: { id: string, email: string, role: string, name: string, phoneNumber: string, createdAt: string, lastLogin: string }, accessToken: string, refreshToken: string } or { message: "User not found", status: false, exist: false, email: string, exist: false }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {boolean} status - True indicating success.
 * @apiSuccess {boolean} exist - True if the user exists, false if they don't.
 * @apiSuccess {Object} user - The user's details.
 * @apiSuccess {string} user.id - The user's ID.
 * @apiSuccess {string} user.email - The user's email.
 * @apiSuccess {string} user.role - The user's role.
 * @apiSuccess {string} user.name - The user's name.
 * @apiSuccess {string} user.phoneNumber - The user's phone number.
 * @apiSuccess {string} user.createdAt - The user's creation date.
 * @apiSuccess {string} user.lastLogin - The user's last login date.
 * @apiSuccess {string} accessToken - The user's access token.
 * @apiSuccess {string} refreshToken - The user's refresh token.
 * @apiSuccess {string} email - The user's email.
 * @apiSuccess {boolean} exist - True if the user exists, false if they don't.
 *
 * @apiError {Error} 400 - For invalid data format.
 * @apiError {Error} 401 - For invalid Google token.
 * @apiError {Error} 403 - If the user is blocked.
 * @apiError {Error} 500 - Internal Server Error.
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
 * @api {post} /api/auth/sendEmailOtp Send Email OTP
 * @apiName SendEmailOtp
 * @apiGroup Authentication
 * @apiDescription Generates and sends a 6-digit OTP to the user's email. Enforces rate limiting.
 *
 * @apiBody {string} email - The recipient's email address.
 *
 * @param {Object} data 
 * @param {string} data.email - The recipient's email address.
 * @returns {Promise<Object>} { message: "An OTP has been sent to your email address.", status: true } or { message: "Failed to send email", statusCode: 500 }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {boolean} status - True indicating success.
 *
 * @apiError {Error} 400 - If the email format is invalid.
 * @apiError {Error} 429 - If too many requests are made in a short period.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const sendEmailOtp = async (data) => {
    try {
        const { email } = emailSchema.parse(data);
        
        await _checkRateLimit(email);

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
 * @api {post} /api/auth/verifyEmailOtp Verify Email OTP
 * @apiName VerifyEmailOtp
 * @apiGroup Authentication
 * @apiDescription Verifies an email OTP and provides a short-lived verification token upon success. Enforces brute-force protection.
 *
 * @apiBody {string} email - The user's email.
 * @apiBody {string} otp - The 6-digit OTP.
 *
 * @param {Object} data 
 * @param {string} data.email - The user's email.
 * @param {string} data.otp - The 6-digit OTP.
 * @returns {Promise<Object>} { message: "OTP verified successfully", verificationToken: string, status: true } or { message: "OTP expired", statusCode: 400 }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {string} verificationToken - A short-lived JWT for subsequent actions (like signup/password reset).
 * @apiSuccess {boolean} status - True indicating success.
 *
 * @apiError {Error} 400 - For invalid OTP format, expired OTP, or incorrect OTP.
 * @apiError {Error} 429 - If the user is locked out due to too many incorrect attempts.
 * @apiError {Error} 500 - Internal Server Error.
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
            await _handleIncorrectOtpAttempt(email, otpEmailRepository);
        }

        // Success! OTP is valid. Clean up the OTP record and any attempt counters from Redis.
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
 * @api {post} /api/auth/sendPhoneOtp Send Phone OTP
 * @apiName SendPhoneOtp
 * @apiGroup Authentication
 * @apiDescription Generates and sends a 6-digit OTP to the user's phone number. Enforces rate limiting.
 *
 * @apiBody {string} phoneNumber - The recipient's phone number.
 *
 * @param {Object} data 
 * @param {string} data.phoneNumber - The recipient's phone number.
 * @returns {Promise<Object>} { message: "An OTP has been sent to your phone number.", status: true } or { message: "Failed to send phone", statusCode: 500 }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {boolean} status - True indicating success.
 *
 * @apiError {Error} 400 - If the phone number format is invalid.
 * @apiError {Error} 429 - If too many requests are made in a short period.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const sendPhoneOtp = async (data) => {
    try {
        const { phoneNumber } = phoneSchema.parse(data);
        
        await _checkRateLimit(phoneNumber);

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

        smsQueue.add('sendPhoneOtp', {
            phoneNumber,
            template_id: "global_otp",
            variables: { otp: otp }
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
 * @api {post} /api/auth/verifyPhoneOtp Verify Phone OTP
 * @apiName VerifyPhoneOtp
 * @apiGroup Authentication
 * @apiDescription Verifies an phone OTP and provides a short-lived verification token upon success. Enforces brute-force protection.
 *
 * @apiBody {string} phoneNumber - The user's phone number.
 * @apiBody {string} otp - The 6-digit OTP.
 *
 * @param {Object} data 
 * @param {string} data.phoneNumber - The user's phone number.
 * @param {string} data.otp - The 6-digit OTP.
 * @returns {Promise<Object>} { message: "OTP verified successfully", verificationToken: string, status: true } or { message: "OTP expired", statusCode: 400 }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {string} verificationToken - A short-lived JWT for subsequent actions (like signup/password reset).
 * @apiSuccess {boolean} status - True indicating success.
 *
 * @apiError {Error} 400 - For invalid OTP format, expired OTP, or incorrect OTP.
 * @apiError {Error} 429 - If the user is locked out due to too many incorrect attempts.
 * @apiError {Error} 500 - Internal Server Error.
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
            await _handleIncorrectOtpAttempt(phoneNumber, otpPhoneRepository);
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
 * @api {post} /api/auth/resetPassword Reset Password
 * @apiName ResetPassword
 * @apiGroup Authentication
 * @apiDescription Resets a user's password after they have verified an OTP.
 *
 * @apiBody {string} newPassword - The new password.
 *
 * @param {Object} data 
 * @param {string} data.email - The user's email.
 * @param {string} data.newPassword - The new password.
 * @returns {Promise<Object>} { message: "Password has been reset successfully. Please log in again.", status: true } or { message: "User not found", statusCode: 404 }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {boolean} status - True indicating success.
 *
 * @apiError {Error} 400 - For invalid data format.
 * @apiError {Error} 404 - If the user is not found.
 * @apiError {Error} 500 - Internal Server Error.
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
 * @api {post} /api/auth/logout Logout
 * @apiName Logout
 * @apiGroup Authentication
 * @apiDescription Logs out a user by invalidating their refresh token.
 *
 * @param {Object} data 
 * @param {string} data.userId - The user's ID.
 * @returns {Promise<Object>} { message: "Logout successful", status: true } or { message: "User not found", statusCode: 404 }
 * 
 * @apiSuccess {string} message - A success confirmation message.
 * @apiSuccess {boolean} status - True indicating success.
 *
 * @apiError {Error} 400 - For invalid data format.
 * @apiError {Error} 404 - If the user is not found.
 * @apiError {Error} 500 - Internal Server Error.
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