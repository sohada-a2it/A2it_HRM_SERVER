// app.js - SIMPLE VERSION WITHOUT MONGODB OPTIONS
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const route = require('./src/routes/api');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  console.log(`\n📨 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Auth header:', req.headers.authorization ? 'Present ✓' : 'Missing ✗');
  console.log('Body keys:', Object.keys(req.body).length > 0 ? Object.keys(req.body) : 'Empty');
  next();
});

// ===================== Mongoose Connect =====================
let mongoose;
try {
  mongoose = require('mongoose');
  console.log('Mongoose version:', mongoose.version);

  const url = `mongodb+srv://a2itsohada_db_user:a2it-hrm@cluster0.18g6dhm.mongodb.net/a2itHRM?retryWrites=true&w=majority`;

  mongoose.connect(url)
    .then(async () => {
      console.log("✅ MongoDB Connected");

      // ===================== Holiday Service + Cron =====================
      const cron = require('node-cron');
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

      // Daily Auto Attendance → 00:01
      cron.schedule('1 0 * * *', async () => {
        try {
          console.log('⏱️ Running daily auto holiday attendance...');
          await autoMarkHolidayAttendance();
        } catch (err) {
          console.error('❌ Daily auto attendance failed:', err.message);
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

// Routes
app.use("/api/v1", route);

// Test route without DB
app.get('/', (req, res) => {
  res.json({ 
    message: 'A2iL HRM API is running',
    database: mongoose ? 'Connected' : 'Not connected',
    time: new Date().toISOString()
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});
// server.js or app.js এ
const cron = require('node-cron');

// Auto mark attendance at 9:00 AM every day
cron.schedule('0 9 * * *', async () => {
  console.log('🕘 Running daily auto attendance marking...');
  try {
    // Call your auto marking endpoint
    // You can call the controller function directly or make HTTP request
    const result = await attendanceController.autoMarkAttendance({}, {
      status: (code) => ({ json: (data) => console.log('Auto-mark result:', data) })
    });
  } catch (error) {
    console.error('Cron job error:', error);
  }
});

// Alternatively, mark attendance at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('🌙 Running midnight auto attendance marking...');
  // Same implementation as above
});
module.exports = app;
