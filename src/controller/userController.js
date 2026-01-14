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
// ================= UNIFIED LOGIN CONTROLLER =================

// Unified Login for all roles
exports.unifiedLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🌐 UNIFIED LOGIN REQUEST for:', email);

    // Find user by email (any role)
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Check account status
    if (!user.isActive || user.status !== 'active') {
      console.log('❌ Account inactive');
      return res.status(403).json({
        success: false,
        message: "Account is not active"
      });
    }

    // Password verification
    let isMatch = false;
    if (user.password && user.password.startsWith("$2")) {
      isMatch = await bcrypt.compare(password, user.password);
    } else if (user.password) {
      isMatch = password === user.password;
    } else {
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    if (!isMatch) {
      console.log('❌ Password mismatch');
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    // Migrate legacy password to bcrypt
    if (user.password && !user.password.startsWith("$2") && isMatch) {
      try {
        user.password = await bcrypt.hash(password, 10);
        await user.save();
        console.log("✅ Password migrated to bcrypt");
      } catch (hashError) {
        console.error("Password migration failed:", hashError);
      }
    }

    // Generate token
    const token = generateToken(user);
    const cleanToken = token.replace(/\s+/g, '');

    console.log('✅ Login successful');
    console.log('User role:', user.role);
    console.log('User email:', user.email);

    // Audit Log
    try {
      await AuditLog.create({
        userId: user._id,
        action: "Unified Login",
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
            action: "Unified Login",
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
    }

    // Update last login
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    // Prepare response data based on role
    const responseData = {
      success: true,
      message: "Login successful",
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      // Profile fields
      phone: user.phone,
      picture: user.picture,
      department: user.department,
      designation: user.designation,
      employeeId: user.employeeId,
      // Account status
      status: user.status,
      isActive: user.isActive,
      // Meta
      lastLogin: user.lastLogin,
      loginCount: user.loginCount || 0,
      token: cleanToken,
      sessionId: session ? session._id : null
    };

    // Add role-specific fields
    if (user.role === 'admin' || user.role === 'superAdmin') {
      responseData.adminLevel = user.adminLevel;
      responseData.companyName = user.companyName;
      responseData.adminPosition = user.adminPosition;
      responseData.permissions = user.permissions || [];
      responseData.isSuperAdmin = user.isSuperAdmin || false;
      responseData.canManageUsers = user.canManageUsers || false;
      responseData.canManagePayroll = user.canManagePayroll || false;
    } else if (user.role === 'moderator') {
      responseData.moderatorLevel = user.moderatorLevel;
      responseData.moderatorScope = user.moderatorScope || [];
      responseData.canModerateUsers = user.canModerateUsers || false;
      responseData.canModerateContent = user.canModerateContent || true;
      responseData.canViewReports = user.canViewReports || true;
      responseData.canManageReports = user.canManageReports || false;
      responseData.moderationLimits = user.moderationLimits || {
        dailyActions: 50,
        warningLimit: 3,
        canBanUsers: false,
        canDeleteContent: true,
        canEditContent: true,
        canWarnUsers: true
      };
      responseData.permissions = user.permissions || [];
    }

    res.json(responseData);
  } catch (error) {
    console.error('Unified login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// ================= MODERATOR CONTROLLERS =================

// Moderator Login
exports.moderatorLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🛡️ MODERATOR LOGIN REQUEST for:', email);

    // Find moderator
    const moderator = await User.findOne({
      email: email.toLowerCase().trim(),
      role: "moderator"
    });

    if (!moderator) {
      console.log('❌ Moderator not found');
      return res.status(401).json({
        success: false,
        message: "Moderator not found"
      });
    }

    // Check moderator-specific fields
    if (!moderator.isActive || moderator.status !== 'active') {
      console.log('❌ Moderator account inactive');
      return res.status(403).json({
        success: false,
        message: "Moderator account is not active"
      });
    }

    // Password verification
    let isMatch = false;
    if (moderator.password && moderator.password.startsWith("$2")) {
      isMatch = await bcrypt.compare(password, moderator.password);
    } else if (moderator.password) {
      isMatch = password === moderator.password;
    } else {
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    if (!isMatch) {
      console.log('❌ Password mismatch');
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    // Migrate legacy password to bcrypt
    if (moderator.password && !moderator.password.startsWith("$2") && isMatch) {
      try {
        moderator.password = await bcrypt.hash(password, 10);
        await moderator.save();
        console.log("✅ Moderator password migrated to bcrypt");
      } catch (hashError) {
        console.error("Password migration failed:", hashError);
      }
    }

    // Generate token
    const token = generateToken(moderator);
    const cleanToken = token.replace(/\s+/g, '');

    console.log('✅ Moderator login successful');
    console.log('Moderator Level:', moderator.moderatorLevel);
    console.log('Moderation Scope:', moderator.moderatorScope);

    // Audit Log
    try {
      await AuditLog.create({
        userId: moderator._id,
        action: "Moderator Login",
        target: moderator._id,
        details: {
          email: moderator.email,
          role: moderator.role,
          moderatorLevel: moderator.moderatorLevel,
          timestamp: new Date()
        },
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        device: req.headers['user-agent'] || 'Unknown'
      });
    } catch (auditError) {
      console.error("Audit log error:", auditError);
    }

    // SessionLog creation
    let session = null;
    try {
      session = await SessionLog.create({
        userId: moderator._id,
        loginAt: new Date(),
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        device: req.headers['user-agent'] || 'Unknown',
        userAgent: req.headers['user-agent'],
        activities: [
          {
            action: "Moderator Login",
            target: moderator._id.toString(),
            details: {
              email: moderator.email,
              role: moderator.role,
              moderatorLevel: moderator.moderatorLevel
            },
            timestamp: new Date()
          }
        ]
      });
    } catch (sessionError) {
      console.error("Session log error:", sessionError);
    }

    // Update last login
    moderator.lastLogin = new Date();
    moderator.loginCount = (moderator.loginCount || 0) + 1;
    await moderator.save();

    res.json({
      success: true,
      message: "Moderator login successful",
      _id: moderator._id,
      firstName: moderator.firstName,
      lastName: moderator.lastName,
      fullName: `${moderator.firstName} ${moderator.lastName}`,
      email: moderator.email,
      role: moderator.role,
      // Moderator-specific fields
      moderatorLevel: moderator.moderatorLevel,
      moderatorScope: moderator.moderatorScope || [],
      canModerateUsers: moderator.canModerateUsers || false,
      canModerateContent: moderator.canModerateContent || true,
      canViewReports: moderator.canViewReports || true,
      canManageReports: moderator.canManageReports || false,
      moderationLimits: moderator.moderationLimits || {
        dailyActions: 50,
        warningLimit: 3,
        canBanUsers: false,
        canDeleteContent: true,
        canEditContent: true,
        canWarnUsers: true
      },
      permissions: moderator.permissions || [],
      // Profile fields
      phone: moderator.phone,
      picture: moderator.picture,
      department: moderator.department,
      designation: moderator.designation,
      employeeId: moderator.employeeId,
      token: cleanToken,
      sessionId: session ? session._id : null
    });
  } catch (error) {
    console.error('Moderator login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Moderator profile
exports.getModeratorProfile = async (req, res) => {
  try {
    const moderator = await User.findOne({
      _id: req.user._id,
      role: "moderator",
    }).select("-password -__v");

    if (!moderator) {
      return res.status(404).json({
        success: false,
        message: "Moderator not found"
      });
    }

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed Moderator Profile",
      target: moderator._id,
      details: {}
    });

    res.json({
      success: true,
      // Basic info
      _id: moderator._id,
      firstName: moderator.firstName,
      lastName: moderator.lastName,
      fullName: `${moderator.firstName} ${moderator.lastName}`,
      email: moderator.email,
      phone: moderator.phone,
      role: moderator.role,

      // Profile
      picture: moderator.picture,
      address: moderator.address,
      department: moderator.department,
      designation: moderator.designation,
      employeeId: moderator.employeeId,

      // Moderator-specific info
      moderatorLevel: moderator.moderatorLevel,
      moderatorScope: moderator.moderatorScope || [],
      canModerateUsers: moderator.canModerateUsers || false,
      canModerateContent: moderator.canModerateContent || true,
      canViewReports: moderator.canViewReports || true,
      canManageReports: moderator.canManageReports || false,
      moderationLimits: moderator.moderationLimits || {
        dailyActions: 50,
        warningLimit: 3,
        canBanUsers: false,
        canDeleteContent: true,
        canEditContent: true,
        canWarnUsers: true
      },
      permissions: moderator.permissions || [],

      // Account status
      status: moderator.status,
      isActive: moderator.isActive,

      // Meta
      lastLogin: moderator.lastLogin,
      loginCount: moderator.loginCount || 0,
      createdAt: moderator.createdAt,
      updatedAt: moderator.updatedAt,
    });
  } catch (error) {
    console.error("Get moderator profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Moderator Profile
exports.updateModeratorProfile = async (req, res) => {
  try {
    const moderator = await User.findOne({
      _id: req.user._id,
      role: "moderator",
    });

    if (!moderator) {
      return res.status(404).json({
        success: false,
        message: "Moderator not found"
      });
    }

    // Store old data for comparison
    const oldData = {
      firstName: moderator.firstName,
      lastName: moderator.lastName,
      phone: moderator.phone,
      address: moderator.address,
      department: moderator.department,
      designation: moderator.designation,
      moderatorLevel: moderator.moderatorLevel,
      moderatorScope: moderator.moderatorScope,
      picture: moderator.picture
    };

    // Update fields
    const {
      firstName,
      lastName,
      phone,
      address,
      department,
      designation,
      moderatorLevel,
      moderatorScope,
      canModerateUsers,
      canModerateContent,
      canViewReports,
      canManageReports,
      moderationLimits,
      permissions,
      picture
    } = req.body;

    // Basic fields
    if (firstName !== undefined) moderator.firstName = firstName;
    if (lastName !== undefined) moderator.lastName = lastName;
    if (phone !== undefined) moderator.phone = phone;
    if (address !== undefined) moderator.address = address;
    if (department !== undefined) moderator.department = department;
    if (designation !== undefined) moderator.designation = designation;
    if (picture !== undefined) moderator.picture = picture;

    // Moderator-specific fields
    if (moderatorLevel !== undefined) moderator.moderatorLevel = moderatorLevel;
    if (moderatorScope !== undefined) moderator.moderatorScope = moderatorScope;
    if (canModerateUsers !== undefined) moderator.canModerateUsers = canModerateUsers;
    if (canModerateContent !== undefined) moderator.canModerateContent = canModerateContent;
    if (canViewReports !== undefined) moderator.canViewReports = canViewReports;
    if (canManageReports !== undefined) moderator.canManageReports = canManageReports;
    if (moderationLimits !== undefined) moderator.moderationLimits = moderationLimits;
    if (permissions !== undefined) moderator.permissions = permissions;

    const updatedModerator = await moderator.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Updated Moderator Profile",
      target: moderator._id,
      details: {
        oldData,
        newData: {
          firstName: updatedModerator.firstName,
          lastName: updatedModerator.lastName,
          phone: updatedModerator.phone,
          address: updatedModerator.address,
          department: updatedModerator.department,
          designation: updatedModerator.designation,
          moderatorLevel: updatedModerator.moderatorLevel,
          moderatorScope: updatedModerator.moderatorScope,
          picture: updatedModerator.picture
        },
        updatedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined)
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Updated Moderator Profile",
      target: moderator._id,
      details: {
        updatedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined)
      }
    });

    res.json({
      success: true,
      message: "Moderator profile updated successfully",
      moderator: {
        _id: updatedModerator._id,
        firstName: updatedModerator.firstName,
        lastName: updatedModerator.lastName,
        email: updatedModerator.email,
        phone: updatedModerator.phone,
        role: updatedModerator.role,
        // Profile
        picture: updatedModerator.picture,
        address: updatedModerator.address,
        department: updatedModerator.department,
        designation: updatedModerator.designation,
        employeeId: updatedModerator.employeeId,
        // Moderator-specific
        moderatorLevel: updatedModerator.moderatorLevel,
        moderatorScope: updatedModerator.moderatorScope,
        canModerateUsers: updatedModerator.canModerateUsers,
        canModerateContent: updatedModerator.canModerateContent,
        canViewReports: updatedModerator.canViewReports,
        canManageReports: updatedModerator.canManageReports,
        moderationLimits: updatedModerator.moderationLimits,
        permissions: updatedModerator.permissions,
        // Status
        status: updatedModerator.status,
        isActive: updatedModerator.isActive,
        updatedAt: updatedModerator.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update moderator profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= ADMIN CONTROLLERS =================

// Admin Login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 ADMIN LOGIN REQUEST for:', email);

    // Find admin
    const admin = await User.findOne({
      email: email.toLowerCase().trim(),
      role: "admin"
    });

    if (!admin) {
      console.log('❌ Admin not found');
      return res.status(401).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Check admin-specific fields
    if (!admin.isActive || admin.status !== 'active') {
      console.log('❌ Admin account inactive');
      return res.status(403).json({
        success: false,
        message: "Admin account is not active"
      });
    }

    // Password verification
    let isMatch = false;
    if (admin.password && admin.password.startsWith("$2")) {
      isMatch = await bcrypt.compare(password, admin.password);
    } else if (admin.password) {
      isMatch = password === admin.password;
    } else {
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    if (!isMatch) {
      console.log('❌ Password mismatch');
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }

    // Migrate legacy password to bcrypt
    if (admin.password && !admin.password.startsWith("$2") && isMatch) {
      try {
        admin.password = await bcrypt.hash(password, 10);
        await admin.save();
        console.log("✅ Admin password migrated to bcrypt");
      } catch (hashError) {
        console.error("Password migration failed:", hashError);
      }
    }

    // Generate token
    const token = generateToken(admin);

    // Clean the token before sending
    const cleanToken = token.replace(/\s+/g, '');

    console.log('✅ Admin login successful');
    console.log('Admin Level:', admin.adminLevel);
    console.log('Company:', admin.companyName);

    // Audit Log
    try {
      await AuditLog.create({
        userId: admin._id,
        action: "Admin Login",
        target: admin._id,
        details: {
          email: admin.email,
          role: admin.role,
          adminLevel: admin.adminLevel,
          timestamp: new Date()
        },
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        device: req.headers['user-agent'] || 'Unknown'
      });
    } catch (auditError) {
      console.error("Audit log error:", auditError);
    }

    // SessionLog creation
    let session = null;
    try {
      session = await SessionLog.create({
        userId: admin._id,
        loginAt: new Date(),
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        device: req.headers['user-agent'] || 'Unknown',
        userAgent: req.headers['user-agent'],
        activities: [
          {
            action: "Admin Login",
            target: admin._id.toString(),
            details: {
              email: admin.email,
              role: admin.role,
              adminLevel: admin.adminLevel
            },
            timestamp: new Date()
          }
        ]
      });
    } catch (sessionError) {
      console.error("Session log error:", sessionError);
    }

    // Update last login
    admin.lastLogin = new Date();
    admin.loginCount = (admin.loginCount || 0) + 1;
    await admin.save();

    res.json({
      success: true,
      message: "Admin login successful",
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: `${admin.firstName} ${admin.lastName}`,
      email: admin.email,
      role: admin.role,
      // Admin-specific fields
      adminLevel: admin.adminLevel,
      companyName: admin.companyName,
      adminPosition: admin.adminPosition,
      permissions: admin.permissions || [],
      isSuperAdmin: admin.isSuperAdmin || false,
      canManageUsers: admin.canManageUsers || false,
      canManagePayroll: admin.canManagePayroll || false,
      // Profile fields
      phone: admin.phone,
      picture: admin.picture,
      department: admin.department,
      designation: admin.designation,
      token: cleanToken,
      sessionId: session ? session._id : null
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin profile
exports.getAdminProfile = async (req, res) => {
  try {
    const admin = await User.findOne({
      _id: req.user._id,
      role: "admin",
    }).select("-password -__v");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed Admin Profile",
      target: admin._id,
      details: {}
    });

    res.json({
      success: true,
      // Basic info
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: `${admin.firstName} ${admin.lastName}`,
      email: admin.email,
      phone: admin.phone,
      role: admin.role,

      // Profile
      picture: admin.picture,
      address: admin.address,
      department: admin.department,
      designation: admin.designation,
      employeeId: admin.employeeId,

      // Salary info (if exists for admin)
      salaryType: admin.salaryType,
      rate: admin.rate,
      basicSalary: admin.basicSalary,
      salary: admin.salary,
      joiningDate: admin.joiningDate,
      salaryRule: admin.salaryRule,

      // Admin-specific info
      companyName: admin.companyName,
      adminPosition: admin.adminPosition,
      adminLevel: admin.adminLevel,
      permissions: admin.permissions || [],
      isSuperAdmin: admin.isSuperAdmin || false,
      canManageUsers: admin.canManageUsers || false,
      canManagePayroll: admin.canManagePayroll || false,

      // Account status
      status: admin.status,
      isActive: admin.isActive,

      // Meta
      lastLogin: admin.lastLogin,
      loginCount: admin.loginCount || 0,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  } catch (error) {
    console.error("Get admin profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Admin Profile
exports.updateAdminProfile = async (req, res) => {
  try {
    const admin = await User.findOne({
      _id: req.user._id,
      role: "admin",
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Store old data for comparison
    const oldData = {
      firstName: admin.firstName,
      lastName: admin.lastName,
      phone: admin.phone,
      address: admin.address,
      department: admin.department,
      designation: admin.designation,
      companyName: admin.companyName,
      adminPosition: admin.adminPosition,
      adminLevel: admin.adminLevel,
      picture: admin.picture
    };

    // Update fields
    const {
      firstName,
      lastName,
      phone,
      address,
      department,
      designation,
      companyName,
      adminPosition,
      adminLevel,
      permissions,
      isSuperAdmin,
      canManageUsers,
      canManagePayroll,
      employeeId,
      salaryType,
      rate,
      basicSalary,
      salary,
      joiningDate,
      picture
    } = req.body;

    // Basic fields
    if (firstName !== undefined) admin.firstName = firstName;
    if (lastName !== undefined) admin.lastName = lastName;
    if (phone !== undefined) admin.phone = phone;
    if (address !== undefined) admin.address = address;
    if (department !== undefined) admin.department = department;
    if (designation !== undefined) admin.designation = designation;
    if (employeeId !== undefined) admin.employeeId = employeeId;
    if (picture !== undefined) admin.picture = picture;

    // Admin-specific fields
    if (companyName !== undefined) admin.companyName = companyName;
    if (adminPosition !== undefined) admin.adminPosition = adminPosition;
    if (adminLevel !== undefined) admin.adminLevel = adminLevel;
    if (permissions !== undefined) admin.permissions = permissions;
    if (isSuperAdmin !== undefined) admin.isSuperAdmin = isSuperAdmin;
    if (canManageUsers !== undefined) admin.canManageUsers = canManageUsers;
    if (canManagePayroll !== undefined) admin.canManagePayroll = canManagePayroll;

    // Salary fields (optional for admin)
    if (salaryType !== undefined) admin.salaryType = salaryType;
    if (rate !== undefined) admin.rate = rate;
    if (basicSalary !== undefined) admin.basicSalary = basicSalary;
    if (salary !== undefined) admin.salary = salary;
    if (joiningDate !== undefined) admin.joiningDate = joiningDate;

    const updatedAdmin = await admin.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Updated Admin Profile",
      target: admin._id,
      details: {
        oldData,
        newData: {
          firstName: updatedAdmin.firstName,
          lastName: updatedAdmin.lastName,
          phone: updatedAdmin.phone,
          address: updatedAdmin.address,
          department: updatedAdmin.department,
          designation: updatedAdmin.designation,
          companyName: updatedAdmin.companyName,
          adminPosition: updatedAdmin.adminPosition,
          adminLevel: updatedAdmin.adminLevel,
          picture: updatedAdmin.picture
        },
        updatedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined)
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Updated Admin Profile",
      target: admin._id,
      details: {
        updatedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined)
      }
    });

    res.json({
      success: true,
      message: "Admin profile updated successfully",
      admin: {
        _id: updatedAdmin._id,
        firstName: updatedAdmin.firstName,
        lastName: updatedAdmin.lastName,
        email: updatedAdmin.email,
        phone: updatedAdmin.phone,
        role: updatedAdmin.role,
        // Profile
        picture: updatedAdmin.picture,
        address: updatedAdmin.address,
        department: updatedAdmin.department,
        designation: updatedAdmin.designation,
        employeeId: updatedAdmin.employeeId,
        // Admin-specific
        companyName: updatedAdmin.companyName,
        adminPosition: updatedAdmin.adminPosition,
        adminLevel: updatedAdmin.adminLevel,
        permissions: updatedAdmin.permissions,
        isSuperAdmin: updatedAdmin.isSuperAdmin,
        canManageUsers: updatedAdmin.canManageUsers,
        canManagePayroll: updatedAdmin.canManagePayroll,
        // Salary
        salaryType: updatedAdmin.salaryType,
        rate: updatedAdmin.rate,
        basicSalary: updatedAdmin.basicSalary,
        salary: updatedAdmin.salary,
        joiningDate: updatedAdmin.joiningDate,
        // Status
        status: updatedAdmin.status,
        isActive: updatedAdmin.isActive,
        updatedAt: updatedAdmin.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update admin profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= USER MANAGEMENT (ADMIN ONLY) =================

// CREATE USER (ADMIN ONLY)
exports.createUser = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role = 'employee',
      phone,
      address,
      department,
      designation,
      employeeId,
      picture,
      salaryType,
      rate,
      basicSalary,
      salary,
      joiningDate,
      companyName,
      adminPosition,
      adminLevel,
      permissions,
      isSuperAdmin,
      canManageUsers,
      canManagePayroll,
      managerId,
      attendanceId,
      shiftTiming,
      // Moderator fields
      moderatorLevel,
      moderatorScope,
      canModerateUsers: canModerateUsersField,
      canModerateContent,
      canViewReports,
      canManageReports,
      moderationLimits
    } = req.body;

    console.log('📝 Creating user with data:', {
      email,
      role
    });

    // Check if user already exists
    const existingUser = await User.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email"
      });
    }

    // Validate role
    const validRoles = ['admin', 'employee', 'moderator'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be 'admin', 'employee', or 'moderator'"
      });
    }

    // Auto-generate missing fields if only email, password, and role are provided
    const autoGenerateData = !firstName && !lastName && !phone && !department;

    // Prepare base user data
    const userData = {
      firstName: firstName || (autoGenerateData ? email.split('@')[0] : ''),
      lastName: lastName || (autoGenerateData ? 'User' : ''),
      email: email.toLowerCase().trim(),
      password: password,
      role: role,
      isActive: true,
      status: 'active',
      phone: phone || '',
      address: address || '',
      department: department || '',
      designation: designation || (autoGenerateData ? 
        role === 'admin' ? 'Administrator' : 
        role === 'moderator' ? 'Moderator' : 'Employee'
        : ''),
      picture: picture || '',
      salaryType: salaryType || 'monthly',
      rate: rate || 0,
      basicSalary: basicSalary || 0,
      salary: salary || 0,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date()
    };

    // Handle employeeId - auto-generate if not provided
    if (employeeId && employeeId.trim() !== '') {
      // Check if manually provided employeeId is unique
      const existingEmpId = await User.findOne({ employeeId: employeeId.trim() });
      if (existingEmpId) {
        return res.status(400).json({
          success: false,
          message: "Employee ID already exists"
        });
      }
      userData.employeeId = employeeId.trim();
    } else {
      // Auto-generate employeeId based on role
      const roleCount = await User.countDocuments({ role: role });
      const prefix = role === 'admin' ? 'ADM' : 
                     role === 'moderator' ? 'MOD' : 'EMP';
      userData.employeeId = `${prefix}-${String(roleCount + 1).padStart(4, '0')}`;
    }

    // Role-specific fields with sensible defaults
    if (role === 'admin') {
      userData.companyName = companyName || 'Default Company';
      userData.adminPosition = adminPosition || 'Administrator';
      userData.adminLevel = adminLevel || 'admin';
      userData.permissions = permissions || ['user:read', 'user:create', 'user:update'];
      userData.isSuperAdmin = isSuperAdmin || false;
      userData.canManageUsers = canManageUsers !== undefined ? canManageUsers : true;
      userData.canManagePayroll = canManagePayroll !== undefined ? canManagePayroll : true;
    }

    if (role === 'moderator') {
      userData.moderatorLevel = moderatorLevel || 'junior';
      userData.moderatorScope = moderatorScope || ['content'];
      userData.canModerateUsers = canModerateUsersField !== undefined ? canModerateUsersField : false;
      userData.canModerateContent = canModerateContent !== undefined ? canModerateContent : true;
      userData.canViewReports = canViewReports !== undefined ? canViewReports : true;
      userData.canManageReports = canManageReports !== undefined ? canManageReports : false;
      userData.moderationLimits = moderationLimits || {
        dailyActions: 50,
        warningLimit: 3,
        canBanUsers: false,
        canDeleteContent: true,
        canEditContent: true,
        canWarnUsers: true
      };
      
      // Auto-set permissions based on moderator level
      const moderatorPermissions = {
        'junior': ['content:view', 'content:edit', 'report:view'],
        'mid': ['content:view', 'content:edit', 'content:delete', 'user:view', 'user:warn', 'report:view'],
        'senior': ['content:view', 'content:edit', 'content:delete', 'user:view', 'user:warn', 'user:suspend', 'report:view', 'report:generate', 'audit:view']
      };
      
      userData.permissions = permissions || moderatorPermissions[userData.moderatorLevel] || moderatorPermissions['junior'];
    }

    if (role === 'employee') {
      userData.managerId = managerId || null;
      userData.attendanceId = attendanceId || userData.employeeId;
      userData.shiftTiming = shiftTiming || { 
        start: '09:00', 
        end: '18:00',
        breakTime: '14:00-14:30'
      };
    }

    console.log('Final user data before save:', {
      email: userData.email,
      role: userData.role,
      employeeId: userData.employeeId,
      firstName: userData.firstName,
      lastName: userData.lastName
    });

    // Create new user
    const newUser = new User(userData);
    await newUser.save();

    console.log('✅ User created successfully:', {
      id: newUser._id,
      email: newUser.email,
      role: newUser.role,
      employeeId: newUser.employeeId,
      autoGenerated: autoGenerateData ? 'Yes' : 'No'
    });

    // Remove password from response
    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: userResponse,
      autoGenerated: autoGenerateData
    });

  } catch (error) {
    console.error('❌ Create user error details:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      console.error('Validation errors:', messages);
      return res.status(400).json({ 
        success: false,
        message: `Validation failed: ${messages.join(', ')}`
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      console.error('Duplicate key error:', { field, value });
      return res.status(400).json({
        success: false,
        message: `${field} '${value}' already exists`
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get all users (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, status, department, search } = req.query;

    // Build query
    const query = {};

    if (role) query.role = role;
    if (status) query.status = status;
    if (department) query.department = department;

    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password -__v')
      .sort({ createdAt: -1 });

    // Format response based on role
    const formattedUsers = users.map(user => {
      const userObj = user.toObject();

      // Add fullName
      userObj.fullName = `${user.firstName} ${user.lastName}`;

      // Remove sensitive admin fields if not admin
      if (req.user.role !== 'admin' && user.role === 'admin') {
        delete userObj.permissions;
        delete userObj.isSuperAdmin;
        delete userObj.adminLevel;
        delete userObj.companyName;
      }

      return userObj;
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed All Users",
      target: null,
      details: {
        filter: { role, status, department, search },
        count: users.length
      }
    });

    res.status(200).json({
      success: true,
      count: users.length,
      users: formattedUsers
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all moderators (admin only)
exports.getAllModerators = async (req, res) => {
  try {
    const moderators = await User.find({ role: 'moderator' })
      .select('-password -__v')
      .lean();

    const formattedModerators = moderators.map(mod => ({
      ...mod,
      fullName: `${mod.firstName} ${mod.lastName}`,
      capabilities: {
        level: mod.moderatorLevel,
        scope: mod.moderatorScope,
        canModerateUsers: mod.canModerateUsers,
        canModerateContent: mod.canModerateContent,
        canManageReports: mod.canManageReports
      }
    }));

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed All Moderators",
      target: null,
      details: {
        count: moderators.length
      }
    });

    res.status(200).json({
      success: true,
      count: moderators.length,
      moderators: formattedModerators
    });
  } catch (error) {
    console.error('Get all moderators error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get moderator by ID (admin only)
exports.getModeratorById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const moderator = await User.findOne({
      _id: id,
      role: 'moderator'
    })
    .select('-password -__v')
    .lean();

    if (!moderator) {
      return res.status(404).json({
        success: false,
        message: "Moderator not found"
      });
    }

    const moderatorResponse = {
      ...moderator,
      fullName: `${moderator.firstName} ${moderator.lastName}`,
      capabilities: {
        level: moderator.moderatorLevel,
        scope: moderator.moderatorScope,
        limits: moderator.moderationLimits,
        permissions: moderator.permissions
      }
    };

    res.status(200).json({
      success: true,
      moderator: moderatorResponse
    });
  } catch (error) {
    console.error('Get moderator by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user (admin only)
exports.adminUpdateUser = async (req, res) => {
  try {
    console.log('🔄 Admin Update User Request');
    console.log('User ID:', req.params.id);
    console.log('Updating user by:', req.user?.email);
    console.log('Request body:', req.body);

    const { id } = req.params;

    // Check if user exists
    const existingUser = await User.findById(id);

    if (!existingUser) {
      console.log('❌ User not found with ID:', id);
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    console.log('Updating user:', existingUser.email, 'Role:', existingUser.role);

    // Store old data for audit
    const oldData = {
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      phone: existingUser.phone,
      address: existingUser.address,
      department: existingUser.department,
      designation: existingUser.designation,
      employeeId: existingUser.employeeId,
      status: existingUser.status,
      isActive: existingUser.isActive,
      role: existingUser.role,
      // Admin fields
      companyName: existingUser.companyName,
      adminPosition: existingUser.adminPosition,
      adminLevel: existingUser.adminLevel,
      permissions: existingUser.permissions,
      isSuperAdmin: existingUser.isSuperAdmin,
      canManageUsers: existingUser.canManageUsers,
      canManagePayroll: existingUser.canManagePayroll,
      // Moderator fields
      moderatorLevel: existingUser.moderatorLevel,
      moderatorScope: existingUser.moderatorScope,
      canModerateUsers: existingUser.canModerateUsers,
      canModerateContent: existingUser.canModerateContent,
      canViewReports: existingUser.canViewReports,
      canManageReports: existingUser.canManageReports,
      moderationLimits: existingUser.moderationLimits
    };

    // Define allowed fields to update
    const updates = {};

    // Common fields
    const commonFields = [
      "firstName",
      "lastName",
      "phone",
      "address",
      "department",
      "designation",
      "employeeId",
      "picture",
      "status",
      "isActive",
      // Salary fields
      "salaryType",
      "rate",
      "basicSalary",
      "salary",
      "joiningDate"
    ];

    // Role-specific fields
    const adminFields = [
      "companyName",
      "adminPosition",
      "adminLevel",
      "permissions",
      "isSuperAdmin",
      "canManageUsers",
      "canManagePayroll"
    ];

    const moderatorFields = [
      "moderatorLevel",
      "moderatorScope",
      "canModerateUsers",
      "canModerateContent",
      "canViewReports",
      "canManageReports",
      "moderationLimits"
    ];

    const employeeFields = [
      "managerId",
      "attendanceId",
      "shiftTiming"
    ];

    // Role change check
    if (req.body.role && req.body.role !== existingUser.role) {
      if (req.user.adminLevel !== 'super' && !req.user.isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: "Only super admin can change user roles"
        });
      }
      updates.role = req.body.role;
    }

    // Add common fields to updates
    commonFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Add role-specific fields
    if (existingUser.role === 'admin' || req.body.role === 'admin') {
      adminFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];

          // Super admin protection
          if (field === 'isSuperAdmin' && req.body[field] === true) {
            if (req.user.adminLevel !== 'super' && !req.user.isSuperAdmin) {
              return res.status(403).json({
                success: false,
                message: "Only super admin can assign super admin status"
              });
            }
          }
        }
      });
    }

    if (existingUser.role === 'moderator' || req.body.role === 'moderator') {
      moderatorFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });
    }

    if (existingUser.role === 'employee' || req.body.role === 'employee') {
      employeeFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });
    }

    console.log('Updates to apply:', updates);

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
        context: 'query'
      }
    ).select("-password -__v");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found after update"
      });
    }

    console.log('✅ User updated successfully:', updatedUser.email);

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Updated User",
      target: updatedUser._id,
      details: {
        oldData,
        newData: {
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          address: updatedUser.address,
          department: updatedUser.department,
          designation: updatedUser.designation,
          employeeId: updatedUser.employeeId,
          status: updatedUser.status,
          isActive: updatedUser.isActive,
          role: updatedUser.role,
          companyName: updatedUser.companyName,
          adminPosition: updatedUser.adminPosition,
          adminLevel: updatedUser.adminLevel,
          permissions: updatedUser.permissions,
          isSuperAdmin: updatedUser.isSuperAdmin,
          canManageUsers: updatedUser.canManageUsers,
          canManagePayroll: updatedUser.canManagePayroll,
          moderatorLevel: updatedUser.moderatorLevel,
          moderatorScope: updatedUser.moderatorScope,
          canModerateUsers: updatedUser.canModerateUsers,
          canModerateContent: updatedUser.canModerateContent,
          canViewReports: updatedUser.canViewReports,
          canManageReports: updatedUser.canManageReports,
          moderationLimits: updatedUser.moderationLimits
        },
        updatedFields: Object.keys(updates)
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Updated User",
      target: updatedUser._id,
      details: {
        email: updatedUser.email,
        updatedFields: Object.keys(updates)
      }
    });

    res.json({
      success: true,
      message: "User updated successfully",
      user: {
        ...updatedUser.toObject(),
        fullName: `${updatedUser.firstName} ${updatedUser.lastName}`
      }
    });
  } catch (err) {
    console.error('❌ Update error:', err.message);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: "Update failed",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Delete user (admin/super admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if trying to delete self
    if (id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting super admin unless you are super admin
    if ((user.isSuperAdmin || user.adminLevel === 'super') &&
      (req.user.adminLevel !== 'super' && !req.user.isSuperAdmin)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete super admin without super admin privileges'
      });
    }

    await User.findByIdAndDelete(id);

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Deleted User",
      target: id,
      details: {
        deletedUserEmail: user.email,
        deletedUserRole: user.role,
        deletedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Deleted User",
      target: id,
      details: {
        email: user.email,
        role: user.role
      }
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Change Admin Password
exports.changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await User.findById(req.user._id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Password verification
    let isPasswordValid = false;
    if (admin.password && admin.password.startsWith("$2")) {
      isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
    } else if (admin.password) {
      isPasswordValid = currentPassword === admin.password;
    }

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Store old hash for audit
    const oldPasswordHash = admin.password;

    // Update password
    admin.password = newPassword; // pre-save hook will hash it
    await admin.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Changed Admin Password",
      target: admin._id,
      details: {
        oldPasswordHash: oldPasswordHash.substring(0, 20) + '...',
        newPasswordHash: admin.password.substring(0, 20) + '...'
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Changed Password",
      target: admin._id,
      details: {}
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change admin password error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get User Statistics (Admin Dashboard)
exports.getUserStatistics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active', isActive: true });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const employeeUsers = await User.countDocuments({ role: 'employee' });
    const moderatorUsers = await User.countDocuments({ role: 'moderator' });

    // Department statistics
    const departmentStats = await User.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Recent users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed User Statistics",
      target: null,
      details: {
        statistics: {
          totalUsers,
          activeUsers,
          recentUsers
        }
      }
    });

    res.status(200).json({
      success: true,
      statistics: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        adminUsers,
        employeeUsers,
        moderatorUsers,
        recentUsers,
        departmentStats
      }
    });
  } catch (error) {
    console.error('Get user statistics error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= USER CONTROLLERS =================

// User Login 
exports.userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🚀 SIMPLE LOGIN ATTEMPT');
    console.log('- Email:', email);
    console.log('- Password provided:', !!password);

    // 1. Basic validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const emailClean = email.toLowerCase().trim();
    const passwordClean = password.trim();

    console.log('- Clean email:', emailClean);
    console.log('- Clean password length:', passwordClean.length);

    // 2. Find user (simple query)
    const user = await User.findOne({ 
      email: emailClean,
      role: 'employee'  // শুধু employee খুঁজবে
    });

    console.log('- User found:', !!user);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // 3. User details log
    console.log('📋 USER DETAILS:');
    console.log('- ID:', user._id);
    console.log('- Email:', user.email);
    console.log('- Role:', user.role);
    console.log('- Status:', user.status);
    console.log('- isActive:', user.isActive);
    console.log('- Password exists:', !!user.password);
    console.log('- Password length:', user.password?.length);
    console.log('- Is bcrypt hash?:', user.password?.startsWith('$2'));
    console.log('- Password first 30 chars:', user.password?.substring(0, 30) + '...');

    // 4. Check account status
    if (user.status !== "active" || !user.isActive) {
      console.log('❌ Account not active');
      return res.status(403).json({
        success: false,
        message: "Account is not active"
      });
    }

    // 5. Password verification - SIMPLE AND RELIABLE
    console.log('🔐 PASSWORD VERIFICATION:');
    
    let passwordValid = false;
    
    // Option A: Use matchPassword method
    if (typeof user.matchPassword === 'function') {
      console.log('- Using matchPassword() method');
      try {
        passwordValid = await user.matchPassword(passwordClean);
        console.log('- matchPassword result:', passwordValid);
      } catch (methodError) {
        console.log('- matchPassword error:', methodError.message);
      }
    }
    
    // Option B: Direct bcrypt compare (if matchPassword fails)
    if (!passwordValid && user.password?.startsWith('$2')) {
      console.log('- Using direct bcrypt.compare()');
      try {
        passwordValid = await bcrypt.compare(passwordClean, user.password);
        console.log('- bcrypt.compare result:', passwordValid);
      } catch (bcryptError) {
        console.log('- bcrypt.compare error:', bcryptError.message);
      }
    }
    
    // Option C: Plain text fallback
    if (!passwordValid && user.password) {
      console.log('- Trying plain text comparison');
      passwordValid = (passwordClean === user.password);
      console.log('- Plain text result:', passwordValid);
      
      // Convert to bcrypt if plain text matches
      if (passwordValid) {
        console.log('🔄 Converting plain text to bcrypt...');
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(passwordClean, salt);
        await user.save();
        console.log('✅ Password converted');
      }
    }

    // 6. If password still not valid
    if (!passwordValid) {
      console.log('❌ ALL PASSWORD METHODS FAILED');
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    console.log('✅ PASSWORD VALID');

    // 7. Generate token
    const token = generateToken(user);
    console.log('✅ TOKEN GENERATED');

    // 8. Update user
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    // 9. Prepare response
    const response = {
      success: true,
      message: "Login successful",
      token: token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        employeeId: user.employeeId,
        picture: user.picture,
        phone: user.phone,
        status: user.status,
        isActive: user.isActive,
        lastLogin: user.lastLogin
      }
    };

    console.log('🎉 LOGIN SUCCESS!');
    console.log('User logged in:', user.email);
    
    return res.status(200).json(response);

  } catch (error) {
    console.error('💥 LOGIN CRASH:', error);
    console.error('- Error name:', error.name);
    console.error('- Error message:', error.message);
    console.error('- Error stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again."
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

    // ✅ AuditLog for logout
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
    const user = await User.findById(req.user.id)
      .select('-password -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user.id,
      action: "Viewed Profile",
      target: user._id,
      details: {}
    });

    // Format response
    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      department: user.department,
      designation: user.designation,
      employeeId: user.employeeId,
      salaryType: user.salaryType,
      rate: user.rate,
      basicSalary: user.basicSalary,
      salary: user.salary,
      joiningDate: user.joiningDate,
      picture: user.picture,
      status: user.status,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Role-based fields
      ...(user.role === 'admin' && {
        companyName: user.companyName,
        adminPosition: user.adminPosition,
        adminLevel: user.adminLevel,
        permissions: user.permissions,
        isSuperAdmin: user.isSuperAdmin,
        canManageUsers: user.canManageUsers,
        canManagePayroll: user.canManagePayroll
      }),
      ...(user.role === 'moderator' && {
        moderatorLevel: user.moderatorLevel,
        moderatorScope: user.moderatorScope,
        canModerateUsers: user.canModerateUsers,
        canModerateContent: user.canModerateContent,
        canViewReports: user.canViewReports,
        canManageReports: user.canManageReports,
        moderationLimits: user.moderationLimits,
        permissions: user.permissions
      }),
      ...(user.role === 'employee' && {
        managerId: user.managerId,
        attendanceId: user.attendanceId,
        shiftTiming: user.shiftTiming
      })
    };

    res.status(200).json({
      success: true,
      user: userResponse
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch profile'
    });
  }
};

// Update profile 
exports.updateProfile = async (req, res) => {
  try {
    console.log('🔄 Profile Update Request Received');
    
    // 🔥 FIX 1: Remove problematic admin fields from request body
    const adminFields = ['adminLevel', 'adminPosition', 'companyName', 
                        'permissions', 'isSuperAdmin', 'canManageUsers', 
                        'canManagePayroll'];
    
    adminFields.forEach(field => {
      if (req.body[field] !== undefined) {
        console.log(`⚠️ Removing admin field: ${field} = ${req.body[field]}`);
        delete req.body[field];
      }
    });

    // Remove moderator fields if user is not moderator
    if (req.user.role !== 'moderator') {
      const moderatorFields = ['moderatorLevel', 'moderatorScope', 'canModerateUsers',
                              'canModerateContent', 'canViewReports', 'canManageReports',
                              'moderationLimits'];
      moderatorFields.forEach(field => {
        if (req.body[field] !== undefined) {
          console.log(`⚠️ Removing moderator field: ${field} = ${req.body[field]}`);
          delete req.body[field];
        }
      });
    }

    // 🔥 FIX 2: Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', {
      id: user._id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId
    });

    // 🔥 FIX 3: Check user role and handle accordingly
    if (user.role === 'employee') {
      console.log('👷 Processing employee profile update');
      
      // Employee can only update these fields
      const employeeAllowedFields = [
        'firstName', 'lastName', 'phone', 'address',
        'department', 'designation', 'picture',
        'salaryType', 'rate', 'basicSalary', 'salary',
        'joiningDate'
      ];
      
      // Update only allowed fields
      employeeAllowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          console.log(`- Updating ${field}: ${user[field]} -> ${req.body[field]}`);
          user[field] = req.body[field];
        }
      });
      
    } else if (user.role === 'admin') {
      console.log('👑 Processing admin profile update');
      // Admin can update all fields except role
      Object.keys(req.body).forEach(field => {
        if (req.body[field] !== undefined && field !== 'role') {
          user[field] = req.body[field];
        }
      });
    } else if (user.role === 'moderator') {
      console.log('🛡️ Processing moderator profile update');
      // Moderator can update these fields
      const moderatorAllowedFields = [
        'firstName', 'lastName', 'phone', 'address',
        'department', 'designation', 'picture',
        'salaryType', 'rate', 'basicSalary', 'salary',
        'joiningDate', 'moderatorLevel', 'moderatorScope',
        'canModerateUsers', 'canModerateContent', 'canViewReports',
        'canManageReports', 'moderationLimits', 'permissions'
      ];
      
      moderatorAllowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          user[field] = req.body[field];
        }
      });
    }

    // Save the user
    console.log('💾 Saving user...');
    await user.save();
    console.log('✅ User saved successfully');

    // Prepare response
    const responseData = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      department: user.department,
      designation: user.designation,
      employeeId: user.employeeId,
      picture: user.picture,
      status: user.status,
      isActive: user.isActive,
      updatedAt: user.updatedAt
    };

    // Add role-specific fields
    if (user.role === 'admin') {
      responseData.companyName = user.companyName;
      responseData.adminPosition = user.adminPosition;
      responseData.adminLevel = user.adminLevel;
    } else if (user.role === 'moderator') {
      responseData.moderatorLevel = user.moderatorLevel;
      responseData.moderatorScope = user.moderatorScope;
      responseData.canModerateUsers = user.canModerateUsers;
      responseData.canModerateContent = user.canModerateContent;
      responseData.canViewReports = user.canViewReports;
      responseData.canManageReports = user.canManageReports;
      responseData.moderationLimits = user.moderationLimits;
      responseData.permissions = user.permissions;
    }

    console.log('🎉 Profile update successful');
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: responseData
    });

  } catch (error) {
    console.error('❌ Profile Update Error:', {
      name: error.name,
      message: error.message
    });

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: `Validation failed: ${messages.join(', ')}`
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
};

