const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const OtpModel = require('../models/OtpModel');  
const { SendEmailUtility, emailTemplates } = require("../utility/SendEmailUtility");

// Admin email from environment
const EMAIL_HOST_USER = process.env.EMAIL_HOST_USER || 'admin@attendance-system.a2itltd.com';

// -------------------- Admin Request OTP --------------------
exports.AdminRequestOtp = async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    console.log('🔐 Admin Request OTP called:', {
      userEmail: userEmail,
      adminEmail: EMAIL_HOST_USER,
      timestamp: new Date().toISOString()
    });

    // Validate user email
    if (!userEmail || !userEmail.includes('@')) {
      console.log('❌ Invalid email format:', userEmail);
      return res.status(400).json({ 
        status: "fail", 
        message: "Please provide a valid email address" 
      });
    }

    const user = await User.findOne({ email: userEmail.toLowerCase().trim() });
    if (!user) {
      console.log('❌ User not found:', userEmail);
      return res.status(404).json({ 
        status: "fail", 
        message: "User not found with this email address" 
      });
    }

    // User details for email
    const userName = user.firstName || user.name || 'User';
    const userEmployeeId = user.employeeId || 'N/A';
    const userRole = user.role || 'User';

    console.log('👤 User found:', {
      name: userName,
      email: user.email,
      employeeId: userEmployeeId,
      role: userRole
    });

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    console.log('🔢 Generated OTP:', {
      otp: otp,
      expiry: otpExpiry
    });

    // Invalidate old OTPs for this user
    await OtpModel.updateMany(
      { 
        email: EMAIL_HOST_USER, 
        userEmail: userEmail.toLowerCase().trim(), 
        status: 0 
      },
      { 
        status: 2, // Mark as expired/revoked
        updatedAt: new Date()
      }
    );

    // Save OTP to database
    const otpRecord = await OtpModel.create({
      email: EMAIL_HOST_USER,
      otp: otp,
      status: 0, // 0 = active, 1 = used, 2 = expired
      userEmail: userEmail.toLowerCase().trim(),
      userName: userName,
      userEmployeeId: userEmployeeId,
      userRole: userRole,
      expiresAt: otpExpiry,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('💾 OTP saved to DB:', {
      recordId: otpRecord._id,
      expiry: otpExpiry
    });

    // Prepare email content
    const emailSubject = `A2IT HRM - Password Reset OTP for ${userName}`;
    const emailText = `
    🔐 Password Reset Request
    
    You have requested to reset the password for:
    
    👤 User: ${userName}
    📧 Email: ${userEmail}
    🆔 Employee ID: ${userEmployeeId}
    👥 Role: ${userRole}
    
    📝 Verification OTP: ${otp}
    
    ⏰ This OTP is valid for 10 minutes.
    ⚠️ Do not share this OTP with anyone.
    
    If you didn't request this password reset, please ignore this email.
    
    Best regards,
    A2IT HRM System
    `;

    // Send email using HTML template
    console.log('📤 Attempting to send email via SMTP...');
    
    try {
      const emailResult = await SendEmailUtility(
        EMAIL_HOST_USER,
        emailSubject,
        emailText,
        'otp',
        {
          otp: otp,
          userName: userName,
          userEmail: userEmail,
          userEmployeeId: userEmployeeId,
          userRole: userRole,
          expiryTime: '10 minutes'
        }
      );

      console.log('✅ Email sent successfully via SMTP:', {
        messageId: emailResult.messageId,
        accepted: emailResult.accepted,
        timestamp: new Date().toISOString()
      });

    } catch (emailError) {
      console.error('❌ Email sending failed:', {
        error: emailError.message,
        code: emailError.code,
        originalError: emailError.originalError
      });
      
      // Even if email fails, return OTP to frontend for development/testing
      console.log('⚠️ Email failed, but OTP generated:', otp);
      
      // Don't fail the request if email fails in development
      if (process.env.NODE_ENV === 'production') {
        // In production, delete the OTP record if email fails
        await OtpModel.deleteOne({ _id: otpRecord._id });
        return res.status(500).json({ 
          status: "fail", 
          message: "Failed to send OTP email. Please try again." 
        });
      }
    }

    // Return success response with OTP
    return res.status(200).json({
      status: "success",
      message: "OTP sent to admin email",
      data: {
        otp: otp, // 🔥 Frontend এর জন্য OTP পাঠানো হচ্ছে (development মোডে)
        email: EMAIL_HOST_USER,
        userEmail: userEmail,
        userName: userName,
        employeeId: userEmployeeId,
        role: userRole,
        expiresAt: otpExpiry,
        // Development mode warning
        ...(process.env.NODE_ENV !== 'production' && {
          warning: "Development mode - OTP shown for testing"
        })
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ AdminRequestOtp error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      status: "fail", 
      message: "Internal server error. Please try again later.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

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