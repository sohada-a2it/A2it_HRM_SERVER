// src/models/OtpModel.js - COMPLETE NEW VERSION
const mongoose = require('mongoose');

// Get the existing schema if model exists, otherwise create new
let OtpModel;

// Check if model already exists in mongoose
if (mongoose.models.otps) {
  // Use existing model
  OtpModel = mongoose.models.otps;
  console.log('📦 Using existing OTP model');
} else {
  // Create new schema and model
  const otpSchema = new mongoose.Schema({
    email: {
      type: String,
      default: 'admin@a2it.com',
      required: true
    },
    otp: {
      type: Number,
      required: true
    },
    status: {
      type: Number,
      default: 0 // 0 = active, 1 = used, 2 = expired
    },
    userEmail: {
      type: String,
      required: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600 // Auto delete after 10 minutes (600 seconds)
    }
  }, {
    versionKey: false,
    timestamps: false
  });

  // Create model
  OtpModel = mongoose.model('otps', otpSchema);
  console.log('🆕 Created new OTP model');
}

module.exports = OtpModel;