const AuditLog = require('../models/AuditModel');
const mongoose = require('mongoose');
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
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Filter options
    let filter = {};
    
    if (req.query.userId) {
      filter.userId = req.query.userId;
    }
    
    if (req.query.action) {
      filter.action = { $regex: req.query.action, $options: 'i' };
    }
    
    if (req.query.startDate && req.query.endDate) {
      filter.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // Get logs with user info
    const logs = await AuditLog.find(filter)
      .populate('userId', 'firstName lastName email role department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// ==================== GET SINGLE AUDIT LOG (ADMIN ONLY) ====================
// controllers/auditController.js
// Get audit logs by user ID
exports.getAuditLogsByUserId = async (req, res) => {
  try {
    console.log('🔍 Searching logs for user ID:', req.params.userId);
    
    // Check if user is admin OR requesting own logs
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only view your own logs.' 
      });
    }

    // Check if user ID is valid
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid user ID format' 
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Find logs by user ID
    const logs = await AuditLog.find({ userId: req.params.userId })
      .populate('userId', 'firstName lastName email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments({ userId: req.params.userId });

    console.log(`📄 Found ${logs.length} logs for user ${req.params.userId}`);

    res.status(200).json({
      success: true,
      message: `Found ${logs.length} logs for user`,
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
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};



// ==================== DELETE AUDIT LOG (ADMIN ONLY) ====================
exports.deleteAuditLog = async (req, res) => {
  try {
    const log = await AuditLog.findByIdAndDelete(req.params.id);

    if (!log) {
      return res.status(404).json({ 
        success: false, 
        message: 'Log not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Audit log deleted' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// ==================== SEARCH AUDIT LOGS (ADMIN ONLY) ====================
exports.searchAuditLogs = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query is required' 
      });
    }

    const logs = await AuditLog.find({
      $or: [
        { action: { $regex: query, $options: 'i' } },
        { details: { $regex: query, $options: 'i' } },
        { device: { $regex: query, $options: 'i' } },
        { ip: { $regex: query, $options: 'i' } }
      ]
    })
    .populate('userId', 'firstName lastName email role')
    .sort({ createdAt: -1 })
    .limit(100);

    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length
    });
  } catch (error) {
    console.error('Error searching audit logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// ==================== GET AUDIT STATS (ADMIN ONLY) ====================
exports.getAuditStats = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    // Total logs
    const totalLogs = await AuditLog.countDocuments();
    
    // Today's logs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysLogs = await AuditLog.countDocuments({
      createdAt: { $gte: today }
    });
    
    // Most frequent actions
    const topActions = await AuditLog.aggregate([
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    // Logs by user
    const topUsers = await AuditLog.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalLogs,
        todaysLogs,
        topActions,
        topUsers
      }
    });
  } catch (error) {
    console.error('Error getting audit stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// ==================== GET MY AUDIT LOGS (USER'S OWN LOGS) ==================== 
exports.getMyAuditLogs = async (req, res) => {
  try {
    // Support both req.user._id and req.user.id
    const userId = req.user._id || req.user.id|| req.user.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in request'
      });
    }

    console.log(`🔍 Fetching audit logs for user: ${userId}`);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Try to find logs with this userId
    const logs = await AuditLog.find({ userId: userId })
      .populate('userId', 'firstName lastName email') // Optional: populate user info
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments({ userId: userId });

    // If no logs found, check database connection
    if (logs.length === 0) {
      // Check if database has any logs at all
      const dbCheck = await AuditLog.findOne({});
      
      return res.status(200).json({
        success: true,
        message: 'No audit logs found for your account',
        suggestion: dbCheck 
          ? 'Your account has not performed any logged actions yet' 
          : 'No audit logs exist in the database. Perform some actions first.',
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      });
    }

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
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};