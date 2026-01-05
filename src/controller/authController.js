const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const OtpModel = require('../models/OtpModel');  
const sendEmail = require("../utility/SendEmailUtility");

// Admin email from environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // example: admin@a2it.com

// -------------------- Admin Request OTP --------------------
// controllers/userController.js
exports.AdminRequestOtp = async (req, res) => {
  try {
    const { userEmail, adminEmail } = req.body;

    console.log('📧 OTP Request Body:', req.body);

    // ✅ adminEmail যদি request body-তে না থাকে, environment থেকে নিন
    const targetAdminEmail = adminEmail || process.env.ADMIN_EMAIL;
    
    console.log('🎯 Sending OTP to:', targetAdminEmail);
    console.log('👤 For user:', userEmail);

    // User আছে কিনা চেক করুন
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({ 
        status: "fail", 
        message: "User not found" 
      });
    }

    // OTP জেনারেট করুন
    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log('🔢 Generated OTP:', otp);

    // পুরনো OTP invalidate করুন
    await OtpModel.updateMany(
      { email: targetAdminEmail, userEmail, status: 0 },
      { status: 1 }
    );

    // নতুন OTP সেভ করুন
    await OtpModel.create({
      email: targetAdminEmail,
      otp,
      status: 0,
      userEmail
    });

    // Email পাঠান
    const emailSubject = `A2IT HRM - Password Reset OTP`;
    const emailText = `
Password Reset Request

User: ${userEmail}
OTP Code: ${otp}

This OTP is valid for 10 minutes.

Regards,
A2IT HRM System
    `;

    console.log('📤 Sending email...');
    
    try {
      await sendEmail(targetAdminEmail, emailSubject, emailText);
      console.log('✅ Email sent successfully');
    } catch (emailError) {
      console.error('❌ Email error:', emailError.message);
      // Email fail হলেও OTP রেসপন্স পাঠাবেন
    }

    // Response
    return res.status(200).json({
      status: "success",
      message: "OTP sent successfully",
      adminEmail: targetAdminEmail,
      userEmail: userEmail
      // Development mode-এ OTPও পাঠান
    (process.env.NODE_ENV === 'development' && { otp: otp })
    });

  } catch (error) {
    console.error('❌ OTP Request Error:', error);
    res.status(500).json({ 
      status: "fail", 
      message: error.message 
    });
  }
};


// -------------------- Admin Verify OTP & Reset User Password --------------------
exports.AdminResetPassword = async (req, res) => {
    try {
        const { userEmail, otp, newPassword } = req.body;

        // Verify OTP for admin and the specific user
        const otpRecord = await OtpModel.findOne({ email: ADMIN_EMAIL, otp, status: 0, userEmail });
        if (!otpRecord) {
            return res.status(400).json({ status: "fail", message: "Invalid OTP" });
        }

        // Mark OTP as used
        otpRecord.status = 1;
        await otpRecord.save();

        // Hash the new password and update user's password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne({ email: userEmail }, { password: hashedPassword });

        res.status(200).json({ status: "success", message: `Password for ${userEmail} reset successfully` });

    } catch (error) {
        res.status(500).json({ status: "fail", message: error.message });
    }
};