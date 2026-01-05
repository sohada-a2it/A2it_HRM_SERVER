const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const OtpModel = require('../models/OtpModel');  
const sendEmail = require("../utility/SendEmailUtility");

// Admin email from environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // e.g., admin@a2it.com

// -------------------- Admin Request OTP --------------------
const AdminRequestOtp = async (req, res) => {
  try {
    const { userEmail } = req.body;

    console.log('🚀 OTP REQUEST FOR:', userEmail);

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Save to database
    await OtpModel.create({
      email: process.env.ADMIN_EMAIL || 'admin@a2it.com',
      otp,
      status: 0,
      userEmail
    });

    // DEVELOPMENT MODE: Show OTP in console instead of sending email
    if (process.env.NODE_ENV === 'development') {
      console.log('='.repeat(50));
      console.log('📧 DEVELOPMENT MODE - OTP NOT SENT VIA EMAIL');
      console.log('👤 User:', userEmail);
      console.log('🔢 OTP CODE:', otp);
      console.log('⏰ Time:', new Date().toLocaleTimeString());
      console.log('='.repeat(50));
    } else {
      // PRODUCTION: Send actual email
      try {
        await sendEmail(
          process.env.ADMIN_EMAIL,
          `Password Reset OTP - ${userEmail}`,
          `OTP: ${otp}\nFor: ${userEmail}\nValid for 10 minutes`
        );
      } catch (emailError) {
        console.error('Email error (non-blocking):', emailError.message);
      }
    }

    res.status(200).json({
      status: "success",
      message: process.env.NODE_ENV === 'development' 
        ? "OTP generated (check console)" 
        : "OTP sent to admin email",
      adminEmail: process.env.ADMIN_EMAIL,
      otp: process.env.NODE_ENV === 'development' ? otp : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OTP Error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// -------------------- Admin Verify OTP & Reset User Password --------------------
const AdminResetPassword = async (req, res) => {
  try {
    const { userEmail, otp, newPassword } = req.body;

    // Verify OTP exists and is unused
    const otpRecord = await OtpModel.findOne({ email: ADMIN_EMAIL, userEmail, otp, status: 0 });
    if (!otpRecord) {
      return res.status(400).json({ status: "fail", message: "Invalid OTP" });
    }

    // Mark OTP as used
    otpRecord.status = 1;
    await otpRecord.save();

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await User.updateOne({ email: userEmail }, { password: hashedPassword });

    return res.status(200).json({
      status: "success",
      message: `Password for ${userEmail} reset successfully`
    });

  } catch (error) {
    console.error("❌ AdminResetPassword error:", error);
    return res.status(500).json({ status: "fail", message: error.message });
  }
};

// Export functions for routes
module.exports = {
  AdminRequestOtp,
  AdminResetPassword
};
