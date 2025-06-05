import jwt from 'jsonwebtoken'; // Import JWT library
import { ACCESS_TOKEN_SECRET, ADMIN_ACCESS_TOKEN_SECRET, OTP_TOKEN_SECRET } from '../config/auth-config.mjs';
import { sendError } from '../utils/core-utils.mjs';

// Middleware to verify JWT token
export const verifyAccessToken = (req, res, next) => {
    // Check if the token is present in the request headers
  const token = req.headers['authorization']?.split(' ')[1]; // Get token from Authorization header
  
  if (!token) {
    return res.sendStatus(401).json({ message: 'No token provided' });
  }

  try {
  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = decoded; // Attach user data to request object
    next(); // Proceed to the next middleware or route handler
  });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export const verifyAdminAccessToken = (req, res, next) => {
  // Check if the token is present in the request headers
  const token = req.headers['authorization']?.split(' ')[1]; // Get token from Authorization header

  if (!token) {
    return res.sendStatus(401).json({ message: 'No token provided' });
  }

  try {
  jwt.verify(token, ADMIN_ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = decoded; // Attach user data to request object
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    next(); // Proceed to the next middleware or route handler
  });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export const verifyOtpToken = (req, res, next) => {
  // Check if the token is present in the request headers
  const token = req.headers['authorization']?.split(' ')[1]; // Get token from Authorization header
  if (!token) {
    return res.sendStatus(401).json({ message: 'No Otp token provided' });
  }

  try {
    jwt.verify(token, OTP_TOKEN_SECRET, (err, decoded) => {
      if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
      }
      return res.status(403).json({ message: 'Invalid token' });
      }
      req.user = decoded; // Attach user data to request object
      next(); // Proceed to the next middleware or route handler
    });
  } catch (error) {
    console.log("error", error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}