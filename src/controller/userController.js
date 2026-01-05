const User = require('../models/UsersModel');
const bcrypt = require('bcrypt');
const generateToken = require("../utility/jwt");
const AuditLog = require('../models/AuditModel'); 
const SessionLog = require('../models/SessionLogModel');

// Helper to push activity to session
const addSessionActivity = async ({ userId, action, target, details }) => {
  try {
    const session = await SessionLog.findOne({ userId }).sort({ loginAt: -1 });
    if (!session) return;
    session.activities.push({ action, target, details });
    await session.save();
  } catch (error) {
    console.error('Add session activity failed:', error);
  }
};

// Registration disabled
// exports.register = async (req, res) => {
//   return res.status(403).json({ 
//       message: 'Registration is disabled. Please contact administrator.' 
//   });
// };

// User Login
exports.userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: "Email and password are required" 
      });
    }

    const emailClean = email.toLowerCase().trim();
    const passwordClean = password.trim();

    // 🔹 PROBLEM 1: Find user without role restriction first
    const user = await User.findOne({ 
      email: emailClean,
      isDeleted: false  // Add this to exclude deleted users
    });

    if (!user) {
      console.log(`❌ User not found with email: ${emailClean}`);
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password" 
      });
    }

    // 🔹 Check user role (case insensitive)
    if (user.role.toLowerCase() !== "employee") {
      console.log(`❌ User role is ${user.role}, expected employee`);
      return res.status(403).json({ 
        success: false,
        message: "Access restricted to employees only" 
      });
    }

    // Check account status
    if (user.status !== "active" || user.isActive === false) {
      console.log(`❌ Account inactive: status=${user.status}, isActive=${user.isActive}`);
      return res.status(403).json({ 
        success: false,
        message: "Account is not active" 
      });
    }

    // Password verification
    let isMatch = false;
    
    // 🔹 PROBLEM 2: Check if password is hashed properly
    if (user.password && user.password.startsWith("$2")) {
      // Bcrypt hash
      isMatch = await bcrypt.compare(passwordClean, user.password);
    } else if (user.password) {
      // Plain text password (for development/testing)
      isMatch = passwordClean === user.password;
    } else {
      console.log("❌ No password found in user document");
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password" 
      });
    }

    if (!isMatch) {
      console.log("❌ Password doesn't match");
      return res.status(401).json({ 
        success: false,
        message: "Invalid password" 
      });
    }

    // Migrate legacy password to bcrypt
    if (user.password && !user.password.startsWith("$2") && isMatch) {
      try {
        user.password = await bcrypt.hash(passwordClean, 10);
        await user.save();
        console.log("✅ Password migrated to bcrypt");
      } catch (hashError) {
        console.error("Password migration failed:", hashError);
      }
    }

    // Generate token
    const token = generateToken(user);

    // Audit Log
    try {
      await AuditLog.create({
        userId: user._id,
        action: "User Login",
        target: user._id,
        details: { 
          email: user.email,
          role: user.role,
          timestamp: new Date()
        },
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        device: req.headers['user-agent'] || 'Unknown'
      });
    } catch (auditError) {
      console.error("Audit log error:", auditError);
      // Don't fail login if audit log fails
    }

    // SessionLog creation
    let session = null;
    try {
      session = await SessionLog.create({
        userId: user._id,
        loginAt: new Date(),
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        device: req.headers['user-agent'] || 'Unknown',
        userAgent: req.headers['user-agent'],
        activities: [
          {
            action: "User Login",
            target: user._id.toString(),
            details: { 
              email: user.email,
              role: user.role 
            },
            timestamp: new Date()
          }
        ]
      });
    } catch (sessionError) {
      console.error("Session log error:", sessionError);
      // Don't fail login if session log fails
    }

    // Update last login
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    // Return user data
    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        employeeId: user.employeeId,
        picture: user.picture,
        phone: user.phone,
        status: user.status,
        isActive: user.isActive
      },
      sessionId: session ? session._id : null,
      loginTime: new Date()
    });

  } catch (error) {
    console.error("❌ Login error details:", error);
    res.status(500).json({ 
      success: false,
      message: "Login failed",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// User Logout
exports.userLogout = async (req, res) => {
  try {
    const session = await SessionLog.findOne({ userId: req.user.id }).sort({ loginAt: -1 });
    if (!session) return res.status(404).json({ success: false, message: 'No active session found' });

    session.logoutAt = new Date();
    await session.save();

    // ✅ Optional AuditLog for logout
    await AuditLog.create({
      userId: req.user.id,
      action: "User Logout",
      target: req.user.id,
      details: {},
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Logout failed' });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, profilePicture } = req.body;
    const user = await User.findById(req.user.id);

    const oldData = { firstName: user.firstName, lastName: user.lastName, phone: user.phone, profilePicture: user.picture };
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phone = phone || user.phone;
    user.picture = profilePicture || user.picture;
    await user.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user.id,
      action: "Updated Profile",
      target: user._id,
      details: { oldData, newData: { firstName, lastName, phone, profilePicture } },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user.id,
      action: "Updated Profile",
      target: user._id,
      details: { oldData, newData: { firstName, lastName, phone, profilePicture } }
    });

    res.status(200).json({ message: 'Profile updated successfully', user });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) return res.status(400).json({ message: 'Current password is incorrect' });

    const oldPasswordHash = user.password;
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user.id,
      action: "Changed Password",
      target: user._id,
      details: { oldPasswordHash, newPasswordHash: user.password },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user.id,
      action: "Changed Password",
      target: user._id,
      details: { oldPasswordHash, newPasswordHash: user.password }
    });

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin: view all sessions
exports.getAllSessions = async (req, res) => {
  try {
    const sessions = await SessionLog.find()
      .populate('userId', 'firstName lastName email role')
      .sort({ loginAt: -1 });

    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
  }
};

// Admin: view session by ID
exports.getSessionById = async (req, res) => {
  try {
    const session = await SessionLog.findById(req.params.id)
      .populate('userId', 'firstName lastName email role');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch session' });
  }
};
