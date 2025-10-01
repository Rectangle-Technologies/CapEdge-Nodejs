# CapEdge

CapEdge is an all-in-one platform to maintain your stock trading records and generate comprehensive reports for Indian stock market investors. It supports portfolio tracking, P&L calculations, tax reporting (STCG/LTCG), and maintains complete audit trails of all trading activities.

## API Specs

---

### Base URL

| Environment | URL |
|-------------|-----|
| Production  | `https://api.capedge.com/v1` |
| Development | `http://localhost:4000/` |

---

## Authentication Endpoints

### POST /auth/login

**Description:** Authenticates a user with username and password credentials. Returns a JWT token that must be included in the Authorization header for all subsequent API requests. The token has an expiration time and should be validated periodically.

**Business Logic:**
- Validate username and password against the database
- Generate a JWT token containing user information and expiration time
- Return the token in the response
- Token should be used for all authenticated endpoints
- Implement rate limiting to prevent brute force attacks

**Request Body:**

```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "string"
}
```

**Errors:**

- `401` - Invalid credentials
- `422` - Validation errors

---

### POST /auth/validate-token

**Description:** Validates the current authentication token to check if it's still valid and not expired. This endpoint is useful for frontend applications to check authentication status before making API calls or refreshing the UI.

**Business Logic:**
- Extract token from Authorization header
- Verify token signature and expiration
- Check if token is blacklisted (if logout functionality implemented)
- Return validation status

**Headers:**

```http
Authorization: Bearer <token>
```

**Response Valid Token:**

```json
{
  "success": true,
  "data": {
    "valid": true
  },
  "message": "Token is valid"
}
```

**Response Invalid/Expired Token:**

```json
{
  "success": true,
  "data": {
    "valid": false
  },
  "message": "Token expired or is invalid"
}
```

---

## Broker Management Endpoints

### GET /brokers

**Description:** Retrieves a list of all brokers or searches for specific brokers by name. Brokers represent brokerage firms through which users trade. This endpoint supports pagination and search functionality to handle large datasets efficiently.

**Business Logic:**
- Fetch brokers from the database with optional name filter
- Apply pagination using limit and offset
- Return brokers sorted by name or creation date
- Include full broker details including PAN number and address

**Query Parameters:**

- `name` (optional): Search brokers by name (partial match, case-insensitive)
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Zerodha",
      "panNumber": "AAAAA0000A",
      "address": "Bangalore, Karnataka",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "message": "Brokers retrieved successfully"
}
```

---

### POST /brokers

**Description:** Creates a new broker entry in the system. Brokers must have unique PAN numbers as they are registered entities. This endpoint validates the PAN number format according to Indian standards.

**Business Logic:**
- Validate all required fields
- Check if PAN number already exists (must be unique)
- Validate PAN format: 5 letters, 4 digits, 1 letter (e.g., ABCDE1234F)
- Create broker record with timestamp
- Return created broker with ID

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "string (required, min 2 chars)",
  "panNumber": "string (required, format: ABCDE1234F)",
  "address": "string (required, min 10 chars)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Zerodha",
    "panNumber": "AAAAA0000A",
    "address": "Bangalore, Karnataka",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "message": "Broker created successfully"
}
```

---

### PUT /brokers/:id

**Description:** Updates an existing broker's information. All fields are required to maintain data integrity. The PAN number can be updated but must remain unique across all brokers.

**Business Logic:**
- Validate broker ID exists
- Validate all required fields
- If PAN number is changed, check uniqueness
- Update broker record with new timestamp
- Return updated broker

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "string (required, min 2 chars)",
  "panNumber": "string (required, format: ABCDE1234F)",
  "address": "string (required, min 10 chars)"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Zerodha Updated",
    "panNumber": "AAAAA0000A",
    "address": "Bangalore, Karnataka",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T12:00:00.000Z"
  },
  "message": "Broker updated successfully"
}
```

---

### DELETE /brokers/:id

**Description:** Deletes a broker from the system. This operation is only allowed if the broker has no associated demat accounts. This prevents orphaned records and maintains referential integrity.

**Business Logic:**
- Validate broker ID exists
- Check if broker has any associated demat accounts
- If accounts exist, reject deletion with 400 error
- If no accounts, perform soft or hard delete
- Return success message

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "message": "Broker deleted successfully"
}
```

**Errors:**

- `400` - Broker has associated accounts (cannot delete)
- `404` - Broker not found
- `422` - Validation errors

---

## Securities Management Endpoints

