# CapEdge Backend Development - Comprehensive Requirements & Prompts

**Document Version:** 1.0  
**Date:** 2025-10-01  
**Author:** MadMaxINDIAN  
**Database:** MongoDB  
**Backend:** Node.js with Express.js

---

## Project Overview

**Project Name:** CapEdge - Stock Trading Portfolio Management System

**Technology Stack:**
- **Backend:** Node.js with Express.js
- **Database:** MongoDB (NoSQL)
- **ODM:** Mongoose
- **Authentication:** JWT (JSON Web Tokens)
- **Validation:** Joi or express-validator
- **Documentation:** Swagger/OpenAPI
- **Testing:** Jest with Supertest
- **Caching:** Redis (optional)
- **Environment:** Development and Production

---

## Table of Contents

1. [Functional Requirements](#functional-requirements)
2. [Non-Functional Requirements](#non-functional-requirements)
3. [MongoDB Schema Design](#mongodb-schema-design)
4. [System Architecture](#system-architecture)
5. [Detailed Flow Diagrams](#detailed-flow-diagrams)
6. [Implementation Prompts by Module](#implementation-prompts-by-module)
7. [Testing Requirements](#testing-requirements)
8. [Deployment & DevOps](#deployment--devops)

---

## Functional Requirements

### FR-1: Authentication & Authorization

**FR-1.1:** User Login
- System shall authenticate users with username and password
- System shall generate JWT token valid for 24 hours
- System shall return token in response body
- System shall hash passwords using bcrypt (salt rounds: 10)

**FR-1.2:** Token Validation
- System shall validate token expiration
- System shall verify token signature
- System shall extract user information from token
- System shall support token blacklisting for logout

**FR-1.3:** Authorization
- All endpoints except /auth/login shall require valid JWT token
- System shall validate user ownership of resources
- System shall return 401 for invalid/expired tokens

**MongoDB Implementation Notes:**
- Store users in `users` collection
- Index on `username` for fast lookups
- Store hashed passwords only

---

### FR-2: Broker Management

**FR-2.1:** Create Broker
- System shall validate broker name (min 2 characters)
- System shall validate PAN format: 5 letters + 4 digits + 1 letter (case-insensitive)
- System shall enforce unique PAN numbers using MongoDB unique index
- System shall validate address (min 10 characters)
- System shall auto-generate timestamps using Mongoose timestamps

**FR-2.2:** Retrieve Brokers
- System shall support name-based search using MongoDB regex queries
- System shall implement pagination using skip() and limit()
- System shall return results sorted by name
- System shall include creation and update timestamps

**FR-2.3:** Update Broker
- System shall validate broker ObjectId exists
- System shall enforce same validation rules as create
- System shall check PAN uniqueness excluding current broker
- System shall update timestamp automatically via Mongoose

**FR-2.4:** Delete Broker
- System shall check for dependent demat accounts using countDocuments()
- System shall reject deletion if accounts exist (HTTP 400)
- System shall perform cascade check before deletion
- System shall return appropriate error messages

**MongoDB Implementation Notes:**
- Collection: `brokers`
- Unique index on `panNumber`
- Text index on `name` for search
- Reference by ObjectId in other collections

---

### FR-3: Securities Management

**FR-3.1:** Create Security
- System shall validate security types: EQUITY, FUTURES, OPTIONS, COMMODITY, CURRENCY, BOND, ETF, MUTUAL_FUND
- System shall require strike price and expiry for OPTIONS and FUTURES
- System shall validate strike price: positive number, max 2 decimals
- System shall validate expiry date must be in future for derivatives
- System shall enforce null strike price and expiry for non-derivatives
- System shall validate stock exchange ObjectId exists

**FR-3.2:** Retrieve Securities
- System shall support name-based search using regex
- System shall support filtering by type using MongoDB queries
- System shall support filtering by exchange ObjectId
- System shall populate stock exchange details using Mongoose populate()
- System shall implement pagination

**FR-3.3:** Update Security
- System shall apply same validation as create
- System shall allow type changes with appropriate field updates
- System shall update timestamps automatically

**FR-3.4:** Delete Security
- System shall check for dependent transactions using countDocuments()
- System shall reject deletion if transactions exist (HTTP 400)

**MongoDB Implementation Notes:**
- Collection: `securities`
- Reference to `stockExchangeId` (ObjectId)
- Indexes on: `type`, `name` (text), `stockExchangeId`
- Use subdocuments for derivative-specific fields

---

### FR-4: User Account Management

**FR-4.1:** Create User Account
- System shall validate user name (min 2 characters)
- System shall validate PAN format
- System shall enforce unique PAN numbers using unique index
- System shall validate address (min 10 characters)
- System shall initialize empty demat accounts array reference

**FR-4.2:** Retrieve User Accounts
- System shall support name-based search using regex
- System shall optionally populate nested demat accounts using $lookup aggregation
- System shall aggregate with demat accounts and brokers
- System shall implement pagination using aggregation pipeline

**FR-4.3:** Update User Account
- System shall apply same validation as create
- System shall check PAN uniqueness excluding current user

**FR-4.4:** Delete User Account
- System shall check for dependent demat accounts
- System shall check for dependent transactions through demat accounts
- System shall reject deletion if dependencies exist

**MongoDB Implementation Notes:**
- Collection: `userAccounts`
- Unique index on `panNumber`
- Text index on `name`
- Use aggregation pipeline for complex queries with relationships

---

### FR-5: Demat Account Management

**FR-5.1:** Create Demat Account
- System shall validate user account ObjectId exists
- System shall validate broker ObjectId exists
- System shall validate balance is non-negative with max 2 decimals
- System shall optionally enforce unique user-broker combination using compound index
- System shall return account with populated user and broker details

**FR-5.2:** Retrieve Demat Accounts
- System shall support filtering by user account ObjectId
- System shall support filtering by broker ObjectId
- System shall populate users and brokers using .populate()
- System shall implement pagination

**FR-5.3:** Update Demat Account
- System shall apply same validation as create
- System shall allow balance updates

**FR-5.4:** Delete Demat Account
- System shall check for dependent transactions
- System shall reject deletion if transactions exist

**MongoDB Implementation Notes:**
- Collection: `dematAccounts`
- References: `userAccountId` (ObjectId), `brokerId` (ObjectId)
- Compound index on `[userAccountId, brokerId]` for uniqueness (optional)
- Index on individual reference fields

---

### FR-6: Transaction Management (CRITICAL - Complex Business Logic)

**FR-6.1:** Create Transaction
- System shall validate all required fields
- System shall validate security ObjectId exists
- System shall validate demat account ObjectId exists
- System shall validate quantity is positive integer
- System shall validate price is positive with max 2 decimals
- System shall validate date is not in future
- System shall validate transaction type: BUY or SELL
- System shall validate delivery type: Delivery or Intraday

**FR-6.2:** Transaction Processing Logic - BUY
- System shall calculate transaction value: quantity × price
- System shall create ledger entry document with negative amount (debit)
- System shall update demat account balance using $inc operator
- If delivery type is "Delivery":
  - System shall create unmatched record document (holding)
  - System shall store: buyDate, quantity, price, securityId, buyTransactionId
- If delivery type is "Intraday":
  - System shall not create unmatched record
  - System shall expect corresponding SELL transaction same day

**FR-6.3:** Transaction Processing Logic - SELL
- System shall validate sufficient holdings exist for delivery transactions
- System shall query unmatched records collection for the security
- System shall calculate transaction value: quantity × price
- System shall create ledger entry document with positive amount (credit)
- System shall update demat account balance using $inc operator
- If delivery type is "Delivery":
  - System shall implement FIFO matching:
    1. Query unmatched records sorted by buyDate ascending
    2. Match sell quantity with buy quantities
    3. For each match:
       - Calculate holding period in days
       - Determine capital gain type (STCG/LTCG)
       - Calculate P&L: (sellPrice - buyPrice) × matchedQuantity
       - Create matched record document
       - Update or delete unmatched record document
    4. Handle partial matches appropriately

**FR-6.4:** Retrieve Transactions
- System shall support multiple filters in MongoDB query
- System shall populate securities, demat accounts, brokers, stock exchanges
- System shall implement pagination using skip() and limit()
- System shall sort by date descending

**FR-6.5:** Update Transaction
- System shall validate transaction ObjectId exists
- System shall check if transaction is referenced in matched records
- System shall unwind and recalculate matches if applicable
- System shall update corresponding ledger entries
- System shall recalculate demat account balance
- System shall maintain data consistency using MongoDB transactions

**FR-6.6:** Delete Transaction
- System shall check if referenced in matched records
- System shall optionally reject deletion if matched (safer approach)
- System shall delete corresponding ledger entry document
- System shall update/delete unmatched record documents
- System shall recalculate demat account balance
- System shall use MongoDB multi-document transactions

**MongoDB Implementation Notes:**
- Collection: `transactions`
- References: `securityId`, `dematAccountId` (ObjectIds)
- Indexes on: `date`, `type`, `securityId`, `dematAccountId`, `deliveryType`
- Use MongoDB sessions for multi-document transactions (ACID compliance)
- Store transaction IDs as ObjectIds or custom string IDs

---

### FR-7: P&L Report Generation

**FR-7.1:** Retrieve P&L Records
- System shall fetch matched records with filters using MongoDB aggregation
- System shall use $lookup to join with transactions and securities
- System shall calculate summary statistics using aggregation pipeline:
  - $match for filtering
  - $group for aggregations
  - $project for calculated fields
- System shall implement pagination in aggregation pipeline
- System shall support filtering by date range, capital gain type, demat account

**FR-7.2:** Export P&L Report
- System shall support CSV and Excel formats
- System shall fetch data using aggregation pipeline
- System shall stream results for large datasets
- System shall include summary section
- System shall set appropriate headers

**MongoDB Implementation Notes:**
- Collection: `matchedRecords`
- Aggregation pipeline example:
  ```javascript
  [
    { $match: { sellDate: { $gte: startDate, $lte: endDate } } },
    { $lookup: { from: 'securities', localField: 'securityId', foreignField: '_id', as: 'security' } },
    { $lookup: { from: 'transactions', localField: 'buyTransactionId', foreignField: '_id', as: 'buyTransaction' } },
    { $lookup: { from: 'transactions', localField: 'sellTransactionId', foreignField: '_id', as: 'sellTransaction' } },
    { $group: { _id: null, totalProfit: { $sum: { $cond: [{ $gt: ['$profitAndLoss', 0] }, '$profitAndLoss', 0] } } } }
  ]
  ```

---

### FR-8: Holdings Report Generation

**FR-8.1:** Retrieve Holdings
- System shall fetch unmatched records (current holdings)
- System shall populate securities and demat accounts using $lookup
- System shall calculate for each holding using aggregation:
  - Total investment: quantity × buyPrice
  - Current value: quantity × currentPrice
  - Unrealized P&L: currentValue - totalInvestment
  - P&L percentage: (unrealizedPnL / totalInvestment) × 100
- System shall group by security using $group if multiple purchases
- System shall calculate portfolio summary using aggregation
- System shall implement pagination

**FR-8.2:** Export Holdings Report
- System shall support CSV and Excel formats
- System shall include calculated fields from aggregation
- System shall include summary section

**MongoDB Implementation Notes:**
- Collection: `unmatchedRecords`
- Use aggregation pipeline for calculations
- Example:
  ```javascript
  [
    { $lookup: { from: 'securities', localField: 'securityId', foreignField: '_id', as: 'security' } },
    { $addFields: {
        totalInvestment: { $multiply: ['$quantity', '$price'] },
        currentValue: { $multiply: ['$quantity', '$security.currentPrice'] }
      }
    },
    { $addFields: {
        unrealizedPnL: { $subtract: ['$currentValue', '$totalInvestment'] },
        pnlPercentage: { $multiply: [{ $divide: [{ $subtract: ['$currentValue', '$totalInvestment'] }, '$totalInvestment'] }, 100] }
      }
    }
  ]
  ```

---

### FR-9: Ledger Management

**FR-9.1:** Retrieve Ledger Entries
- System shall fetch ledger entries with filters
- System shall use $lookup to join with demat accounts, users, brokers, transactions, securities
- System shall calculate running balance using aggregation $accumulator or application logic
- System shall calculate summary using aggregation $group
- System shall support filtering by date range, demat account, transaction type
- System shall implement pagination
- System shall sort by date descending

**FR-9.2:** Export Ledger
- System shall support CSV and Excel formats
- System shall include running balance column
- System shall include summary section

**MongoDB Implementation Notes:**
- Collection: `ledgerEntries`
- References: `dematAccountId`, `tradeTransactionId` (ObjectIds)
- Indexes on: `date`, `dematAccountId`
- Running balance calculation may need application-level logic or window functions (MongoDB 5.0+)

---

### FR-10: Financial Year Configuration

**FR-10.1:** Create Financial Year
- System shall validate title format
- System shall validate start date is before last date
- System shall check for date range overlaps using MongoDB query
- System shall validate tax rates: 0-100 (percentage)
- System shall store rates as decimal values

**FR-10.2:** Retrieve Financial Years
- System shall fetch all documents sorted by start date descending
- System shall return complete configurations

**MongoDB Implementation Notes:**
- Collection: `financialYears`
- Indexes on: `startDate`, `lastDate`
- Validation for non-overlapping date ranges

---

### FR-11: Data Export (Common)

**FR-11.1:** CSV Export
- System shall generate comma-separated values
- System shall include headers in first row
- System shall handle special characters
- System shall escape values appropriately
- System shall use UTF-8 encoding
- System shall stream data for large exports

**FR-11.2:** Excel Export
- System shall generate .xlsx format using libraries like exceljs
- System shall apply formatting
- System shall auto-size columns
- System shall add filters to header row
- System shall create multiple sheets if needed

---

## Non-Functional Requirements

### NFR-1: Performance

**NFR-1.1:** Response Time
- API endpoints shall respond within 200ms for simple queries (95th percentile)
- API endpoints shall respond within 1000ms for complex aggregations (95th percentile)
- Report generation shall complete within 5 seconds for datasets up to 10,000 records
- Use MongoDB aggregation pipeline for complex queries
- Use streaming for export operations

**NFR-1.2:** Throughput
- System shall handle 100 concurrent users
- System shall process 1000 requests per minute
- MongoDB connection pool shall be configured: min 5, max 20 connections

**NFR-1.3:** Database Optimization
- System shall implement indexes on:
  - All reference fields (ObjectIds)
  - Frequently queried fields (date, type, capitalGainType)
  - Text indexes on name fields for search
  - Compound indexes for common query patterns
- System shall use query result caching with Redis (TTL: 1 hour) for reference data
- System shall use MongoDB aggregation pipelines for complex queries
- System shall enable MongoDB profiling for slow queries (>500ms)
- System shall use projection to limit returned fields
- System shall avoid $lookup on large collections when possible

---

### NFR-2: Security

**NFR-2.1:** Authentication Security
- System shall hash passwords using bcrypt (salt rounds: 10)
- System shall generate JWT tokens with HS256 algorithm
- System shall store JWT secret in environment variables
- System shall implement token expiration (24 hours)
- System shall implement rate limiting on /auth/login: 5 attempts per minute per IP

**NFR-2.2:** Authorization Security
- System shall validate JWT token on all protected routes
- System shall verify user ownership of resources before modifications
- System shall use MongoDB field-level authorization if needed
- System shall return generic error messages for security

**NFR-2.3:** Input Security
- System shall sanitize all inputs to prevent NoSQL injection
- System shall validate all inputs against Joi/validator schemas
- System shall use parameterized queries through Mongoose
- System shall implement CORS with whitelist
- System shall set security headers using helmet.js
- **MongoDB-specific:** Avoid dynamic query construction from user input
- **MongoDB-specific:** Use Mongoose schema validation

**NFR-2.4:** Data Security
- System shall store sensitive data encrypted at rest (MongoDB encryption at rest)
- System shall use HTTPS/TLS in production
- System shall implement NoSQL injection prevention
- System shall implement XSS prevention
- System shall log security events
- **MongoDB-specific:** Use MongoDB authentication (SCRAM-SHA-256)
- **MongoDB-specific:** Enable MongoDB audit logging

---

### NFR-3: Reliability

**NFR-3.1:** Error Handling
- System shall implement global error handler
- System shall return consistent error response format
- System shall log all errors with stack traces
- System shall use try-catch blocks for async operations
- System shall validate inputs before processing

**NFR-3.2:** Data Integrity
- System shall use MongoDB multi-document transactions for multi-step operations (requires replica set)
- System shall implement schema validation using Mongoose schemas
- System shall validate reference integrity before deletions
- System shall implement rollback on transaction failures using MongoDB sessions
- System shall maintain audit trail for critical operations

**NFR-3.3:** Availability
- System shall target 99.5% uptime
- System shall implement health check endpoint: GET /health
- System shall implement graceful shutdown
- System shall handle MongoDB connection failures with retry logic
- System shall use MongoDB replica sets for high availability

**MongoDB Implementation Notes:**
- Multi-document transactions require MongoDB 4.0+ with replica set
- Use sessions for transaction support:
  ```javascript
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // operations
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
  } finally {
    session.endSession();
  }
  ```

---

### NFR-4: Maintainability

**NFR-4.1:** Code Quality
- System shall follow consistent code style (ESLint + Prettier)
- System shall implement modular architecture (controllers, services, models, routes)
- System shall use meaningful variable and function names
- System shall include JSDoc comments for functions
- System shall maintain code coverage >80%

**NFR-4.2:** Documentation
- System shall generate API documentation using Swagger/OpenAPI
- System shall include README with setup instructions
- System shall document environment variables
- System shall document MongoDB schema designs
- System shall include example requests/responses

**NFR-4.3:** Version Control
- System shall use Git for version control
- System shall follow conventional commits
- System shall use feature branches
- System shall require code reviews for main branch

---

### NFR-5: Scalability

**NFR-5.1:** Horizontal Scaling
- System shall be stateless (no session storage in memory)
- System shall use external session store if needed (Redis)
- System shall support multiple instances behind load balancer
- MongoDB shall use sharding for horizontal scaling (if needed)

**NFR-5.2:** Database Scaling
- System shall implement MongoDB indexing strategy
- System shall support connection pooling
- System shall implement query optimization
- System shall support MongoDB read replicas for read scaling
- System shall use MongoDB sharding for write scaling (if volume exceeds single server capacity)

---

### NFR-6: Monitoring & Logging

**NFR-6.1:** Logging
- System shall log all API requests: method, path, status, duration
- System shall log all errors with stack traces
- System shall log security events: failed logins, unauthorized access
- System shall use structured logging (JSON format) using Winston
- System shall implement log levels: error, warn, info, debug
- System shall log slow MongoDB queries

**NFR-6.2:** Monitoring
- System shall expose metrics endpoint for monitoring tools
- System shall track: request count, error rate, response time
- System shall implement health check endpoint
- System shall monitor MongoDB performance metrics
- System shall use MongoDB Atlas monitoring or similar tools

---

### NFR-7: Usability

**NFR-7.1:** API Design
- System shall follow RESTful conventions
- System shall return appropriate HTTP status codes
- System shall return consistent response format
- System shall include helpful error messages
- System shall support pagination for list endpoints

**NFR-7.2:** Developer Experience
- System shall provide clear API documentation
- System shall include example requests
- System shall provide Postman collection
- System shall include sample environment file

---

## MongoDB Schema Design

### Collections Overview

```
Collections:
1. users (authentication)
2. brokers
3. securities
4. stockExchanges
5. userAccounts
6. dematAccounts
7. transactions
8. matchedRecords
9. unmatchedRecords
10. ledgerEntries
11. financialYears
```

---

### 1. Users Collection

```javascript
{
  _id: ObjectId,
  username: String (required, unique, indexed),
  password: String (required, hashed),
  email: String (optional, unique if provided),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true, sparse: true });
```

---

### 2. Brokers Collection

```javascript
{
  _id: ObjectId,
  name: String (required, min: 2),
  panNumber: String (required, unique, format: ABCDE1234F),
  address: String (required, min: 10),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.brokers.createIndex({ panNumber: 1 }, { unique: true });
db.brokers.createIndex({ name: "text" }); // Text search
```

---

### 3. Stock Exchanges Collection

```javascript
{
  _id: ObjectId,
  name: String (required),
  code: String (required, unique, e.g., "NSE", "BSE"),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.stockExchanges.createIndex({ code: 1 }, { unique: true });
```

---

### 4. Securities Collection

```javascript
{
  _id: ObjectId,
  name: String (required, min: 2),
  type: String (required, enum: [
    'EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 
    'CURRENCY', 'BOND', 'ETF', 'MUTUAL_FUND'
  ]),
  strikePrice: Number (nullable, required for OPTIONS/FUTURES),
  expiry: Date (nullable, required for OPTIONS/FUTURES),
  stockExchangeId: ObjectId (required, ref: 'StockExchange'),
  currentPrice: Number (optional, for holdings calculation),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.securities.createIndex({ name: "text" });
db.securities.createIndex({ type: 1 });
db.securities.createIndex({ stockExchangeId: 1 });
db.securities.createIndex({ expiry: 1 }); // For derivative filtering
```

---

### 5. User Accounts Collection

```javascript
{
  _id: ObjectId,
  name: String (required, min: 2),
  panNumber: String (required, unique, format: ABCDE1234F),
  address: String (required, min: 10),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.userAccounts.createIndex({ panNumber: 1 }, { unique: true });
db.userAccounts.createIndex({ name: "text" });
```

---

### 6. Demat Accounts Collection

```javascript
{
  _id: ObjectId,
  userAccountId: ObjectId (required, ref: 'UserAccount'),
  brokerId: ObjectId (required, ref: 'Broker'),
  balance: Number (required, min: 0, default: 0),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.dematAccounts.createIndex({ userAccountId: 1 });
db.dematAccounts.createIndex({ brokerId: 1 });
db.dematAccounts.createIndex(
  { userAccountId: 1, brokerId: 1 }, 
  { unique: true } // Optional: one demat account per user-broker
);
```

---

### 7. Transactions Collection

```javascript
{
  _id: ObjectId (or custom String ID like "TXN001"),
  date: Date (required),
  type: String (required, enum: ['BUY', 'SELL']),
  quantity: Number (required, min: 1, integer),
  price: Number (required, min: 0),
  securityId: ObjectId (required, ref: 'Security'),
  deliveryType: String (required, enum: ['Delivery', 'Intraday']),
  referenceNumber: String (optional),
  dematAccountId: ObjectId (required, ref: 'DematAccount'),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.transactions.createIndex({ date: -1 }); // Descending for recent first
db.transactions.createIndex({ type: 1 });
db.transactions.createIndex({ securityId: 1 });
db.transactions.createIndex({ dematAccountId: 1 });
db.transactions.createIndex({ deliveryType: 1 });
db.transactions.createIndex({ date: 1, type: 1, securityId: 1 }); // Compound
```

---

### 8. Matched Records Collection

```javascript
{
  _id: ObjectId,
  buyDate: Date (required),
  sellDate: Date (required),
  securityId: ObjectId (required, ref: 'Security'),
  quantity: Number (required, min: 1),
  buyTransactionId: ObjectId (required, ref: 'Transaction'),
  sellTransactionId: ObjectId (required, ref: 'Transaction'),
  capitalGainType: String (required, enum: ['STCG', 'LTCG']),
  profitAndLoss: Number (required), // Can be negative
  deliveryType: String (required),
  dematAccountId: ObjectId (required, ref: 'DematAccount'), // For filtering
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.matchedRecords.createIndex({ sellDate: -1 });
db.matchedRecords.createIndex({ buyDate: 1 });
db.matchedRecords.createIndex({ capitalGainType: 1 });
db.matchedRecords.createIndex({ securityId: 1 });
db.matchedRecords.createIndex({ dematAccountId: 1 });
db.matchedRecords.createIndex({ buyTransactionId: 1 });
db.matchedRecords.createIndex({ sellTransactionId: 1 });
db.matchedRecords.createIndex({ sellDate: 1, capitalGainType: 1 }); // Compound
```

---

### 9. Unmatched Records Collection (Current Holdings)

```javascript
{
  _id: ObjectId,
  buyDate: Date (required),
  quantity: Number (required, min: 1),
  price: Number (required), // Buy price
  securityId: ObjectId (required, ref: 'Security'),
  buyTransactionId: ObjectId (required, ref: 'Transaction'),
  dematAccountId: ObjectId (required, ref: 'DematAccount'), // For filtering
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.unmatchedRecords.createIndex({ buyDate: 1 }); // For FIFO sorting
db.unmatchedRecords.createIndex({ securityId: 1 });
db.unmatchedRecords.createIndex({ dematAccountId: 1 });
db.unmatchedRecords.createIndex({ buyTransactionId: 1 });
db.unmatchedRecords.createIndex({ securityId: 1, buyDate: 1 }); // Compound for FIFO
```

---

### 10. Ledger Entries Collection

```javascript
{
  _id: ObjectId,
  dematAccountId: ObjectId (required, ref: 'DematAccount'),
  tradeTransactionId: ObjectId (required, ref: 'Transaction'),
  transactionAmount: Number (required), // Negative for debit, positive for credit
  date: Date (required),
  remarks: String (optional),
  createdAt: Date (auto)
}

// Indexes
db.ledgerEntries.createIndex({ dematAccountId: 1, date: -1 }); // Compound
db.ledgerEntries.createIndex({ date: -1 });
db.ledgerEntries.createIndex({ tradeTransactionId: 1 });
```

---

### 11. Financial Years Collection

```javascript
{
  _id: ObjectId,
  title: String (required, e.g., "FY 2024-25"),
  startDate: Date (required),
  lastDate: Date (required),
  stcgRate: Number (required, min: 0, max: 100), // Percentage
  ltcgRate: Number (required, min: 0, max: 100), // Percentage
  createdAt: Date (auto),
  updatedAt: Date (auto)
}

// Indexes
db.financialYears.createIndex({ startDate: -1 });
db.financialYears.createIndex({ startDate: 1, lastDate: 1 }); // For overlap checks
```

---

### Mongoose Schema Example (Transaction)

```javascript
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['BUY', 'SELL'],
    index: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer'
    }
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(value) {
        return /^\d+(\.\d{1,2})?$/.test(value.toString());
      },
      message: 'Price must have maximum 2 decimal places'
    }
  },
  securityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Security',
    required: true,
    index: true
  },
  deliveryType: {
    type: String,
    required: true,
    enum: ['Delivery', 'Intraday'],
    index: true
  },
  referenceNumber: {
    type: String,
    required: false
  },
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: true,
    index: true
  }
}, {
  timestamps: true // Auto-creates createdAt and updatedAt
});

// Compound indexes
transactionSchema.index({ date: 1, type: 1, securityId: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
```

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  (Web App, Mobile App, Postman, External Integrations)      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTPS/REST
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     API GATEWAY LAYER                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CORS, Rate Limiting, Security Headers (Helmet)     │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  AUTHENTICATION MIDDLEWARE                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  JWT Validation, Token Verification, User Context   │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                      ROUTING LAYER                           │
│  ┌──────────┬──────────┬──────────┬────────────────────┐   │
│  │  Auth    │ Brokers  │Securities│  Transactions      │   │
│  │  Routes  │ Routes   │ Routes   │  Routes            │   │
│  └──────────┴──────────┴──────────┴────────────────────┘   │
│  ┌──────────┬──────────┬──────────┬────────────────────┐   │
│  │  Users   │  Demat   │ Reports  │  Ledger            │   │
│  │  Routes  │ Routes   │ Routes   │  Routes            │   │
│  └──────────┴──────────┴──────────┴────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    CONTROLLER LAYER                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Request Validation, Input Sanitization             │   │
│  │  Response Formatting, Error Handling                │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     SERVICE LAYER                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Business Logic Implementation                       │  │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐  │  │
│  │  │ Broker   │Security  │Transaction│  FIFO        │  │  │
│  │  │ Service  │Service   │Service    │  Matching    │  │  │
│  │  └──────────┴──────────┴──────────┴──────────────┘  │  │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐  │  │
│  │  │ User     │  Demat   │  Report  │  Ledger      │  │  │
│  │  │ Service  │ Service  │  Service │  Service     │  │  │
│  │  └──────────┴──────────┴──────────┴──────────────┘  │  │
│  │  ┌──────────┬──────────────────────────────────────┐│  │
│  │  │ Export   │  Capital Gain Calculation Service    ││  │
│  │  │ Service  │                                       ││  │
│  │  └──────────┴──────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    REPOSITORY LAYER                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Database Operations (CRUD)                         │   │
│  │  Query Building, Pagination, Filtering              │   │
│  │  Aggregation Pipeline Construction                  │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                       ODM LAYER                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Mongoose                                           │   │
│  │  Model Definitions, Schema Validation, Hooks       │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    DATABASE LAYER                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MongoDB (NoSQL Document Database)                  │   │
│  │  Connection Pool, Multi-doc Transactions, Indexes   │   │
│  │  Aggregation Pipeline, Replica Set (optional)       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   CROSS-CUTTING CONCERNS                     │
│  ┌──────────┬──────────┬──────────┬──────────────────┐     │
│  │ Logging  │  Error   │ Caching  │  Validation      │     │
│  │ (Winston)│ Handling │ (Redis)  │  (Joi/Mongoose)  │     │
│  └──────────┴──────────┴──────────┴──────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

### MongoDB-Specific Architecture Notes

1. **Connection Management:**
   - Use Mongoose connection pooling
   - Configure min/max pool size
   - Handle connection errors and reconnection logic

2. **Data Modeling Strategy:**
   - Use references (normalization) for related entities
   - Use embedded documents for tightly coupled data
   - Use aggregation pipeline for complex queries with joins

3. **Transaction Support:**
   - Requires MongoDB 4.0+ with replica set
   - Use sessions for multi-document ACID transactions
   - Transaction example in transaction creation and FIFO matching

4. **Indexing Strategy:**
   - Create indexes on frequently queried fields
   - Use compound indexes for common query patterns
   - Monitor index usage with explain()

5. **Aggregation Pipeline:**
   - Use for complex reports (P&L, Holdings, Ledger)
   - Pipeline stages: $match, $lookup, $group, $project, $sort, $limit, $skip
   - Optimize pipeline order (filter early with $match)

---

### Folder Structure

```
capedge-backend/
├── src/
│   ├── config/
│   │   ├── database.js           # MongoDB connection config
│   │   ├── jwt.js                # JWT configuration
│   │   └── constants.js          # Application constants
│   │
│   ├── models/                   # Mongoose models
│   │   ├── index.js
│   │   ├── User.js              # Auth user
│   │   ├── Broker.js
│   │   ├── Security.js
│   │   ├── StockExchange.js
│   │   ├── UserAccount.js
│   │   ├── DematAccount.js
│   │   ├── Transaction.js
│   │   ├── MatchedRecord.js
│   │   ├── UnmatchedRecord.js
│   │   ├── LedgerEntry.js
│   │   └── FinancialYear.js
│   │
│   ├── repositories/             # Database operations
│   │   ├── brokerRepository.js
│   │   ├── securityRepository.js
│   │   ├── transactionRepository.js
│   │   ├── matchedRecordRepository.js
│   │   ├── unmatchedRecordRepository.js
│   │   ├── ledgerRepository.js
│   │   └── ...
│   │
│   ├── services/                 # Business logic
│   │   ├── authService.js
│   │   ├── brokerService.js
│   │   ├── securityService.js
│   │   ├── transactionService.js
│   │   ├── fifoMatchingService.js
│   │   ├── capitalGainService.js
│   │   ├── reportService.js
│   │   ├── ledgerService.js
│   │   ├── exportService.js
│   │   └── ...
│   │
│   ├── controllers/              # Request handlers
│   │   ├── authController.js
│   │   ├── brokerController.js
│   │   ├── securityController.js
│   │   ├── transactionController.js
│   │   ├── reportController.js
│   │   ├── ledgerController.js
│   │   └── ...
│   │
│   ├── routes/                   # API routes
│   │   ├── index.js             # Main router
│   │   ├── authRoutes.js
│   │   ├── brokerRoutes.js
│   │   ├── securityRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── reportRoutes.js
│   │   ├── ledgerRoutes.js
│   │   └── ...
│   │
│   ├── middlewares/              # Express middlewares
│   │   ├── authMiddleware.js    # JWT validation
│   │   ├── errorMiddleware.js   # Error handling
│   │   ├── validationMiddleware.js
│   │   ├── rateLimitMiddleware.js
│   │   └── loggerMiddleware.js
│   │
│   ├── validators/               # Input validation schemas
│   │   ├── authValidator.js
│   │   ├── brokerValidator.js
│   │   ├── securityValidator.js
│   │   ├── transactionValidator.js
│   │   └── ...
│   │
│   ├── utils/                    # Utility functions
│   │   ├── responseFormatter.js
│   │   ├── dateHelper.js
│   │   ├── panValidator.js
│   │   ├── csvExporter.js
│   │   ├── excelExporter.js
│   │   ├── mongooseHelper.js    # MongoDB-specific helpers
│   │   └── logger.js
│   │
│   ├── seeders/                  # Database seeders
│   │   ├── stockExchangeSeeder.js
│   │   ├── financialYearSeeder.js
│   │   └── ...
│   │
│   └── app.js                    # Express app setup
│
├── tests/                        # Test files
│   ├── unit/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   └── api/
│   └── fixtures/
│
├── docs/                         # Documentation
│   ├── api/
│   │   └── swagger.yaml
│   └── database/
│       └── schema.md
│
├── .env.example                  # Example environment variables
├── .env                          # Environment variables (gitignored)
├── .gitignore
├── .eslintrc.js                  # ESLint configuration
├── .prettierrc                   # Prettier configuration
├── package.json
├── README.md
└── server.js                     # Entry point
```

---

## Detailed Flow Diagrams

### Flow 1: User Authentication Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ POST /auth/login
     │ { username, password }
     ▼
┌────────────────────────────────────┐
│   Authentication Controller        │
│                                    │
│  1. Validate request body          │
│  2. Check required fields          │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│     Authentication Service         │
│                                    │
│  1. Query MongoDB users collection │
│     User.findOne({ username })     │
│  2. Check if user exists           │
│     ├─ Not found → Return 401      │
│     └─ Found → Continue            │
│                                    │
│  3. Compare password hash          │
│     (bcrypt.compare)               │
│     ├─ Mismatch → Return 401       │
│     └─ Match → Continue            │
│                                    │
│  4. Generate JWT token             │
│     - Payload: { userId, username }│
│     - Expiry: 24 hours             │
│     - Algorithm: HS256             │
│                                    │
│  5. Return token                   │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│     Response to Client             │
│                                    │
│  Success (200):                    │
│  {                                 │
│    "success": true,                │
│    "data": {                       │
│      "token": "eyJhbG..."          │
│    },                              │
│    "message": "Login successful"   │
│  }                                 │
│                                    │
│  Failure (401):                    │
│  {                                 │
│    "success": false,               │
│    "message": "Invalid credentials"│
│  }                                 │
└────────────────────────────────────┘
```

---

### Flow 2: Create Transaction Flow (BUY - Delivery) with MongoDB

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ POST /transactions
     │ Authorization: Bearer <token>
     │ {
     │   "date": "2024-09-15",
     │   "type": "BUY",
     │   "quantity": 100,
     │   "price": 2450.50,
     │   "securityId": "60d5f...",
     │   "deliveryType": "Delivery",
     │   "dematAccountId": "60d5e..."
     │ }
     ▼
┌────────────────────────────────────┐
│   Auth Middleware                  │
│  1. Extract JWT from header        │
│  2. Verify token                   │
│  3. Extract user context           │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Transaction Controller           │
│  1. Validate request body (Joi)    │
│  2. Check required fields          │
│  3. Validate field formats         │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Transaction Service              │
│                                    │
│  VALIDATION PHASE:                 │
│  1. Validate security exists       │
│     Security.findById(securityId)  │
│  2. Validate demat account exists  │
│     DematAccount.findById(...)     │
│  3. Validate user owns demat acc   │
│  4. Validate date not in future    │
│  5. Validate quantity > 0          │
│  6. Validate price > 0             │
│                                    │
│  CALCULATION PHASE:                │
│  7. Calculate transaction value    │
│     transactionValue = qty × price │
│     = 100 × 2450.50 = 245,050      │
│                                    │
│  8. Check demat account balance    │
│     currentBalance = 1,000,000     │
│     requiredBalance = 245,050      │
│     if currentBalance < required   │
│       → Return error 400           │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   MongoDB Session Transaction Begins│
│   const session =                  │
│     await mongoose.startSession(); │
│   session.startTransaction();      │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 1: Create Transaction Doc   │
│                                    │
│   const transaction = new Transaction({│
│     date: new Date("2024-09-15"),  │
│     type: "BUY",                   │
│     quantity: 100,                 │
│     price: 2450.50,                │
│     securityId: ObjectId("60d5f..."),│
│     deliveryType: "Delivery",      │
│     dematAccountId: ObjectId("60d5e...")│
│   });                              │
│   await transaction.save({ session });│
│                                    │
│   Generated _id: ObjectId("60d6...")│
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 2: Create Ledger Entry Doc  │
│                                    │
│   const ledgerEntry = new LedgerEntry({│
│     dematAccountId: ObjectId("60d5e..."),│
│     tradeTransactionId: transaction._id,│
│     transactionAmount: -245050.00, │
│     date: new Date("2024-09-15"),  │
│     remarks: "Purchase of equity"  │
│   });                              │
│   await ledgerEntry.save({ session });│
│                                    │
│   Note: Negative amount = Debit    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 3: Update Demat Balance     │
│   (Using MongoDB $inc operator)    │
│                                    │
│   await DematAccount.findByIdAndUpdate(│
│     dematAccountId,                │
│     { $inc: { balance: -245050 } },│
│     { session }                    │
│   );                               │
│                                    │
│   Old balance: 1,000,000           │
│   New balance: 754,950             │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 4: Create Unmatched Record  │
│   (For Delivery transactions only) │
│                                    │
│   const unmatchedRecord =          │
│     new UnmatchedRecord({          │
│       buyDate: new Date("2024-09-15"),│
│       quantity: 100,               │
│       price: 2450.50,              │
│       securityId: ObjectId("60d5f..."),│
│       buyTransactionId: transaction._id,│
│       dematAccountId: ObjectId("60d5e...")│
│     });                            │
│   await unmatchedRecord.save({ session });│
│                                    │
│   This represents current holding  │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   MongoDB Session Commits          │
│   await session.commitTransaction();│
│   session.endSession();            │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Response to Client               │
│                                    │
│   Success (201):                   │
│   {                                │
│     "success": true,               │
│     "data": {                      │
│       "_id": "60d6...",            │
│       "date": "2024-09-15",        │
│       "type": "BUY",               │
│       "quantity": 100,             │
│       "price": 2450.50,            │
│       "securityId": "60d5f...",    │
│       "deliveryType": "Delivery",  │
│       "dematAccountId": "60d5e...",│
│       "createdAt": "...",          │
│       "updatedAt": "..."           │
│     },                             │
│     "message": "Transaction        │
│                 created"           │
│   }                                │
└────────────────────────────────────┘

ERROR HANDLING:
- If any step fails → Rollback transaction
  await session.abortTransaction();
  session.endSession();
- Return appropriate error message
- Restore original state (automatic with rollback)
```

---

### Flow 3: Create Transaction Flow (SELL - Delivery with FIFO Matching) - MongoDB

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ POST /transactions
     │ {
     │   "date": "2024-12-01",
     │   "type": "SELL",
     │   "quantity": 150,
     │   "price": 2890.75,
     │   "securityId": "60d5f...",
     │   "deliveryType": "Delivery",
     │   "dematAccountId": "60d5e..."
     │ }
     ▼
┌────────────────────────────────────┐
│   Transaction Service              │
│                                    │
│  VALIDATION PHASE:                 │
│  1. Validate all fields            │
│  2. Query unmatched records for    │
│     the security using aggregation:│
│                                    │
│     UnmatchedRecord.find({         │
│       securityId: ObjectId("60d5f..."),│
│       dematAccountId: ObjectId("60d5e...")│
│     }).sort({ buyDate: 1 })        │
│                                    │
│  3. Check sufficient holdings:     │
│     Current Holdings:              │
│     ┌─────────────────────────────┐│
│     │ UnmatchedRecord #1:         ││
│     │   _id: ObjectId("60d7...")  ││
│     │   buyDate: 2024-01-15       ││
│     │   quantity: 100             ││
│     │   price: 2450.50            ││
│     │   buyTxnId: ObjectId("60d6...")││
│     └─────────────────────────────┘│
│     ┌─────────────────────────────┐│
│     │ UnmatchedRecord #2:         ││
│     │   _id: ObjectId("60d8...")  ││
│     │   buyDate: 2024-06-20       ││
│     │   quantity: 75              ││
│     │   price: 2620.00            ││
│     │   buyTxnId: ObjectId("60d9...")││
│     └─────────────────────────────┘│
│                                    │
│     Total available: 100 + 75=175  │
│     Sell quantity: 150             │
│     ✓ Sufficient holdings          │
│                                    │
│  4. Calculate transaction value    │
│     = 150 × 2890.75 = 433,612.50   │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   MongoDB Session Transaction Begins│
│   const session =                  │
│     await mongoose.startSession(); │
│   session.startTransaction();      │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 1: Create SELL Transaction  │
│                                    │
│   const transaction = new Transaction({│
│     date: new Date("2024-12-01"),  │
│     type: "SELL",                  │
│     quantity: 150,                 │
│     price: 2890.75,                │
│     securityId: ObjectId("60d5f..."),│
│     deliveryType: "Delivery",      │
│     dematAccountId: ObjectId("60d5e...")│
│   });                              │
│   await transaction.save({ session });│
│                                    │
│   Generated _id: ObjectId("60da...")│
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 2: Create Ledger Entry      │
│                                    │
│   const ledgerEntry = new LedgerEntry({│
│     dematAccountId: ObjectId("60d5e..."),│
│     tradeTransactionId: transaction._id,│
│     transactionAmount: +433612.50, │
│     date: new Date("2024-12-01")   │
│   });                              │
│   await ledgerEntry.save({ session });│
│                                    │
│   Note: Positive amount = Credit   │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 3: Update Demat Balance     │
│                                    │
│   await DematAccount.findByIdAndUpdate(│
│     dematAccountId,                │
│     { $inc: { balance: +433612.50 } },│
│     { session }                    │
│   );                               │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   STEP 4: FIFO Matching Logic      │
│   (Capital Gain Calculation)       │
│                                    │
│   Initialize:                      │
│   - remainingSellQty = 150         │
│   - unmatchedRecords sorted by     │
│     buyDate ASC (FIFO)             │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   MATCH #1: Process Record #1      │
│                                    │
│   Unmatched Record:                │
│   - _id: ObjectId("60d7...")       │
│   - buyDate: 2024-01-15            │
│   - quantity: 100                  │
│   - price: 2450.50                 │
│   - buyTxnId: ObjectId("60d6...")  │
│                                    │
│   Matching:                        │
│   - matchQty = min(100, 150) = 100 │
│   - remainingSellQty = 150-100=50  │
│                                    │
│   Calculate Holding Period:        │
│   - buyDate: 2024-01-15            │
│   - sellDate: 2024-12-01           │
│   - days = 320 days                │
│   - capitalGainType = STCG         │
│     (< 365 days for EQUITY)        │
│                                    │
│   Calculate P&L:                   │
│   - buyValue = 100 × 2450.50       │
│               = 245,050            │
│   - sellValue = 100 × 2890.75      │
│                = 289,075           │
│   - P&L = 289,075 - 245,050        │
│         = 44,025                   │
│                                    │
│   Create MatchedRecord Document:   │
│   const matchedRecord =            │
│     new MatchedRecord({            │
│       buyDate: new Date("2024-01-15"),│
│       sellDate: new Date("2024-12-01"),│
│       securityId: ObjectId("60d5f..."),│
│       quantity: 100,               │
│       buyTransactionId: ObjectId("60d6..."),│
│       sellTransactionId: transaction._id,│
│       capitalGainType: "STCG",     │
│       profitAndLoss: 44025.00,     │
│       deliveryType: "Delivery",    │
│       dematAccountId: ObjectId("60d5e...")│
│     });                            │
│   await matchedRecord.save({ session });│
│                                    │
│   Delete UnmatchedRecord #1:       │
│   await UnmatchedRecord.findByIdAndDelete(│
│     ObjectId("60d7..."),           │
│     { session }                    │
│   );                               │
│   (Fully matched - qty exhausted)  │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   MATCH #2: Process Record #2      │
│                                    │
│   Unmatched Record:                │
│   - _id: ObjectId("60d8...")       │
│   - buyDate: 2024-06-20            │
│   - quantity: 75                   │
│   - price: 2620.00                 │
│   - buyTxnId: ObjectId("60d9...")  │
│                                    │
│   Matching:                        │
│   - matchQty = min(75, 50) = 50    │
│   - remainingSellQty = 50-50 = 0   │
│                                    │
│   Calculate Holding Period:        │
│   - buyDate: 2024-06-20            │
│   - sellDate: 2024-12-01           │
│   - days = 164 days                │
│   - capitalGainType = STCG         │
│                                    │
│   Calculate P&L:                   │
│   - buyValue = 50 × 2620.00        │
│               = 131,000            │
│   - sellValue = 50 × 2890.75       │
│                = 144,537.50        │
│   - P&L = 144,537.50 - 131,000     │
│         = 13,537.50                │
│                                    │
│   Create MatchedRecord Document:   │
│   const matchedRecord =            │
│     new MatchedRecord({            │
│       buyDate: new Date("2024-06-20"),│
│       sellDate: new Date("2024-12-01"),│
│       securityId: ObjectId("60d5f..."),│
│       quantity: 50,                │
│       buyTransactionId: ObjectId("60d9..."),│
│       sellTransactionId: transaction._id,│
│       capitalGainType: "STCG",     │
│       profitAndLoss: 13537.50,     │
│       deliveryType: "Delivery",    │
│       dematAccountId: ObjectId("60d5e...")│
│     });                            │
│   await matchedRecord.save({ session });│
│                                    │
│   Update UnmatchedRecord #2:       │
│   await UnmatchedRecord.findByIdAndUpdate(│
│     ObjectId("60d8..."),           │
│     { $inc: { quantity: -50 } },   │
│     { session }                    │
│   );                               │
│   New quantity: 75 - 50 = 25       │
│   (Partial match - 25 qty remains) │
│                                    │
│   remainingSellQty = 0 → DONE      │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   MongoDB Session Commits          │
│   await session.commitTransaction();│
│   session.endSession();            │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Final State in MongoDB:          │
│                                    │
│   transactions collection:         │
│   - New SELL transaction doc       │
│                                    │
│   ledgerEntries collection:        │
│   - New credit entry +433,612.50   │
│                                    │
│   matchedRecords collection:       │
│   - Match #1: Qty 100, P&L 44,025  │
│   - Match #2: Qty 50, P&L 13,537.50│
│   Total P&L: 57,562.50             │
│                                    │
│   unmatchedRecords collection:     │
│   - Record #1: DELETED (qty 0)     │
│   - Record #2: UPDATED (qty 25)    │
│                                    │
│   dematAccounts collection:        │
│   - Balance increased by 433,612.50│
│                                    │
└────────────────────────────────────┘
```

---

### Flow 4: Generate P&L Report Flow with MongoDB Aggregation

---
```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ GET /reports/pnl?startDate=2024-01-01
     │                  &endDate=2024-12-31
     │                  &capitalGainType=STCG
     │                  &limit=50&offset=0
     │ Authorization: Bearer <token>
     ▼
┌────────────────────────────────────┐
│   Report Controller                │
│                                    │
│  1. Validate query parameters      │
│  2. Parse dates                    │
│  3. Validate date range            │
│  4. Set pagination defaults        │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Report Service                   │
│                                    │
│  BUILD AGGREGATION PIPELINE:       │
│                                    │
│  const pipeline = [                │
│    // Stage 1: Filter by criteria │
│    {                               │
│      $match: {                     │
│        sellDate: {                 │
│          $gte: new Date("2024-01-01"),│
│          $lte: new Date("2024-12-31")│
│        },                          │
│        capitalGainType: "STCG"     │
│      }                             │
│    },                              │
│                                    │
│    // Stage 2: Lookup security     │
│    {                               │
│      $lookup: {                    │
│        from: "securities",         │
│        localField: "securityId",   │
│        foreignField: "_id",        │
│        as: "security"              │
│      }                             │
│    },                              │
│    { $unwind: "$security" },       │
│                                    │
│    // Stage 3: Lookup buy txn      │
│    {                               │
│      $lookup: {                    │
│        from: "transactions",       │
│        localField: "buyTransactionId",│
│        foreignField: "_id",        │
│        as: "buyTransaction"        │
│      }                             │
│    },                              │
│    { $unwind: "$buyTransaction" }, │
│                                    │
│    // Stage 4: Lookup sell txn     │
│    {                               │
│      $lookup: {                    │
│        from: "transactions",       │
│        localField: "sellTransactionId",│
│        foreignField: "_id",        │
│        as: "sellTransaction"       │
│      }                             │
│    },                              │
│    { $unwind: "$sellTransaction" },│
│                                    │
│    // Stage 5: Sort by sell date   │
│    { $sort: { sellDate: -1 } },    │
│                                    │
│    // Stage 6: Pagination          │
│    { $skip: 0 },                   │
│    { $limit: 50 }                  │
│  ];                                │
│                                    │
│  Execute aggregation:              │
│  const records =                   │
│    await MatchedRecord             │
│      .aggregate(pipeline);         │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Query Result from MongoDB:       │
│                                    │
│   Matched Records Found:           │
│   [                                │
│     {                              │
│       _id: ObjectId("60db..."),    │
│       buyDate: ISODate("2024-01-15"),│
│       sellDate: ISODate("2024-06-20"),│
│       securityId: ObjectId("60d5..."),│
│       quantity: 100,               │
│       capitalGainType: "STCG",     │
│       profitAndLoss: 44025.00,     │
│       security: {                  │
│         _id: ObjectId("60d5..."),  │
│         name: "Reliance Industries",│
│         type: "EQUITY"             │
│       },                           │
│       buyTransaction: {            │
│         _id: ObjectId("60d6..."),  │
│         date: ISODate("2024-01-15"),│
│         price: 2450.50,            │
│         quantity: 100,             │
│         type: "BUY"                │
│       },                           │
│       sellTransaction: {           │
│         _id: ObjectId("60da..."),  │
│         date: ISODate("2024-06-20"),│
│         price: 2890.75,            │
│         quantity: 100,             │
│         type: "SELL"               │
│       }                            │
│     },                             │
│     { /* Record #2 */ },           │
│     { /* Record #3 */ }            │
│   ]                                │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   CALCULATE SUMMARY USING          │
│   SEPARATE AGGREGATION:            │
│                                    │
│   const summaryPipeline = [        │
│     {                              │
│       $match: {                    │
│         sellDate: {                │
│           $gte: new Date("2024-01-01"),│
│           $lte: new Date("2024-12-31")│
│         },                         │
│         capitalGainType: "STCG"    │
│       }                            │
│     },                             │
│     {                              │
│       $group: {                    │
│         _id: null,                 │
│         totalProfit: {             │
│           $sum: {                  │
│             $cond: [               │
│               { $gt: ["$profitAndLoss", 0] },│
│               "$profitAndLoss",    │
│               0                    │
│             ]                      │
│           }                        │
│         },                         │
│         totalLoss: {               │
│           $sum: {                  │
│             $cond: [               │
│               { $lt: ["$profitAndLoss", 0] },│
│               { $abs: "$profitAndLoss" },│
│               0                    │
│             ]                      │
│           }                        │
│         },                         │
│         stcg: {                    │
│           $sum: {                  │
│             $cond: [               │
│               { $eq: ["$capitalGainType", "STCG"] },│
│               "$profitAndLoss",    │
│               0                    │
│             ]                      │
│           }                        │
│         },                         │
│         ltcg: {                    │
│           $sum: {                  │
│             $cond: [               │
│               { $eq: ["$capitalGainType", "LTCG"] },│
│               "$profitAndLoss",    │
│               0                    │
│             ]                      │
│           }                        │
│         },                         │
│         totalTrades: { $sum: 1 }   │
│       }                            │
│     },                             │
│     {                              │
│       $project: {                  │
│         _id: 0,                    │
│         totalProfit: 1,            │
│         totalLoss: 1,              │
│         netProfitLoss: {           │
│           $subtract: [             │
│             "$totalProfit",        │
│             "$totalLoss"           │
│           ]                        │
│         },                         │
│         stcg: 1,                   │
│         ltcg: 1,                   │
│         totalTrades: 1             │
│       }                            │
│     }                              │
│   ];                               │
│                                    │
│   const summary =                  │
│     await MatchedRecord            │
│       .aggregate(summaryPipeline); │
│                                    │
│   Summary Result:                  │
│   {                                │
│     totalProfit: 55050.00,         │
│     totalLoss: 3180.00,            │
│     netProfitLoss: 51870.00,       │
│     stcg: 51870.00,                │
│     ltcg: 0.00,                    │
│     totalTrades: 3                 │
│   }                                │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Response to Client               │
│                                    │
│   Success (200):                   │
│   {                                │
│     "success": true,               │
│     "data": {                      │
│       "records": [                 │
│         {                          │
│           "_id": "60db...",        │
│           "buyDate": "2024-01-15", │
│           "sellDate": "2024-06-20",│
│           "securityId": "60d5...", │
│           "quantity": 100,         │
│           "capitalGainType":"STCG",│
│           "profitAndLoss": 44025,  │
│           "security": {            │
│             "name": "Reliance..."  │
│           },                       │
│           "buyTransaction": {...}, │
│           "sellTransaction": {...} │
│         },                         │
│         {...}, {...}               │
│       ],                           │
│       "summary": {                 │
│         "totalProfit": 55050.00,   │
│         "totalLoss": 3180.00,      │
│         "netProfitLoss": 51870.00, │
│         "stcg": 51870.00,          │
│         "ltcg": 0.00,              │
│         "totalTrades": 3           │
│       }                            │
│     },                             │
│     "message": "P&L records..."    │
│   }                                │
└────────────────────────────────────┘
```

---
### Flow 5: Generate Holdings Report with Unrealized P&L - MongoDB Aggregation
---

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ GET /reports/holdings
     │ Authorization: Bearer <token>
     ▼
┌────────────────────────────────────┐
│   Report Service                   │
│                                    │
│  BUILD AGGREGATION PIPELINE:       │
│                                    │
│  const pipeline = [                │
│    // Stage 1: Lookup security     │
│    {                               │
│      $lookup: {                    │
│        from: "securities",         │
│        localField: "securityId",   │
│        foreignField: "_id",        │
│        as: "security"              │
│      }                             │
│    },                              │
│    { $unwind: "$security" },       │
│                                    │
│    // Stage 2: Add calculated fields│
│    {                               │
│      $addFields: {                 │
│        totalInvestment: {          │
│          $multiply: [              │
│            "$quantity",            │
│            "$price"                │
│          ]                         │
│        },                          │
│        currentValue: {             │
│          $multiply: [              │
│            "$quantity",            │
│            "$security.currentPrice"│
│          ]                         │
│        }                           │
│      }                             │
│    },                              │
│                                    │
│    // Stage 3: Calculate P&L       │
│    {                               │
│      $addFields: {                 │
│        unrealizedPnL: {            │
│          $subtract: [              │
│            "$currentValue",        │
│            "$totalInvestment"      │
│          ]                         │
│        },                          │
│        pnlPercentage: {            │
│          $multiply: [              │
│            {                       │
│              $divide: [            │
│                {                   │
│                  $subtract: [      │
│                    "$currentValue",│
│                    "$totalInvestment"│
│                  ]                 │
│                },                  │
│                "$totalInvestment"  │
│              ]                     │
│            },                      │
│            100                     │
│          ]                         │
│        }                           │
│      }                             │
│    },                              │
│                                    │
│    // Stage 4: Sort by security    │
│    { $sort: { "security.name": 1 } },│
│                                    │
│    // Stage 5: Pagination          │
│    { $skip: 0 },                   │
│    { $limit: 50 }                  │
│  ];                                │
│                                    │
│  Execute aggregation:              │
│  const holdings =                  │
│    await UnmatchedRecord           │
│      .aggregate(pipeline);         │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Query Result from MongoDB:       │
│                                    │
│   Holdings (Unmatched Records):    │
│   [                                │
│     {                              │
│       _id: ObjectId("60dc..."),    │
│       buyDate: ISODate("2024-09-15"),│
│       quantity: 50,                │
│       price: 2450.50,              │
│       securityId: ObjectId("60d5..."),│
│       buyTransactionId: ObjectId("60d6..."),│
│       security: {                  │
│         _id: ObjectId("60d5..."),  │
│         name: "Reliance Industries",│
│         type: "EQUITY",            │
│         currentPrice: 2890.75      │
│       },                           │
│       totalInvestment: 122525.00,  │
│       currentValue: 144537.50,     │
│       unrealizedPnL: 22012.50,     │
│       pnlPercentage: 17.96         │
│     },                             │
│     {                              │
│       _id: ObjectId("60dd..."),    │
│       buyDate: ISODate("2024-10-01"),│
│       quantity: 30,                │
│       price: 3800.00,              │
│       securityId: ObjectId("60d6..."),│
│       buyTransactionId: ObjectId("60d7..."),│
│       security: {                  │
│         _id: ObjectId("60d6..."),  │
│         name: "TCS",               │
│         type: "EQUITY",            │
│         currentPrice: 3950.25      │
│       },                           │
│       totalInvestment: 114000.00,  │
│       currentValue: 118507.50,     │
│       unrealizedPnL: 4507.50,      │
│       pnlPercentage: 3.95          │
│     }                              │
│   ]                                │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   CALCULATE PORTFOLIO SUMMARY      │
│   USING AGGREGATION:               │
│                                    │
│   const summaryPipeline = [        │
│     {                              │
│       $lookup: {                   │
│         from: "securities",        │
│         localField: "securityId",  │
│         foreignField: "_id",       │
│         as: "security"             │
│       }                            │
│     },                             │
│     { $unwind: "$security" },      │
│     {                              │
│       $addFields: {                │
│         totalInvestment: {         │
│           $multiply: ["$quantity", "$price"]│
│         },                         │
│         currentValue: {            │
│           $multiply: [             │
│             "$quantity",           │
│             "$security.currentPrice"│
│           ]                        │
│         }                          │
│       }                            │
│     },                             │
│     {                              │
│       $addFields: {                │
│         unrealizedPnL: {           │
│           $subtract: [             │
│             "$currentValue",       │
│             "$totalInvestment"     │
│           ]                        │
│         }                          │
│       }                            │
│     },                             │
│     {                              │
│       $group: {                    │
│         _id: null,                 │
│         totalInvestment: {         │
│           $sum: "$totalInvestment" │
│         },                         │
│         totalCurrentValue: {       │
│           $sum: "$currentValue"    │
│         },                         │
│         totalUnrealizedPnL: {      │
│           $sum: "$unrealizedPnL"   │
│         },                         │
│         totalHoldings: { $sum: 1 },│
│         profitableHoldings: {      │
│           $sum: {                  │
│             $cond: [               │
│               { $gt: ["$unrealizedPnL", 0] },│
│               1, 0                 │
│             ]                      │
│           }                        │
│         },                         │
│         losingHoldings: {          │
│           $sum: {                  │
│             $cond: [               │
│               { $lt: ["$unrealizedPnL", 0] },│
│               1, 0                 │
│             ]                      │
│           }                        │
│         }                          │
│       }                            │
│     },                             │
│     {                              │
│       $project: {                  │
│         _id: 0,                    │
│         totalInvestment: 1,        │
│         currentValue: "$totalCurrentValue",│
│         unrealizedPnL: "$totalUnrealizedPnL",│
│         pnlPercentage: {           │
│           $multiply: [             │
│             {                      │
│               $divide: [           │
│                 "$totalUnrealizedPnL",│
│                 "$totalInvestment" │
│               ]                    │
│             },                     │
│             100                    │
│           ]                        │
│         },                         │
│         totalHoldings: 1,          │
│         profitableHoldings: 1,     │
│         losingHoldings: 1          │
│       }                            │
│     }                              │
│   ];                               │
│                                    │
│   const summary =                  │
│     await UnmatchedRecord          │
│       .aggregate(summaryPipeline); │
│                                    │
│   Summary Result:                  │
│   {                                │
│     totalInvestment: 236525.00,    │
│     currentValue: 263045.00,       │
│     unrealizedPnL: 26520.00,       │
│     pnlPercentage: 11.21,          │
│     totalHoldings: 2,              │
│     profitableHoldings: 2,         │
│     losingHoldings: 0              │
│   }                                │
│                                    │
└────┬───────────────────────────────┘
     │
     ▼
┌────────────────────────────────────┐
│   Response to Client               │
│                                    │
│   Success (200):                   │
│   {                                │
│     "success": true,               │
│     "data": {                      │
│       "holdings": [                │
│         {                          │
│           "_id": "60dc...",        │
│           "securityId": "60d5...", │
│           "security": {            │
│             "name": "Reliance...", │
│             "currentPrice":2890.75 │
│           },                       │
│           "quantity": 50,          │
│           "buyPrice": 2450.50,     │
│           "totalInvestment":       │
│              122525.00,            │
│           "currentValue":          │
│              144537.50,            │
│           "unrealizedPnL":         │
│              22012.50,             │
│           "pnlPercentage": 17.96   │
│         },                         │
│         {...}                      │
│       ],                           │
│       "summary": {                 │
│         "totalInvestment":         │
│            236525.00,              │
│         "currentValue": 263045.00, │
│         "unrealizedPnL": 26520.00, │
│         "pnlPercentage": 11.21,    │
│         "totalHoldings": 2,        │
│         "profitableHoldings": 2,   │
│         "losingHoldings": 0        │
│       }                            │
│     },                             │
│     "message": "Holdings..."       │
│   }                                │
└────────────────────────────────────┘
```

## Implementation Prompts by Module

### Module 1: Database Setup & Configuration

**Prompt for Database Configuration**

Create a MongoDB database connection module for CapEdge backend application with the following requirements:

- **Database Connection:**
    - Use Mongoose ODM
    - Connection string from environment variable `MONGODB_URI` (default: `mongodb://localhost:27017/capedge`)
    - Support MongoDB Atlas connection strings
    - Connection pooling: min 5, max 20 connections
    - Auto-reconnect enabled
    - Connection timeout: 30 seconds

- **Configuration Options:**
    - `useNewUrlParser: true`
    - `useUnifiedTopology: true`
    - Enable strict mode
    - Set appropriate buffer timeout
    - Configure connection event handlers (`connected`, `error`, `disconnected`)

- **Environment Variables:**
    - `MONGODB_URI`: Database connection string
    - `MONGODB_DB_NAME`: Database name (default: capedge)
    - `NODE_ENV`: Environment (development/production)

- **Error Handling:**
    - Log connection success
    - Log connection errors
    - Implement reconnection logic
    - Graceful shutdown on application termination

- **File Structure:**  
    `src/config/database.js`

---

### Module 2: Mongoose Models Creation

**Prompt for Creating Mongoose Models**

Create comprehensive Mongoose models for the CapEdge stock trading portfolio management system with the following collections:

1. **User Model (`src/models/User.js`):**
     - Fields: `username` (String, required, unique, lowercase, indexed), `password` (String, required, minlength: 8), `email` (String, optional, unique if provided, lowercase), `createdAt`, `updatedAt` (timestamps: true)
     - Pre-save hook: Hash password with bcrypt (salt rounds: 10) before saving
     - Methods: `comparePassword(candidatePassword)` - returns Promise<boolean>
     - Indexes: username (unique), email (unique, sparse)

2. **Broker Model (`src/models/Broker.js`):**
     - Fields: `name` (String, required, minlength: 2), `panNumber` (String, required, unique, uppercase, validate PAN format), `address` (String, required, minlength: 10), timestamps: true
     - Validation: panNumber format ABCDE1234F (regex: `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/`)
     - Indexes: panNumber (unique), name (text index for search)

3. **StockExchange Model (`src/models/StockExchange.js`):**
     - Fields: `name` (String, required), `code` (String, required, unique, uppercase, e.g., NSE, BSE), timestamps: true
     - Indexes: code (unique)

4. **Security Model (`src/models/Security.js`):**
     - Fields: `name` (String, required, minlength: 2), `type` (String, required, enum), `strikePrice` (Number, optional, min: 0, validate 2 decimals), `expiry` (Date, optional), `stockExchangeId` (ObjectId, ref: 'StockExchange', required), `currentPrice` (Number, optional), timestamps: true
     - Custom Validation: If type is OPTIONS or FUTURES, strikePrice and expiry are required; if type is EQUITY, BOND, ETF, MUTUAL_FUND, strikePrice and expiry must be null
     - Indexes: name (text), type, stockExchangeId, expiry

5. **UserAccount Model (`src/models/UserAccount.js`):**
     - Fields: `name` (String, required, minlength: 2), `panNumber` (String, required, unique, uppercase, validate PAN format), `address` (String, required, minlength: 10), timestamps: true
     - Validation: panNumber format
     - Indexes: panNumber (unique), name (text)

6. **DematAccount Model (`src/models/DematAccount.js`):**
     - Fields: `userAccountId` (ObjectId, ref: 'UserAccount', required), `brokerId` (ObjectId, ref: 'Broker', required), `balance` (Number, required, default: 0, min: 0, validate 2 decimals), timestamps: true
     - Compound Index: [userAccountId, brokerId] (unique)
     - Indexes: userAccountId, brokerId

7. **Transaction Model (`src/models/Transaction.js`):**
     - Fields: `date` (Date, required), `type` (String, required, enum: ['BUY', 'SELL']), `quantity` (Number, required, min: 1, integer validation), `price` (Number, required, min: 0, validate 2 decimals), `securityId` (ObjectId, ref: 'Security', required), `deliveryType` (String, required, enum: ['Delivery', 'Intraday']), `referenceNumber` (String, optional), `dematAccountId` (ObjectId, ref: 'DematAccount', required), timestamps: true
     - Indexes: date (descending), type, securityId, dematAccountId, deliveryType
     - Compound Index: [date, type, securityId]

8. **MatchedRecord Model (`src/models/MatchedRecord.js`):**
     - Fields: `buyDate` (Date, required), `sellDate` (Date, required), `securityId` (ObjectId, ref: 'Security', required), `quantity` (Number, required, min: 1), `buyTransactionId` (ObjectId, ref: 'Transaction', required), `sellTransactionId` (ObjectId, ref: 'Transaction', required), `capitalGainType` (String, required, enum: ['STCG', 'LTCG']), `profitAndLoss` (Number, required), `deliveryType` (String, required), `dematAccountId` (ObjectId, ref: 'DematAccount', required), timestamps: true
     - Indexes: sellDate (descending), buyDate, capitalGainType, securityId, dematAccountId, buyTransactionId, sellTransactionId
     - Compound Index: [sellDate, capitalGainType]

9. **UnmatchedRecord Model (`src/models/UnmatchedRecord.js`):**
     - Fields: `buyDate` (Date, required), `quantity` (Number, required, min: 1), `price` (Number, required, min: 0), `securityId` (ObjectId, ref: 'Security', required), `buyTransactionId` (ObjectId, ref: 'Transaction', required), `dematAccountId` (ObjectId, ref: 'DematAccount', required), timestamps: true
     - Indexes: buyDate (ascending for FIFO), securityId, dematAccountId, buyTransactionId
     - Compound Index: [securityId, buyDate]

10. **LedgerEntry Model (`src/models/LedgerEntry.js`):**
        - Fields: `dematAccountId` (ObjectId, ref: 'DematAccount', required), `tradeTransactionId` (ObjectId, ref: 'Transaction', required), `transactionAmount` (Number, required), `date` (Date, required), `remarks` (String, optional), `createdAt` (timestamp)
        - Indexes: [dematAccountId, date] (compound, descending on date), tradeTransactionId

11. **FinancialYear Model (`src/models/FinancialYear.js`):**
        - Fields: `title` (String, required, e.g., "FY 2024-25"), `startDate` (Date, required), `lastDate` (Date, required), `stcgRate` (Number, required, min: 0, max: 100), `ltcgRate` (Number, required, min: 0, max: 100), timestamps: true
        - Custom Validation: startDate < lastDate
        - Indexes: startDate (descending), [startDate, lastDate] compound

**General Requirements:**
- All models should export as Mongoose models
- Use strict schema validation
- Enable timestamps for all models
- Implement custom validators where needed
- Use appropriate data types
- Create comprehensive indexes for query performance
- Include JSDoc comments for all schemas

---

### Module 3: Authentication System

**Prompt for Authentication Implementation**

Create a complete authentication system for CapEdge backend with JWT tokens:

- **Auth Service (`src/services/authService.js`):**
    - `register(username, email, password)`: Validate uniqueness, hash password, create user, return result
    - `login(username, password)`: Query user, compare password, generate JWT token (payload: `{ userId, username }`, expiry: 24h, HS256, secret from env), return `{ token, user }`
    - `validateToken(token)`: Verify JWT, check expiration, return decoded payload or error

- **Auth Controller (`src/controllers/authController.js`):**
    - POST `/auth/register`
    - POST `/auth/login`
    - POST `/auth/validate-token`
    - Response: `{ success, data, message }`
    - Proper error handling

- **Auth Middleware (`src/middlewares/authMiddleware.js`):**
    - `authenticateToken(req, res, next)`: Extract/verify JWT from Authorization header, attach user to `req.user`, handle errors

- **Auth Routes (`src/routes/authRoutes.js`):**
    - POST `/auth/register`
    - POST `/auth/login`
    - POST `/auth/validate-token`

- **Auth Validators (`src/validators/authValidator.js`):**
    - `registerValidator`: username (required, min 3, alphanumeric), email (optional, valid), password (required, min 8, strong)
    - `loginValidator`: username (required), password (required)

- **Rate Limiting:**
    - Limit `/auth/login` to 5 attempts/minute/IP (express-rate-limit)

- **Security:**
    - Never return password
    - Use bcrypt for hashing
    - Secure JWT secret (min 32 chars)
    - Set secure HTTP headers

**Environment Variables:**
- `JWT_SECRET` (required, min 32 chars)
- `JWT_EXPIRY` (default: 24h)

**Dependencies:**  
jsonwebtoken, bcryptjs, express-rate-limit, joi

---

### Module 4: Transaction Management with FIFO Matching

**Prompt for Transaction System**

Create a comprehensive transaction management system with FIFO matching for CapEdge:

- **Transaction Service (`src/services/transactionService.js`):**
    - `createTransaction(transactionData, userId)`: Validate security/demat account, user ownership, date, quantity, price. Start MongoDB session.  
        - For BUY: check balance, create transaction, ledger entry, update balance, create unmatched record (if delivery), commit session.
        - For SELL: check holdings, create transaction, ledger entry, update balance, call FIFO matching (if delivery), commit session.
        - On error: abort session, return error.
    - `getTransactions(filters, pagination)`: Support filters, populate security/demat/broker, paginate, sort, return `{ transactions, total }`
    - `updateTransaction(id, updateData, userId)`: Validate, check matched records, unwind/recalculate if needed, use session, return updated transaction
    - `deleteTransaction(id, userId)`: Validate, check matched records, delete ledger/unmatched records, recalc balance, use session, return success

- **FIFO Matching Service (`src/services/fifoMatchingService.js`):**
    - `matchSellTransaction(sellTransaction, session)`: Query unmatched records FIFO, match quantities, calculate holding period, capital gain type, P&L, create matched records, update/delete unmatched, return matched records

- **Capital Gain Service (`src/services/capitalGainService.js`):**
    - `calculateCapitalGainType(buyDate, sellDate, securityType)`: Return 'STCG' or 'LTCG'
    - `calculateHoldingPeriod(buyDate, sellDate)`: Return days

- **Transaction Controller (`src/controllers/transactionController.js`):**
    - POST `/transactions`, GET `/transactions`, PUT `/transactions/:id`, DELETE `/transactions/:id`
    - Use authentication, Joi validation, error handling

- **Transaction Validators (`src/validators/transactionValidator.js`):**
    - `createTransactionValidator`, `updateTransactionValidator`, query param validators

**MongoDB Transactions:**  
Use `mongoose.startSession()` for multi-document ops, try-catch-finally, commit/abort/end session

**Error Codes:**  
400 (validation, insufficient funds/holdings), 404 (not found), 500 (server error)

---

### Module 5: Report Generation System

**Prompt for Report System**

Create a comprehensive reporting system for CapEdge with MongoDB aggregation pipelines:

- **Report Service (`src/services/reportService.js`):**
    - `generatePnLReport(filters, pagination)`: Aggregation pipeline with filters, lookups (security, stock exchange, buy/sell txns), sort, facet for records/summary, return `{ records, summary }`
    - `generateHoldingsReport(filters, pagination)`: Aggregation pipeline with filters, lookups, calculated fields (investment, current value, P&L), sort, facet for holdings/summary, return `{ holdings, summary }`
    - `generateLedgerReport(filters, pagination)`: Aggregation with lookups (demat, user, broker, txn, security), running balance, return `{ entries, summary }`

- **Export Service (`src/services/exportService.js`):**
    - `exportToCSV(data, columns)`: Use json2csv, define headers, return CSV string
    - `exportToExcel(data, columns, summary)`: Use exceljs, format, auto-size, filters, summary sheet, return buffer

- **Report Controller (`src/controllers/reportController.js`):**
    - GET `/reports/pnl`, `/reports/pnl/export`, `/reports/holdings`, `/reports/holdings/export`, `/ledger`, `/ledger/export`
    - Use authentication, validate queries, set headers for downloads

- **Report Validators (`src/validators/reportValidator.js`):**
    - `pnlReportValidator`, `holdingsReportValidator`, `ledgerReportValidator`, `exportFormatValidator`

**Dependencies:**  
json2csv, exceljs

**Performance:**  
Use indexes, limit pipeline stages, projection, streaming for large exports, cache frequently accessed data

---

### Module 6: Error Handling & Logging

**Prompt for Error Handling System**

Create a comprehensive error handling and logging system for CapEdge:

- **Error Middleware (`src/middlewares/errorMiddleware.js`):**
    - Custom error classes: ValidationError (400), NotFoundError (404), UnauthorizedError (401), ForbiddenError (403), ConflictError (409), InternalServerError (500)
    - Global error handler: logs error, handles Mongoose/JWT/custom errors, returns consistent error response

- **Logger (`src/utils/logger.js`):**
    - Use Winston: levels (error, warn, info, http, debug), console for dev, files for prod, JSON format, timestamps, metadata (service, env, timestamp)

- **Request Logger Middleware (`src/middlewares/loggerMiddleware.js`):**
    - Log all requests: method, path, status, duration, IP, user agent, user

- **Async Handler Wrapper (`src/utils/asyncHandler.js`):**
    - Wrap async route handlers to catch errors

- **Response Formatter (`src/utils/responseFormatter.js`):**
    - Standard success/error response functions

- **Not Found Handler (`src/middlewares/notFoundMiddleware.js`):**
    - Handle 404 for unknown routes

**Dependencies:**  
winston, winston-daily-rotate-file (optional)

**Integration:**  
Apply requestLogger before routes, notFound after routes, errorHandler last, wrap async handlers

---

## Testing Requirements

### Unit Testing Prompt

Create comprehensive unit tests for CapEdge backend services:

- **Test Setup (`tests/setup.js`):**
    - Set `NODE_ENV=test`, use in-memory MongoDB, clear DB before each suite, close after all

- **Transaction Service Tests (`tests/unit/services/transactionService.test.js`):**
    - Test BUY/SELL creation, insufficient balance/holdings, unmatched/matched records, ledger entries, balance updates, rollback, validation, invalid IDs/dates

- **FIFO Matching Service Tests (`tests/unit/services/fifoMatchingService.test.js`):**
    - Test FIFO logic, P&L, STCG/LTCG, partial/exact matches, unmatched record updates/deletes, insufficient holdings

- **Capital Gain Service Tests (`tests/unit/services/capitalGainService.test.js`):**
    - Test holding period, STCG/LTCG for equity/non-equity

- **Report Service Tests (`tests/unit/services/reportService.test.js`):**
    - Test P&L/holdings report, filters, summary, pagination, unrealized P&L, missing prices, security type filter

- **Auth Service Tests (`tests/unit/services/authService.test.js`):**
    - Test registration, duplicate username, login, wrong password, JWT generation/validation, expired token

**Test Configuration:**  
Jest, mock dependencies, factories for test data, test success/error, >80% coverage, descriptive names, grouped tests

**Dependencies:**  
jest, supertest, mongodb-memory-server, @faker-js/faker

---

### Integration Testing Prompt

Create integration tests for CapEdge API endpoints:

- **Test Setup (`tests/integration/setup.js`):**
    - Start test server, use in-memory DB, seed data, clear after each, generate auth tokens

- **Auth Endpoints Tests (`tests/integration/api/auth.test.js`):**
    - POST `/auth/register`: success, duplicate, invalid email, weak password, missing fields
    - POST `/auth/login`: valid credentials, JWT token, invalid username
