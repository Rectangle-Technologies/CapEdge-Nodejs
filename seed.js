const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Import models
const User = require('./src/models/User');
const StockExchange = require('./src/models/StockExchange');
const FinancialYear = require('./src/models/FinancialYear');

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await StockExchange.deleteMany({});
    await FinancialYear.deleteMany({});

    // Create default admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@capedge.com',
      password: 'admin123', // Will be hashed by the pre-save hook
      isActive: true
    });
    await adminUser.save();

    // Create stock exchanges
    const stockExchanges = [
      { name: 'National Stock Exchange of India', code: 'NSE', country: 'India' },
      { name: 'Bombay Stock Exchange', code: 'BSE', country: 'India' },
      { name: 'Multi Commodity Exchange', code: 'MCX', country: 'India' },
      { name: 'National Commodity and Derivatives Exchange', code: 'NCDEX', country: 'India' }
    ];

    await StockExchange.insertMany(stockExchanges);

    // Create financial year
    const financialYear = new FinancialYear({
      title: 'FY 2024-25',
      startDate: new Date('2024-04-01'),
      lastDate: new Date('2025-03-31'),
      STCGrate: 15, // Will be converted to 0.15 by setter
      LTCGrate: 10, // Will be converted to 0.10 by setter
      isActive: true
    });
    await financialYear.save();

    console.log('Seed data created successfully!');
    console.log('Default admin user: username=admin, password=admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();