### GET /securities

**Description:** Retrieves all securities (stocks, options, futures, etc.) with optional filtering by name, type, or stock exchange. Securities represent tradable instruments and can include equities, derivatives, commodities, currencies, bonds, ETFs, and mutual funds. Supports pagination for large datasets.

**Business Logic:**
- Fetch securities with optional filters
- Join with stock exchange table to include exchange details
- Apply pagination
- For derivatives (OPTIONS/FUTURES), include strike price and expiry
- Return securities with related exchange information

**Query Parameters:**

- `name` (optional): Search securities by name (partial match, case-insensitive)
- `type` (optional): Filter by security type (EQUITY, FUTURES, OPTIONS, COMMODITY, CURRENCY, BOND, ETF, MUTUAL_FUND)
- `exchangeId` (optional): Filter by stock exchange ID
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Reliance Industries Ltd",
      "type": "EQUITY",
      "strikePrice": null,
      "expiry": null,
      "stockExchangeId": 1,
      "stockExchange": {
        "id": 1,
        "name": "NSE (National Stock Exchange)",
        "code": "NSE"
      },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "name": "NIFTY 50 JAN 2024 CE 18000",
      "type": "OPTIONS",
      "strikePrice": 18000.00,
      "expiry": "2024-01-25T00:00:00.000Z",
      "stockExchangeId": 1,
      "stockExchange": {
        "id": 1,
        "name": "NSE (National Stock Exchange)",
        "code": "NSE"
      },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "message": "Securities retrieved successfully"
}
```

---

### POST /securities

**Description:** Creates a new security entry in the system. The validation rules differ based on security type: derivatives (OPTIONS/FUTURES) require strike price and expiry date, while equities do not. This ensures data integrity for different instrument types.

**Business Logic:**
- Validate all required fields
- For OPTIONS/FUTURES types:
  - Require strike price (must be positive)
  - Require expiry date (must be future date)
- For EQUITY, BOND, ETF, MUTUAL_FUND types:
  - Strike price and expiry should be null
- Validate stock exchange ID exists
- Validate strike price format (max 2 decimal places)
- Create security record with timestamp
- Return created security with exchange details

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "string (required, min 2 chars)",
  "type": "string (required, enum: EQUITY|FUTURES|OPTIONS|COMMODITY|CURRENCY|BOND|ETF|MUTUAL_FUND)",
  "strikePrice": "number (nullable, min 0, max 2 decimal places, required for OPTIONS/FUTURES)",
  "expiry": "string (nullable, ISO date, required for OPTIONS/FUTURES, must be future date)",
  "stockExchangeId": "number (required)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Reliance Industries Ltd",
    "type": "EQUITY",
    "strikePrice": null,
    "expiry": null,
    "stockExchangeId": 1,
    "stockExchange": {
      "id": 1,
      "name": "NSE (National Stock Exchange)",
      "code": "NSE"
    },
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "message": "Security created successfully"
}
```

---

### PUT /securities/:id

**Description:** Updates an existing security's information. All validation rules from POST apply. Changing the security type requires appropriate changes to strike price and expiry fields.

**Business Logic:**
- Validate security ID exists
- Apply same validation rules as POST
- Update security record with new timestamp
- Return updated security with exchange details

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** Same as POST

**Response (200):** Same structure as POST with updated timestamps

---

### DELETE /securities/:id

**Description:** Deletes a security from the system. This operation is only allowed if the security has no associated transactions. This prevents data inconsistency and maintains historical transaction integrity.

**Business Logic:**
- Validate security ID exists
- Check if security has any associated transactions
- If transactions exist, reject deletion with 400 error
- If no transactions, perform deletion
- Return success message

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "message": "Security deleted successfully"
}
```

**Errors:**

- `400` - Security has associated transactions (cannot delete)
- `404` - Security not found
- `422` - Validation errors

---

## Stock Exchanges Endpoints

### GET /stock-exchanges

**Description:** Retrieves all available stock exchanges in the system. Stock exchanges represent trading venues like NSE, BSE, etc. This is typically a reference data endpoint with relatively static data.

**Business Logic:**
- Fetch all stock exchanges from database
- Return sorted by code or name
- No pagination needed as data is limited

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "NSE (National Stock Exchange)",
      "code": "NSE"
    },
    {
      "id": 2,
      "name": "BSE (Bombay Stock Exchange)",
      "code": "BSE"
    }
  ],
  "message": "Stock exchanges retrieved successfully"
}
```

---

