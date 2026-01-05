// controllers/auditController.js
const AuditLog = require('../models/AuditModel');
const mongoose = require('mongoose');

// ==================== MIDDLEWARE: Create Audit Log ====================
const createAuditLog = async (req, action, details = {}, status = 'SUCCESS') => {
  try {
    if (!req.user) return;
    
    // Get device and IP information
    const deviceInfo = getDeviceInfo(req);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    
    const auditData = {
      userId: req.user._id,
      action,
      details,
      ip: ip.split(',')[0].trim(), // Get first IP if multiple
      device: deviceInfo.device,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      userAgent: req.headers['user-agent'],
      status,
      createdAt: new Date()
    };

    // Add target if available
    if (req.params.id) auditData.target = req.params.id;
    if (req.body.target) auditData.target = req.body.target;

    await AuditLog.create(auditData);
    
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
};

// Helper function to get device info
const getDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  let device = 'Unknown';
  let browser = 'Unknown';
  let os = 'Unknown';

  // Detect device
  if (/mobile/i.test(userAgent)) {
    device = 'Mobile';
  } else if (/tablet/i.test(userAgent)) {
    device = 'Tablet';
  } else if (/windows|mac|linux/i.test(userAgent)) {
    device = 'Desktop';
  }

  // Detect browser
  if (/chrome/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/firefox/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/safari/i.test(userAgent)) {
    browser = 'Safari';
  } else if (/edge/i.test(userAgent)) {
    browser = 'Edge';
  }

  // Detect OS
  if (/windows/i.test(userAgent)) {
    os = 'Windows';
  } else if (/mac/i.test(userAgent)) {
    os = 'MacOS';
  } else if (/linux/i.test(userAgent)) {
    os = 'Linux';
  } else if (/android/i.test(userAgent)) {
    os = 'Android';
  } else if (/ios|iphone|ipad/i.test(userAgent)) {
    os = 'iOS';
  }

  return { device, browser, os };
};

// ==================== GET ALL AUDIT LOGS (ADMIN ONLY) ====================
exports.getAllAuditLogs = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    
    // User filter
    if (req.query.userId) {
      if (mongoose.Types.ObjectId.isValid(req.query.userId)) {
        filter.userId = req.query.userId;
      }
    }
    
    // Action filter
    if (req.query.action && req.query.action !== 'all') {
      filter.action = req.query.action;
    }
    
    // Status filter
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    
    // Date range filter
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate + 'T23:59:59.999Z')
      };
    }
    
    // Search in details
    if (req.query.search) {
      filter.$or = [
        { 'details': { $regex: req.query.search, $options: 'i' } },
        { 'ip': { $regex: req.query.search, $options: 'i' } },
        { 'device': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Get total count
    const total = await AuditLog.countDocuments(filter);

    // Get logs with pagination
    const logs = await AuditLog.find(filter)
      .populate('userId', 'firstName lastName email role employeeId department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean for better performance

    // Format logs for frontend
    const formattedLogs = logs.map(log => ({
      _id: log._id,
      action: log.action,
      details: log.details,
      ip: log.ip,
      device: log.device,
      browser: log.browser,
      os: log.os,
      location: log.location,
      status: log.status,
      createdAt: log.createdAt,
      user: log.userId ? {
        _id: log.userId._id,
        name: `${log.userId.firstName || ''} ${log.userId.lastName || ''}`.trim(),
        email: log.userId.email,
        role: log.userId.role,
        employeeId: log.userId.employeeId,
        department: log.userId.department
      } : null
    }));

    // Create audit log for this view
    await createAuditLog(req, 'VIEW_AUDIT_LOGS', { filter, page, limit }, 'SUCCESS');

    res.status(200).json({
      success: true,
      message: `Found ${formattedLogs.length} audit logs`,
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('❌ Error getting audit logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// ==================== GET MY AUDIT LOGS ====================
exports.getMyAuditLogs = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found'
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { userId };
    
    // Date range filter
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate + 'T23:59:59.999Z')
      };
    }

    // Get total count
    const total = await AuditLog.countDocuments(filter);

    // Get logs
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Format logs
    const formattedLogs = logs.map(log => ({
      _id: log._id,
      action: log.action,
      details: log.details,
      ip: log.ip,
      device: log.device,
      browser: log.browser,
      os: log.os,
      status: log.status,
      createdAt: log.createdAt
    }));

    res.status(200).json({
      success: true,
      message: `Found ${formattedLogs.length} audit logs`,
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error getting my audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

// ==================== DELETE AUDIT LOG ====================
exports.deleteAuditLog = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const log = await AuditLog.findById(req.params.id);
    
    if (!log) {
      return res.status(404).json({ 
        success: false, 
        message: 'Audit log not found' 
      });
    }

    await AuditLog.findByIdAndDelete(req.params.id);
    
    // Create audit log for deletion
    await createAuditLog(req, 'DELETE_AUDIT_LOG', { logId: req.params.id }, 'SUCCESS');

    res.status(200).json({ 
      success: true, 
      message: 'Audit log deleted successfully' 
    });

  } catch (error) {
    console.error('Error deleting audit log:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// ==================== GET AUDIT STATS ====================
exports.getAuditStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    // Today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Last 7 days
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    // Get stats
    const [
      totalLogs,
      todaysLogs,
      last7DaysLogs,
      topActions,
      topUsers,
      logsByDevice,
      logsByStatus
    ] = await Promise.all([
      // Total logs
      AuditLog.countDocuments(),
      
      // Today's logs
      AuditLog.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
      
      // Last 7 days logs
      AuditLog.countDocuments({ createdAt: { $gte: last7Days } }),
      
      // Top 5 actions
      AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      
      // Top 5 users
      AuditLog.aggregate([
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 1,
            count: 1,
            name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
            email: '$user.email',
            role: '$user.role'
          }
        }
      ]),
      
      // Logs by device
      AuditLog.aggregate([
        { $group: { _id: '$device', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Logs by status
      AuditLog.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalLogs,
        todaysLogs,
        last7DaysLogs,
        topActions,
        topUsers,
        logsByDevice,
        logsByStatus,
        chartData: {
          labels: ['Today', 'Last 7 Days', 'Total'],
          data: [todaysLogs, last7DaysLogs, totalLogs]
        }
      }
    });

  } catch (error) {
    console.error('Error getting audit stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// ==================== GET LOG BY ID ====================
exports.getAuditLogById = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate('userId', 'firstName lastName email role employeeId department');
    
    if (!log) {
      return res.status(404).json({ 
        success: false, 
        message: 'Audit log not found' 
      });
    }

    // Check permission - admin or own log
    if (req.user.role !== 'admin' && log.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    res.status(200).json({
      success: true,
      data: log
    });

  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// ==================== CLEAR OLD LOGS ====================
exports.clearOldLogs = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const days = parseInt(req.body.days) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await AuditLog.deleteMany({ 
      createdAt: { $lt: cutoffDate } 
    });

    // Create audit log for this action
    await createAuditLog(req, 'CLEAR_OLD_LOGS', { 
      days, 
      deletedCount: result.deletedCount,
      cutoffDate 
    }, 'SUCCESS');

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} logs older than ${days} days`
    });

  } catch (error) {
    console.error('Error clearing old logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};