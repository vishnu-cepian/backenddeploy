import jwt from 'jsonwebtoken';
import { sendError } from '../utils/core-utils.mjs';
import { ACCESS_TOKEN_SECRET, ADMIN_ACCESS_TOKEN_SECRET, OTP_TOKEN_SECRET } from '../config/auth-config.mjs';

/**
 * A factory function that creates a reusable JWT verification middleware.
 *
 * @param {string} secret - The JWT secret key to use for verification.
 * @param {object} options - Configuration options for the middleware.
 * @param {string} [options.requiredRole] - The role the user must have (e.g., 'ADMIN').
 * @param {boolean} [options.checkBlockedStatus=true] - Whether to check if the user is blocked.
 * @returns {function} An Express middleware function.
 */

const createAuthMiddleware = (secret, options = {}) => {
  const { requiredRole, checkBlockedStatus = true } = options;

  return (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return next(sendError('A token is required for authentication', 401));
      }

      const decoded = jwt.verify(token, secret);

      if (checkBlockedStatus && decoded.isBlocked) {
        return next(sendError('This account has been suspended.', 403));
      }

      if (requiredRole && decoded.role?.toLowerCase() !== requiredRole.toLowerCase()) {
        return next(sendError('You do not have permission to perform this action.', 403));
      }

      req.user = decoded;

      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return next(sendError('Your session has expired. Please log in again.', 401));
      }
      if (err instanceof jwt.JsonWebTokenError) {
        return next(sendError('Invalid token. Please log in again.', 403));
      }

      return next(err);
    }
  };
};

export const verifyAccessToken = createAuthMiddleware(ACCESS_TOKEN_SECRET);

export const verifyAdminAccessToken = createAuthMiddleware(ADMIN_ACCESS_TOKEN_SECRET, {
  requiredRole: 'admin',
  checkBlockedStatus: true // Ensure blocked admin cannot operate
});

export const verifyOtpToken = createAuthMiddleware(OTP_TOKEN_SECRET, {
  checkBlockedStatus: false // OTP tokens likely don't need this check
});