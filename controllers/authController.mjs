import * as authService from '../services/authService.mjs';
import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";

export const signup = async (req, res, next) => {
  try {
    const data = { ...req.body, authorization: req.headers['authorization']?.split(' ')[1] };  //get custom token from client 

    const response = await authService.signup(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const loginWithEmail = async (req, res, next) => {
  try {
    const data = { ...req.body, authorization: req.headers['authorization']?.split(' ')[1] };  //get custom token from client
    const response = await authService.loginWithEmail(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const loginWithGoogle = async (req, res, next) => {
  try {
    const data = req.headers['authorization']?.split(' ')[1]; // Get google token from Authorization header
    // console.log("Google Token: ", data);
    const response = await authService.loginWithGoogle(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};


export const checkEmail = async (req, res, next) => {
  try {
    const data = { ...req.body, authorization: req.headers['authorization']?.split(' ')[1] };  //get custom token from client
    const response = await authService.checkEmail(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const sendEmailOtp = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.sendEmailOtp(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const verifyEmailOtp = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.verifyEmailOtp(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const sendPhoneOtp = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.sendPhoneOtp(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const verifyPhoneOtp = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.verifyPhoneOtp(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.forgotPassword(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.resetPassword(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.refreshAccessToken(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.logout(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
};