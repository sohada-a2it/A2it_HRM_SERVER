const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const OtpModel = require('../models/OtpModel');  

// ✅ CORRECT IMPORT - NO DESTRUCTURING
const SendEmailUtility = require("../utility/SendEmailUtility");

// Admin email
const ADMIN_EMAIL = 'admin@attendance-system.a2itltd.com';

// -------------------- Admin Request OTP --------------------
exports.AdminRequestOtp = async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    console.log('🔐 Admin Request OTP called:', {
      userEmail: userEmail,
      adminEmail: ADMIN_EMAIL
    });

    // Validate input
    if (!userEmail) {
      return res.status(400).json({ 
        status: "fail", 
        message: "User email is required" 
      });
    }

    // Find user
    const user = await User.findOne({ email: userEmail.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ 
        status: "fail", 
        message: "User not found" 
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    console.log('🔢 Generated OTP:', otp);

    // Invalidate old OTPs
    await OtpModel.updateMany(
      { 
        email: ADMIN_EMAIL, 
        userEmail: userEmail.toLowerCase().trim(), 
        status: 0 
      },
      { 
        status: 2,
        updatedAt: new Date()
      }
    );

    // Save OTP
    const otpRecord = await OtpModel.create({
      email: ADMIN_EMAIL,
      otp: otp,
      status: 0,
      userEmail: userEmail.toLowerCase().trim(),
      expiresAt: otpExpiry
    });

    console.log('💾 OTP saved to DB');

    // Prepare email content
    const emailSubject = `A2IT HRM - Password Reset OTP`;
    const emailText = `
Password Reset Request

User Email: ${userEmail}
OTP Code: ${otp}

This OTP is valid for 10 minutes.
Do not share this OTP with anyone.

If you didn't request this, please ignore this email.

A2IT HRM System
    `;

    // Send email
    console.log('📤 Attempting to send email...');
    
    try {
      // ✅ CORRECT CALL - SendEmailUtility is a function
      await SendEmailUtility(
        ADMIN_EMAIL,
        emailSubject,
        emailText
      );
      
      console.log('✅ Email sent successfully');
      
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError.message);
      
      // In development mode, show OTP anyway
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ 
          status: "fail", 
          message: "Failed to send OTP email" 
        });
      }
      
      console.log('⚠️ Development mode - OTP shown despite email failure:', otp);
    }

    // Return response
    return res.status(200).json({
      status: "success",
      message: "OTP sent to admin email",
      data: {
        otp: otp, // For development/testing
        userEmail: userEmail,
        expiresAt: otpExpiry,
        ...(process.env.NODE_ENV !== 'production' && {
          note: "Development mode - OTP shown"
        })
      }
    });

  } catch (error) {
    console.error('❌ AdminRequestOtp error:', error.message);
    res.status(500).json({ 
      status: "fail", 
      message: "Server error",
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

// -------------------- Admin Reset Password --------------------
exports.AdminResetPassword = async (req, res) => {
    try {
        const { userEmail, otp, newPassword } = req.body;

        console.log('🔑 AdminResetPassword called:', { userEmail });

        // Validate
        if (!userEmail || !otp || !newPassword) {
            return res.status(400).json({ 
                status: "fail", 
                message: "All fields required" 
            });
        }

        // Find OTP
        const otpRecord = await OtpModel.findOne({ 
            email: ADMIN_EMAIL, 
            otp: parseInt(otp), 
            status: 0,
            userEmail: userEmail.toLowerCase().trim()
        });

        if (!otpRecord) {
            return res.status(400).json({ 
                status: "fail", 
                message: "Invalid OTP" 
            });
        }

        // Check expiry
        if (otpRecord.expiresAt && otpRecord.expiresAt < new Date()) {
            otpRecord.status = 2;
            await otpRecord.save();
            return res.status(400).json({ 
                status: "fail", 
                message: "OTP expired" 
            });
        }

        // Find user
        const user = await User.findOne({ email: userEmail.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ 
                status: "fail", 
                message: "User not found" 
            });
        }

        // Mark OTP as used
        otpRecord.status = 1;
        otpRecord.usedAt = new Date();
        await otpRecord.save();

        // Update password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.updateOne(
            { email: userEmail.toLowerCase().trim() }, 
            { 
                password: hashedPassword,
                lastPasswordChange: new Date()
            }
        );

        console.log('✅ Password updated for:', userEmail);

        return res.status(200).json({ 
            status: "success", 
            message: `Password reset successful for ${userEmail}` 
        });

    } catch (error) {
        console.error('❌ AdminResetPassword error:', error.message);
        res.status(500).json({ 
            status: "fail", 
            message: "Server error" 
        });
    }
};