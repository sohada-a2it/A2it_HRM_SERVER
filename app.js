// app.js - FIXED VERSION
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const route = require('./src/routes/api');
const cron = require('node-cron');

const app = express();

// ===================== BODY PARSERS FIRST =====================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===================== CORS CONFIGURATION =====================
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://hrm.a2itltd.com',
      'https://www.hrm.a2itltd.com'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'Authorization'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// ===================== MANUAL CORS HEADERS FOR ALL REQUESTS =====================
app.use((req, res, next) => {
  // Set CORS headers for all responses
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://hrm.a2itltd.com',
    'https://www.hrm.a2itltd.com'
  ];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Headers');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  next();
});

// ===================== REQUEST HANDLING MIDDLEWARE =====================
app.use((req, res, next) => {
  console.log(`\n📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin || 'No origin');
  console.log('Auth header:', req.headers.authorization ? 'Present ✓' : 'Missing ✗');
  console.log('Body keys:', Object.keys(req.body).length > 0 ? Object.keys(req.body) : 'Empty');
  
  // Handle OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS (preflight) request handled');
    return res.status(200).end();
  }
  
  // Handle HEAD requests
  if (req.method === 'HEAD') {
    console.log('✅ HEAD request handled');
    return res.status(200).end();
  }
  
  next();
});

// ===================== MONGOOSE CONNECTION =====================
let mongoose;
try {
  mongoose = require('mongoose');
  console.log('Mongoose version:', mongoose.version);

  const url = `mongodb+srv://a2itsohada_db_user:a2it-hrm@cluster0.18g6dhm.mongodb.net/a2itHRM?retryWrites=true&w=majority`;

  mongoose.connect(url)
    .then(async () => {
      console.log("✅ MongoDB Connected");

      // ===================== HOLIDAY SERVICE + CRON =====================
      const { autoSyncBangladeshHolidays, autoMarkHolidayAttendance } = require('./src/services/HolidayAutoSync');

      // Yearly Holiday Sync → 1 Jan 00:05
      cron.schedule('5 0 1 1 *', async () => {
        try {
          console.log('🗓️ Running yearly holiday sync...');
          await autoSyncBangladeshHolidays();
        } catch (err) {
          console.error('❌ Yearly holiday sync failed:', err.message);
        }
      });

      // Daily Auto Attendance for Holidays → 00:01
      cron.schedule('1 0 * * *', async () => {
        try {
          console.log('⏱️ Running daily auto holiday attendance...');
          await autoMarkHolidayAttendance();
        } catch (err) {
          console.error('❌ Daily auto attendance failed:', err.message);
        }
      });

      // Auto mark attendance at 9:00 AM every day
      cron.schedule('0 9 * * *', async () => {
        console.log('🕘 Running daily auto attendance marking at 9:00 AM...');
        try {
          // You need to import or require your attendance controller here
          // const attendanceController = require('./src/controllers/attendanceController');
          // await attendanceController.autoMarkAttendance();
          console.log('✅ Auto attendance marked at 9:00 AM');
        } catch (error) {
          console.error('❌ 9:00 AM Cron job error:', error);
        }
      });

      // Auto mark attendance at midnight
      cron.schedule('0 0 * * *', async () => {
        console.log('🌙 Running midnight auto attendance marking...');
        try {
          // const attendanceController = require('./src/controllers/attendanceController');
          // await attendanceController.autoMarkAttendance();
          console.log('✅ Auto attendance marked at midnight');
        } catch (error) {
          console.error('❌ Midnight Cron job error:', error);
        }
      });

      // Optional: Run immediately on server start for testing/demo
      try {
        await autoSyncBangladeshHolidays();
        await autoMarkHolidayAttendance();
      } catch (err) {
        console.error('❌ Initial holiday service run failed:', err.message);
      }

    })
    .catch(err => {
      console.log("⚠️ MongoDB Connection Warning:", err.message);
      console.log("⚠️ API will work but database operations will fail");
    });

} catch (error) {
  console.log("⚠️ Mongoose not available, running in test mode");
}

// ===================== ROUTES =====================
// Health check endpoint - এইটা CORS এর আগে রাখুন
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose ? 'Connected' : 'Not connected',
    cors: 'Enabled'
  });
});

// Test endpoint for HEAD requests
app.head('/api/v1/test-head', (req, res) => {
  console.log('✅ HEAD request to test endpoint');
  res.status(200).end();
});

// Main API routes
app.use("/api/v1", route);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'A2iL HRM API is running',
    database: mongoose ? 'Connected' : 'Not connected',
    time: new Date().toISOString(),
    cors: 'Active'
  });
});

// ===================== ERROR HANDLERS =====================
// 404 handler
app.use("*", (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  console.log(`Origin: ${req.headers.origin}`);
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.method} ${req.originalUrl} not found`,
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://hrm.a2itltd.com',
      'https://www.hrm.a2itltd.com'
    ]
  });
});

// CORS Error handler (এইটা আগে রাখুন)
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    console.error('🔥 CORS Error:', {
      origin: req.headers.origin,
      method: req.method,
      url: req.url
    });
    
    return res.status(403).json({
      success: false,
      message: 'CORS: Origin not allowed',
      yourOrigin: req.headers.origin,
      allowedOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://hrm.a2itltd.com',
        'https://www.hrm.a2itltd.com'
      ]
    });
  }
  next(err);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Handler:', err.message);
  console.error('Stack:', err.stack);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// ===================== SERVER START =====================
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Allowed origins:`);
    console.log(`   - http://localhost:3000`);
    console.log(`   - http://localhost:3001`);
    console.log(`   - https://hrm.a2itltd.com`);
    console.log(`   - https://www.hrm.a2itltd.com`);
    console.log(`🕒 Cron jobs scheduled for:`);
    console.log(`   - Yearly holiday sync: 1 Jan 00:05`);
    console.log(`   - Holiday attendance: Daily 00:01`);
    console.log(`   - Auto attendance: Daily 00:00 & 09:00`);
  });
}

module.exports = app;