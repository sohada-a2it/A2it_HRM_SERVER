// 📁 controllers/authController.js
const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const OtpModel = require('../models/OtpModel');  

// ✅ IMPORT FIX: Make sure the path is correct
const SendEmailUtility = require("../utility/SendEmailUtility");

// Admin email
const ADMIN_EMAIL = 'admin@attendance-system.a2itltd.com';

// -------------------- Admin Request OTP --------------------
exports.AdminRequestOtp = async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    console.log('🔐 Admin Request OTP for:', userEmail);

    // Validate
    if (!userEmail) {
      return res.status(400).json({ 
        status: "fail", 
        message: "User email required" 
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
    console.log('🔢 Generated OTP:', otp);

    // Save OTP
    await OtpModel.create({
      email: ADMIN_EMAIL,
      otp: otp,
      status: 0,
      userEmail: userEmail.toLowerCase().trim(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send email
    console.log('📤 Sending email to:', ADMIN_EMAIL);
    
    try {
      // ✅ DIRECT CALL - No destructuring
      const emailResult = await SendEmailUtility(
        ADMIN_EMAIL,
        "A2IT HRM - Password Reset OTP",
        `OTP to reset password for ${userEmail} is: ${otp}`
      );
      
      console.log('✅ Email sent successfully');
      
    } catch (emailError) {
      console.error('❌ Email failed:', emailError.message);
      // Continue even if email fails for development
    }

    // Return response with OTP (for development)
    return res.status(200).json({
      status: "success",
      message: "OTP generated",
      otp: otp, // Show OTP for development
      userEmail: userEmail
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      status: "fail", 
      message: "Server error" 
    });
  }
};

// Rest of the functions...

// -------------------- Admin Verify OTP & Reset User Password --------------------
exports.AdminResetPassword = async (req, res) => {
    try {
        const { userEmail, otp, newPassword } = req.body;

        console.log('🔑 AdminResetPassword called:', {
            userEmail: userEmail,
            otpLength: otp?.toString().length || 0,
            timestamp: new Date().toISOString()
        });

        // Validate inputs
        if (!userEmail || !otp || !newPassword) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ 
                status: "fail", 
                message: "All fields are required: userEmail, otp, newPassword" 
            });
        }

        if (newPassword.length < 6) {
            console.log('❌ Password too short');
            return res.status(400).json({ 
                status: "fail", 
                message: "Password must be at least 6 characters long" 
            });
        }

        // Find and validate OTP
        const otpRecord = await OtpModel.findOne({ 
            email: EMAIL_HOST_USER, 
            otp: parseInt(otp), 
            status: 0,
            userEmail: userEmail.toLowerCase().trim()
        });

        if (!otpRecord) {
            console.log('❌ Invalid OTP or OTP not found:', {
                userEmail: userEmail,
                otp: otp
            });
            return res.status(400).json({ 
                status: "fail", 
                message: "Invalid or expired OTP. Please request a new OTP." 
            });
        }

        // Check if OTP is expired
        if (otpRecord.expiresAt && otpRecord.expiresAt < new Date()) {
            console.log('❌ OTP expired:', otpRecord.expiresAt);
            otpRecord.status = 2; // Mark as expired
            await otpRecord.save();
            return res.status(400).json({ 
                status: "fail", 
                message: "OTP has expired. Please request a new OTP." 
            });
        }

        // Find user
        const user = await User.findOne({ email: userEmail.toLowerCase().trim() });
        if (!user) {
            console.log('❌ User not found during password reset:', userEmail);
            return res.status(404).json({ 
                status: "fail", 
                message: "User not found" 
            });
        }

        // Mark OTP as used
        otpRecord.status = 1;
        otpRecord.usedAt = new Date();
        await otpRecord.save();

        console.log('✅ OTP verified and marked as used:', otpRecord._id);

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update user's password
        await User.updateOne(
            { email: userEmail.toLowerCase().trim() }, 
            { 
                password: hashedPassword,
                lastPasswordChange: new Date()
            }
        );

        console.log('✅ Password updated for user:', userEmail);

        // Send confirmation email to user (optional)
        try {
            const userEmailSubject = `Your Password Has Been Reset - A2IT HRM`;
            const userEmailText = `
            🔐 Password Reset Successful
            
            Your A2IT HRM account password has been successfully reset.
            
            👤 Account: ${user.firstName || user.name} ${user.lastName || ''}
            📧 Email: ${user.email}
            🆔 Employee ID: ${user.employeeId || 'N/A'}
            
            ⏰ Reset Time: ${new Date().toLocaleString()}
            
            If you did not request this password reset, please contact your system administrator immediately.
            
            For security, please:
            1. Use a strong, unique password
            2. Enable two-factor authentication if available
            3. Never share your password with anyone
            
            Best regards,
            A2IT HRM System Security Team
            `;

            await SendEmailUtility(
                user.email,
                userEmailSubject,
                userEmailText,
                'default',
                {
                    userName: user.firstName || user.name,
                    action: 'password_reset',
                    resetTime: new Date().toLocaleString()
                }
            );

            console.log('📧 Password reset confirmation sent to user:', user.email);
            
        } catch (emailError) {
            console.warn('⚠️ Could not send confirmation email to user:', emailError.message);
            // Continue even if confirmation email fails
        }

        // Return success response
        return res.status(200).json({ 
            status: "success", 
            message: `Password for ${userEmail} has been reset successfully`,
            data: {
                userEmail: userEmail,
                resetTime: new Date(),
                nextStep: "User can now login with the new password"
            }
        });

    } catch (error) {
        console.error('❌ AdminResetPassword error:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({ 
            status: "fail", 
            message: "Failed to reset password. Please try again.",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// -------------------- Verify OTP Only (for frontend validation) --------------------
exports.AdminVerifyOtp = async (req, res) => {
    try {
        const { userEmail, otp } = req.body;

        console.log('🔍 AdminVerifyOtp called:', {
            userEmail: userEmail,
            otp: otp,
            timestamp: new Date().toISOString()
        });

        // Validate inputs
        if (!userEmail || !otp) {
            return res.status(400).json({ 
                status: "fail", 
                message: "userEmail and otp are required" 
            });
        }

        // Find and validate OTP
        const otpRecord = await OtpModel.findOne({ 
            email: EMAIL_HOST_USER, 
            otp: parseInt(otp), 
            status: 0,
            userEmail: userEmail.toLowerCase().trim()
        });

        if (!otpRecord) {
            console.log('❌ OTP verification failed');
            return res.status(400).json({ 
                status: "fail", 
                message: "Invalid OTP" 
            });
        }

        // Check if OTP is expired
        if (otpRecord.expiresAt && otpRecord.expiresAt < new Date()) {
            console.log('❌ OTP expired');
            otpRecord.status = 2; // Mark as expired
            await otpRecord.save();
            return res.status(400).json({ 
                status: "fail", 
                message: "OTP has expired" 
            });
        }

        console.log('✅ OTP verified successfully');

        // Return success response (don't mark as used yet)
        return res.status(200).json({ 
            status: "success", 
            message: "OTP verified successfully",
            data: {
                verified: true,
                userEmail: userEmail,
                userName: otpRecord.userName,
                expiresAt: otpRecord.expiresAt
            }
        });

    } catch (error) {
        console.error('❌ AdminVerifyOtp error:', error);
        res.status(500).json({ 
            status: "fail", 
            message: "Failed to verify OTP",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// -------------------- Cleanup Expired OTPs --------------------
exports.CleanupExpiredOtps = async (req, res) => {
    try {
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        
        const result = await OtpModel.deleteMany({
            $or: [
                { status: 2 }, // Expired
                { status: 1, updatedAt: { $lt: cutoffDate } }, // Used more than 24 hours ago
                { status: 0, expiresAt: { $lt: new Date() } } // Active but expired
            ]
        });

        console.log('🧹 Cleanup expired OTPs:', {
            deletedCount: result.deletedCount,
            cutoffDate: cutoffDate
        });

        return res.status(200).json({
            status: "success",
            message: `Cleaned up ${result.deletedCount} expired OTPs`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('❌ CleanupExpiredOtps error:', error);
        res.status(500).json({ 
            status: "fail", 
            message: "Failed to cleanup OTPs"
        });
    }
};