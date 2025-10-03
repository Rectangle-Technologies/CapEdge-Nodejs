# CapEdge Backend API - Express.js + MongoDB Setup

CapEdge is a comprehensive stock trading portfolio management system built with Node.js, Express.js, and MongoDB.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access
- **Broker Management**: CRUD operations for managing brokers
- **Securities Management**: Manage stocks, options, futures, and other securities
- **User Account Management**: Individual investor account management  
- **Demat Account Management**: Link users to brokers with trading balances
- **Transaction Management**: Record buy/sell trades with FIFO matching
- **P&L Reporting**: Realized and unrealized profit/loss calculations
- **Holdings Management**: Current portfolio positions
- **Ledger Management**: Complete audit trail of financial transactions
- **Data Export**: CSV and Excel export capabilities

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Express Validator & Joi
- **Security**: bcrypt, helmet, CORS, rate limiting
- **Logging**: Winston
- **Testing**: Jest with Supertest (configured)

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Rectangle-Technologies/CapEdge-Nodejs.git
   cd CapEdge-Nodejs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit the .env file with your configuration
   # Make sure to set your MongoDB URI
   ```

4. **Configure Environment Variables**
   
   Edit the `.env` file with your settings:
   ```env
   # Server Configuration
   PORT=4000
   NODE_ENV=development

   # MongoDB Configuration  
   MONGODB_URI=mongodb://localhost:27017/capedge

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=24h

   # Security Configuration
   BCRYPT_SALT_ROUNDS=10
   ```

5. **Start MongoDB**
   
   Make sure MongoDB is running on your system:
   ```bash
   # On Windows (if MongoDB is installed as a service)
   net start MongoDB
   
   # On macOS/Linux
   mongod
   
   # Or using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

6. **Initialize Database with Seed Data**
   ```bash
   npm run seed
   ```
   
   This will create:
   - Default admin user (username: `admin`, password: `admin123`)
   - Sample stock exchanges (NSE, BSE, MCX, NCDEX)
   - Default financial year configuration

7. **Start the Server**
   ```bash
   # Development mode with nodemon
   npm run dev
   
   # Production mode
   npm start
   ```

   The server will start on `http://localhost:4000`

## API Documentation

### Base URL
- **Development**: `http://localhost:4000`
- **Production**: Configure as needed

### Authentication

All endpoints except `/auth/login` require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Getting Started - Quick Test

1. **Login to get JWT token**
   ```bash
   curl -X POST http://localhost:4000/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "username": "admin",
       "password": "admin123"
     }'
   ```

2. **Use the returned token for authenticated requests**
   ```bash
   curl -X GET http://localhost:4000/brokers \
     -H "Authorization: Bearer <your_jwt_token>"
   ```

### Available Endpoints

- **Authentication**
  - `POST /auth/login` - User login
  - `POST /auth/validate-token` - Validate JWT token

- **Brokers**
  - `GET /brokers` - List all brokers
  - `POST /brokers` - Create new broker
  - `PUT /brokers/:id` - Update broker
  - `DELETE /brokers/:id` - Delete broker

- **Stock Exchanges**
  - `GET /stock-exchanges` - List all stock exchanges
  - `POST /stock-exchanges` - Create new stock exchange
  - `PUT /stock-exchanges/:id` - Update stock exchange
  - `DELETE /stock-exchanges/:id` - Delete stock exchange

- **Securities** (placeholder)
  - `GET /securities` - List securities
  - `POST /securities` - Create security
  - `PUT /securities/:id` - Update security
  - `DELETE /securities/:id` - Delete security

- **User Accounts** (placeholder)
  - `GET /user-accounts` - List user accounts
  - `POST /user-accounts` - Create user account
  - `PUT /user-accounts/:id` - Update user account
  - `DELETE /user-accounts/:id` - Delete user account

- **Demat Accounts** (placeholder)
  - `GET /demat-accounts` - List demat accounts
  - `POST /demat-accounts` - Create demat account
  - `PUT /demat-accounts/:id` - Update demat account
  - `DELETE /demat-accounts/:id` - Delete demat account

- **Transactions** (placeholder)
  - `GET /transactions` - List transactions
  - `POST /transactions` - Create transaction
  - `PUT /transactions/:id` - Update transaction
  - `DELETE /transactions/:id` - Delete transaction

- **Reports** (placeholder)
  - `GET /reports/pnl` - P&L report
  - `GET /reports/holdings` - Holdings report
  - `GET /reports/pnl/export` - Export P&L to CSV/Excel
  - `GET /reports/holdings/export` - Export holdings to CSV/Excel

- **Ledger** (placeholder)
  - `GET /ledger` - Ledger entries
  - `GET /ledger/export` - Export ledger to CSV/Excel

- **Health Check**
  - `GET /health` - Server health status

## Project Structure

```
src/
├── config/         # Database configuration
├── controllers/    # Request handlers
├── middleware/     # Custom middleware (auth, error handling)
├── models/         # Mongoose schemas
├── routes/         # API routes
├── services/       # Business logic (to be implemented)
├── utils/          # Utility functions and helpers
└── server.js       # Main application file

tests/              # Test files (to be implemented)
logs/               # Application logs
.env                # Environment variables
.env.example        # Environment template
seed.js             # Database seeding script
```

## Database Schema

The application uses MongoDB with the following collections:
- `users` - Authentication users
- `brokers` - Brokerage firms
- `stockexchanges` - Trading venues
- `securities` - Tradable instruments
- `useraccounts` - Investor accounts
- `demataccounts` - User-broker account links
- `transactions` - Buy/sell trades
- `matchedrecords` - Realized P&L records
- `unmatchedrecords` - Current holdings
- `ledgerentries` - Financial audit trail
- `financialyears` - Tax rate configurations

## Development

### Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests (to be implemented)
npm run seed       # Seed database with sample data
```

### Adding New Features

1. Create/update Mongoose models in `src/models/`
2. Create controllers in `src/controllers/`
3. Define routes in `src/routes/`
4. Add business logic in `src/services/` (optional)
5. Update validation rules
6. Add tests in `tests/`

### Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- Rate limiting on login endpoint
- Input validation and sanitization
- CORS protection
- Security headers with helmet
- NoSQL injection prevention

## Deployment

1. **Environment Variables**: Set production environment variables
2. **Database**: Ensure MongoDB is accessible and secured
3. **SSL/TLS**: Configure HTTPS in production
4. **Process Management**: Use PM2 or similar for process management
5. **Monitoring**: Set up logging and monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Support

For support and questions, please create an issue in the GitHub repository.

## License

This project is licensed under the ISC License.