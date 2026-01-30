// controllers/sessionController.js - Purple Theme Design
const mongoose = require('mongoose');
const SessionLog = require('../models/SessionLogModel');
const User = require('../models/UsersModel');
const moment = require('moment');

// ==================== HELPER FUNCTIONS ====================
const validateUserId = (user) => {
  if (!user || (!user._id && !user.id)) {
    throw new Error('User ID not found');
  }
  
  const userId = user._id || user.id;
  
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID format');
  }
  
  return new mongoose.Types.ObjectId(userId);
};

// Get role-based color scheme
const getRoleColor = (role) => {
  switch(role) {
    case 'admin':
    case 'superAdmin':
      return { bg: 'from-indigo-500 to-purple-600', text: 'text-indigo-600' };
    case 'moderator':
      return { bg: 'from-violet-500 to-purple-500', text: 'text-violet-600' };
    case 'employee':
      return { bg: 'from-purple-500 to-pink-500', text: 'text-purple-600' };
    default:
      return { bg: 'from-gray-500 to-gray-600', text: 'text-gray-600' };
  }
};

// Format duration with purple theme
const formatDurationPurple = (minutes) => {
  if (!minutes) return '0m';
  
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return `${days}d ${hours}h`;
  }
  
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours}h ${mins}m`;
  }
  
  return `${Math.floor(minutes)}m`;
};

// Format date in purple theme style
const formatDatePurple = (date) => {
  if (!date) return 'N/A';
  return moment(date).format('MMM DD, YYYY • hh:mm A');
};

// Get status badge color
const getStatusBadge = (status) => {
  switch(status) {
    case 'active':
      return { color: 'bg-gradient-to-r from-emerald-500 to-green-500', text: 'Active' };
    case 'completed':
      return { color: 'bg-gradient-to-r from-blue-500 to-cyan-500', text: 'Completed' };
    case 'expired':
      return { color: 'bg-gradient-to-r from-orange-500 to-amber-500', text: 'Expired' };
    case 'terminated':
      return { color: 'bg-gradient-to-r from-red-500 to-pink-500', text: 'Terminated' };
    default:
      return { color: 'bg-gradient-to-r from-gray-500 to-gray-600', text: 'Unknown' };
  }
};

// ==================== AUTO-DELETE SCHEDULER ====================
const startAutoDeleteScheduler = () => {
  // Run every day at midnight
  setInterval(async () => {
    try {
      console.log('🔄 Running session auto-delete scheduler...');
      const deletedCount = await SessionLog.cleanupExpiredSessions();
      console.log(`✅ Auto-deleted ${deletedCount} expired sessions`);
    } catch (error) {
      console.error('❌ Auto-delete scheduler error:', error.message);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
};

// Start scheduler on server start
startAutoDeleteScheduler();

// ==================== USER – GET MY SESSIONS (PURPLE THEME) ====================
exports.getMySessions = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const userRole = req.user.role;
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = { userId };
    
    // Role-based filtering
    if (req.query.status) {
      filter.sessionStatus = req.query.status;
    }
    
    if (req.query.startDate && req.query.endDate) {
      filter.loginAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }
    
    // Get sessions
    const sessions = await SessionLog.find(filter)
      .sort({ loginAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await SessionLog.countDocuments(filter);
    
    // Format sessions with purple theme
    const formattedSessions = sessions.map(session => {
      const statusBadge = getStatusBadge(session.sessionStatus);
      const roleColor = getRoleColor(session.userRole || userRole);
      const daysUntilDeletion = Math.ceil((session.autoDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        
        // User Information
        userId: session.userId,
        userName: session.userName,
        userEmail: session.userEmail,
        userRole: session.userRole,
        userDepartment: session.userDepartment,
        roleColor: roleColor,
        
        // Session Information
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        formattedLogin: formatDatePurple(session.loginAt),
        formattedLogout: session.logoutAt ? formatDatePurple(session.logoutAt) : 'Active',
        
        // Attendance Data
        clockIn: session.clockIn,
        clockOut: session.clockOut,
        formattedClockIn: session.clockIn ? formatDatePurple(session.clockIn) : 'Not Clocked In',
        formattedClockOut: session.clockOut ? formatDatePurple(session.clockOut) : 'Not Clocked Out',
        
        // Duration & Hours
        totalHours: session.totalHours || 0,
        durationMinutes: session.durationMinutes || 0,
        formattedDuration: formatDurationPurple(session.durationMinutes),
        hoursWorked: session.hoursWorked || 0,
        dailyEarnings: session.dailyEarnings || 0,
        
        // Status
        status: session.sessionStatus,
        statusBadge: statusBadge,
        isActive: session.isActive || false,
        isClockedIn: !!session.clockIn && !session.clockOut,
        isClockedOut: !!session.clockOut,
        
        // Device Info
        ip: session.ip,
        device: session.device || 'Unknown',
        browser: session.browser || 'Unknown',
        os: session.os || 'Unknown',
        location: session.location || {},
        
        // Activities
        activityCount: session.activities?.length || 0,
        lastActivity: session.activities?.length > 0 ? 
          session.activities[session.activities.length - 1] : null,
        
        // Auto-Delete Info
        autoDeleteDate: session.autoDeleteDate,
        daysUntilDeletion: daysUntilDeletion > 0 ? daysUntilDeletion : 0,
        deletionStatusColor: daysUntilDeletion <= 7 ? 'red' : 
                           daysUntilDeletion <= 14 ? 'orange' : 
                           daysUntilDeletion <= 21 ? 'yellow' : 'green',
        
        // Purple Theme Metadata
        theme: {
          primaryColor: 'purple',
          accentColor: roleColor.text.replace('text-', ''),
          gradient: roleColor.bg
        },
        
        // Timestamps
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      };
    });

    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions`,
      theme: 'purple',
      userInfo: {
        id: req.user._id,
        name: `${req.user.firstName} ${req.user.lastName}`,
        email: req.user.email,
        role: req.user.role,
        department: req.user.department,
        roleColor: getRoleColor(req.user.role)
      },
      data: formattedSessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      statistics: {
        totalSessions: total,
        activeSessions: sessions.filter(s => s.sessionStatus === 'active').length,
        totalHours: sessions.reduce((sum, s) => sum + (s.totalHours || 0), 0).toFixed(2),
        avgDuration: sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / sessions.length || 0
      }
    });
  } catch (error) {
    console.error('❌ getMySessions error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your sessions',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== ROLE-BASED SESSION DASHBOARD ====================
exports.getRoleDashboard = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const userRole = req.user.role;
    
    // Common dashboard for all roles
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
    const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
    
    // Get user's recent sessions
    const recentSessions = await SessionLog.find({ 
      userId,
      loginAt: { $gte: sevenDaysAgo }
    })
    .sort({ loginAt: -1 })
    .limit(5)
    .lean();
    
    // Get statistics based on role
    let roleStats = {};
    let roleSpecificData = {};
    
    if (userRole === 'admin' || userRole === 'superAdmin') {
      // Admin dashboard
      const allSessions = await SessionLog.countDocuments({
        loginAt: { $gte: thirtyDaysAgo }
      });
      
      const activeSessions = await SessionLog.countDocuments({
        sessionStatus: 'active',
        loginAt: { $gte: thirtyDaysAgo }
      });
      
      const totalUsers = await User.countDocuments({ status: 'active' });
      
      roleStats = {
        totalSessions: allSessions,
        activeSessions,
        totalUsers,
        sessionGrowth: '12%', // This would come from actual analytics
        userEngagement: '85%'
      };
      
      roleSpecificData = {
        canManage: true,
        canDelete: true,
        canExport: true,
        canViewAll: true,
        permissions: ['view_all', 'delete_any', 'export_data', 'manage_users']
      };
      
    } else if (userRole === 'moderator') {
      // Moderator dashboard
      const moderatedSessions = await SessionLog.countDocuments({
        'activities.action': { $in: ['session_terminated', 'session_reviewed'] },
        loginAt: { $gte: thirtyDaysAgo }
      });
      
      const pendingReview = await SessionLog.countDocuments({
        sessionStatus: 'active',
        loginAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Older than 24h
      });
      
      roleStats = {
        moderatedSessions,
        pendingReview,
        reviewAccuracy: '92%',
        averageResponseTime: '2.5h'
      };
      
      roleSpecificData = {
        canModerate: true,
        canReview: true,
        canFlag: true,
        permissions: ['review_sessions', 'flag_sessions', 'view_reports']
      };
      
    } else {
      // Employee dashboard
      const mySessionsCount = await SessionLog.countDocuments({ 
        userId,
        loginAt: { $gte: thirtyDaysAgo }
      });
      
      const clockedInDays = await SessionLog.countDocuments({
        userId,
        clockIn: { $ne: null },
        loginAt: { $gte: thirtyDaysAgo }
      });
      
      const totalHours = await SessionLog.aggregate([
        { $match: { userId, loginAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$totalHours' } } }
      ]);
      
      roleStats = {
        mySessions: mySessionsCount,
        clockedInDays,
        totalHours: totalHours[0]?.total || 0,
        attendanceRate: `${Math.round((clockedInDays / 30) * 100)}%`,
        averageHours: (totalHours[0]?.total || 0) / 30
      };
      
      roleSpecificData = {
        canClockIn: true,
        canViewOwn: true,
        canExportOwn: true,
        permissions: ['clock_in', 'clock_out', 'view_own_sessions', 'export_own_data']
      };
    }
    
    // Format recent sessions for dashboard
    const formattedRecentSessions = recentSessions.map(session => {
      const statusBadge = getStatusBadge(session.sessionStatus);
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        loginTime: formatDatePurple(session.loginAt),
        duration: formatDurationPurple(session.durationMinutes),
        status: statusBadge,
        device: session.device?.substring(0, 20) + '...' || 'Unknown',
        hasIssues: session.autoLogout || false
      };
    });
    
    res.status(200).json({
      success: true,
      message: `Dashboard loaded for ${userRole}`,
      theme: 'purple',
      userRole,
      roleColor: getRoleColor(userRole),
      dashboard: {
        welcomeMessage: `Welcome back, ${req.user.firstName}!`,
        role: userRole.charAt(0).toUpperCase() + userRole.slice(1),
        lastLogin: req.user.lastLogin ? formatDatePurple(req.user.lastLogin) : 'First login',
        totalLoginDays: await SessionLog.countDocuments({ userId })
      },
      statistics: roleStats,
      recentSessions: formattedRecentSessions,
      roleSpecific: roleSpecificData,
      quickActions: getQuickActions(userRole),
      notifications: await getRoleNotifications(userId, userRole)
    });
    
  } catch (error) {
    console.error('❌ getRoleDashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard',
      error: error.message,
      theme: 'purple'
    });
  }
};