## User Account Management Endpoints

### GET /user-accounts

**Description:** Retrieves all user accounts with their associated demat accounts. User accounts represent individual investors who trade through various brokers. The endpoint supports optional inclusion of nested demat account details for comprehensive user profiles.

**Business Logic:**
- Fetch user accounts with optional name filter
- If includeDematAccounts is true, join with demat accounts and brokers
- Apply pagination
- Return user accounts with nested demat account details
- Sort by creation date or name

**Query Parameters:**

- `name` (optional): Search user accounts by name (partial match, case-insensitive)
- `includeDematAccounts` (optional): Include demat accounts in response (default: true)
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "panNumber": "ABCDE1234F",
      "address": "123 Main Street, Mumbai, Maharashtra 400001",
      "dematAccounts": [
        {
          "id": 1,
          "userAccountId": 1,
          "brokerId": 1,
          "balance": 50000.00,
          "broker": {
            "id": 1,
            "name": "Zerodha",
            "panNumber": "AAAAA0000A"
          },
          "createdAt": "2025-01-01T00:00:00.000Z",
          "updatedAt": "2025-01-01T00:00:00.000Z"
        }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "message": "User accounts retrieved successfully"
}
```

---

### POST /user-accounts

**Description:** Creates a new user account in the system. User accounts must have unique PAN numbers as they represent individual taxpayers. This endpoint validates PAN format according to Indian standards.

**Business Logic:**
- Validate all required fields
- Check if PAN number already exists (must be unique)
- Validate PAN format: 5 letters, 4 digits, 1 letter (e.g., ABCDE1234F)
- Create user account record with timestamp
- Return created account with empty demat accounts array

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "string (required, min 2 chars)",
  "panNumber": "string (required, format: ABCDE1234F)",
  "address": "string (required, min 10 chars)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "panNumber": "ABCDE1234F",
    "address": "123 Main Street, Mumbai, Maharashtra 400001",
    "dematAccounts": [],
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "message": "User account created successfully"
}
```

---

### PUT /user-accounts/:id

**Description:** Updates an existing user account's information. All fields are required. The PAN number can be updated but must remain unique across all users.

**Business Logic:**
- Validate user account ID exists
- Validate all required fields
- If PAN number is changed, check uniqueness
- Update user account record with new timestamp
- Return updated account with demat accounts

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** Same as POST

**Response (200):** Same structure as POST with updated timestamps

---

### DELETE /user-accounts/:id

**Description:** Deletes a user account from the system. This operation is only allowed if the user has no associated demat accounts or transactions. This maintains referential integrity and prevents loss of historical trading data.

**Business Logic:**
- Validate user account ID exists
- Check if user has any associated demat accounts
- Check if user has any associated transactions (through demat accounts)
- If associations exist, reject deletion with 400 error
- If no associations, perform deletion
- Return success message

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "message": "User account deleted successfully"
}
```

**Errors:**

- `400` - User account has associated demat accounts or transactions (cannot delete)
- `404` - User account not found
- `422` - Validation errors

---

## Demat Account Management Endpoints

### GET /demat-accounts

**Description:** Retrieves demat accounts with optional filtering by user or broker. Demat accounts link users to brokers and maintain trading balances. Each account includes references to the user and broker for complete context.

**Business Logic:**
- Fetch demat accounts with optional filters
- Join with user accounts and brokers tables
- Apply pagination
- Return demat accounts with nested user and broker details
- Sort by creation date

**Query Parameters:**

- `userAccountId` (optional): Filter by user account ID
- `brokerId` (optional): Filter by broker ID
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userAccountId": 1,
      "brokerId": 1,
      "balance": 50000.00,
      "userAccount": {
        "id": 1,
        "name": "John Doe",
        "panNumber": "ABCDE1234F"
      },
      "broker": {
        "id": 1,
        "name": "Zerodha",
        "panNumber": "AAAAA0000A"
      },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "message": "Demat accounts retrieved successfully"
}
```

---

### POST /demat-accounts

**Description:** Creates a new demat account linking a user to a broker. The initial balance represents the cash available for trading. Balance must be non-negative and is stored with two decimal precision for paisa accuracy.

