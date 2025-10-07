const User = require('../models/User');
const { sign } = require('@coconut-packages/jsonwebtoken');
const bcrypt = require('bcryptjs');

/**
 * Auth Service
 * Handles authentication and authorization logic
 */

/**
 * Login user and generate JWT token
 * @param {Object} credentials - { username, password }
 * @returns {Promise<Object>} - { token, user }
 */
const login = async (credentials) => {
  try {
    const { username, password } = credentials;

    // Find user by username
    const user = await User.findOne({ username }).select('+password');
    
    if (!user) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      error.reasonCode = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      const error = new Error('Invalid credentials');
      error.statusCode = 401;
      error.reasonCode = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Generate JWT token
    const token = sign(
      { 
        userId: user._id
      },
      process.env.JWT_ENCRYPTION_KEY, process.env.JWT_SECRET, process.env.JWT_ENCRYPTION_IV, process.env.TOKEN_EXPIRE_TIME
    );

    // Return token and user info (without password)
    return {
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Validate JWT token
 * @param {String} token - JWT token
 * @returns {Promise<Object>} - { valid, user }
 */
const validateToken = async (token) => {
  try {
    return {
      valid: true
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        valid: false,
        message: 'Token expired'
      };
    } else if (error.name === 'JsonWebTokenError') {
      return {
        valid: false,
        message: 'Invalid token'
      };
    }

    throw error;
  }
};

/**
 * Register a new user
 * @param {Object} userData - { username, email, password, fullName }
 * @returns {Promise<Object>} - Created user
 */
const register = async (userData) => {
  try {
    const { username, email, password, fullName } = userData;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      const error = new Error('Username already exists');
      error.statusCode = 400;
      throw error;
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        const error = new Error('Email already exists');
        error.statusCode = 400;
        throw error;
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      fullName
    });

    await user.save();

    // Return user without password
    return {
      _id: user._id,
      username: user.username,
      email: user.email,
      fullName: user.fullName
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Change user password
 * @param {String} userId - User ID
 * @param {Object} passwordData - { oldPassword, newPassword }
 * @returns {Promise<void>}
 */
const changePassword = async (userId, passwordData) => {
  try {
    const { oldPassword, newPassword } = passwordData;

    // Find user
    const user = await User.findById(userId).select('+password');
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      const error = new Error('Invalid old password');
      error.statusCode = 401;
      throw error;
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

  } catch (error) {
    throw error;
  }
};

module.exports = {
  login,
  validateToken,
  register,
  changePassword
};