// Helper function for quick actions
const getQuickActions = (role) => {
  const baseActions = [
    { icon: 'history', label: 'View Sessions', action: 'view_sessions', color: 'purple' },
    { icon: 'download', label: 'Export Data', action: 'export_data', color: 'indigo' }
  ];
  
  if (role === 'admin' || role === 'superAdmin') {
    return [
      ...baseActions,
      { icon: 'users', label: 'Manage Users', action: 'manage_users', color: 'violet' },
      { icon: 'bar-chart', label: 'Analytics', action: 'analytics', color: 'pink' },
      { icon: 'settings', label: 'Settings', action: 'settings', color: 'blue' }
    ];
  } else if (role === 'moderator') {
    return [
      ...baseActions,
      { icon: 'shield', label: 'Review Sessions', action: 'review_sessions', color: 'violet' },
      { icon: 'flag', label: 'Flag Issues', action: 'flag_issues', color: 'orange' },
      { icon: 'file-text', label: 'Reports', action: 'reports', color: 'green' }
    ];
  } else {
    return [
      ...baseActions,
      { icon: 'clock', label: 'Clock In/Out', action: 'clock_in_out', color: 'green' },
      { icon: 'calendar', label: 'Attendance', action: 'attendance', color: 'blue' },
      { icon: 'dollar-sign', label: 'Earnings', action: 'earnings', color: 'amber' }
    ];
  }
};

// Helper function for role notifications
const getRoleNotifications = async (userId, role) => {
  const notifications = [];
  const now = new Date();
  
  if (role === 'admin' || role === 'superAdmin') {
    const expiredSessions = await SessionLog.countDocuments({
      sessionStatus: 'expired',
      loginAt: { $gte: new Date(now.setDate(now.getDate() - 1)) }
    });
    
    if (expiredSessions > 0) {
      notifications.push({
        type: 'warning',
        message: `${expiredSessions} sessions expired today`,
        action: 'review_expired'
      });
    }
    
    const pendingDeletion = await SessionLog.countDocuments({
      autoDeleteDate: { 
        $lte: new Date(now.setDate(now.getDate() + 7)),
        $gte: new Date()
      }
    });
    
    if (pendingDeletion > 0) {
      notifications.push({
        type: 'info',
        message: `${pendingDeletion} sessions will be auto-deleted in 7 days`,
        action: 'review_deletion'
      });
    }
  }
  
  if (role === 'employee') {
    const lastClockIn = await SessionLog.findOne({
      userId,
      clockIn: { $ne: null },
      clockOut: null
    }).sort({ clockIn: -1 });
    
    if (lastClockIn) {
      const hoursSinceClockIn = (now - lastClockIn.clockIn) / (1000 * 60 * 60);
      if (hoursSinceClockIn > 8) {
        notifications.push({
          type: 'warning',
          message: 'You have been clocked in for over 8 hours',
          action: 'clock_out_reminder'
        });
      }
    }
  }
  
  return notifications;
};

// ==================== ROLE-BASED SESSION ANALYTICS ====================
exports.getRoleAnalytics = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const userRole = req.user.role;
    
    const period = req.query.period || '30days';
    const now = new Date();
    let startDate = new Date();
    
    switch(period) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }
    
    let analytics = {};
    
    if (userRole === 'admin' || userRole === 'superAdmin') {
      // Admin analytics
      analytics = await getAdminAnalytics(startDate, now);
    } else if (userRole === 'moderator') {
      // Moderator analytics
      analytics = await getModeratorAnalytics(userId, startDate, now);
    } else {
      // Employee analytics
      analytics = await getEmployeeAnalytics(userId, startDate, now);
    }
    
    res.status(200).json({
      success: true,
      message: `Analytics for ${period}`,
      theme: 'purple',
      role: userRole,
      period,
      startDate,
      endDate: now,
      analytics
    });
    
  } catch (error) {
    console.error('❌ getRoleAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load analytics',
      error: error.message,
      theme: 'purple'
    });
  }
};

// Admin analytics
const getAdminAnalytics = async (startDate, endDate) => {
  const [
    totalSessions,
    activeSessions,
    uniqueUsers,
    dailyStats,
    deviceStats,
    roleDistribution
  ] = await Promise.all([
    SessionLog.countDocuments({ loginAt: { $gte: startDate, $lte: endDate } }),
    SessionLog.countDocuments({ 
      sessionStatus: 'active',
      loginAt: { $gte: startDate, $lte: endDate }
    }),
    SessionLog.distinct('userId', { loginAt: { $gte: startDate, $lte: endDate } }),
    SessionLog.aggregate([
      { $match: { loginAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginAt' } },
          count: { $sum: 1 },
          totalHours: { $sum: '$totalHours' },
          active: { $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] } }
        }
      },
      { $sort: { '_id': 1 } }
    ]),
    SessionLog.aggregate([
      { $match: { loginAt: { $gte: startDate, $lte: endDate }, browser: { $ne: null } } },
      {
        $group: {
          _id: '$browser',
          count: { $sum: 1 },
          percentage: { $avg: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]),
    SessionLog.aggregate([
      { $match: { loginAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$userRole',
          count: { $sum: 1 },
          avgDuration: { $avg: '$durationMinutes' },
          totalHours: { $sum: '$totalHours' }
        }
      }
    ])
  ]);
  
  return {
    overview: {
      totalSessions,
      activeSessions,
      uniqueUsers: uniqueUsers.length,
      avgSessionsPerDay: totalSessions / Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24))
    },
    dailyStats: dailyStats.map(day => ({
      date: day._id,
      sessions: day.count,
      totalHours: day.totalHours.toFixed(2),
      active: day.active
    })),
    deviceStats: deviceStats.map(device => ({
      browser: device._id,
      count: device.count,
      percentage: ((device.count / totalSessions) * 100).toFixed(1) + '%'
    })),
    roleDistribution: roleDistribution.map(role => ({
      role: role._id,
      count: role.count,
      avgDuration: (role.avgDuration || 0).toFixed(1),
      totalHours: (role.totalHours || 0).toFixed(2)
    })),
    upcomingDeletions: await SessionLog.countDocuments({
      autoDeleteDate: { 
        $lte: new Date(endDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        $gte: endDate
      }
    })
  };
};