**Business Logic:**
- Validate all required fields
- Validate user account ID exists
- Validate broker ID exists
- Validate balance is non-negative with max 2 decimal places
- Check if user-broker combination already exists (optional uniqueness)
- Create demat account record with timestamp
- Return created account with user and broker details

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "userAccountId": "number (required)",
  "brokerId": "number (required)",
  "balance": "number (required, min 0, max 2 decimal places)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "userAccountId": 1,
    "brokerId": 1,
    "balance": 50000.00,
    "userAccount": {
      "id": 1,
      "name": "John Doe",
      "panNumber": "ABCDE1234F"
    },
    "broker": {
      "id": 1,
      "name": "Zerodha",
      "panNumber": "AAAAA0000A"
    },
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "message": "Demat account created successfully"
}
```

---

### PUT /demat-accounts/:id

**Description:** Updates an existing demat account. All fields are required. Balance updates should typically be done through transactions, but this endpoint allows direct balance corrections.

**Business Logic:**
- Validate demat account ID exists
- Validate all required fields
- Validate user account and broker exist
- Update demat account record with new timestamp
- Return updated account with user and broker details

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** Same as POST

**Response (200):** Same structure as POST with updated timestamps

---

### DELETE /demat-accounts/:id

**Description:** Deletes a demat account from the system. This operation is only allowed if the account has no associated transactions. This prevents orphaned transaction records and maintains data integrity.

**Business Logic:**
- Validate demat account ID exists
- Check if account has any associated transactions
- If transactions exist, reject deletion with 400 error
- If no transactions, perform deletion
- Return success message

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "message": "Demat account deleted successfully"
}
```

**Errors:**

- `400` - Demat account has associated transactions (cannot delete)
- `404` - Demat account not found
- `422` - Validation errors

---

## Transaction Management Endpoints

### GET /transactions

**Description:** Retrieves all trading transactions with comprehensive filtering options. Transactions represent buy/sell trades and are the core of the trading system. Each transaction is linked to a security and demat account, with details about quantity, price, and delivery type (intraday vs delivery).

**Business Logic:**
- Fetch transactions with multiple optional filters
- Join with securities, demat accounts, brokers, and stock exchanges
- Apply date range filtering if provided
- Apply pagination
- Return transactions with complete nested details
- Sort by transaction date (newest first)
- Calculate total transaction value (quantity * price) for display

**Query Parameters:**

- `startDate` (optional): Filter by transaction date from (ISO date format: YYYY-MM-DD)
- `endDate` (optional): Filter by transaction date to (ISO date format: YYYY-MM-DD)
- `type` (optional): Filter by transaction type (BUY, SELL)
- `securityId` (optional): Filter by security ID
- `dematAccountId` (optional): Filter by demat account ID
- `deliveryType` (optional): Filter by delivery type (Delivery, Intraday)
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "TXN001",
      "date": "2024-09-15T00:00:00.000Z",
      "type": "BUY",
      "quantity": 100,
      "price": 2450.50,
      "securityId": 1,
      "deliveryType": "Delivery",
      "referenceNumber": "REF001",
      "dematAccountId": 1,
      "security": {
        "id": 1,
        "name": "Reliance Industries",
        "type": "EQUITY",
        "stockExchange": {
          "id": 1,
          "name": "NSE (National Stock Exchange)",
          "code": "NSE"
        }
      },
      "dematAccount": {
        "id": 1,
        "userAccountId": 1,
        "brokerId": 1,
        "broker": {
          "id": 1,
          "name": "Zerodha"
        }
      },
      "createdAt": "2024-09-15T00:00:00.000Z",
      "updatedAt": "2024-09-15T00:00:00.000Z"
    }
  ],
  "message": "Transactions retrieved successfully"
}
```

---

### POST /transactions

**Description:** Creates a new trading transaction. This is a critical operation that records buy/sell trades. The system should automatically create corresponding ledger entries to track cash flow. For delivery transactions, the system should update unmatched records for holdings tracking.

**Business Logic:**
- Validate all required fields
- Validate security ID exists
- Validate demat account ID exists
- Validate quantity is positive integer
- Validate price is positive with max 2 decimal places
- Validate date is not in future
- For SELL transactions:
  - Check if sufficient holdings exist in unmatched records
  - Calculate average buy price for P&L calculation
- Create transaction record with unique ID
- Create corresponding ledger entry:
  - BUY: Debit (negative amount)
  - SELL: Credit (positive amount)
- If deliveryType is "Delivery":
  - For BUY: Create unmatched record (holding)
  - For SELL: Match with oldest unmatched records (FIFO) and create matched records
- Calculate capital gain type (STCG/LTCG) based on holding period
- Update demat account balance
- Return created transaction with related details

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "date": "string (required, ISO date format)",
  "type": "string (required, enum: BUY|SELL)",
  "quantity": "number (required, min 1)",
  "price": "number (required, min 0, max 2 decimal places)",
  "securityId": "number (required)",
  "deliveryType": "string (required, enum: Delivery|Intraday)",
  "referenceNumber": "string (optional)",
  "dematAccountId": "number (required)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "TXN001",
    "date": "2024-09-15T00:00:00.000Z",
    "type": "BUY",
    "quantity": 100,
    "price": 2450.50,
    "securityId": 1,
    "deliveryType": "Delivery",
    "referenceNumber": "REF001",
    "dematAccountId": 1,
    "createdAt": "2024-09-15T00:00:00.000Z",
    "updatedAt": "2024-09-15T00:00:00.000Z"
  },
  "message": "Transaction created successfully"
}
```

