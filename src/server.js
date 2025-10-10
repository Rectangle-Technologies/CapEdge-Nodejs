const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('express-async-errors');
require('dotenv').config();

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');
const ApiResponse = require('./utils/response');

// Import Routes
const authRoutes = require('./routes/auth');
const brokerRoutes = require('./routes/brokers');
const securityRoutes = require('./routes/securities');
const userAccountRoutes = require('./routes/userAccounts');
const dematAccountRoutes = require('./routes/dematAccounts');
const transactionRoutes = require('./routes/transactions');
const reportRoutes = require('./routes/reports');
const ledgerRoutes = require('./routes/ledger');

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  handler: (req, res) => {
    return ApiResponse.error(res, 'Too many requests from this IP, please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
  }
});
// app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  process.env.NODE_ENV === 'development' &&
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  return ApiResponse.success(res, {
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }, 'Server is healthy');
});

// API Routes
app.use('/auth', authRoutes);

// Protected routes (require authentication)
app.use('/broker', authMiddleware, brokerRoutes);
app.use('/security', authMiddleware, securityRoutes);
app.use('/user-account', authMiddleware, userAccountRoutes);
app.use('/demat-account', authMiddleware, dematAccountRoutes);
app.use('/transaction', authMiddleware, transactionRoutes);
app.use('/report', authMiddleware, reportRoutes);
app.use('/ledger', authMiddleware, ledgerRoutes);

// 404 handler
app.use('*', (req, res) => {
  const error = new Error('Route not found');
  error.statusCode = 404;
  error.reasonCode = 'NOT_FOUND';
  throw error;
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

// Start server
const startServer = async () => {
  try {
    // Try to connect to MongoDB, but don't fail if it's not available
    try {
      await connectDB();
    } catch (dbError) {
      logger.warn('MongoDB connection failed, starting server without database:', dbError.message);
      logger.warn('Please start MongoDB and restart the server for full functionality');
    }
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
      logger.info('Health check available at /health');
      if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('localhost')) {
        logger.info('💡 To fully test the API, please start MongoDB and restart the server');
        logger.info('💡 MongoDB connection string: ' + (process.env.MONGODB_URI || 'mongodb://localhost:27017/capedge'));
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT. Graceful shutdown...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Graceful shutdown...');
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = app;