// Change password (for all users)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    // Password verification
    let isPasswordValid = false;
    if (user.password && user.password.startsWith("$2")) {
      isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    } else if (user.password) {
      isPasswordValid = currentPassword === user.password;
    }

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const oldPasswordHash = user.password;
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user.id,
      action: "Changed Password",
      target: user._id,
      details: {
        oldPasswordHash: oldPasswordHash.substring(0, 20) + '...',
        newPasswordHash: user.password.substring(0, 20) + '...'
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user.id,
      action: "Changed Password",
      target: user._id,
      details: {}
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= SESSION MANAGEMENT =================

// Admin: view all sessions
exports.getAllSessions = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const sessions = await SessionLog.find()
      .populate('userId', 'firstName lastName email role')
      .sort({ loginAt: -1 });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed All Sessions",
      target: null,
      details: {
        count: sessions.length
      }
    });

    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
  }
};

// Admin: view session by ID
exports.getSessionById = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const session = await SessionLog.findById(req.params.id)
      .populate('userId', 'firstName lastName email role');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed Session",
      target: session._id,
      details: {
        sessionId: session._id,
        userId: session.userId
      }
    });

    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch session' });
  }
};

// Terminate specific session
exports.terminateSession = async (req, res) => {
  try {
    const session = await SessionLog.findById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Check if user owns the session or is admin
    if (session.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to terminate this session'
      });
    }

    session.logoutAt = new Date();
    await session.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user.id,
      action: "Terminated Session",
      target: session._id,
      details: { sessionId: session._id, userId: session.userId },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user.id,
      action: "Terminated Session",
      target: session._id,
      details: {
        sessionId: session._id,
        terminatedUserId: session.userId
      }
    });

    res.status(200).json({
      success: true,
      message: 'Session terminated successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to terminate session'
    });
  }
};

