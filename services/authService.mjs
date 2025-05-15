import { logger } from "../utils/logger-utils.mjs";
import { hashPassword, comparePassword } from "../utils/auth-utils.mjs";
import { prisma } from "../utils/prisma-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { Resend } from "resend";
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } from '../config/auth-config.mjs';
import { OAuth2Client } from "google-auth-library";
// import pkg from "twilio";
// const { Twilio } = pkg;
import twilio from "twilio";
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

export const refreshAccessToken = async (refreshToken) => {  //if token is expired, ie., 401, then refresh token will be used to get new access token
  try {
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
        throw sendError('Invalid refresh token');
    }
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
        throw sendError('User not found');
    }
    if (user.refreshToken !== refreshToken) {
        throw sendError('Invalid refresh token');
    }
    const newAccessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role });
    await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: newRefreshToken },
    });
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


export const signup = async (data) => { 
    try {
        if (data.authorization === process.env.SIGNUP_TOKEN) {
            const { email, name, password, role } = data;
            if (!email || !name || !password || !role) {
                throw sendError('Email, name, password, and role are required');
            }
            // // Check if user already exists
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                throw sendError('User already exists with this email');
            }
            
            const hashedPassword = await hashPassword(password);
            // Save user to database 
            const newUser = await prisma.user.create({
                data: {
                    email,
                    name,
                    password: hashedPassword,
                    role,
        
                },
            });
            return newUser;
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

export const loginWithEmail = async (data) => {
    try {
        if (data.authorization === process.env.SIGNUP_TOKEN) {
            const {email, password} = data;
        
            if (!email || !password) {
                throw sendError('Email and password are required');
            }

            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                throw sendError('User not found');
            }
            // Check if password is correct
            const isPasswordValid = await comparePassword(password, user.password);
            if (!isPasswordValid) {
                //throw sendError('Invalid password', 401, { email });  can use data to send error
                throw sendError('Invalid password');
            }

            // Generate JWT token
            const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
            const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role });

            await prisma.user.update({
                where: { id: user.id },
                data: { refreshToken }, // add refreshToken field to User model
            });

            return {
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                },
                accessToken,
                refreshToken,
                message: "Login successful",
            };
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
};

export const checkEmail = async (data) => {
    try {
        if (data.authorization === process.env.SIGNUP_TOKEN) {
            const { email } = data;
        
            if (!email) {
                throw sendError('Email is required');
            }

            // Check if user already exists
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return { exist: true }; // User exists
            } else {
                return { exist: false }; // User does not exist
            }
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const loginWithGoogle = async (data) => { 
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
            throw sendError('ID token has expired');
        }

        const { email } = payload;

        // Check if user already exists
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {        /// IF THERE IS NO USER THEN THE NEW USER IS NOT CREATED INSTEAD signup ROUTE WILL HANDLE IT /// IT IS USED FOR GIVING USERS FLEXBILITY TO ACCESS WITH NORMAL EMAIL PASSWORD LOGIN WITH THE SAME EMAIL ID EXTRACTED FROM GOOGLE PAYLOAD
        //     // Create new user
        //     user = await prisma.user.create({
        //         data: {
        //             email,
        //             name,
        //             provider: 'google',
        //         },
        //     });
            return ({
                message: "User not found",
                status: false
            });
        }

        // Generate JWT token
        const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
        const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role });

        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken }, 
        });

        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
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

