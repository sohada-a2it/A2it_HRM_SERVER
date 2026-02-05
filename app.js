// app.js - UPDATED VERSION FOR 403 FIX
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const route = require('./src/routes/api');

const app = express();

// ===================== CORS CONFIGURATION =====================
// Render.com এবং Vercel এর জন্য CORS সেটিংস
const allowedOrigins = [ 
  'https://a2itserver.onrender.com',
  "https://hrm.a2itltd.com", // আপনার নিজের API সার্ভার
  process.env.CLIENT_URL
].filter(Boolean);

console.log('🛡️ Allowed CORS Origins:', allowedOrigins);

// CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    // Development mode এ সব allow
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log(`🚫 CORS blocked origin: ${origin}`);
      // Production এ শুধু allowed origins
      return callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-access-token',
    'x-auth-token'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// Handle preflight requests
app.options('*', cors());

// Render.com specific settings
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`\n📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin || 'No origin');
  console.log('Auth header:', req.headers.authorization ? 'Present ✓' : 'Missing ✗');
  console.log('User-Agent:', req.headers['user-agent']?.substring(0, 50) || 'No agent');
  next();
});

// ===================== DATABASE CONNECTION =====================
let mongoose;
try {
  mongoose = require('mongoose');
  console.log('📦 Mongoose version:', mongoose.version);

  const url = process.env.MONGODB_URI || `mongodb+srv://a2itsohada_db_user:a2it-hrm@cluster0.18g6dhm.mongodb.net/a2itHRM?retryWrites=true&w=majority`;

  // MongoDB connection options
  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  };

  mongoose.connect(url, options)
    .then(async () => {
      console.log("✅ MongoDB Connected Successfully");
      
      // ===================== CRON JOBS =====================
      try {
        const cron = require('node-cron');
        console.log('⏰ Setting up cron jobs...');
        
        // Holiday Sync - 1 Jan at 00:05
        cron.schedule('5 0 1 1 *', async () => {
          console.log('🗓️ Running yearly holiday sync...');
          try {
            const { autoSyncBangladeshHolidays } = require('./src/services/HolidayAutoSync');
            await autoSyncBangladeshHolidays();
            console.log('✅ Holiday sync completed');
          } catch (err) {
            console.error('❌ Holiday sync failed:', err.message);
          }
        });

        // Daily Auto Attendance - 00:01 daily
        cron.schedule('1 0 * * *', async () => {
          console.log('⏱️ Running daily auto attendance...');
          try {
            const { autoMarkHolidayAttendance } = require('./src/services/HolidayAutoSync');
            await autoMarkHolidayAttendance();
            console.log('✅ Auto attendance completed');
          } catch (err) {
            console.error('❌ Auto attendance failed:', err.message);
          }
        });

        // Auto mark attendance at 9:00 AM
        cron.schedule('0 9 * * *', async () => {
          console.log('🕘 Running 9 AM auto attendance...');
          try {
            // Call your attendance controller here
            // Example: await attendanceController.autoMarkRegularAttendance();
          } catch (err) {
            console.error('❌ 9 AM attendance failed:', err.message);
          }
        });

        console.log('✅ Cron jobs scheduled');
      } catch (cronError) {
        console.log('⚠️ Cron jobs not set up:', cronError.message);
      }
    })
    .catch(err => {
      console.error("❌ MongoDB Connection Failed:", err.message);
      console.log("⚠️ Running without database connection");
    });

} catch (error) {
  console.log("⚠️ Mongoose not available:", error.message);
}

// ===================== ROUTES =====================
app.use("/api/v1", route);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose?.connection?.readyState === 1 ? 'connected' : 'disconnected',
    service: 'A2iL HRM API'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 A2iL HRM API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose?.connection?.readyState === 1 ? '✅ Connected' : '❌ Disconnected',
    cors: '✅ Enabled',
    endpoints: {
      health: '/health',
      api: '/api/v1',
      admin: '/api/v1/admin',
      employees: '/api/v1/employees',
      expenses: '/api/v1/extra-expenses'
    }
  });
});

// 404 handler - ALL methods
app.all("*", (req, res) => {
  console.log(`🚫 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false,
    message: "Route not found",
    requested: `${req.method} ${req.originalUrl}`,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /api/v1/*',
      'POST /api/v1/*',
      'PUT /api/v1/*',
      'DELETE /api/v1/*'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.message);
  console.error(err.stack);
  
  // CORS error handle
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS Error: Origin not allowed',
      origin: req.headers.origin,
      allowedOrigins: allowedOrigits
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = app;