// Logout from all sessions
exports.logoutAllSessions = async (req, res) => {
  try {
    const sessions = await SessionLog.find({
      userId: req.user.id,
      logoutAt: null
    });

    const logoutTime = new Date();
    await SessionLog.updateMany(
      { userId: req.user.id, logoutAt: null },
      { $set: { logoutAt: logoutTime } }
    );

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user.id,
      action: "Logged Out All Sessions",
      target: req.user.id,
      details: { terminatedSessions: sessions.length },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user.id,
      action: "Logged Out All Sessions",
      target: req.user.id,
      details: {
        terminatedSessions: sessions.length
      }
    });

    res.status(200).json({
      success: true,
      message: `Logged out from ${sessions.length} sessions`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout from all sessions'
    });
  }
};

// ================= ADMIN: GET USER BY ID =================

// Admin get user profile by ID
exports.getUserById = async (req, res) => {
  try {
    console.log('🔍 Admin fetching user by ID:', req.params.id);
    
    const { id } = req.params;
    
    // Check if admin is requesting
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only."
      });
    }

    // Find user by ID
    const user = await User.findById(id)
      .select('-password -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    console.log('✅ User found:', {
      id: user._id,
      email: user.email,
      role: user.role,
      name: `${user.firstName} ${user.lastName}`
    });

    // Format response with all user data
    const userResponse = {
      // Basic info
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: user.role,
      
      // Profile
      picture: user.picture,
      department: user.department,
      designation: user.designation,
      employeeId: user.employeeId,
      
      // Salary information
      salaryType: user.salaryType,
      rate: user.rate,
      basicSalary: user.basicSalary,
      salary: user.salary,
      joiningDate: user.joiningDate,
      salaryRule: user.salaryRule,
      
      // Account status
      status: user.status,
      isActive: user.isActive,
      
      // Meta
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount || 0,
      
      // Role-specific fields
      ...(user.role === 'admin' && {
        companyName: user.companyName,
        adminPosition: user.adminPosition,
        adminLevel: user.adminLevel,
        permissions: user.permissions || [],
        isSuperAdmin: user.isSuperAdmin || false,
        canManageUsers: user.canManageUsers || false,
        canManagePayroll: user.canManagePayroll || false
      }),
      
      ...(user.role === 'moderator' && {
        moderatorLevel: user.moderatorLevel,
        moderatorScope: user.moderatorScope,
        canModerateUsers: user.canModerateUsers,
        canModerateContent: user.canModerateContent,
        canViewReports: user.canViewReports,
        canManageReports: user.canManageReports,
        moderationLimits: user.moderationLimits,
        permissions: user.permissions
      }),
      
      ...(user.role === 'employee' && {
        managerId: user.managerId,
        attendanceId: user.attendanceId,
        shiftTiming: user.shiftTiming || { start: '09:00', end: '18:00' }
      })
    };

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Viewed User Profile (Admin)",
      target: user._id,
      details: {
        viewedUserId: user._id,
        viewedUserEmail: user.email,
        viewedUserRole: user.role
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed User Profile",
      target: user._id,
      details: {
        userId: user._id,
        email: user.email,
        role: user.role
      }
    });

    res.status(200).json({
      success: true,
      message: "User profile retrieved successfully",
      user: userResponse
    });

  } catch (error) {
    console.error('❌ Get user by ID error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format"
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch user profile"
    });
  }
};

