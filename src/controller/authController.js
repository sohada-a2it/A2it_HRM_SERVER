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

    // Check if user exists
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({ status: "fail", message: "User not found" });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Invalidate old OTPs for this user
    await OtpModel.updateMany(
      { email: ADMIN_EMAIL, userEmail, status: 0 },
      { status: 1 }
    );

    // Save new OTP
    await OtpModel.create({
      email: ADMIN_EMAIL,
      userEmail,
      otp,
      status: 0,
      createdAt: new Date()
    });

    // Send OTP email (async, non-blocking)
    sendEmail(
      ADMIN_EMAIL,
      "A2IT Admin Password Reset OTP",
      `OTP to reset password for ${userEmail} is ${otp}`
    ).catch(err => {
      console.error("❌ Email error:", err.message);
    });

    // Respond to frontend
    return res.status(200).json({
      status: "success",
      message: "OTP sent to admin email"
    });

  } catch (error) {
    console.error("❌ AdminRequestOtp error:", error);
    return res.status(500).json({ status: "fail", message: error.message });
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
