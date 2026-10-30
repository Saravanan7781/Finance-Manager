const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());

// CORS - restrict to specific origins (native apps send no Origin header)
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:3000'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// Rate limiting (disabled in tests, which fire many requests from one address)
if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 300,
        message: { error: 'Too many requests, please try again later.' },
    });
    app.use('/api/', limiter);

    // Stricter rate limit for auth endpoints
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: { error: 'Too many auth attempts, please try again later.' },
    });
    app.use('/api/auth/', authLimiter);
}

app.use(bodyParser.json({ limit: '100kb' }));

// Log all requests
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    }
    next();
});

app.get('/', (req, res) => {
    res.send('Family Finance API is running...');
});

// Import Routes
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const familyRoutes = require('./routes/family');
const transactionRoutes = require('./routes/transactions');
const goalRoutes = require('./routes/goals');
const loanRoutes = require('./routes/loans');
const budgetRoutes = require('./routes/budgets');

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/budgets', budgetRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
    if (process.env.NODE_ENV !== 'test') console.error('SERVER ERROR:', err.message);
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Something went wrong on the server'
        : err.message;
    res.status(statusCode).json({ error: message });
});

module.exports = app;
