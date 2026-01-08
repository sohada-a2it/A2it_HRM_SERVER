// 📁 controllers/authController.js

const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const OtpModel = require('../models/OtpModel');
const SendEmailUtility = require('../utility/SendEmailUtility');

// 🔐 Admin email (ONLY admin receives OTP)
const ADMIN_EMAIL = 'admin@attendance-system.a2itltd.com';

/* =========================================================
   ADMIN REQUEST OTP
========================================================= */
exports.AdminRequestOtp = async (req, res) => {
  try {
    const { userEmail } = req.body;

    console.log('🔐 AdminRequestOtp:', userEmail);

    if (!userEmail) {
      return res.status(400).json({
        status: 'fail',
        message: 'User email is required',
      });
    }

    // Check user exists
    const user = await User.findOne({
      email: userEmail.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);

    // Save OTP
    await OtpModel.create({
      email: ADMIN_EMAIL,
      userEmail: userEmail.toLowerCase().trim(),
      otp,
      status: 0, // 0 = unused
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    // ✅ SEND RESPONSE FIRST (NO TIMEOUT)
    res.status(200).json({
      status: 'success',
      message: 'OTP generated successfully',
      otp, // ⚠️ dev only — remove in production
      userEmail,
    });

    // 📤 SEND EMAIL ASYNC (NON-BLOCKING)
    SendEmailUtility(
      ADMIN_EMAIL,
      'A2IT HRM - Password Reset OTP',
      `OTP to reset password for ${userEmail} is: ${otp}`
    ).then(() => {
      console.log('📧 OTP email sent to admin');
    }).catch((err) => {
      console.error('❌ OTP email failed:', err.message);
    });

  } catch (error) {
    console.error('❌ AdminRequestOtp error:', error.message);
    return res.status(500).json({
      status: 'fail',
      message: 'Server error',
    });
  }
};

/* =========================================================
   ADMIN VERIFY OTP (STEP 2)
========================================================= */
exports.AdminVerifyOtp = async (req, res) => {
  try {
    const { userEmail, otp } = req.body;

    if (!userEmail || !otp) {
      return res.status(400).json({
        status: 'fail',
        message: 'userEmail and otp are required',
      });
    }

    const otpRecord = await OtpModel.findOne({
      email: ADMIN_EMAIL,
      userEmail: userEmail.toLowerCase().trim(),
      otp: parseInt(otp),
      status: 0,
    });

    if (!otpRecord) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or expired OTP',
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      otpRecord.status = 2; // expired
      await otpRecord.save();

      return res.status(400).json({
        status: 'fail',
        message: 'OTP expired',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'OTP verified successfully',
      verified: true,
    });

  } catch (error) {
    console.error('❌ AdminVerifyOtp error:', error.message);
    return res.status(500).json({
      status: 'fail',
      message: 'OTP verification failed',
    });
  }
};

/* =========================================================
   ADMIN RESET PASSWORD (FINAL STEP)
========================================================= */
exports.AdminResetPassword = async (req, res) => {
  try {
    const { userEmail, otp, newPassword } = req.body;

    if (!userEmail || !otp || !newPassword) {
      return res.status(400).json({
        status: 'fail',
        message: 'userEmail, otp and newPassword are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'fail',
        message: 'Password must be at least 6 characters',
      });
    }

    const otpRecord = await OtpModel.findOne({
      email: ADMIN_EMAIL,
      userEmail: userEmail.toLowerCase().trim(),
      otp: parseInt(otp),
      status: 0,
    });

    if (!otpRecord) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid or expired OTP',
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      otpRecord.status = 2;
      await otpRecord.save();

      return res.status(400).json({
        status: 'fail',
        message: 'OTP expired',
      });
    }

    const user = await User.findOne({
      email: userEmail.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    // Mark OTP as used
    otpRecord.status = 1;
    otpRecord.usedAt = new Date();
    await otpRecord.save();

    // Hash password (FAST & SAFE)
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.updateOne(
      { email: userEmail.toLowerCase().trim() },
      {
        password: hashedPassword,
        lastPasswordChange: new Date(),
      }
    );

    return res.status(200).json({
      status: 'success',
      message: `Password reset successful for ${userEmail}`,
    });

  } catch (error) {
    console.error('❌ AdminResetPassword error:', error.message);
    return res.status(500).json({
      status: 'fail',
      message: 'Password reset failed',
    });
  }
};

/* =========================================================
   CLEANUP EXPIRED OTPs (OPTIONAL CRON)
========================================================= */
exports.CleanupExpiredOtps = async (_req, res) => {
  try {
    const result = await OtpModel.deleteMany({
      $or: [
        { status: 2 },
        { status: 0, expiresAt: { $lt: new Date() } },
      ],
    });

    return res.status(200).json({
      status: 'success',
      deleted: result.deletedCount,
    });

  } catch (error) {
    console.error('❌ CleanupExpiredOtps error:', error.message);
    return res.status(500).json({
      status: 'fail',
      message: 'Cleanup failed',
    });
  }
};