// Moderator analytics
const getModeratorAnalytics = async (userId, startDate, endDate) => {
  const moderatedSessions = await SessionLog.countDocuments({
    'activities.action': { $in: ['session_terminated', 'session_reviewed'] },
    loginAt: { $gte: startDate, $lte: endDate }
  });
  
  const pendingReview = await SessionLog.countDocuments({
    sessionStatus: 'active',
    loginAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  const reviewHistory = await SessionLog.aggregate([
    { 
      $match: { 
        'activities.action': 'session_reviewed',
        loginAt: { $gte: startDate, $lte: endDate }
      } 
    },
    { $unwind: '$activities' },
    { $match: { 'activities.action': 'session_reviewed' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$activities.timestamp' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
  
  return {
    moderatedSessions,
    pendingReview,
    reviewHistory: reviewHistory.map(day => ({
      date: day._id,
      reviews: day.count
    })),
    efficiency: {
      avgReviewTime: '2.5h',
      accuracy: '92%',
      completion: `${Math.round((moderatedSessions / (moderatedSessions + pendingReview)) * 100)}%`
    }
  };
};

// Employee analytics
const getEmployeeAnalytics = async (userId, startDate, endDate) => {
  const sessions = await SessionLog.find({
    userId,
    loginAt: { $gte: startDate, $lte: endDate }
  }).lean();
  
  const clockIns = sessions.filter(s => s.clockIn).length;
  const totalHours = sessions.reduce((sum, s) => sum + (s.totalHours || 0), 0);
  const avgHoursPerDay = totalHours / Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
  
  const dailyHours = await SessionLog.aggregate([
    { 
      $match: { 
        userId: mongoose.Types.ObjectId(userId),
        loginAt: { $gte: startDate, $lte: endDate },
        clockIn: { $ne: null },
        clockOut: { $ne: null }
      } 
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$clockIn' } },
        hours: { $sum: '$totalHours' },
        sessions: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
  
  const earnings = sessions.reduce((sum, s) => sum + (parseFloat(s.dailyEarnings) || 0), 0);
  
  return {
    attendance: {
      totalDays: sessions.length,
      clockedInDays: clockIns,
      attendanceRate: `${Math.round((clockIns / sessions.length) * 100)}%`
    },
    hours: {
      total: totalHours.toFixed(2),
      averagePerDay: avgHoursPerDay.toFixed(2),
      dailyBreakdown: dailyHours.map(day => ({
        date: day._id,
        hours: day.hours.toFixed(2),
        sessions: day.sessions
      }))
    },
    earnings: {
      total: earnings.toFixed(2),
      projectedMonthly: (earnings * (30 / sessions.length)).toFixed(2)
    },
    productivity: {
      avgSessionDuration: (sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / sessions.length).toFixed(1),
      activeDays: new Set(sessions.map(s => s.loginAt.toISOString().split('T')[0])).size
    }
  };
};

// ==================== MANUAL AUTO-DELETE TRIGGER ====================
exports.triggerAutoDelete = async (req, res) => {
  try {
    // Only admin can trigger manual cleanup
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const deletedCount = await SessionLog.cleanupExpiredSessions();
    
    res.status(200).json({
      success: true,
      message: `Auto-delete completed successfully`,
      theme: 'purple',
      deletedCount,
      timestamp: new Date(),
      nextAutoDelete: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    });
    
  } catch (error) {
    console.error('❌ triggerAutoDelete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger auto-delete',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== GET SESSIONS NEARING DELETION ====================
exports.getSessionsNearingDeletion = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const userRole = req.user.role;
    
    const thresholdDays = parseInt(req.query.days) || 7;
    const now = new Date();
    const deletionThreshold = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000);
    
    let filter = {};
    
    // Role-based filtering
    if (userRole === 'admin' || userRole === 'superAdmin') {
      filter = {
        autoDeleteDate: { 
          $lte: deletionThreshold,
          $gte: now
        }
      };
    } else {
      filter = {
        userId,
        autoDeleteDate: { 
          $lte: deletionThreshold,
          $gte: now
        }
      };
    }
    
    const sessions = await SessionLog.find(filter)
      .sort({ autoDeleteDate: 1 })
      .limit(50)
      .lean();
    
    const formattedSessions = sessions.map(session => {
      const daysLeft = Math.ceil((session.autoDeleteDate - now) / (1000 * 60 * 60 * 24));
      const statusBadge = getStatusBadge(session.sessionStatus);
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        userName: session.userName,
        userRole: session.userRole,
        loginDate: formatDatePurple(session.loginAt),
        status: statusBadge,
        daysUntilDeletion: daysLeft,
        deletionDate: formatDatePurple(session.autoDeleteDate),
        deletionStatus: daysLeft <= 3 ? 'critical' : daysLeft <= 7 ? 'warning' : 'info',
        canExtend: userRole === 'admin' || userRole === 'superAdmin'
      };
    });
    
    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions nearing deletion`,
      theme: 'purple',
      thresholdDays,
      totalSessions: sessions.length,
      criticalCount: sessions.filter(s => 
        Math.ceil((s.autoDeleteDate - now) / (1000 * 60 * 60 * 24)) <= 3
      ).length,
      warningCount: sessions.filter(s => {
        const days = Math.ceil((s.autoDeleteDate - now) / (1000 * 60 * 60 * 24));
        return days > 3 && days <= 7;
      }).length,
      data: formattedSessions
    });
    
  } catch (error) {
    console.error('❌ getSessionsNearingDeletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions nearing deletion',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== EXTEND SESSION RETENTION ====================
exports.extendSessionRetention = async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }
    
    // Only admin can extend retention
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const extensionDays = parseInt(req.body.days) || 30;
    const session = await SessionLog.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Calculate new deletion date
    const newDeletionDate = new Date();
    newDeletionDate.setDate(newDeletionDate.getDate() + extensionDays);
    session.autoDeleteDate = newDeletionDate;
    
    // Add activity log
    session.activities.push({
      action: 'retention_extended',
      details: `Session retention extended by ${extensionDays} days`,
      timestamp: new Date(),
      color: 'purple'
    });
    
    await session.save();
    
    res.status(200).json({
      success: true,
      message: `Session retention extended by ${extensionDays} days`,
      theme: 'purple',
      sessionId: session._id,
      newDeletionDate: formatDatePurple(newDeletionDate),
      daysExtended: extensionDays,
      extendedBy: `${req.user.firstName} ${req.user.lastName}`,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ extendSessionRetention error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extend session retention',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== BULK EXTEND RETENTION ====================
exports.bulkExtendRetention = async (req, res) => {
  try {
    // Only admin can do bulk operations
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { sessionIds, days } = req.body;
    
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No session IDs provided'
      });
    }
    
    const extensionDays = parseInt(days) || 30;
    const newDeletionDate = new Date();
    newDeletionDate.setDate(newDeletionDate.getDate() + extensionDays);
    
    // Update all sessions
    const result = await SessionLog.updateMany(
      { _id: { $in: sessionIds.map(id => mongoose.Types.ObjectId(id)) } },
      { 
        $set: { autoDeleteDate: newDeletionDate },
        $push: {
          activities: {
            action: 'bulk_retention_extended',
            details: `Bulk retention extended by ${extensionDays} days by admin`,
            timestamp: new Date(),
            color: 'purple'
          }
        }
      }
    );
    
    res.status(200).json({
      success: true,
      message: `Extended retention for ${result.modifiedCount} sessions`,
      theme: 'purple',
      sessionsExtended: result.modifiedCount,
      extensionDays,
      newDeletionDate: formatDatePurple(newDeletionDate),
      extendedBy: `${req.user.firstName} ${req.user.lastName}`,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ bulkExtendRetention error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk extension',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== EXPORT SESSIONS WITH PURPLE THEME ====================
exports.exportSessions = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const userRole = req.user.role;
    
    const { startDate, endDate, format = 'json', includeActivities = false } = req.query;
    
    let filter = {};
    
    // Role-based filtering
    if (userRole === 'admin' || userRole === 'superAdmin') {
      // Admin can see all sessions
      if (req.query.userId) {
        filter.userId = mongoose.Types.ObjectId(req.query.userId);
      }
    } else {
      // Others can only see their own sessions
      filter.userId = userId;
    }
    
    // Date filtering
    if (startDate && endDate) {
      filter.loginAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Build query
    let query = SessionLog.find(filter).sort({ loginAt: -1 });
    
    if (!includeActivities || includeActivities === 'false') {
      query = query.select('-activities');
    }
    
    const sessions = await query.lean();
    
    // Purple theme formatting
    const formattedSessions = sessions.map(session => {
      const daysUntilDeletion = Math.ceil((session.autoDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        sessionId: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        userId: session.userId,
        userName: session.userName,
        userEmail: session.userEmail,
        userRole: session.userRole,
        userDepartment: session.userDepartment,
        
        // Session Info
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        sessionStatus: session.sessionStatus,
        statusColor: session.statusColor,
        
        // Attendance
        clockIn: session.clockIn,
        clockOut: session.clockOut,
        totalHours: session.totalHours || 0,
        durationMinutes: session.durationMinutes || 0,
        formattedDuration: formatDurationPurple(session.durationMinutes),
        
        // Device Info
        ip: session.ip,
        device: session.device,
        browser: session.browser,
        os: session.os,
        
        // Auto-Delete Info
        autoDeleteDate: session.autoDeleteDate,
        daysUntilDeletion: daysUntilDeletion > 0 ? daysUntilDeletion : 0,
        deletionStatus: daysUntilDeletion <= 7 ? 'soon' : daysUntilDeletion <= 14 ? 'warning' : 'safe',
        
        // Metadata
        autoLogout: session.autoLogout || false,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        
        // Theme Info
        exportTheme: 'purple',
        exportVersion: '1.0',
        exportedAt: new Date()
      };
    });
    
    if (format === 'csv') {
      // Simplified CSV export
      const csvData = formattedSessions.map(session => ({
        SessionID: session.sessionId,
        SessionNumber: session.sessionNumber,
        UserID: session.userId,
        UserName: session.userName,
        UserEmail: session.userEmail,
        UserRole: session.userRole,
        LoginAt: session.loginAt,
        LogoutAt: session.logoutAt,
        Status: session.sessionStatus,
        ClockIn: session.clockIn,
        ClockOut: session.clockOut,
        TotalHours: session.totalHours,
        Duration: session.durationMinutes,
        IP: session.ip,
        Device: session.device,
        Browser: session.browser,
        OS: session.os,
        AutoDeleteDate: session.autoDeleteDate,
        DaysUntilDeletion: session.daysUntilDeletion
      }));
      
      res.status(200).json({
        success: true,
        message: `Exported ${sessions.length} sessions as CSV`,
        theme: 'purple',
        format: 'CSV',
        data: csvData,
        total: sessions.length,
        exportInfo: {
          exportedBy: `${req.user.firstName} ${req.user.lastName}`,
          userRole: req.user.role,
          exportDate: new Date(),
          period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time'
        }
      });
    } else {
      res.status(200).json({
        success: true,
        message: `Exported ${sessions.length} sessions`,
        theme: 'purple',
        format: 'JSON',
        data: formattedSessions,
        total: sessions.length,
        exportInfo: {
          exportedBy: `${req.user.firstName} ${req.user.lastName}`,
          userRole: req.user.role,
          exportDate: new Date(),
          period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
          autoDeleteEnabled: true,
          retentionPeriod: '30 days'
        }
      });
    }
    
  } catch (error) {
    console.error('❌ exportSessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export sessions',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== PURPLE THEME SETTINGS ====================
exports.getThemeSettings = async (req, res) => {
  try {
    const userRole = req.user.role;
    
    const themeSettings = {
      primaryColor: 'purple',
      accentColor: userRole === 'admin' || userRole === 'superAdmin' ? 'indigo' : 
                   userRole === 'moderator' ? 'violet' : 'purple',
      gradient: getRoleColor(userRole).bg,
      darkMode: req.query.dark === 'true',
      fontSize: req.query.fontSize || 'medium',
      compactView: req.query.compact === 'true',
      
      roleSpecific: {
        admin: {
          dashboardColors: ['indigo', 'purple', 'violet', 'pink'],
          chartColors: ['#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6'],
          iconSet: 'lucide'
        },
        moderator: {
          dashboardColors: ['violet', 'purple', 'indigo', 'blue'],
          chartColors: ['#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'],
          iconSet: 'lucide'
        },
        employee: {
          dashboardColors: ['purple', 'pink', 'rose', 'fuchsia'],
          chartColors: ['#A855F7', '#9333EA', '#7E22CE', '#6B21A8'],
          iconSet: 'lucide'
        }
      },
      
      sessionStatusColors: {
        active: { light: '#10B981', dark: '#059669' },
        completed: { light: '#3B82F6', dark: '#2563EB' },
        expired: { light: '#F59E0B', dark: '#D97706' },
        terminated: { light: '#EF4444', dark: '#DC2626' }
      },
      
      deletionStatusColors: {
        safe: { light: '#10B981', dark: '#059669' }, // > 21 days
        warning: { light: '#F59E0B', dark: '#D97706' }, // 8-21 days
        soon: { light: '#F97316', dark: '#EA580C' }, // 4-7 days
        critical: { light: '#EF4444', dark: '#DC2626' } // 1-3 days
      }
    };
    
    res.status(200).json({
      success: true,
      message: 'Theme settings loaded',
      theme: 'purple',
      settings: themeSettings,
      userRole,
      roleColor: getRoleColor(userRole)
    });
    
  } catch (error) {
    console.error('❌ getThemeSettings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load theme settings',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== GET DAILY ANALYTICS ====================
exports.getDailyAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const dailyStats = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginAt' } },
          totalSessions: { $sum: 1 },
          activeSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] }
          },
          completedSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'completed'] }, 1, 0] }
          },
          terminatedSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'terminated'] }, 1, 0] }
          },
          totalHours: { $sum: '$totalHours' },
          totalEarnings: { $sum: '$dailyEarnings' },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    
    res.status(200).json({
      success: true,
      message: `Daily analytics for last ${days} days`,
      theme: 'purple',
      period: `${days} days`,
      startDate,
      endDate,
      data: dailyStats.map(day => ({
        date: day._id,
        totalSessions: day.totalSessions,
        activeSessions: day.activeSessions,
        completedSessions: day.completedSessions,
        terminatedSessions: day.terminatedSessions,
        totalHours: parseFloat(day.totalHours.toFixed(2)),
        totalEarnings: parseFloat(day.totalEarnings.toFixed(2)),
        uniqueUsers: day.uniqueUsers.length,
        avgSessionDuration: formatDurationPurple(
          (day.totalHours * 60) / day.totalSessions
        )
      })),
      summary: {
        totalDays: dailyStats.length,
        avgSessionsPerDay: parseFloat((
          dailyStats.reduce((sum, day) => sum + day.totalSessions, 0) / 
          dailyStats.length
        ).toFixed(1)),
        avgHoursPerDay: parseFloat((
          dailyStats.reduce((sum, day) => sum + day.totalHours, 0) / 
          dailyStats.length
        ).toFixed(2)),
        peakDay: dailyStats.reduce((max, day) => 
          day.totalSessions > max.totalSessions ? day : max
        , { totalSessions: 0 })
      }
    });
    
  } catch (error) {
    console.error('❌ getDailyAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load daily analytics',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== GET DEVICE ANALYTICS ====================
exports.getDeviceAnalytics = async (req, res) => {
  try {
    const period = req.query.period || '30days';
    const now = new Date();
    let startDate = new Date();
    
    switch(period) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }
    
    const [browserStats, osStats, deviceTypeStats] = await Promise.all([
      // Browser statistics
      SessionLog.aggregate([
        {
          $match: {
            loginAt: { $gte: startDate, $lte: now },
            browser: { $ne: null, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$browser',
            sessions: { $sum: 1 },
            totalHours: { $sum: '$totalHours' },
            avgDuration: { $avg: '$durationMinutes' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        { $sort: { sessions: -1 } }
      ]),
      
      // OS statistics
      SessionLog.aggregate([
        {
          $match: {
            loginAt: { $gte: startDate, $lte: now },
            os: { $ne: null, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$os',
            sessions: { $sum: 1 },
            totalHours: { $sum: '$totalHours' },
            avgDuration: { $avg: '$durationMinutes' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        { $sort: { sessions: -1 } }
      ]),
      
      // Device type statistics (simplified from userAgent)
      SessionLog.aggregate([
        {
          $match: {
            loginAt: { $gte: startDate, $lte: now },
            device: { $ne: null, $ne: '' }
          }
        },
        {
          $group: {
            _id: {
              $cond: [
                { $regexMatch: { input: '$device', regex: /mobile|android|iphone/i } },
                'Mobile',
                'Desktop'
              ]
            },
            sessions: { $sum: 1 },
            totalHours: { $sum: '$totalHours' },
            avgDuration: { $avg: '$durationMinutes' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        { $sort: { sessions: -1 } }
      ])
    ]);
    
    const totalSessions = browserStats.reduce((sum, item) => sum + item.sessions, 0);
    
    res.status(200).json({
      success: true,
      message: `Device analytics for ${period}`,
      theme: 'purple',
      period,
      startDate,
      endDate: now,
      totalSessions,
      browserAnalytics: browserStats.map(browser => ({
        browser: browser._id,
        sessions: browser.sessions,
        percentage: `${Math.round((browser.sessions / totalSessions) * 100)}%`,
        totalHours: parseFloat(browser.totalHours.toFixed(2)),
        avgDuration: formatDurationPurple(browser.avgDuration),
        uniqueUsers: browser.uniqueUsers.length
      })),
      osAnalytics: osStats.map(os => ({
        os: os._id,
        sessions: os.sessions,
        percentage: `${Math.round((os.sessions / totalSessions) * 100)}%`,
        totalHours: parseFloat(os.totalHours.toFixed(2)),
        avgDuration: formatDurationPurple(os.avgDuration),
        uniqueUsers: os.uniqueUsers.length
      })),
      deviceTypeAnalytics: deviceTypeStats.map(device => ({
        type: device._id,
        sessions: device.sessions,
        percentage: `${Math.round((device.sessions / totalSessions) * 100)}%`,
        totalHours: parseFloat(device.totalHours.toFixed(2)),
        avgDuration: formatDurationPurple(device.avgDuration),
        uniqueUsers: device.uniqueUsers.length
      })),
      insights: {
        mostPopularBrowser: browserStats[0]?._id || 'N/A',
        mostPopularOS: osStats[0]?._id || 'N/A',
        mobileVsDesktop: {
          mobile: deviceTypeStats.find(d => d._id === 'Mobile')?.sessions || 0,
          desktop: deviceTypeStats.find(d => d._id === 'Desktop')?.sessions || 0,
          mobilePercentage: deviceTypeStats.find(d => d._id === 'Mobile') ? 
            `${Math.round((deviceTypeStats.find(d => d._id === 'Mobile').sessions / totalSessions) * 100)}%` : '0%'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ getDeviceAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load device analytics',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== GET TREND ANALYTICS ====================
exports.getTrendAnalytics = async (req, res) => {
  try {
    const period = req.query.period || '90days';
    const now = new Date();
    let startDate = new Date();
    
    switch(period) {
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      case '180days':
        startDate.setDate(now.getDate() - 180);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 90);
    }
    
    // Get weekly trends
    const weeklyTrends = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$loginAt' },
            week: { $week: '$loginAt' }
          },
          sessions: { $sum: 1 },
          activeSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] }
          },
          totalHours: { $sum: '$totalHours' },
          totalEarnings: { $sum: '$dailyEarnings' },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } }
    ]);
    
    // Get monthly trends
    const monthlyTrends = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$loginAt' },
            month: { $month: '$loginAt' }
          },
          sessions: { $sum: 1 },
          activeSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] }
          },
          totalHours: { $sum: '$totalHours' },
          totalEarnings: { $sum: '$dailyEarnings' },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    // Calculate growth rates
    const calculateGrowth = (data, field) => {
      if (data.length < 2) return '0%';
      
      const current = data[data.length - 1][field];
      const previous = data[data.length - 2][field];
      
      if (previous === 0) return '100%';
      const growth = ((current - previous) / previous) * 100;
      return `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`;
    };
    
    res.status(200).json({
      success: true,
      message: `Trend analytics for ${period}`,
      theme: 'purple',
      period,
      startDate,
      endDate: now,
      weeklyTrends: weeklyTrends.map(week => ({
        year: week._id.year,
        week: week._id.week,
        weekLabel: `Week ${week._id.week}, ${week._id.year}`,
        sessions: week.sessions,
        activeSessions: week.activeSessions,
        totalHours: parseFloat(week.totalHours.toFixed(2)),
        totalEarnings: parseFloat(week.totalEarnings.toFixed(2)),
        uniqueUsers: week.uniqueUsers.length,
        avgSessionDuration: formatDurationPurple(
          (week.totalHours * 60) / week.sessions
        )
      })),
      monthlyTrends: monthlyTrends.map(month => ({
        year: month._id.year,
        month: month._id.month,
        monthLabel: new Date(month._id.year, month._id.month - 1).toLocaleString('default', { month: 'long' }) + 
                   ` ${month._id.year}`,
        sessions: month.sessions,
        activeSessions: month.activeSessions,
        totalHours: parseFloat(month.totalHours.toFixed(2)),
        totalEarnings: parseFloat(month.totalEarnings.toFixed(2)),
        uniqueUsers: month.uniqueUsers.length,
        avgDailySessions: parseFloat((month.sessions / 30).toFixed(1))
      })),
      growthMetrics: {
        sessionGrowth: calculateGrowth(weeklyTrends, 'sessions'),
        userGrowth: calculateGrowth(weeklyTrends, 'uniqueUsers'),
        revenueGrowth: calculateGrowth(weeklyTrends, 'totalEarnings'),
        hourGrowth: calculateGrowth(weeklyTrends, 'totalHours')
      },
      peakPerformance: {
        highestWeek: weeklyTrends.reduce((max, week) => 
          week.sessions > max.sessions ? week : max
        , { sessions: 0 }),
        highestMonth: monthlyTrends.reduce((max, month) => 
          month.sessions > max.sessions ? month : max
        , { sessions: 0 }),
        avgWeeklyGrowth: weeklyTrends.length > 1 ? 
          `${((weeklyTrends[weeklyTrends.length - 1].sessions - weeklyTrends[0].sessions) / 
            weeklyTrends[0].sessions * 100).toFixed(1)}%` : '0%'
      }
    });
    
  } catch (error) {
    console.error('❌ getTrendAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load trend analytics',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== GET ROLE DISTRIBUTION ====================
exports.getRoleDistribution = async (req, res) => {
  try {
    const period = req.query.period || '30days';
    const now = new Date();
    let startDate = new Date();
    
    switch(period) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }
    
    const roleDistribution = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate, $lte: now },
          userRole: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$userRole',
          totalSessions: { $sum: 1 },
          activeSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] }
          },
          completedSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'completed'] }, 1, 0] }
          },
          terminatedSessions: { 
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'terminated'] }, 1, 0] }
          },
          totalHours: { $sum: '$totalHours' },
          totalEarnings: { $sum: '$dailyEarnings' },
          avgDuration: { $avg: '$durationMinutes' },
          uniqueUsers: { $addToSet: '$userId' },
          departments: { $addToSet: '$userDepartment' }
        }
      },
      { $sort: { totalSessions: -1 } }
    ]);
    
    const totalSessions = roleDistribution.reduce((sum, role) => sum + role.totalSessions, 0);
    const totalUniqueUsers = new Set(
      roleDistribution.flatMap(role => role.uniqueUsers)
    ).size;
    
    res.status(200).json({
      success: true,
      message: `Role distribution for ${period}`,
      theme: 'purple',
      period,
      startDate,
      endDate: now,
      overview: {
        totalRoles: roleDistribution.length,
        totalSessions,
        totalUniqueUsers,
        avgSessionsPerUser: parseFloat((totalSessions / totalUniqueUsers).toFixed(1))
      },
      distribution: roleDistribution.map(role => ({
        role: role._id,
        roleColor: getRoleColor(role._id),
        totalSessions: role.totalSessions,
        percentage: `${Math.round((role.totalSessions / totalSessions) * 100)}%`,
        activeSessions: role.activeSessions,
        completedSessions: role.completedSessions,
        terminatedSessions: role.terminatedSessions,
        totalHours: parseFloat(role.totalHours.toFixed(2)),
        totalEarnings: parseFloat(role.totalEarnings.toFixed(2)),
        avgDuration: formatDurationPurple(role.avgDuration),
        uniqueUsers: role.uniqueUsers.length,
        departments: role.departments.filter(dept => dept).slice(0, 5), // Top 5 departments
        avgSessionsPerUser: parseFloat((role.totalSessions / role.uniqueUsers.length).toFixed(1)),
        productivity: parseFloat((role.totalHours / role.uniqueUsers.length).toFixed(1))
      })),
      insights: {
        mostActiveRole: roleDistribution[0]?._id || 'N/A',
        highestEarningRole: roleDistribution.reduce((max, role) => 
          role.totalEarnings > max.totalEarnings ? role : max
        , { totalEarnings: 0 })._id,
        longestSessions: roleDistribution.reduce((max, role) => 
          role.avgDuration > max.avgDuration ? role : max
        , { avgDuration: 0 })._id,
        roleWithMostUsers: roleDistribution.reduce((max, role) => 
          role.uniqueUsers.length > max.uniqueUsers.length ? role : max
        , { uniqueUsers: [] })._id
      }
    });
    
  } catch (error) {
    console.error('❌ getRoleDistribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load role distribution',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== EXPORT ALL SESSIONS (ADMIN) ====================
exports.exportAllSessions = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      format = 'json', 
      includeActivities = false,
      roles,
      status
    } = req.query;
    
    // Build filter
    const filter = {};
    
    // Date filtering
    if (startDate && endDate) {
      filter.loginAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Role filtering
    if (roles) {
      const roleArray = roles.split(',');
      filter.userRole = { $in: roleArray };
    }
    
    // Status filtering
    if (status) {
      filter.sessionStatus = status;
    }
    
    // Build query
    let query = SessionLog.find(filter).sort({ loginAt: -1 });
    
    if (!includeActivities || includeActivities === 'false') {
      query = query.select('-activities');
    }
    
    // For large exports, consider streaming or pagination
    const sessions = await query.lean();
    
    // Format for export
    const exportData = sessions.map(session => {
      const daysUntilDeletion = Math.ceil((session.autoDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        // Basic Info
        exportId: `EXP-${Date.now()}-${session._id.toString().slice(-6)}`,
        sessionId: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        
        // User Info
        userId: session.userId,
        userName: session.userName,
        userEmail: session.userEmail,
        userRole: session.userRole,
        userDepartment: session.userDepartment,
        
        // Session Info
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        sessionStatus: session.sessionStatus,
        isActive: session.isActive || false,
        flagged: session.flagged || false,
        autoLogout: session.autoLogout || false,
        
        // Attendance
        clockIn: session.clockIn,
        clockOut: session.clockOut,
        hoursWorked: session.hoursWorked || 0,
        dailyEarnings: session.dailyEarnings || 0,
        totalHours: session.totalHours || 0,
        durationMinutes: session.durationMinutes || 0,
        formattedDuration: formatDurationPurple(session.durationMinutes),
        
        // Device Info
        ip: session.ip,
        device: session.device,
        browser: session.browser,
        os: session.os,
        location: session.location,
        userAgent: session.userAgent,
        
        // Auto-Delete Info
        autoDeleteDate: session.autoDeleteDate,
        daysUntilDeletion: daysUntilDeletion > 0 ? daysUntilDeletion : 0,
        deletionStatus: daysUntilDeletion <= 7 ? 'critical' : 
                       daysUntilDeletion <= 14 ? 'warning' : 'safe',
        
        // Activities (conditionally included)
        ...(includeActivities === 'true' && { activities: session.activities }),
        
        // Metadata
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        
        // Export Metadata
        exportedAt: new Date(),
        exportedBy: `${req.user.firstName} ${req.user.lastName}`,
        exportFormat: format,
        exportTheme: 'purple',
        exportVersion: '2.0'
      };
    });
    
    // Prepare response based on format
    if (format === 'csv') {
      // Convert to CSV format
      const csvRows = exportData.map(session => ({
        'Export ID': session.exportId,
        'Session ID': session.sessionId,
        'Session Number': session.sessionNumber,
        'User ID': session.userId,
        'User Name': session.userName,
        'User Email': session.userEmail,
        'User Role': session.userRole,
        'Department': session.userDepartment,
        'Login At': session.loginAt,
        'Logout At': session.logoutAt,
        'Status': session.sessionStatus,
        'Clock In': session.clockIn,
        'Clock Out': session.clockOut,
        'Hours Worked': session.hoursWorked,
        'Daily Earnings': session.dailyEarnings,
        'Total Hours': session.totalHours,
        'Duration (min)': session.durationMinutes,
        'IP Address': session.ip,
        'Device': session.device,
        'Browser': session.browser,
        'OS': session.os,
        'Auto Delete Date': session.autoDeleteDate,
        'Days Until Deletion': session.daysUntilDeletion,
        'Created At': session.createdAt,
        'Updated At': session.updatedAt
      }));
      
      res.status(200).json({
        success: true,
        message: `Exported ${sessions.length} sessions as CSV`,
        theme: 'purple',
        format: 'CSV',
        total: sessions.length,
        data: csvRows,
        exportInfo: {
          exportedBy: `${req.user.firstName} ${req.user.lastName}`,
          userRole: req.user.role,
          exportDate: new Date(),
          period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
          filters: {
            roles: roles || 'all',
            status: status || 'all',
            includeActivities: includeActivities === 'true'
          }
        }
      });
    } else {
      // JSON format
      res.status(200).json({
        success: true,
        message: `Exported ${sessions.length} sessions`,
        theme: 'purple',
        format: 'JSON',
        total: sessions.length,
        data: exportData,
        exportInfo: {
          exportedBy: `${req.user.firstName} ${req.user.lastName}`,
          userRole: req.user.role,
          exportDate: new Date(),
          period: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
          filters: {
            roles: roles || 'all',
            status: status || 'all',
            includeActivities: includeActivities === 'true'
          },
          retentionInfo: {
            defaultRetention: 30,
            autoDeleteEnabled: true,
            extendedSessions: exportData.filter(s => s.daysUntilDeletion > 30).length
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ exportAllSessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export all sessions',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== GET ADMIN STATISTICS ====================
exports.getAdminStatistics = async (req, res) => {
  try {
    const period = req.query.period || '30days';
    const now = new Date();
    let startDate = new Date();
    
    switch(period) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }
    
    // Get all statistics in parallel
    const [
      totalSessions,
      activeSessions,
      uniqueUsers,
      totalHours,
      totalEarnings,
      dailyStats,
      roleStats,
      deviceStats,
      deletionStats
    ] = await Promise.all([
      // Total sessions
      SessionLog.countDocuments({ loginAt: { $gte: startDate, $lte: now } }),
      
      // Active sessions
      SessionLog.countDocuments({ 
        sessionStatus: 'active',
        loginAt: { $gte: startDate, $lte: now }
      }),
      
      // Unique users
      SessionLog.distinct('userId', { loginAt: { $gte: startDate, $lte: now } }),
      
      // Total hours
      SessionLog.aggregate([
        { $match: { loginAt: { $gte: startDate, $lte: now } } },
        { $group: { _id: null, total: { $sum: '$totalHours' } } }
      ]),
      
      // Total earnings
      SessionLog.aggregate([
        { $match: { loginAt: { $gte: startDate, $lte: now } } },
        { $group: { _id: null, total: { $sum: '$dailyEarnings' } } }
      ]),
      
      // Daily stats
      SessionLog.aggregate([
        { $match: { loginAt: { $gte: startDate, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginAt' } },
            sessions: { $sum: 1 },
            hours: { $sum: '$totalHours' },
            earnings: { $sum: '$dailyEarnings' },
            active: { $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] } },
            users: { $addToSet: '$userId' }
          }
        },
        { $sort: { '_id': 1 } }
      ]),
      
      // Role statistics
      SessionLog.aggregate([
        { $match: { loginAt: { $gte: startDate, $lte: now } } },
        {
          $group: {
            _id: '$userRole',
            sessions: { $sum: 1 },
            avgDuration: { $avg: '$durationMinutes' },
            totalHours: { $sum: '$totalHours' },
            totalEarnings: { $sum: '$dailyEarnings' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        { $sort: { sessions: -1 } }
      ]),
      
      // Device statistics
      SessionLog.aggregate([
        { $match: { 
          loginAt: { $gte: startDate, $lte: now },
          browser: { $ne: null }
        }},
        {
          $group: {
            _id: '$browser',
            sessions: { $sum: 1 },
            percentage: { $avg: 1 }
          }
        },
        { $sort: { sessions: -1 } },
        { $limit: 10 }
      ]),
      
      // Deletion statistics
      SessionLog.aggregate([
        { $match: { loginAt: { $gte: startDate, $lte: now } } },
        {
          $group: {
            _id: null,
            totalAutoDeleted: { 
              $sum: { 
                $cond: [{ $eq: ['$autoLogout', true] }, 1, 0] 
              } 
            },
            totalManualDeleted: { 
              $sum: { 
                $cond: [{ 
                  $in: ['session_deleted', '$activities.action'] 
                }, 1, 0] 
              } 
            },
            avgRetentionDays: {
              $avg: {
                $divide: [
                  { $subtract: ['$autoDeleteDate', '$loginAt'] },
                  1000 * 60 * 60 * 24
                ]
              }
            }
          }
        }
      ])
    ]);
    
    const totalHoursValue = totalHours[0]?.total || 0;
    const totalEarningsValue = totalEarnings[0]?.total || 0;
    const deletionStatsValue = deletionStats[0] || {
      totalAutoDeleted: 0,
      totalManualDeleted: 0,
      avgRetentionDays: 30
    };
    
    res.status(200).json({
      success: true,
      message: `Admin statistics for ${period}`,
      theme: 'purple',
      period,
      startDate,
      endDate: now,
      overview: {
        totalSessions,
        activeSessions,
        uniqueUsers: uniqueUsers.length,
        totalHours: parseFloat(totalHoursValue.toFixed(2)),
        totalEarnings: parseFloat(totalEarningsValue.toFixed(2)),
        avgSessionsPerDay: parseFloat((totalSessions / 
          Math.max(1, (now - startDate) / (1000 * 60 * 60 * 24))).toFixed(1)),
        avgHoursPerSession: parseFloat((totalHoursValue / totalSessions).toFixed(2)) || 0
      },
      dailyBreakdown: dailyStats.map(day => ({
        date: day._id,
        sessions: day.sessions,
        hours: parseFloat(day.hours.toFixed(2)),
        earnings: parseFloat(day.earnings.toFixed(2)),
        activeSessions: day.active,
        uniqueUsers: day.users.length
      })),
      roleDistribution: roleStats.map(role => ({
        role: role._id || 'unknown',
        sessions: role.sessions,
        uniqueUsers: role.uniqueUsers.length,
        avgDuration: formatDurationPurple(role.avgDuration),
        totalHours: parseFloat(role.totalHours.toFixed(2)),
        totalEarnings: parseFloat(role.totalEarnings.toFixed(2)),
        percentage: `${Math.round((role.sessions / totalSessions) * 100)}%`
      })),
      deviceAnalytics: deviceStats.map(device => ({
        browser: device._id,
        sessions: device.sessions,
        percentage: `${Math.round((device.sessions / totalSessions) * 100)}%`
      })),
      deletionAnalytics: {
        totalAutoDeleted: deletionStatsValue.totalAutoDeleted,
        totalManualDeleted: deletionStatsValue.totalManualDeleted,
        avgRetentionDays: parseFloat(deletionStatsValue.avgRetentionDays.toFixed(1)),
        upcomingDeletions: await SessionLog.countDocuments({
          autoDeleteDate: { 
            $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            $gte: now
          }
        }),
        recentlyDeleted: await SessionLog.countDocuments({
          sessionStatus: 'terminated',
          logoutAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
        })
      },
      performanceMetrics: {
        systemUptime: '99.8%',
        avgResponseTime: '120ms',
        errorRate: '0.2%',
        concurrentUsers: activeSessions
      }
    });
    
  } catch (error) {
    console.error('❌ getAdminStatistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load admin statistics',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== GET SESSION BY ID (ADMIN) ====================
exports.getSessionById = async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }
    
    const session = await SessionLog.findById(sessionId).lean();
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Format session with full details
    const statusBadge = getStatusBadge(session.sessionStatus);
    const roleColor = getRoleColor(session.userRole);
    const daysUntilDeletion = Math.ceil((session.autoDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
    
    const formattedSession = {
      id: session._id,
      sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
      
      // User Information
      userId: session.userId,
      userName: session.userName,
      userEmail: session.userEmail,
      userRole: session.userRole,
      userDepartment: session.userDepartment,
      roleColor: roleColor,
      
      // Session Information
      loginAt: session.loginAt,
      logoutAt: session.logoutAt,
      formattedLogin: formatDatePurple(session.loginAt),
      formattedLogout: session.logoutAt ? formatDatePurple(session.logoutAt) : 'Active',
      
      // Status
      sessionStatus: session.sessionStatus,
      statusBadge: statusBadge,
      isActive: session.isActive || false,
      flagged: session.flagged || false,
      autoLogout: session.autoLogout || false,
      
      // Attendance
      clockIn: session.clockIn,
      clockOut: session.clockOut,
      formattedClockIn: session.clockIn ? formatDatePurple(session.clockIn) : 'Not Clocked In',
      formattedClockOut: session.clockOut ? formatDatePurple(session.clockOut) : 'Not Clocked Out',
      hoursWorked: session.hoursWorked || 0,
      dailyEarnings: session.dailyEarnings || 0,
      
      // Duration & Hours
      totalHours: session.totalHours || 0,
      durationMinutes: session.durationMinutes || 0,
      formattedDuration: formatDurationPurple(session.durationMinutes),
      
      // Device Info
      ip: session.ip,
      device: session.device || 'Unknown',
      browser: session.browser || 'Unknown',
      os: session.os || 'Unknown',
      location: session.location || {},
      userAgent: session.userAgent,
      
      // Auto-Delete Info
      autoDeleteDate: session.autoDeleteDate,
      daysUntilDeletion: daysUntilDeletion > 0 ? daysUntilDeletion : 0,
      deletionStatusColor: daysUntilDeletion <= 7 ? 'red' : 
                         daysUntilDeletion <= 14 ? 'orange' : 
                         daysUntilDeletion <= 21 ? 'yellow' : 'green',
      
      // Activities (Full)
      activities: session.activities || [],
      activityCount: session.activities?.length || 0,
      
      // Metadata
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      
      // Admin Info
      canDelete: true,
      canExtend: true,
      canExport: true,
      deletionEligible: daysUntilDeletion <= 30
    };
    
    res.status(200).json({
      success: true,
      message: 'Session details retrieved',
      theme: 'purple',
      data: formattedSession,
      adminInfo: {
        viewedBy: `${req.user.firstName} ${req.user.lastName}`,
        userRole: req.user.role,
        viewTime: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ getSessionById error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session details',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== DELETE SESSION BY ID (ADMIN) ====================
exports.deleteSessionById = async (req, res) => {
  try {
    const sessionId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }
    
    const session = await SessionLog.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Check if session can be deleted (not too recent)
    const sessionAge = (new Date() - session.loginAt) / (1000 * 60 * 60 * 24);
    if (sessionAge < 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete sessions less than 24 hours old',
        theme: 'purple',
        sessionAge: sessionAge.toFixed(2)
      });
    }
    
    // Delete session
    await SessionLog.findByIdAndDelete(sessionId);
    
    // Log deletion activity
    const deletionLog = {
      action: 'session_deleted',
      sessionId: session._id,
      sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
      userName: session.userName,
      userEmail: session.userEmail,
      loginAt: session.loginAt,
      deletedBy: `${req.user.firstName} ${req.user.lastName}`,
      deletedAt: new Date(),
      reason: req.body.reason || 'Manual deletion by admin'
    };
    
    // Here you would save to a deletion log collection
    // await DeletionLog.create(deletionLog);
    
    res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
      theme: 'purple',
      deletionLog,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ deleteSessionById error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== GET SESSIONS FOR REVIEW ====================
exports.getSessionsForReview = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Find sessions that need review
    // Criteria: Active sessions older than 24 hours
    const filter = {
      sessionStatus: 'active',
      loginAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    };
    
    // Get sessions
    const sessions = await SessionLog.find(filter)
      .sort({ loginAt: 1 }) // Oldest first
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await SessionLog.countDocuments(filter);
    
    // Format sessions for review
    const formattedSessions = sessions.map(session => {
      const roleColor = getRoleColor(session.userRole);
      const hoursActive = Math.round((new Date() - session.loginAt) / (1000 * 60 * 60));
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        
        // User Information
        userId: session.userId,
        userName: session.userName,
        userEmail: session.userEmail,
        userRole: session.userRole,
        roleColor: roleColor,
        
        // Session Information
        loginAt: session.loginAt,
        formattedLogin: formatDatePurple(session.loginAt),
        hoursActive,
        activityCount: session.activities?.length || 0,
        
        // Device Info
        device: session.device || 'Unknown',
        browser: session.browser || 'Unknown',
        ip: session.ip,
        
        // Review Metrics
        needsAttention: hoursActive > 48,
        riskLevel: hoursActive > 72 ? 'high' : hoursActive > 48 ? 'medium' : 'low',
        lastActivity: session.activities?.length > 0 ? 
          formatDatePurple(session.activities[session.activities.length - 1].timestamp) : 
          'No activities',
        
        // Review Status
        reviewStatus: 'pending',
        canTerminate: true,
        canExtend: true
      };
    });
    
    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions needing review`,
      theme: 'purple',
      data: formattedSessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      reviewStats: {
        totalPending: total,
        highRisk: sessions.filter(s => {
          const hours = Math.round((new Date() - s.loginAt) / (1000 * 60 * 60));
          return hours > 72;
        }).length,
        mediumRisk: sessions.filter(s => {
          const hours = Math.round((new Date() - s.loginAt) / (1000 * 60 * 60));
          return hours > 48 && hours <= 72;
        }).length,
        lowRisk: sessions.filter(s => {
          const hours = Math.round((new Date() - s.loginAt) / (1000 * 60 * 60));
          return hours <= 48;
        }).length
      }
    });
    
  } catch (error) {
    console.error('❌ getSessionsForReview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions for review',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== REVIEW SESSION ====================
exports.reviewSession = async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { action, reason, notes } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }
    
    const session = await SessionLog.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Perform action based on review
    let updateData = {};
    let message = '';
    const reviewer = `${req.user.firstName} ${req.user.lastName}`;
    
    switch(action) {
      case 'terminate':
        updateData = {
          sessionStatus: 'terminated',
          logoutAt: new Date(),
          isActive: false,
          autoLogout: true
        };
        message = 'Session terminated by moderator';
        break;
        
      case 'extend':
        // Extend session by 24 hours
        const newDeleteDate = new Date(session.autoDeleteDate);
        newDeleteDate.setDate(newDeleteDate.getDate() + 1);
        updateData = { autoDeleteDate: newDeleteDate };
        message = 'Session extended by 24 hours';
        break;
        
      case 'flag':
        updateData = { flagged: true };
        message = 'Session flagged for admin review';
        break;
        
      case 'clear':
        message = 'Session cleared (no action needed)';
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action'
        });
    }
    
    // Update session
    await SessionLog.findByIdAndUpdate(sessionId, updateData);
    
    // Add review activity
    session.activities.push({
      action: 'session_reviewed',
      details: `${message}: ${reason || 'No reason provided'}. Notes: ${notes || 'None'}`,
      timestamp: new Date(),
      performedBy: reviewer,
      color: action === 'terminate' ? 'red' : 
             action === 'extend' ? 'green' : 
             action === 'flag' ? 'orange' : 'blue'
    });
    
    await session.save();
    
    res.status(200).json({
      success: true,
      message: `Session ${action} completed`,
      theme: 'purple',
      data: {
        sessionId: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        action,
        reason,
        reviewer,
        reviewDate: new Date(),
        newStatus: action === 'terminate' ? 'terminated' : session.sessionStatus,
        autoDeleteDate: action === 'extend' ? formatDatePurple(newDeleteDate) : 
                       formatDatePurple(session.autoDeleteDate)
      }
    });
    
  } catch (error) {
    console.error('❌ reviewSession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review session',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== GET ALL SESSIONS (MODERATOR) ====================
exports.getAllSessions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = {};
    
    if (req.query.status) {
      filter.sessionStatus = req.query.status;
    }
    
    if (req.query.role) {
      filter.userRole = req.query.role;
    }
    
    if (req.query.startDate && req.query.endDate) {
      filter.loginAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }
    
    if (req.query.search) {
      filter.$or = [
        { userName: { $regex: req.query.search, $options: 'i' } },
        { userEmail: { $regex: req.query.search, $options: 'i' } },
        { 'sessionNumber': { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    // Get sessions
    const sessions = await SessionLog.find(filter)
      .sort({ loginAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await SessionLog.countDocuments(filter);
    
    // Format sessions
    const formattedSessions = sessions.map(session => {
      const statusBadge = getStatusBadge(session.sessionStatus);
      const roleColor = getRoleColor(session.userRole);
      const daysUntilDeletion = Math.ceil((session.autoDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        
        // User Information
        userId: session.userId,
        userName: session.userName,
        userEmail: session.userEmail,
        userRole: session.userRole,
        userDepartment: session.userDepartment,
        roleColor: roleColor,
        
        // Session Information
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        formattedLogin: formatDatePurple(session.loginAt),
        formattedLogout: session.logoutAt ? formatDatePurple(session.logoutAt) : 'Active',
        
        // Status
        status: session.sessionStatus,
        statusBadge: statusBadge,
        isActive: session.isActive || false,
        
        // Duration
        durationMinutes: session.durationMinutes || 0,
        formattedDuration: formatDurationPurple(session.durationMinutes),
        
        // Device Info
        device: session.device || 'Unknown',
        browser: session.browser || 'Unknown',
        ip: session.ip,
        
        // Auto-Delete Info
        autoDeleteDate: session.autoDeleteDate,
        daysUntilDeletion: daysUntilDeletion > 0 ? daysUntilDeletion : 0,
        deletionStatus: daysUntilDeletion <= 7 ? 'critical' : 
                       daysUntilDeletion <= 14 ? 'warning' : 'safe',
        
        // Activities
        activityCount: session.activities?.length || 0,
        hasIssues: session.autoLogout || false,
        requiresReview: session.sessionStatus === 'active' && 
          (new Date() - session.loginAt) > (24 * 60 * 60 * 1000), // Older than 24h
        
        // Timestamps
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      };
    });
    
    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions`,
      theme: 'purple',
      userRole: req.user.role,
      data: formattedSessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {
        status: req.query.status || 'all',
        role: req.query.role || 'all',
        dateRange: req.query.startDate && req.query.endDate ? 
          `${req.query.startDate} to ${req.query.endDate}` : 'all',
        search: req.query.search || 'none'
      },
      summary: {
        totalSessions: total,
        activeSessions: await SessionLog.countDocuments({ sessionStatus: 'active' }),
        pendingReview: await SessionLog.countDocuments({
          sessionStatus: 'active',
          loginAt: { $lte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }),
        expiringSoon: await SessionLog.countDocuments({
          autoDeleteDate: { 
            $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            $gte: new Date()
          }
        })
      }
    });
    
  } catch (error) {
    console.error('❌ getAllSessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== GET MY SESSION STATISTICS ====================
exports.getMySessionStats = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    const period = req.query.period || 'month'; // month, week, year
    const now = new Date();
    let startDate = new Date();
    
    switch(period) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setDate(now.getDate() - 30);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }
    
    // Get statistics
    const stats = await SessionLog.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
          loginAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalHours: { $sum: '$totalHours' },
          totalEarnings: { $sum: '$dailyEarnings' },
          avgDuration: { $avg: '$durationMinutes' },
          activeSessions: {
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] }
          },
          clockedInDays: {
            $sum: { $cond: [{ $ne: ['$clockIn', null] }, 1, 0] }
          },
          completedSessions: {
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Get daily breakdown
    const dailyStats = await SessionLog.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
          loginAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginAt' } },
          sessions: { $sum: 1 },
          hours: { $sum: '$totalHours' },
          earnings: { $sum: '$dailyEarnings' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    
    // Get device usage
    const deviceStats = await SessionLog.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
          loginAt: { $gte: startDate, $lte: now },
          device: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$device',
          count: { $sum: 1 },
          totalHours: { $sum: '$totalHours' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    const result = stats[0] || {
      totalSessions: 0,
      totalHours: 0,
      totalEarnings: 0,
      avgDuration: 0,
      activeSessions: 0,
      clockedInDays: 0,
      completedSessions: 0
    };
    
    res.status(200).json({
      success: true,
      message: `Session statistics for ${period}`,
      theme: 'purple',
      period,
      startDate,
      endDate: now,
      statistics: {
        overview: {
          totalSessions: result.totalSessions,
          totalHours: parseFloat(result.totalHours.toFixed(2)),
          totalEarnings: parseFloat(result.totalEarnings.toFixed(2)),
          avgSessionDuration: formatDurationPurple(result.avgDuration),
          activeSessions: result.activeSessions,
          clockedInDays: result.clockedInDays,
          attendanceRate: `${Math.round((result.clockedInDays / 
            ((now - startDate) / (1000 * 60 * 60 * 24))) * 100)}%`
        },
        dailyBreakdown: dailyStats.map(day => ({
          date: day._id,
          sessions: day.sessions,
          hours: parseFloat(day.hours.toFixed(2)),
          earnings: parseFloat(day.earnings.toFixed(2))
        })),
        deviceUsage: deviceStats.map(device => ({
          device: device._id,
          sessions: device.count,
          totalHours: parseFloat(device.totalHours.toFixed(2)),
          percentage: `${Math.round((device.count / result.totalSessions) * 100)}%`
        })),
        trends: {
          avgDailyHours: parseFloat((result.totalHours / 
            Math.max(1, (now - startDate) / (1000 * 60 * 60 * 24))).toFixed(2)),
          avgDailySessions: parseFloat((result.totalSessions / 
            Math.max(1, (now - startDate) / (1000 * 60 * 60 * 24))).toFixed(1)),
          avgDailyEarnings: parseFloat((result.totalEarnings / 
            Math.max(1, (now - startDate) / (1000 * 60 * 60 * 24))).toFixed(2))
        }
      }
    });
    
  } catch (error) {
    console.error('❌ getMySessionStats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session statistics',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== CLOCK IN ====================
exports.clockIn = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    // Check if already clocked in
    const existingClockIn = await SessionLog.findOne({
      userId,
      clockIn: { $ne: null },
      clockOut: null
    });
    
    if (existingClockIn) {
      return res.status(400).json({
        success: false,
        message: 'Already clocked in',
        theme: 'purple',
        currentSession: {
          sessionId: existingClockIn._id,
          clockInTime: formatDatePurple(existingClockIn.clockIn)
        }
      });
    }
    
    // Find active session
    const currentSession = await SessionLog.findOne({
      userId,
      sessionStatus: 'active'
    }).sort({ loginAt: -1 });
    
    if (!currentSession) {
      return res.status(400).json({
        success: false,
        message: 'No active session found to clock in',
        theme: 'purple'
      });
    }
    
    // Update clock in
    currentSession.clockIn = new Date();
    currentSession.activities.push({
      action: 'clock_in',
      details: 'User clocked in',
      timestamp: new Date(),
      color: 'green'
    });
    
    await currentSession.save();
    
    res.status(200).json({
      success: true,
      message: 'Successfully clocked in',
      theme: 'purple',
      data: {
        sessionId: currentSession._id,
        sessionNumber: `SESS-${currentSession._id.toString().slice(-6).toUpperCase()}`,
        clockInTime: formatDatePurple(currentSession.clockIn),
        currentTime: formatDatePurple(new Date()),
        expectedClockOut: formatDatePurple(new Date(Date.now() + 8 * 60 * 60 * 1000)), // 8 hours later
        activities: currentSession.activities.slice(-3) // Last 3 activities
      }
    });
    
  } catch (error) {
    console.error('❌ clockIn error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clock in',
      error: error.message,
      theme: 'purple'
    });
  }
};

// ==================== CLOCK OUT ====================
exports.clockOut = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    // Find session with active clock in
    const currentSession = await SessionLog.findOne({
      userId,
      clockIn: { $ne: null },
      clockOut: null
    }).sort({ loginAt: -1 });
    
    if (!currentSession) {
      return res.status(400).json({
        success: false,
        message: 'No active clock in found',
        theme: 'purple'
      });
    }
    
    // Update clock out
    currentSession.clockOut = new Date();
    
    // Calculate hours worked
    const hoursWorked = (currentSession.clockOut - currentSession.clockIn) / (1000 * 60 * 60);
    currentSession.hoursWorked = parseFloat(hoursWorked.toFixed(2));
    
    // Calculate earnings (example: $15 per hour)
    const hourlyRate = 15;
    currentSession.dailyEarnings = parseFloat((hoursWorked * hourlyRate).toFixed(2));
    
    currentSession.activities.push({
      action: 'clock_out',
      details: `User clocked out after ${hoursWorked.toFixed(2)} hours`,
      timestamp: new Date(),
      color: 'blue'
    });
    
    await currentSession.save();
    
    res.status(200).json({
      success: true,
      message: 'Successfully clocked out',
      theme: 'purple',
      data: {
        sessionId: currentSession._id,
        sessionNumber: `SESS-${currentSession._id.toString().slice(-6).toUpperCase()}`,
        clockInTime: formatDatePurple(currentSession.clockIn),
        clockOutTime: formatDatePurple(currentSession.clockOut),
        hoursWorked: currentSession.hoursWorked,
        dailyEarnings: currentSession.dailyEarnings,
        sessionDuration: formatDurationPurple(currentSession.durationMinutes),
        activities: currentSession.activities.slice(-3)
      }
    });
    
  } catch (error) {
    console.error('❌ clockOut error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clock out',
      error: error.message,
      theme: 'purple'
    });
  }
};
// ==================== GET MY CURRENT SESSION ====================
exports.getMyCurrentSession = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    // Find active session
    const currentSession = await SessionLog.findOne({
      userId,
      sessionStatus: 'active'
    }).sort({ loginAt: -1 }).lean();
    
    if (!currentSession) {
      return res.status(200).json({
        success: true,
        message: 'No active session found',
        theme: 'purple',
        hasActiveSession: false,
        data: null
      });
    }
    
    // Format session
    const statusBadge = getStatusBadge(currentSession.sessionStatus);
    const roleColor = getRoleColor(currentSession.userRole || req.user.role);
    const daysUntilDeletion = Math.ceil((currentSession.autoDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
    
    const formattedSession = {
      id: currentSession._id,
      sessionNumber: `SESS-${currentSession._id.toString().slice(-6).toUpperCase()}`,
      
      // User Info
      userId: currentSession.userId,
      userName: currentSession.userName,
      userRole: currentSession.userRole,
      roleColor: roleColor,
      
      // Session Info
      loginAt: currentSession.loginAt,
      formattedLogin: formatDatePurple(currentSession.loginAt),
      sessionDuration: formatDurationPurple(currentSession.durationMinutes),
      status: statusBadge,
      isActive: currentSession.isActive || false,
      
      // Clock Info
      isClockedIn: !!currentSession.clockIn && !currentSession.clockOut,
      isClockedOut: !!currentSession.clockOut,
      clockIn: currentSession.clockIn,
      clockOut: currentSession.clockOut,
      formattedClockIn: currentSession.clockIn ? formatDatePurple(currentSession.clockIn) : 'Not Clocked In',
      formattedClockOut: currentSession.clockOut ? formatDatePurple(currentSession.clockOut) : 'Not Clocked Out',
      
      // Device Info
      device: currentSession.device || 'Unknown',
      browser: currentSession.browser || 'Unknown',
      ip: currentSession.ip,
      location: currentSession.location || {},
      
      // Auto-Delete Info
      autoDeleteDate: currentSession.autoDeleteDate,
      daysUntilDeletion: daysUntilDeletion > 0 ? daysUntilDeletion : 0,
      deletionStatusColor: daysUntilDeletion <= 7 ? 'red' : 
                         daysUntilDeletion <= 14 ? 'orange' : 
                         daysUntilDeletion <= 21 ? 'yellow' : 'green',
      
      // Activities
      activities: currentSession.activities || [],
      activityCount: currentSession.activities?.length || 0,
      lastActivity: currentSession.activities?.length > 0 ? 
        currentSession.activities[currentSession.activities.length - 1] : null,
      
      // Theme
      theme: {
        primaryColor: 'purple',
        accentColor: roleColor.text.replace('text-', ''),
        gradient: roleColor.bg
      }
    };
    
    res.status(200).json({
      success: true,
      message: 'Current session found',
      theme: 'purple',
      hasActiveSession: true,
      data: formattedSession,
      statistics: {
        hoursActive: ((new Date() - currentSession.loginAt) / (1000 * 60 * 60)).toFixed(2),
        activitiesPerHour: ((currentSession.activities?.length || 0) / 
          Math.max(1, (new Date() - currentSession.loginAt) / (1000 * 60 * 60))).toFixed(1)
      }
    });
    
  } catch (error) {
    console.error('❌ getMyCurrentSession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current session',
      error: error.message,
      theme: 'purple'
    });
  }
};
// Add this new function for getting all sessions with proper pagination:

exports.getAllSessionsAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = {};
    
    // Status filter
    if (req.query.status && req.query.status !== 'all') {
      filter.sessionStatus = req.query.status;
    }
    
    // Role filter
    if (req.query.role && req.query.role !== 'all') {
      filter.userRole = req.query.role;
    }
    
    // Date range filter
    if (req.query.startDate && req.query.endDate) {
      filter.loginAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }
    
    // Search filter
    if (req.query.search) {
      filter.$or = [
        { userName: { $regex: req.query.search, $options: 'i' } },
        { userEmail: { $regex: req.query.search, $options: 'i' } },
        { device: { $regex: req.query.search, $options: 'i' } },
        { browser: { $regex: req.query.search, $options: 'i' } },
        { ip: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    // Get total count and sessions
    const total = await SessionLog.countDocuments(filter);
    
    const sessions = await SessionLog.find(filter)
      .sort({ loginAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Format sessions with all details
    const formattedSessions = sessions.map(session => {
      const statusBadge = getStatusBadge(session.sessionStatus);
      const roleColor = getRoleColor(session.userRole);
      const daysUntilDeletion = Math.ceil((session.autoDeleteDate - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        
        // User Information
        userId: session.userId,
        userName: session.userName,
        userEmail: session.userEmail,
        userRole: session.userRole,
        userDepartment: session.userDepartment,
        roleColor: roleColor,
        
        // Session Information
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        formattedLogin: formatDatePurple(session.loginAt),
        formattedLogout: session.logoutAt ? formatDatePurple(session.logoutAt) : 'Active',
        
        // Attendance Data
        clockIn: session.clockIn,
        clockOut: session.clockOut,
        formattedClockIn: session.clockIn ? formatDatePurple(session.clockIn) : 'Not Clocked In',
        formattedClockOut: session.clockOut ? formatDatePurple(session.clockOut) : 'Not Clocked Out',
        
        // Duration & Hours
        totalHours: session.totalHours || 0,
        durationMinutes: session.durationMinutes || 0,
        formattedDuration: formatDurationPurple(session.durationMinutes),
        hoursWorked: session.hoursWorked || 0,
        dailyEarnings: session.dailyEarnings || 0,
        
        // Status
        status: session.sessionStatus,
        statusBadge: statusBadge,
        isActive: session.isActive || false,
        isClockedIn: !!session.clockIn && !session.clockOut,
        isClockedOut: !!session.clockOut,
        
        // Device Info (FULL DETAILS)
        ip: session.ip,
        device: session.device || 'Unknown',
        browser: session.browser || 'Unknown',
        os: session.os || 'Unknown',
        location: session.location || {},
        userAgent: session.userAgent,
        
        // Activities
        activityCount: session.activities?.length || 0,
        lastActivity: session.activities?.length > 0 ? 
          session.activities[session.activities.length - 1] : null,
        
        // Auto-Delete Info
        autoDeleteDate: session.autoDeleteDate,
        daysUntilDeletion: daysUntilDeletion > 0 ? daysUntilDeletion : 0,
        deletionStatusColor: daysUntilDeletion <= 7 ? 'red' : 
                           daysUntilDeletion <= 14 ? 'orange' : 
                           daysUntilDeletion <= 21 ? 'yellow' : 'green',
        
        // Metadata
        flagged: session.flagged || false,
        autoLogout: session.autoLogout || false,
        
        // Timestamps
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      };
    });

    // Get statistics
    const activeSessions = await SessionLog.countDocuments({ 
      ...filter, 
      sessionStatus: 'active' 
    });
    
    const totalHoursAgg = await SessionLog.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$totalHours' } } }
    ]);
    
    const avgDurationAgg = await SessionLog.aggregate([
      { $match: filter },
      { $group: { _id: null, avg: { $avg: '$durationMinutes' } } }
    ]);
    
    const uniqueUsers = await SessionLog.distinct('userId', filter);

    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions`,
      theme: 'purple',
      userInfo: {
        id: req.user._id,
        name: `${req.user.firstName} ${req.user.lastName}`,
        email: req.user.email,
        role: req.user.role,
        roleColor: getRoleColor(req.user.role)
      },
      data: formattedSessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      statistics: {
        totalSessions: total,
        activeSessions,
        completedSessions: await SessionLog.countDocuments({ 
          ...filter, 
          sessionStatus: 'completed' 
        }),
        expiredSessions: await SessionLog.countDocuments({ 
          ...filter, 
          sessionStatus: 'expired' 
        }),
        terminatedSessions: await SessionLog.countDocuments({ 
          ...filter, 
          sessionStatus: 'terminated' 
        }),
        totalHours: totalHoursAgg[0]?.total || 0,
        avgDuration: avgDurationAgg[0]?.avg || 0,
        uniqueUsers: uniqueUsers.length,
        deletionCount: await SessionLog.countDocuments({
          ...filter,
          autoDeleteDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        })
      }
    });
  } catch (error) {
    console.error('❌ getAllSessionsAdmin error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions',
      error: error.message,
      theme: 'purple'
    });
  }
};