---

### PUT /transactions/:id

**Description:** Updates an existing transaction. This is a sensitive operation as it affects matched/unmatched records and ledger entries. Consider implementing audit trails for transaction modifications.

**Business Logic:**
- Validate transaction ID exists
- Check if transaction is part of matched records (may restrict updates)
- Validate all required fields
- If transaction is matched:
  - Recalculate matched records
  - Update profit/loss calculations
  - Update capital gain type if date changed
- Update corresponding ledger entry
- Update unmatched records if applicable
- Recalculate demat account balance
- Update transaction record with new timestamp
- Return updated transaction

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** Same as POST

**Response (200):** Same structure as POST with updated timestamps

---

### DELETE /transactions/:id

**Description:** Deletes a transaction from the system. This operation has cascading effects and should be handled carefully. If the transaction is part of matched records, deletion may be restricted.

**Business Logic:**
- Validate transaction ID exists
- Check if transaction is part of matched records
- If matched, decide whether to:
  - Reject deletion (safer approach)
  - OR unwind the match and recreate unmatched records
- Delete corresponding ledger entry
- Delete or update unmatched records
- Recalculate demat account balance
- Perform deletion
- Return success message

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "message": "Transaction deleted successfully"
}
```

**Errors:**

- `400` - Transaction is part of matched records (cannot delete)
- `404` - Transaction not found
- `422` - Validation errors

---

## Profit & Loss (P&L) Report Endpoints

### GET /reports/pnl

**Description:** Retrieves realized profit and loss records from matched buy-sell transactions. This endpoint implements FIFO (First In First Out) matching logic to pair buy and sell transactions. It calculates capital gains, determines STCG (Short Term Capital Gains) vs LTCG (Long Term Capital Gains) based on holding period, and provides comprehensive P&L summary.

**Business Logic:**
- Fetch matched records with optional filters
- Join with buy/sell transactions and securities
- Calculate holding period (days between buy and sell)
- Determine capital gain type:
  - EQUITY: STCG if held < 365 days, LTCG if ≥ 365 days
  - NON-EQUITY: STCG if held < 1095 days (3 years), LTCG if ≥ 1095 days
- Calculate P&L: (sell price - buy price) × quantity
- Apply date range filter on sell date
- Group by capital gain type for summary
- Calculate totals:
  - Total profit (sum of positive P&L)
  - Total loss (sum of negative P&L)
  - Net P&L (total profit - total loss)
  - STCG amount
  - LTCG amount
  - Total trades count
- Return records with summary

**Query Parameters:**

- `startDate` (optional): Filter by sell date from (ISO date format: YYYY-MM-DD)
- `endDate` (optional): Filter by sell date to (ISO date format: YYYY-MM-DD)
- `capitalGainType` (optional): Filter by capital gain type (STCG, LTCG)
- `dematAccountId` (optional): Filter by demat account ID
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": 1,
        "buyDate": "2024-01-15T00:00:00.000Z",
        "sellDate": "2024-06-20T00:00:00.000Z",
        "securityId": 1,
        "quantity": 100,
        "buyTransactionId": "TXN001",
        "sellTransactionId": "TXN002",
        "capitalGainType": "STCG",
        "profitAndLoss": 44025.00,
        "deliveryType": "Delivery",
        "security": {
          "id": 1,
          "name": "Reliance Industries",
          "type": "EQUITY"
        },
        "buyTransaction": {
          "id": "TXN001",
          "date": "2024-01-15T00:00:00.000Z",
          "price": 2450.50,
          "quantity": 100,
          "type": "BUY"
        },
        "sellTransaction": {
          "id": "TXN002",
          "date": "2024-06-20T00:00:00.000Z",
          "price": 2890.75,
          "quantity": 100,
          "type": "SELL"
        }
      }
    ],
    "summary": {
      "totalProfit": 89050.00,
      "totalLoss": 10218.75,
      "netProfitLoss": 78831.25,
      "stcg": 38806.25,
      "ltcg": 40025.00,
      "totalTrades": 5
    }
  },
  "message": "P&L records retrieved successfully"
}
```

