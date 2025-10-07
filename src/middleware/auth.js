const decode = require('@coconut-packages/jsonwebtoken/decode');
const User = require('../models/User');

// Helper function to create auth errors
const createAuthError = (message, reasonCode = 'UNAUTHORIZED') => {
  const error = new Error(message);
  error.statusCode = 401;
  error.reasonCode = reasonCode;
  return error;
};

// TODO: Change the message to generic message once development is done
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.get('Authorization');

    if (!authHeader) {
      return next(createAuthError('No token provided'));
    }

    // Extract Bearer token
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(createAuthError('Invalid token format'));
    }

    const decodedToken = decode(token, process.env.JWT_ENCRYPTION_KEY, process.env.JWT_SECRET, process.env.JWT_ENCRYPTION_IV);
    if (!decodedToken) {
      return next(createAuthError('Invalid token'));
    }

    // Check if user still exists
    const user = await User.findById(decodedToken.userId).select('-password');
    if (!user) {
      return next(createAuthError('User not found'));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      error.message = 'Token expired';
      error.statusCode = 401;
      error.reasonCode = 'TOKEN_EXPIRED';
    } else {
      error.message = 'Internal server error';
      error.statusCode = 500;
      error.reasonCode = 'INTERNAL_SERVER_ERROR';
    }
    next(error);
  }
};

module.exports = authMiddleware;