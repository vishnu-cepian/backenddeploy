import * as authService from '../services/authService.mjs';
import { MESSAGE } from "../types/enums/index.mjs";
import { formatError, formatResponse } from "../utils/core-utils.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { controllerWrapper } from "../controllers/index.mjs";
// import { authenticateAccessToken } from "../services/authService.mjs";

export const signupWithEmail = controllerWrapper(async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.signupWithEmail(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

export const loginWithEmail = controllerWrapper(async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.loginWithEmail(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

export const loginWithGoogle = controllerWrapper(async (req, res, next) => {
});


export const checkEmail = controllerWrapper(async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.checkEmail(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

export const sendOtp = controllerWrapper(async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.sendOtp(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

export const verifyOtp = controllerWrapper(async (req, res, next) => {
  try {
    const data = req.body;
    const response = await authService.verifyOtp(data);
    if (!response) {
      throw new Error(formatError("Authentication Failed!", response));
    }
    res.status(200).json(formatResponse(MESSAGE.SUCCESS, true, response));
  } catch (err) {
    logger.error(err);
    next(err);
  }
});

export const forgotPassword = controllerWrapper(async (req, res, next) => {
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
});

export const resetPassword = controllerWrapper(async (req, res, next) => {
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
});

export const refreshToken = controllerWrapper(async (req, res, next) => {
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
});