---

### GET /reports/pnl/export

**Description:** Exports the P&L report to CSV or Excel format for offline analysis, tax filing, or record keeping. The export includes all columns from the matched records table with calculated fields for easy tax computation.

**Business Logic:**
- Apply same filters as GET /reports/pnl
- Fetch all matching records (ignore pagination for export)
- Format data based on export format
- For CSV:
  - Include headers
  - Comma-separated values
  - Handle special characters and quotes
- For Excel:
  - Create workbook with formatted cells
  - Include summary sheet with totals
  - Apply number formatting for currency
  - Add filters to header row
- Set appropriate Content-Type and Content-Disposition headers
- Return file stream

**Query Parameters:**

- `format` (optional): Export format (csv, excel) - default: csv
- `startDate` (optional): Filter by sell date from (ISO date format)
- `endDate` (optional): Filter by sell date to (ISO date format)
- `capitalGainType` (optional): Filter by capital gain type (STCG, LTCG)
- `dematAccountId` (optional): Filter by demat account ID

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** File download with appropriate Content-Type and Content-Disposition headers

---

## Holdings Report Endpoints

### GET /reports/holdings

**Description:** Retrieves current holdings (open positions) from unmatched buy transactions. This endpoint shows all securities that have been bought but not yet sold. It includes unrealized P&L by comparing purchase price with current market price (if available). Holdings represent the current portfolio value.

**Business Logic:**
- Fetch unmatched records (current holdings)
- Join with securities and demat accounts
- For each holding:
  - Calculate total investment: quantity × buy price
  - Fetch current market price (if available from external API or manual update)
  - Calculate current value: quantity × current price
  - Calculate unrealized P&L: current value - total investment
  - Calculate P&L percentage: (unrealized P&L / total investment) × 100
- Apply filters (security name, type, demat account)
- Group by security if multiple buy transactions exist
- Calculate portfolio summary:
  - Total investment across all holdings
  - Total current value
  - Total unrealized P&L
  - P&L percentage
  - Count of total holdings
  - Count of profitable holdings (P&L > 0)
  - Count of losing holdings (P&L < 0)
- Return holdings with summary

**Query Parameters:**

