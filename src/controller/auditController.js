const AuditLog = require('../models/AuditModel');
const mongoose = require('mongoose');
const User = require('../models/UsersModel');

// Helper function to create audit log for any user
const createAuditLog = async (logData) => {
  try {
    return await AuditLog.create({
      userId: logData.userId,
      userRole: logData.userRole,
      action: logData.action,
      target: logData.target || logData.userId,
      details: logData.details || {},
      ip: logData.ip,
      device: logData.device,
      browser: logData.browser,
      os: logData.os,
      location: logData.location,
      status: logData.status || 'success',
      severity: logData.severity || 'low',
      duration: logData.duration || 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });
  } catch (error) {
    console.error('Create audit log helper error:', error);
    return null;
  }
};

// ==================== GET ALL AUDIT LOGS (ADMIN ONLY - ALL USERS) ====================
exports.getAllAuditLogs = async (req, res) => {
  try {
    console.log('🔍 Admin fetching ALL audit logs');
    console.log('Admin user:', {
      id: req.user._id,
      role: req.user.role,
      email: req.user.email
    });

    // Check if user is admin
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superAdmin';
    if (!isAdmin) {
      // Create audit log for unauthorized access attempt
      await createAuditLog({
        userId: req.user._id,
        userRole: req.user.role,
        action: "Unauthorized Access to All Audit Logs",
        details: {
          message: "Non-admin user attempted to access all audit logs",
          userRole: req.user.role
        },
        status: 'failed',
        severity: 'high',
        ip: req.ip,
        device: req.headers['user-agent']
      });
      
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Filter options - Admin can see ALL logs
    let filter = {};
    
    // Apply filters if provided
    if (req.query.userId) {
      filter.userId = req.query.userId;
    }
    
    if (req.query.userRole) {
      filter.userRole = req.query.userRole;
    }
    
    if (req.query.action) {
      filter.action = { $regex: req.query.action, $options: 'i' };
    }
    
    if (req.query.severity) {
      filter.severity = req.query.severity;
    }
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: 'i' };
      filter.$or = [
        { action: searchRegex },
        { details: searchRegex },
        { ip: searchRegex },
        { device: searchRegex },
        { 'userId.firstName': searchRegex },
        { 'userId.lastName': searchRegex },
        { 'userId.email': searchRegex }
      ];
    }

    console.log('Query filter:', JSON.stringify(filter, null, 2));

    // Get ALL logs with user info
    const logs = await AuditLog.find(filter)
      .populate('userId', 'firstName lastName email role department employeeId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments(filter);

    console.log(`📊 Found ${logs.length} logs out of ${total} total`);

    // Create audit log for this admin action
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Admin Viewed All Audit Logs",
      details: {
        page,
        limit,
        filters: filter,
        results: logs.length,
        total: total
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Successfully retrieved ${logs.length} audit logs`,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error getting all audit logs:', error);
    
    // Create audit log for failed action
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to View All Audit Logs",
      details: { error: error.message },
      status: 'failed',
      severity: 'high',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching audit logs',
      error: error.message 
    });
  }
};

// ==================== GET AUDIT LOGS BY USER ID (ADMIN OR SELF) ====================
exports.getAuditLogsByUserId = async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    console.log('🔍 Fetching logs for user ID:', targetUserId);
    console.log('Requesting user:', {
      id: req.user._id,
      role: req.user.role,
      email: req.user.email
    });

    // Check permissions
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superAdmin';
    const isSelf = req.user._id.toString() === targetUserId;

    if (!isAdmin && !isSelf) {
      // Create audit log for unauthorized attempt
      await createAuditLog({
        userId: req.user._id,
        userRole: req.user.role,
        action: "Unauthorized Access to User Audit Logs",
        target: targetUserId,
        details: {
          message: "User attempted to access another user's audit logs",
          targetUserId,
          requestingUserId: req.user._id
        },
        status: 'failed',
        severity: 'high',
        ip: req.ip,
        device: req.headers['user-agent']
      });
      
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only view your own logs.' 
      });
    }

    // Check if user ID is valid
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID format' 
      });
    }

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser && targetUserId !== 'system') {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Find logs by user ID
    const logs = await AuditLog.find({ userId: targetUserId })
      .populate('userId', 'firstName lastName email role department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments({ userId: targetUserId });

    console.log(`📄 Found ${logs.length} logs for user ${targetUserId}`);

    // Create audit log for this action
    const actionName = isAdmin 
      ? "Admin Viewed User Audit Logs" 
      : "User Viewed Own Audit Logs";
    
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: actionName,
      target: targetUserId,
      details: {
        targetUserId,
        targetUserRole: targetUser?.role,
        page,
        limit,
        results: logs.length,
        total
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Found ${logs.length} audit logs`,
      user: targetUser ? {
        _id: targetUser._id,
        name: `${targetUser.firstName} ${targetUser.lastName}`,
        email: targetUser.email,
        role: targetUser.role,
        employeeId: targetUser.employeeId
      } : null,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error getting user audit logs:', error);
    
    // Create audit log for failed action
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to Get User Audit Logs",
      target: req.params.userId,
      details: { error: error.message },
      status: 'failed',
      severity: 'medium',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// ==================== GET MY AUDIT LOGS (USER'S OWN LOGS) ==================== 
exports.getMyAuditLogs = async (req, res) => {
  try {
    const userId = req.user._id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in request'
      });
    }

    console.log(`👤 User fetching own audit logs: ${userId}`);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get user's own logs
    const logs = await AuditLog.find({ userId })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments({ userId });

    // If no logs found
    if (logs.length === 0) {
      // Create audit log for viewing own logs
      await createAuditLog({
        userId: req.user._id,
        userRole: req.user.role,
        action: "Viewed My Audit Logs",
        details: {
          page,
          limit,
          results: 0,
          message: 'No logs found for user'
        },
        ip: req.ip,
        device: req.headers['user-agent']
      });
      
      return res.status(200).json({
        success: true,
        message: 'No audit logs found for your account',
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      });
    }

    // Create audit log for viewing own logs
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Viewed My Audit Logs",
      details: {
        page,
        limit,
        results: logs.length,
        total
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Found ${logs.length} audit logs`,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in getMyAuditLogs:', error);
    
    // Create audit log for failed fetch
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to View My Audit Logs",
      details: { error: error.message },
      status: 'failed',
      severity: 'medium',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

// ==================== SEARCH ALL AUDIT LOGS (ADMIN ONLY) ====================
exports.searchAuditLogs = async (req, res) => {
  try {
    const { query, startDate, endDate, userRole, severity } = req.query;
    
    console.log('🔍 Admin searching audit logs:', { query, startDate, endDate, userRole, severity });

    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    // Build search filter
    const filter = {};
    
    if (query) {
      filter.$or = [
        { action: { $regex: query, $options: 'i' } },
        { details: { $regex: query, $options: 'i' } },
        { device: { $regex: query, $options: 'i' } },
        { ip: { $regex: query, $options: 'i' } },
        { userRole: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (userRole) {
      filter.userRole = userRole;
    }
    
    if (severity) {
      filter.severity = severity;
    }
    
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    console.log('Search filter:', JSON.stringify(filter, null, 2));

    const logs = await AuditLog.find(filter)
      .populate('userId', 'firstName lastName email role department')
      .sort({ createdAt: -1 })
      .limit(100);

    // Create audit log for search action
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Searched Audit Logs",
      details: {
        searchQuery: query,
        filters: filter,
        results: logs.length
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Found ${logs.length} matching audit logs`,
      data: logs,
      count: logs.length
    });
  } catch (error) {
    console.error('Error searching audit logs:', error);
    
    // Create audit log for failed search
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to Search Audit Logs",
      details: { error: error.message, query: req.query.query },
      status: 'failed',
      severity: 'medium',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// ==================== GET AUDIT STATISTICS (ADMIN ONLY) ====================
exports.getAuditStats = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    console.log('📊 Admin fetching audit statistics');

    // Total logs (ALL users)
    const totalLogs = await AuditLog.countDocuments();
    
    // Today's logs (ALL users)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysLogs = await AuditLog.countDocuments({
      createdAt: { $gte: today }
    });
    
    // Most frequent actions
    const topActions = await AuditLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Logs by user role
    const logsByRole = await AuditLog.aggregate([
      { $group: { _id: '$userRole', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Logs by severity
    const logsBySeverity = await AuditLog.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Top users by activity
    const topUsers = await AuditLog.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Populate user info for top users
    const topUsersWithInfo = await Promise.all(
      topUsers.map(async (userStat) => {
        if (userStat._id) {
          const user = await User.findById(userStat._id)
            .select('firstName lastName email role department employeeId')
            .lean();
          return {
            ...userStat,
            userInfo: user || { _id: userStat._id, name: 'Unknown User' }
          };
        }
        return userStat;
      })
    );
    
    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentActivity = await AuditLog.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Create audit log for stats viewing
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Viewed Audit Statistics",
      details: {
        totalLogs,
        todaysLogs
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: 'Audit statistics retrieved successfully',
      data: {
        totalLogs,
        todaysLogs,
        topActions,
        logsByRole,
        logsBySeverity,
        topUsers: topUsersWithInfo,
        recentActivity,
        summary: {
          averageDailyLogs: Math.round(totalLogs / 30), // Approximate daily average
          mostActiveRole: logsByRole[0]?._id || 'None',
          criticalIssues: logsBySeverity.find(s => s._id === 'critical')?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('Fetch stats error:', error);
    
    // Create audit log for failed stats fetch
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to View Audit Statistics",
      details: { error: error.message },
      status: 'failed',
      severity: 'medium',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// ==================== EXPORT ALL AUDIT LOGS (ADMIN ONLY) ====================
exports.exportAuditLogs = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    console.log('📥 Admin exporting audit logs');

    const { startDate, endDate, format = 'csv' } = req.query;
    
    let filter = {};
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get ALL logs (up to 10,000 for safety)
    const logs = await AuditLog.find(filter)
      .populate('userId', 'firstName lastName email role department employeeId')
      .sort({ createdAt: -1 })
      .limit(10000);

    console.log(`📤 Exporting ${logs.length} audit logs`);

    // Create audit log for export
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Exported Audit Logs",
      details: {
        format,
        startDate,
        endDate,
        count: logs.length,
        filter
      },
      severity: 'medium',
      ip: req.ip,
      device: req.headers['user-agent']
    });

    if (format === 'csv') {
      // Convert to CSV
      const csvHeaders = 'Timestamp,User ID,User Name,User Role,Action,IP Address,Device,Browser,OS,Status,Severity,Details\n';
      const csvRows = logs.map(log => {
        const user = log.userId 
          ? `${log.userId.firstName} ${log.userId.lastName}` 
          : 'System';
        const userEmail = log.userId?.email || 'N/A';
        const userRole = log.userRole || 'N/A';
        
        const details = typeof log.details === 'object' 
          ? JSON.stringify(log.details).replace(/"/g, '""') 
          : String(log.details || '').replace(/"/g, '""');
        
        return `"${log.createdAt}","${log.userId?._id || 'system'}","${user} (${userEmail})","${userRole}","${log.action}","${log.ip}","${log.device}","${log.browser}","${log.os}","${log.status}","${log.severity}","${details}"`;
      }).join('\n');
      
      const csvContent = csvHeaders + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
    } else {
      // Default to JSON
      res.status(200).json({
        success: true,
        message: `Exported ${logs.length} audit logs`,
        data: logs,
        count: logs.length,
        exportedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Export audit logs error:', error);
    
    // Create audit log for failed export
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to Export Audit Logs",
      details: { error: error.message },
      status: 'failed',
      severity: 'high',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to export audit logs',
      error: error.message
    });
  }
};

// ==================== DELETE AUDIT LOG (ADMIN ONLY) ====================
exports.deleteAuditLog = async (req, res) => {
  try {
    const logId = req.params.id;
    console.log(`🗑️ Admin attempting to delete audit log: ${logId}`);

    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      // Create audit log for unauthorized attempt
      await createAuditLog({
        userId: req.user._id,
        userRole: req.user.role,
        action: "Unauthorized Audit Log Deletion Attempt",
        target: logId,
        details: {
          message: "Non-admin user attempted to delete audit log",
          logId
        },
        status: 'failed',
        severity: 'high',
        ip: req.ip,
        device: req.headers['user-agent']
      });
      
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const log = await AuditLog.findById(logId);

    if (!log) {
      return res.status(404).json({ 
        success: false, 
        message: 'Audit log not found' 
      });
    }

    // Store log info before deletion
    const logInfo = {
      logId: log._id,
      action: log.action,
      userId: log.userId,
      userRole: log.userRole,
      createdAt: log.createdAt,
      userInfo: log.userId ? await User.findById(log.userId).select('email name') : null
    };

    // Delete the log
    await AuditLog.findByIdAndDelete(logId);

    // Create audit log for successful deletion
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Deleted Audit Log",
      target: logId,
      details: {
        deletedLog: logInfo,
        deletedBy: req.user.email,
        deletedByRole: req.user.role
      },
      severity: 'high',
      ip: req.ip,
      device: req.headers['user-agent']
    });

    console.log(`✅ Audit log ${logId} deleted successfully by admin ${req.user.email}`);

    res.status(200).json({ 
      success: true, 
      message: 'Audit log deleted successfully',
      deletedLog: logInfo
    });
  } catch (error) {
    console.error('Delete audit log error:', error);
    
    // Create audit log for failed deletion
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to Delete Audit Log",
      target: req.params.id,
      details: { error: error.message, logId: req.params.id },
      status: 'failed',
      severity: 'high',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message
    });
  }
};

// ==================== CLEAN OLD LOGS (ADMIN ONLY) ====================
exports.cleanOldLogs = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const { days = 30 } = req.body;
    
    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        message: 'Days must be between 1 and 365'
      });
    }

    console.log(`🧹 Admin cleaning logs older than ${days} days`);

    // Get count before deletion
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const countBefore = await AuditLog.countDocuments({ 
      createdAt: { $lt: cutoffDate } 
    });

    if (countBefore === 0) {
      return res.status(200).json({
        success: true,
        message: 'No old logs found to delete',
        deletedCount: 0
      });
    }

    // Get sample of logs that will be deleted (for audit)
    const sampleLogs = await AuditLog.find({ 
      createdAt: { $lt: cutoffDate } 
    })
    .limit(5)
    .select('action userRole createdAt');

    // Delete old logs
    const result = await AuditLog.deleteMany({ 
      createdAt: { $lt: cutoffDate } 
    });

    // Create audit log for cleanup
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Cleaned Old Audit Logs",
      details: {
        daysOld: days,
        deletedCount: result.deletedCount,
        cutoffDate: cutoffDate,
        sampleDeletedLogs: sampleLogs
      },
      severity: 'high',
      ip: req.ip,
      device: req.headers['user-agent']
    });

    console.log(`✅ Deleted ${result.deletedCount} logs older than ${days} days`);

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} logs older than ${days} days`,
      deletedCount: result.deletedCount,
      cutoffDate: cutoffDate,
      sampleDeleted: sampleLogs
    });
  } catch (error) {
    console.error('Clean old logs error:', error);
    
    // Create audit log for failed cleanup
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to Clean Old Audit Logs",
      details: { error: error.message, days: req.body.days },
      status: 'failed',
      severity: 'high',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to clean old logs',
      error: error.message
    });
  }
};
// ==================== GET ADMIN OWN LOGS ====================
exports.getAdminAuditLogs = async (req, res) => {
  try {
    console.log('👑 Admin fetching own audit logs');
    
    // Check if user is admin
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superAdmin';
    if (!isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get admin's own logs
    const logs = await AuditLog.find({ userId: req.user._id })
      .populate('userId', 'firstName lastName email role department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments({ userId: req.user._id });

    console.log(`📊 Found ${logs.length} logs for admin ${req.user.email}`);

    // Create audit log for this action
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Admin Viewed Own Audit Logs",
      details: {
        page,
        limit,
        results: logs.length,
        total
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });

    res.status(200).json({
      success: true,
      message: `Found ${logs.length} audit logs`,
      user: {
        _id: req.user._id,
        name: `${req.user.firstName} ${req.user.lastName}`,
        email: req.user.email,
        role: req.user.role
      },
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting admin audit logs:', error);
    
    // Create audit log for failed action
    await createAuditLog({
      userId: req.user._id,
      userRole: req.user.role,
      action: "Failed to View Admin Audit Logs",
      details: { error: error.message },
      status: 'failed',
      severity: 'medium',
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
}; 