export const sendEmailOtp = async (data) => {
    try {
        const { email } = data;
    
        if (!email) {
            throw sendError('Email is required');
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

        await prisma.otpEmail.upsert({
            where: { email },
            update: {otp: otp.toString(), expiresAt},
            create: { email, otp: otp.toString(), expiresAt },
        });
        
        const resend = new Resend(process.env.RESEND_API_KEY);  //for testing purpose

        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: email,                      // will only be able to send OTP to www.vishnurpillai@gmail.com
            subject: 'Your OTP Code',
            html: `<p>Your OTP code is <strong>${otp}</strong>. It will expire in 10 minutes.</p>`,
        });

        return ({
            message: "OTP sent successfully",
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const verifyEmailOtp = async (data) => {
    try {
        const { email, otp } = data;
    
        if (!email || !otp) {
            throw sendError('Email and OTP are required');
        }

        const otpRecord = await prisma.otpEmail.findUnique({ where: { email } });
        if (!otpRecord) {
            throw sendError('OTP not found');
        }

        if (otpRecord.otp !== otp) {
            throw sendError('Invalid OTP');
        }

        if (new Date() > otpRecord.expiresAt) {
            throw sendError('OTP expired');
        }

        if(otpRecord.otp === otp) {
            await prisma.otpEmail.delete({ where: { email } });
        }
        // OTP is valid
        return ({
            message: "OTP verified successfully",
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}
export const sendPhoneOtp = async (data) => {
    try {
        const { phone } = data;
    
        if (!phone) {
            throw sendError('Phone number is required');
        }

        const normalizedPhone = phone.startsWith('+91') ? phone : `+91${phone}`;
       
        const client = twilio(
            process.env.TWILIO_ACCOUNT_SID, 
            process.env.TWILIO_AUTH_TOKEN
        );

        // Rate limiting check
        const existingOtp = await prisma.otpPhone.findUnique({
            where: { phone: normalizedPhone }
        });

        if (existingOtp && existingOtp.createdAt > new Date(Date.now() - 60 * 1000)) {
            throw sendError('OTP already sent. Please wait before requesting another.', 429);
        }

        // Send OTP via Twilio Verify (Twilio generates the OTP)
        const verification = await client.verify.v2
            .services(process.env.TWILIO_SERVICE_SID)
            .verifications.create({
                to: normalizedPhone,
                channel: "sms",
                locale: "en"
            });

        // Store verification SID (not OTP) in database
        await prisma.otpPhone.upsert({
            where: { phone: normalizedPhone },
            update: { 
                verificationSid: verification.sid,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
                attempts: 0,
                createdAt: new Date()
            },
            create: { 
                phone: normalizedPhone,
                verificationSid: verification.sid,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                attempts: 0
            },
        });

        logger.info(`OTP verification started for ${normalizedPhone} (SID: ${verification.sid})`);

        return {
            success: true,
            message: "OTP sent successfully",
            verificationSid: verification.sid // Optional: For tracking
        };
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const verifyPhoneOtp = async(data) => {
    try {
        const  { phone, otp } = data;
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
        const normalizedPhone = phone.startsWith('+91') ? phone : `+91${phone}`;

        const record = await prisma.otpPhone.findUnique({
            where: { phone: normalizedPhone }
        });

        if (!record) throw sendError('No OTP requested for this number', 400);

        const verificationCheck = await client.verify.v2
            .services(process.env.TWILIO_SERVICE_SID)
            .verificationChecks
            .create({
            to: normalizedPhone,
            code: otp
            });

        if (verificationCheck.status === 'approved') {
            await prisma.otpPhone.delete({ where: { phone: normalizedPhone } });
            return { success: true };
        } else {
            await prisma.otpPhone.update({
            where: { phone: normalizedPhone },
            data: { attempts: { increment: 1 } }
            });
            throw sendError('Invalid OTP', 400);
        }
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const forgotPassword = async (data) => {
    try {
        const { email } = data;
    
        if (!email) {
            throw sendError('Email is required');
        }

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw sendError('User not found');
        }

        // Generate OTP and send email
        const otp = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes

        await prisma.otpEmail.upsert({
            where: { email },
            update: { otp: otp.toString(), expiresAt },
            create: { email, otp: otp.toString(), expiresAt },
        });

        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: email,
            subject: 'Your OTP Code for Password Reset',
            html: `<p>Your OTP code for password reset is <strong>${otp}</strong>. It will expire in 10 minutes.</p>`,
        });
        return ({
            message: "OTP sent successfully",
            status: true
        });
    }
    catch (err) {
        logger.error(err);
        throw err;
    }
}

export const resetPassword = async (data) => {
    try {
        const { email, otp, newPassword } = data;
    
        if (!email || !otp || !newPassword) {
            throw sendError('Email, OTP, and new password are required');
        }

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw sendError('User not found');
        }

        // Verify OTP
        const otpRecord = await prisma.otpEmail.findUnique({ where: { email } });
        if (!otpRecord) {
            throw sendError('OTP not found');
        }

        if (otpRecord.otp !== otp) {
            throw sendError('Invalid OTP');
        }

        if (new Date() > otpRecord.expiresAt) {
            throw sendError('OTP expired');
        }

        // Hash the new password
        const hashedPassword = await hashPassword(newPassword);

        // Update user's password
        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword },
        });

        return ({
            message: "Password reset successfully",
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}

export const logout = async (data) => {
    try {
        const { refreshToken } = data;
    
        if (!refreshToken) {
            throw sendError('Refresh token is required');
        }

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { refreshToken } });
        if (!user) {
            throw sendError('User not found');
        }

        // Invalidate the refresh token
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: null },
        });

        return ({
            message: "Logout successful",
            status: true
        });
    } catch (err) {
        logger.error(err);
        throw err;
    }
}