// ================= ADMIN: SEARCH USERS =================

exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }

    // Search in multiple fields
    const users = await User.find({
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { employeeId: { $regex: query, $options: 'i' } }
      ]
    })
    .select('_id firstName lastName email role department designation employeeId phone picture status')
    .limit(20)
    .lean();

    // Format response
    const formattedUsers = users.map(user => ({
      _id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role,
      department: user.department,
      designation: user.designation,
      employeeId: user.employeeId,
      phone: user.phone,
      picture: user.picture,
      status: user.status
    }));

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Searched Users",
      target: null,
      details: {
        query: query,
        results: users.length
      }
    });

    res.status(200).json({
      success: true,
      count: users.length,
      users: formattedUsers
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= ADMIN: GET USER SUMMARY =================

exports.getUserSummary = async (req, res) => {
  try {
    const { id } = req.params;

    // Get basic user info
    const user = await User.findById(id)
      .select('firstName lastName email role department designation employeeId status lastLogin createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Get additional statistics if needed
    const sessionCount = await SessionLog.countDocuments({ userId: id });
    const activeSessions = await SessionLog.countDocuments({ 
      userId: id, 
      logoutAt: null 
    });

    const summary = {
      basicInfo: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        employeeId: user.employeeId,
        status: user.status
      },
      activity: {
        lastLogin: user.lastLogin,
        accountCreated: user.createdAt,
        totalSessions: sessionCount,
        activeSessions: activeSessions
      },
      permissions: user.role === 'admin' ? user.permissions : 
                  user.role === 'moderator' ? user.permissions : []
    };

    res.status(200).json({
      success: true,
      summary: summary
    });

  } catch (error) {
    console.error('Get user summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= SHIFT MANAGEMENT CONTROLLERS =================

// Admin: Get all employees with their shift timings
exports.getAllEmployeeShifts = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const employees = await User.find({ role: 'employee' })
      .select('_id firstName lastName email employeeId department designation shiftTiming status isActive')
      .lean();

    const employeeShifts = employees.map(emp => {
      // Get current shift
      let currentShift = {
        start: '09:00',
        end: '18:00',
        type: 'default'
      };

      if (emp.shiftTiming) {
        if (emp.shiftTiming.currentShift && emp.shiftTiming.currentShift.isActive) {
          currentShift = {
            start: emp.shiftTiming.currentShift.start || '09:00',
            end: emp.shiftTiming.currentShift.end || '18:00',
            type: 'assigned',
            assignedBy: emp.shiftTiming.currentShift.assignedBy,
            assignedAt: emp.shiftTiming.currentShift.assignedAt,
            effectiveDate: emp.shiftTiming.currentShift.effectiveDate
          };
        } else if (emp.shiftTiming.defaultShift) {
          currentShift = {
            start: emp.shiftTiming.defaultShift.start || '09:00',
            end: emp.shiftTiming.defaultShift.end || '18:00',
            type: 'default'
          };
        } else if (emp.shiftTiming.start && emp.shiftTiming.end) {
          // Legacy format
          currentShift = {
            start: emp.shiftTiming.start,
            end: emp.shiftTiming.end,
            type: 'legacy'
          };
        }
      }

      return {
        _id: emp._id,
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email,
        employeeId: emp.employeeId,
        department: emp.department,
        designation: emp.designation,
        currentShift: currentShift,
        status: emp.status,
        isActive: emp.isActive,
        // Shift history count
        shiftHistoryCount: emp.shiftTiming?.shiftHistory?.length || 0
      };
    });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed All Employee Shifts",
      target: null,
      details: { count: employees.length }
    });

    res.status(200).json({
      success: true,
      count: employees.length,
      employees: employeeShifts
    });

  } catch (error) {
    console.error('Get all employee shifts error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Assign shift to employee
exports.assignShiftToEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { 
      startTime, 
      endTime, 
      effectiveDate, 
      reason = '',
      isPermanent = false 
    } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    // Validate required fields
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Start time and end time are required'
      });
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time format. Use HH:mm (24-hour format)'
      });
    }

    // Find employee
    const employee = await User.findOne({
      _id: employeeId,
      role: 'employee'
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Store old shift data for audit
    const oldShiftData = employee.shiftTiming ? { ...employee.shiftTiming.toObject() } : null;

    // Initialize shiftTiming if not exists
    if (!employee.shiftTiming) {
      employee.shiftTiming = {
        defaultShift: {
          start: '09:00',
          end: '18:00'
        },
        currentShift: {
          start: '',
          end: '',
          assignedBy: null,
          assignedAt: null,
          effectiveDate: null,
          isActive: false
        },
        shiftHistory: []
      };
    }

    // Ensure shiftHistory array exists
    if (!employee.shiftTiming.shiftHistory) {
      employee.shiftTiming.shiftHistory = [];
    }

    // Add current shift to history before updating
    if (employee.shiftTiming.currentShift && employee.shiftTiming.currentShift.isActive) {
      employee.shiftTiming.shiftHistory.push({
        start: employee.shiftTiming.currentShift.start,
        end: employee.shiftTiming.currentShift.end,
        assignedBy: employee.shiftTiming.currentShift.assignedBy,
        assignedAt: employee.shiftTiming.currentShift.assignedAt,
        effectiveDate: employee.shiftTiming.currentShift.effectiveDate,
        endedAt: new Date(),
        reason: reason || 'Reassigned to new shift'
      });
    }

    // Update current shift
    employee.shiftTiming.currentShift = {
      start: startTime,
      end: endTime,
      assignedBy: req.user._id,
      assignedAt: new Date(),
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      isActive: true
    };

    // Add to shift history
    employee.shiftTiming.shiftHistory.push({
      start: startTime,
      end: endTime,
      assignedBy: req.user._id,
      assignedAt: new Date(),
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      reason: reason || 'Shift assigned by admin'
    });

    // If permanent, update default shift as well
    if (isPermanent) {
      employee.shiftTiming.defaultShift = {
        start: startTime,
        end: endTime
      };
    }

    await employee.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Assigned Shift to Employee",
      target: employee._id,
      details: {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeId: employee.employeeId,
        oldShift: oldShiftData?.currentShift || 'No previous shift',
        newShift: {
          start: startTime,
          end: endTime,
          effectiveDate: effectiveDate || 'Immediate',
          reason: reason,
          isPermanent: isPermanent
        },
        assignedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Assigned Shift",
      target: employee._id,
      details: {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        shift: `${startTime} - ${endTime}`,
        reason: reason
      }
    });

    res.status(200).json({
      success: true,
      message: 'Shift assigned successfully',
      shiftDetails: {
        employee: {
          _id: employee._id,
          name: `${employee.firstName} ${employee.lastName}`,
          email: employee.email,
          employeeId: employee.employeeId
        },
        shift: {
          start: startTime,
          end: endTime,
          effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
          assignedBy: req.user.email,
          assignedAt: new Date(),
          isPermanent: isPermanent
        }
      }
    });

  } catch (error) {
    console.error('Assign shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Reset employee shift to default
exports.resetEmployeeShift = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { reason = '' } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    // Find employee
    const employee = await User.findOne({
      _id: employeeId,
      role: 'employee'
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Store old shift data
    const oldShiftData = employee.shiftTiming ? { ...employee.shiftTiming.toObject() } : null;

    // Check if there's a current shift to reset
    if (!employee.shiftTiming || !employee.shiftTiming.currentShift || !employee.shiftTiming.currentShift.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Employee does not have an active assigned shift'
      });
    }

    // Add current shift to history
    employee.shiftTiming.shiftHistory.push({
      start: employee.shiftTiming.currentShift.start,
      end: employee.shiftTiming.currentShift.end,
      assignedBy: employee.shiftTiming.currentShift.assignedBy,
      assignedAt: employee.shiftTiming.currentShift.assignedAt,
      effectiveDate: employee.shiftTiming.currentShift.effectiveDate,
      endedAt: new Date(),
      reason: reason || 'Reset to default shift'
    });

    // Reset current shift
    employee.shiftTiming.currentShift = {
      start: '',
      end: '',
      assignedBy: req.user._id,
      assignedAt: new Date(),
      effectiveDate: null,
      isActive: false
    };

    await employee.save();

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Reset Employee Shift to Default",
      target: employee._id,
      details: {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeId: employee.employeeId,
        oldShift: {
          start: oldShiftData.currentShift.start,
          end: oldShiftData.currentShift.end,
          assignedBy: oldShiftData.currentShift.assignedBy,
          assignedAt: oldShiftData.currentShift.assignedAt
        },
        resetBy: req.user.email,
        reason: reason
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Reset Shift to Default",
      target: employee._id,
      details: {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        reason: reason
      }
    });

    res.status(200).json({
      success: true,
      message: 'Shift reset to default successfully',
      employee: {
        _id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        employeeId: employee.employeeId,
        defaultShift: employee.shiftTiming.defaultShift || { start: '09:00', end: '18:00' }
      }
    });

  } catch (error) {
    console.error('Reset shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Update default shift timing
exports.updateDefaultShift = async (req, res) => {
  try {
    const { startTime, endTime } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time format. Use HH:mm (24-hour format)'
      });
    }

    // Update company-wide default shift in admin's profile
    const admin = await User.findById(req.user._id);
    
    if (!admin.shiftTiming) {
      admin.shiftTiming = {};
    }
    
    admin.shiftTiming.defaultShift = {
      start: startTime,
      end: endTime
    };

    await admin.save();

    // Update all employees who don't have assigned shifts
    const result = await User.updateMany(
      {
        role: 'employee',
        'shiftTiming.currentShift.isActive': { $ne: true }
      },
      {
        $set: {
          'shiftTiming.defaultShift.start': startTime,
          'shiftTiming.defaultShift.end': endTime
        }
      }
    );

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Updated Default Shift Timing",
      target: null,
      details: {
        oldDefault: admin.shiftTiming?.defaultShift || '09:00-18:00',
        newDefault: `${startTime}-${endTime}`,
        employeesAffected: result.modifiedCount,
        updatedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Updated Default Shift",
      target: null,
      details: {
        shift: `${startTime} - ${endTime}`,
        employeesAffected: result.modifiedCount
      }
    });

    res.status(200).json({
      success: true,
      message: 'Default shift timing updated successfully',
      data: {
        defaultShift: {
          start: startTime,
          end: endTime
        },
        employeesAffected: result.modifiedCount,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Update default shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Get employee shift history
exports.getEmployeeShiftHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    // Find employee with shift history
    const employee = await User.findOne({
      _id: employeeId,
      role: 'employee'
    }).select('firstName lastName email employeeId shiftTiming');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get shift history
    const shiftHistory = employee.shiftTiming?.shiftHistory || [];
    
    // Populate assignedBy user names
    const populatedHistory = await Promise.all(
      shiftHistory.map(async (history) => {
        if (history.assignedBy) {
          const assignedByUser = await User.findById(history.assignedBy)
            .select('firstName lastName email')
            .lean();
          
          return {
            ...history.toObject ? history.toObject() : history,
            assignedByUser: assignedByUser || null
          };
        }
        return history.toObject ? history.toObject() : history;
      })
    );

    // Sort by date (newest first)
    populatedHistory.sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed Employee Shift History",
      target: employee._id,
      details: {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        historyCount: populatedHistory.length
      }
    });

    res.status(200).json({
      success: true,
      employee: {
        _id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        employeeId: employee.employeeId,
        currentShift: employee.shiftTiming?.currentShift || null,
        defaultShift: employee.shiftTiming?.defaultShift || { start: '09:00', end: '18:00' }
      },
      shiftHistory: populatedHistory,
      totalRecords: populatedHistory.length
    });

  } catch (error) {
    console.error('Get shift history error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Get my shift timing
exports.getMyShift = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id)
      .select('firstName lastName email employeeId shiftTiming department designation');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Determine current shift
    let currentShift;
    let shiftType = 'default';

    if (employee.shiftTiming) {
      if (employee.shiftTiming.currentShift && employee.shiftTiming.currentShift.isActive) {
        currentShift = {
          start: employee.shiftTiming.currentShift.start,
          end: employee.shiftTiming.currentShift.end,
          assignedBy: employee.shiftTiming.currentShift.assignedBy,
          assignedAt: employee.shiftTiming.currentShift.assignedAt,
          effectiveDate: employee.shiftTiming.currentShift.effectiveDate
        };
        shiftType = 'assigned';
      } else if (employee.shiftTiming.defaultShift) {
        currentShift = {
          start: employee.shiftTiming.defaultShift.start || '09:00',
          end: employee.shiftTiming.defaultShift.end || '18:00'
        };
        shiftType = 'default';
      } else {
        // Legacy format
        currentShift = {
          start: employee.shiftTiming.start || '09:00',
          end: employee.shiftTiming.end || '18:00'
        };
        shiftType = 'legacy';
      }
    } else {
      // No shift data, use default
      currentShift = {
        start: '09:00',
        end: '18:00'
      };
      shiftType = 'default';
    }

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed My Shift",
      target: req.user._id,
      details: {
        shift: `${currentShift.start} - ${currentShift.end}`,
        shiftType: shiftType
      }
    });

    res.status(200).json({
      success: true,
      employee: {
        _id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation
      },
      currentShift: currentShift,
      shiftType: shiftType,
      message: shiftType === 'assigned' ? 'You have an assigned shift' : 'You are on default shift timing'
    });

  } catch (error) {
    console.error('Get my shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Bulk assign shifts to multiple employees
exports.bulkAssignShifts = async (req, res) => {
  try {
    const { employeeIds, startTime, endTime, effectiveDate, reason = '' } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    // Validate required fields
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee IDs array is required'
      });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Start time and end time are required'
      });
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time format. Use HH:mm (24-hour format)'
      });
    }

    // Find employees
    const employees = await User.find({
      _id: { $in: employeeIds },
      role: 'employee'
    });

    if (employees.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No employees found'
      });
    }

    const results = [];
    const errors = [];

    // Assign shift to each employee
    for (const employee of employees) {
      try {
        // Initialize shiftTiming if not exists
        if (!employee.shiftTiming) {
          employee.shiftTiming = {
            defaultShift: {
              start: '09:00',
              end: '18:00'
            },
            currentShift: {
              start: '',
              end: '',
              assignedBy: null,
              assignedAt: null,
              effectiveDate: null,
              isActive: false
            },
            shiftHistory: []
          };
        }

        // Add current shift to history before updating
        if (employee.shiftTiming.currentShift && employee.shiftTiming.currentShift.isActive) {
          employee.shiftTiming.shiftHistory.push({
            start: employee.shiftTiming.currentShift.start,
            end: employee.shiftTiming.currentShift.end,
            assignedBy: employee.shiftTiming.currentShift.assignedBy,
            assignedAt: employee.shiftTiming.currentShift.assignedAt,
            effectiveDate: employee.shiftTiming.currentShift.effectiveDate,
            endedAt: new Date(),
            reason: reason || 'Bulk reassignment'
          });
        }

        // Update current shift
        employee.shiftTiming.currentShift = {
          start: startTime,
          end: endTime,
          assignedBy: req.user._id,
          assignedAt: new Date(),
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          isActive: true
        };

        // Add to shift history
        employee.shiftTiming.shiftHistory.push({
          start: startTime,
          end: endTime,
          assignedBy: req.user._id,
          assignedAt: new Date(),
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          reason: reason || 'Bulk shift assignment'
        });

        await employee.save();

        results.push({
          employeeId: employee._id,
          name: `${employee.firstName} ${employee.lastName}`,
          email: employee.email,
          success: true
        });

      } catch (error) {
        errors.push({
          employeeId: employee._id,
          name: `${employee.firstName} ${employee.lastName}`,
          error: error.message
        });
      }
    }

    // ✅ AuditLog
    await AuditLog.create({
      userId: req.user._id,
      action: "Bulk Assigned Shifts",
      target: null,
      details: {
        shift: `${startTime} - ${endTime}`,
        totalEmployees: employeeIds.length,
        successfulAssignments: results.length,
        failedAssignments: errors.length,
        effectiveDate: effectiveDate || 'Immediate',
        reason: reason,
        assignedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Bulk Assigned Shifts",
      target: null,
      details: {
        shift: `${startTime} - ${endTime}`,
        successful: results.length,
        failed: errors.length
      }
    });

    res.status(200).json({
      success: true,
      message: 'Bulk shift assignment completed',
      summary: {
        totalProcessed: employeeIds.length,
        successful: results.length,
        failed: errors.length
      },
      results: results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Bulk assign shifts error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Get shift statistics
exports.getShiftStatistics = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    // Total employees
    const totalEmployees = await User.countDocuments({ role: 'employee' });

    // Employees with assigned shifts
    const employeesWithAssignedShifts = await User.countDocuments({
      role: 'employee',
      'shiftTiming.currentShift.isActive': true
    });

    // Employees on default shift
    const employeesOnDefaultShift = totalEmployees - employeesWithAssignedShifts;

    // Most common shift timings
    const shiftAggregation = await User.aggregate([
      { $match: { role: 'employee' } },
      {
        $project: {
          shift: {
            $cond: {
              if: { $and: [
                { $ne: ['$shiftTiming', null] },
                { $eq: ['$shiftTiming.currentShift.isActive', true] }
              ]},
              then: {
                start: '$shiftTiming.currentShift.start',
                end: '$shiftTiming.currentShift.end'
              },
              else: {
                start: { $ifNull: ['$shiftTiming.defaultShift.start', '09:00'] },
                end: { $ifNull: ['$shiftTiming.defaultShift.end', '18:00'] }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: { start: '$shift.start', end: '$shift.end' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Shift changes in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentShiftChanges = await User.aggregate([
      { $match: { role: 'employee' } },
      { $unwind: { path: '$shiftTiming.shiftHistory', preserveNullAndEmptyArrays: true } },
      { $match: { 'shiftTiming.shiftHistory.assignedAt': { $gte: thirtyDaysAgo } } },
      { 
        $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: "$shiftTiming.shiftHistory.assignedAt" } 
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } },
      { $limit: 30 }
    ]);

    // ✅ Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: "Viewed Shift Statistics",
      target: null,
      details: {
        totalEmployees: totalEmployees,
        withAssignedShifts: employeesWithAssignedShifts
      }
    });

    res.status(200).json({
      success: true,
      statistics: {
        totalEmployees: totalEmployees,
        employeesWithAssignedShifts: employeesWithAssignedShifts,
        employeesOnDefaultShift: employeesOnDefaultShift,
        shiftDistribution: shiftAggregation,
        recentShiftChanges: recentShiftChanges,
        defaultShift: {
          start: '09:00',
          end: '18:00'
        }
      }
    });

  } catch (error) {
    console.error('Get shift statistics error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};