- `securityName` (optional): Search holdings by security name (partial match)
- `securityType` (optional): Filter by security type (EQUITY, FUTURES, OPTIONS, etc.)
- `dematAccountId` (optional): Filter by demat account ID
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "holdings": [
      {
        "id": 1,
        "buyDate": "2024-01-15T00:00:00.000Z",
        "quantity": 50,
        "price": 2450.50,
        "securityId": 1,
        "buyTransactionId": "TXN001",
        "security": {
          "id": 1,
          "name": "Reliance Industries",
          "type": "EQUITY",
          "currentPrice": 2890.75
        },
        "totalInvestment": 122525.00,
        "currentValue": 144537.50,
        "unrealizedPnL": 22012.50,
        "pnlPercentage": 17.96
      }
    ],
    "summary": {
      "totalInvestment": 568537.50,
      "currentValue": 638018.75,
      "unrealizedPnL": 69481.25,
      "pnlPercentage": 12.22,
      "totalHoldings": 6,
      "profitableHoldings": 4,
      "losingHoldings": 2
    }
  },
  "message": "Holdings retrieved successfully"
}
```

---

### GET /reports/holdings/export

**Description:** Exports the holdings report to CSV or Excel format. This is useful for portfolio tracking, sharing with advisors, or maintaining offline records of current positions.

**Business Logic:**
- Apply same filters as GET /reports/holdings
- Fetch all matching holdings (ignore pagination)
- Include calculated fields (investment, current value, P&L)
- Format data based on export format
- Include summary section in export
- Set appropriate file headers
- Return file stream

**Query Parameters:**

- `format` (optional): Export format (csv, excel) - default: csv
- `securityName` (optional): Filter by security name
- `securityType` (optional): Filter by security type
- `dematAccountId` (optional): Filter by demat account ID

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** File download with appropriate Content-Type and Content-Disposition headers

---

## Ledger Endpoints

### GET /ledger

**Description:** Retrieves ledger entries showing all cash flow transactions across demat accounts. The ledger maintains a double-entry bookkeeping system where every trade creates a corresponding cash entry. This provides a complete audit trail of all financial movements and helps reconcile account balances.

**Business Logic:**
- Fetch ledger entries with optional filters
- Join with demat accounts, user accounts, brokers, and transactions
- For each entry:
  - Show transaction amount (negative for purchases, positive for sales)
  - Calculate running balance for the demat account
  - Include transaction details (security, quantity, price)
- Apply date range filter on transaction date
- Support filtering by demat account and transaction type
- Calculate summary:
  - Total debits (all negative amounts)
  - Total credits (all positive amounts)
  - Net amount (credits - debits)
  - Total transaction count
- Return entries sorted by date (newest first) with summary

**Query Parameters:**

- `startDate` (optional): Filter by transaction date from (ISO date format: YYYY-MM-DD)
- `endDate` (optional): Filter by transaction date to (ISO date format: YYYY-MM-DD)
- `dematAccountId` (optional): Filter by specific demat account ID
- `transactionType` (optional): Filter by transaction type (BUY, SELL, CREDIT, DEBIT)
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `offset` (optional): Number of records to skip (default: 0)

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": 1,
        "date": "2024-09-15T00:00:00.000Z",
        "dematAccountId": 1,
        "tradeTransactionId": "TXN001",
        "transactionAmount": -245050.00,
        "balance": 754950.00,
        "dematAccount": {
          "id": 1,
          "userAccountId": 1,
          "brokerId": 1,
          "userAccount": {
            "id": 1,
            "name": "John Doe"
          },
          "broker": {
            "id": 1,
            "name": "Zerodha"
          }
        },
        "transaction": {
          "id": "TXN001",
          "date": "2024-09-15T00:00:00.000Z",
          "type": "BUY",
          "quantity": 100,
          "price": 2450.50,
          "securityId": 1,
          "deliveryType": "Delivery",
          "referenceNumber": "REF001",
          "security": {
            "id": 1,
            "name": "Reliance Industries",
            "type": "EQUITY"
          }
        },
        "remarks": "Purchase of equity shares"
      }
    ],
    "summary": {
      "totalDebits": 787868.75,
      "totalCredits": 248037.50,
      "netAmount": -539831.25,
      "totalTransactions": 8
    }
  },
  "message": "Ledger entries retrieved successfully"
}
```

---

### GET /ledger/export

**Description:** Exports the ledger to CSV or Excel format. This is essential for accounting purposes, tax filing, and financial reconciliation with broker statements.

**Business Logic:**
- Apply same filters as GET /ledger
- Fetch all matching entries (ignore pagination)
- Include all transaction details and running balance
- Format data based on export format
- Include summary section
- Set appropriate file headers
- Return file stream

**Query Parameters:**

- `format` (optional): Export format (csv, excel) - default: csv
- `startDate` (optional): Filter by transaction date from (ISO date format)
- `endDate` (optional): Filter by transaction date to (ISO date format)
- `dematAccountId` (optional): Filter by demat account ID
- `transactionType` (optional): Filter by transaction type

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** File download with appropriate Content-Type and Content-Disposition headers

---

## Financial Year Configuration Endpoints

### GET /financial-years

**Description:** Retrieves all financial year configurations including tax rates for STCG and LTCG. Financial years in India run from April 1 to March 31. This reference data is used for calculating tax liabilities on capital gains.

**Business Logic:**
- Fetch all financial year records
- Return sorted by start date (most recent first)
- No pagination needed as data is limited
- Validate that date ranges don't overlap

**Headers:**

```http
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "FY 2024-25",
      "startDate": "2024-04-01T00:00:00.000Z",
      "lastDate": "2025-03-31T23:59:59.999Z",
      "stcgRate": 15.0,
      "ltcgRate": 10.0,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "message": "Financial years retrieved successfully"
}
```

---

### POST /financial-years

**Description:** Creates a new financial year configuration with tax rates. This allows the system to adapt to changing tax regulations over time. Each financial year must have non-overlapping date ranges.

**Business Logic:**
- Validate all required fields
- Validate start date is before last date
- Check for date range conflicts with existing financial years
- Validate tax rates are between 0-100 (percentage)
- Validate title follows format "FY YYYY-YY"
- Create financial year record with timestamp
- Return created record

**Headers:**

```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "title": "string (required, e.g., 'FY 2024-25')",
  "startDate": "string (required, ISO date format)",
  "lastDate": "string (required, ISO date format)",
  "stcgRate": "number (required, min 0, max 100, represents percentage)",
  "ltcgRate": "number (required, min 0, max 100, represents percentage)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "FY 2024-25",
    "startDate": "2024-04-01T00:00:00.000Z",
    "lastDate": "2025-03-31T23:59:59.999Z",
    "stcgRate": 15.0,
    "ltcgRate": 10.0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Financial year created successfully"
}
```

**Errors:**

- `400` - Date range conflicts with existing financial year
- `422` - Validation errors

---

## Data Export Endpoints

### GET /brokers/export

**Description:** Exports broker data to CSV or Excel format. Useful for maintaining offline records or sharing with compliance teams.

**Business Logic:**
- Apply same filters as GET /brokers
- Fetch all matching brokers (no pagination)
- Format data: ID, Name, PAN Number, Address, Created Date, Updated Date
- For CSV: comma-separated with headers
- For Excel: formatted workbook with column widths
- Set appropriate Content-Type and Content-Disposition headers
- Return file stream

**Query Parameters:**

- `format` (optional): Export format (csv, excel) - default: csv
- `name` (optional): Filter by broker name

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** File download with appropriate Content-Type and Content-Disposition headers

---

### GET /securities/export

**Description:** Exports securities data to CSV or Excel format. Useful for maintaining a master list of tradable instruments.

**Business Logic:**
- Apply same filters as GET /securities
- Fetch all matching securities (no pagination)
- Include security details and exchange information
- Format data: ID, Name, Type, Strike Price, Expiry, Exchange Name, Exchange Code
- Handle null values for strike price and expiry
- Set appropriate file headers
- Return file stream

**Query Parameters:**

- `format` (optional): Export format (csv, excel) - default: csv
- `name` (optional): Filter by security name
- `type` (optional): Filter by security type

**Headers:**

```http
Authorization: Bearer <token>
```

**Response:** File download with appropriate Content-Type and Content-Disposition headers

---

## Common Error Responses

All endpoints may return the following error responses:

**Validation Error (422):**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "field_name": ["Error message 1", "Error message 2"]
  }
}
```

**Authentication Error (401):**

```json
{
  "success": false,
  "message": "Unauthorized access"
}
```

**Not Found Error (404):**

```json
{
  "success": false,
  "message": "Resource not found"
}
```

**Server Error (500):**

```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Implementation Notes for Backend Development

### Database Considerations

1. **Transactions**: Use database transactions for operations that modify multiple tables (e.g., creating a transaction also creates ledger entry and updates matched/unmatched records)

2. **Indexing**: Add indexes on:
   - Foreign keys (brokerId, userAccountId, securityId, dematAccountId)
   - Frequently queried columns (date, type, capitalGainType)
   - Search columns (name fields with text indexes)

3. **Cascading**: Configure foreign key constraints with appropriate cascade rules

4. **Timestamps**: Use database-level timestamps for createdAt and updatedAt

### Business Logic Implementation

1. **FIFO Matching Algorithm**: When processing SELL transactions:
   - Query unmatched records for the security
   - Sort by buy date (oldest first)
   - Match sell quantity with buy quantities
   - Create matched records for paired transactions
   - Update or delete fully matched unmatched records
   - Create new unmatched record if partial match

2. **Capital Gains Calculation**:
   - Calculate holding period in days
   - For EQUITY: < 365 days = STCG, ≥ 365 days = LTCG
   - For other securities: < 1095 days = STCG, ≥ 1095 days = LTCG
   - Store calculated values in matched records

3. **Balance Management**:
   - Maintain running balance in demat accounts
   - Validate sufficient balance before SELL transactions
   - Update balance atomically with transaction creation

4. **Validation Layer**:
   - Implement comprehensive input validation
   - Use middleware for common validations (auth, PAN format, date ranges)
   - Return descriptive error messages

5. **Security**:
   - Implement JWT-based authentication
   - Use bcrypt for password hashing
   - Implement rate limiting on auth endpoints
   - Validate user owns resources before allowing modifications
   - Sanitize inputs to prevent SQL injection

6. **Logging**:
   - Log all API requests and responses
   - Log error stack traces
   - Implement audit trail for sensitive operations (transaction modifications, deletions)

7. **Performance**:
   - Implement query result caching for reference data (exchanges, financial years)
   - Use pagination consistently
   - Optimize complex queries with proper joins and indexes
   - Consider implementing background jobs for report generation

---