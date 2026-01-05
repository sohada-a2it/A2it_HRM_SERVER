// controllers/sessionController.js - আপডেটেড
const mongoose = require('mongoose');
const SessionLog = require('../models/SessionLogModel');

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

// ==================== USER – GET MY SESSIONS ====================
exports.getMySessions = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // SessionLog.find ব্যবহার করুন
    const sessions = await SessionLog.find({ userId })
      .sort({ loginAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await SessionLog.countDocuments({ userId });
    
    // User তথ্য fetch করুন (একবারই)
    const User = require('../models/UsersModel');
    const user = await User.findById(userId).select('firstName lastName email role department');
    
    // formattedSessions এ clockIn, clockOut, totalHours এবং User Name যোগ করুন
    const formattedSessions = sessions.map(session => ({
      id: session._id,
      
      // ✅ User Information
      userId: session.userId,
      userName: session.userName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown User',
      userEmail: session.userEmail || user?.email || 'Unknown Email',
      userRole: session.userRole || user?.role || 'employee',
      userDepartment: session.userDepartment || user?.department || 'Not assigned',
      
      // Session Information
      loginAt: session.loginAt,
      logoutAt: session.logoutAt,
      
      // ✅ Attendance data
      clockIn: session.clockIn,
      clockOut: session.clockOut,
      totalHours: session.totalHours || 0,
      
      // ✅ Formatted times
      formattedClockIn: session.clockIn ? 
        session.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
        'Not clocked in',
      formattedClockOut: session.clockOut ? 
        session.clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
        'Not clocked out',
      formattedTotalHours: session.totalHours ? 
        `${session.totalHours.toFixed(2)} hours` : 
        '0 hours',
      
      // Session duration
      duration: session.durationMinutes || 0,
      formattedDuration: session.formattedDuration || '0m',
      
      // Device and location
      ip: session.ip,
      device: session.device,
      browser: session.browser || 'Unknown',
      os: session.os || 'Unknown',
      location: session.location || {},
      
      // Status
      status: session.sessionStatus,
      activityCount: session.activities?.length || 0,
      isActive: session.isActive || false,
      
      // ✅ Attendance status
      isClockedIn: !!session.clockIn && !session.clockOut,
      isClockedOut: !!session.clockOut,
      hasAttendance: !!session.clockIn || !!session.clockOut,
      
      // Additional info
      autoLogout: session.autoLogout || false,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      
      // ✅ Formatted date and time
      formattedLoginDate: session.loginAt ? 
        session.loginAt.toLocaleDateString() : 'N/A',
      formattedLoginTime: session.loginAt ? 
        session.loginAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A',
      formattedLogoutDate: session.logoutAt ? 
        session.logoutAt.toLocaleDateString() : 'Still active',
      formattedLogoutTime: session.logoutAt ? 
        session.logoutAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Still active'
    }));

    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions for ${user?.firstName || 'User'}`,
      userInfo: {
        id: user?._id,
        name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
        email: user?.email,
        role: user?.role,
        department: user?.department
      },
      data: formattedSessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ getMySessions error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your sessions',
      error: error.message
    });
  }
};

// ==================== USER – GET CURRENT SESSION ====================
exports.getMyCurrentSession = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    // ✅ findOne ব্যবহার করুন
    const session = await SessionLog.findOne({
      userId,
      logoutAt: null,
      sessionStatus: 'active'
    }).sort({ loginAt: -1 });

    if (!session) {
      return res.status(200).json({
        success: true,
        message: 'No active session found',
        data: null,
        isActive: false
      });
    }

    res.status(200).json({
      success: true,
      message: 'Active session found',
      data: {
        sessionId: session._id,
        loginAt: session.loginAt,
        
        // ✅ Attendance data
        clockIn: session.clockIn,
        clockOut: session.clockOut,
        totalHours: session.totalHours || 0,
        
        // ✅ Formatted
        formattedClockIn: session.clockIn ? 
          session.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
          'Not clocked in',
        formattedClockOut: session.clockOut ? 
          session.clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
          'Not clocked out',
        formattedTotalHours: session.totalHours ? 
          `${session.totalHours.toFixed(2)} hours` : 
          '0 hours',
        
        // ✅ Status
        isClockedIn: !!session.clockIn && !session.clockOut,
        isClockedOut: !!session.clockOut,
        
        duration: session.durationMinutes || 0,
        formattedDuration: session.formattedDuration || '0m',
        ip: session.ip,
        device: session.device,
        activities: session.activities?.slice(-5) || [],
        totalActivities: session.activities?.length || 0
      },
      isActive: true
    });
  } catch (error) {
    console.error('❌ getMyCurrentSession error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current session',
      error: error.message
    });
  }
}; 

// ==================== USER – GET SESSION STATISTICS (MULTI PERIOD) ====================
exports.getSessionStatistics = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const now = new Date();

    // Periods: last 7 days, last 30 days
    const periods = [
      { label: 'Last 7 days', days: 7 },
      { label: 'Last 30 days', days: 30 }
    ];

    const statsResult = {};

    for (const period of periods) {
      const startDate = new Date();
      startDate.setDate(now.getDate() - period.days);

      const stats = await SessionLog.aggregate([
        { $match: { userId, loginAt: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            totalDuration: { $sum: '$durationMinutes' },
            totalHoursWorked: { $sum: '$totalHours' },
            daysClockedIn: { $sum: { $cond: [{ $ne: ['$clockIn', null] }, 1, 0] } },
            daysClockedOut: { $sum: { $cond: [{ $ne: ['$clockOut', null] }, 1, 0] } },
            avgHoursPerDay: { $avg: '$totalHours' }
          }
        }
      ]);

      const result = stats[0] || {
        totalSessions: 0,
        totalDuration: 0,
        totalHoursWorked: 0,
        daysClockedIn: 0,
        daysClockedOut: 0,
        avgHoursPerDay: 0
      };

      statsResult[period.label] = {
        totalSessions: result.totalSessions,
        totalDurationHours: (result.totalDuration / 60).toFixed(2),
        totalHoursWorked: result.totalHoursWorked.toFixed(2),
        daysClockedIn: result.daysClockedIn,
        daysClockedOut: result.daysClockedOut,
        avgHoursPerDay: result.avgHoursPerDay.toFixed(2),
        attendanceRate: result.totalSessions > 0 ?
          ((result.daysClockedIn / result.totalSessions) * 100).toFixed(2) + '%' : '0%'
      };
    }

    res.status(200).json({
      success: true,
      message: 'User session statistics',
      data: statsResult
    });
  } catch (error) {
    console.error('❌ getSessionStatistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session statistics',
      error: error.message
    });
  }
};

// ==================== ADMIN – GET ALL SESSIONS ====================
exports.getAllSessions = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Filters
    const filter = {};
    
    if (req.query.userId) {
      filter.userId = new mongoose.Types.ObjectId(req.query.userId);
    }
    
    if (req.query.status) {
      filter.sessionStatus = req.query.status;
    }
    
    if (req.query.startDate && req.query.endDate) {
      filter.loginAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // ✅ find ব্যবহার করুন
    const sessions = await SessionLog.find(filter)
      .sort({ loginAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SessionLog.countDocuments(filter);

    // Format response with attendance data
    const formattedSessions = sessions.map(session => ({
      id: session._id,
      userId: session.userId,
      userName: session.userName || 'Unknown',
      userEmail: session.userEmail || 'Unknown',
      userRole: session.userRole || 'employee',
      loginAt: session.loginAt,
      logoutAt: session.logoutAt,
      
      // ✅ Attendance data
      clockIn: session.clockIn,
      clockOut: session.clockOut,
      totalHours: session.totalHours || 0,
      
      // ✅ Formatted
      formattedClockIn: session.clockIn ? 
        session.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
        'Not clocked in',
      formattedClockOut: session.clockOut ? 
        session.clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
        'Not clocked out',
      formattedTotalHours: session.totalHours ? 
        `${session.totalHours.toFixed(2)} hours` : 
        '0 hours',
      
      duration: session.durationMinutes || 0,
      formattedDuration: session.formattedDuration || '0m',
      ip: session.ip,
      device: session.device,
      status: session.sessionStatus,
      activityCount: session.activities?.length || 0,
      isActive: session.isActive || false,
      
      // ✅ Attendance status
      isClockedIn: !!session.clockIn && !session.clockOut,
      isClockedOut: !!session.clockOut
    }));

    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions`,
      data: formattedSessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ getAllSessions error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions',
      error: error.message
    });
  }
};

// ==================== ADMIN – GET SESSION BY ID ====================
exports.getSessionById = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const sessionId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }

    // ✅ findById ব্যবহার করুন
    const session = await SessionLog.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: session._id,
        userId: session.userId,
        userName: session.userName,
        userEmail: session.userEmail,
        userRole: session.userRole,
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        
        // ✅ Attendance data
        clockIn: session.clockIn,
        clockOut: session.clockOut,
        totalHours: session.totalHours || 0,
        
        // ✅ Formatted
        formattedClockIn: session.clockIn ? 
          session.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
          'Not clocked in',
        formattedClockOut: session.clockOut ? 
          session.clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
          'Not clocked out',
        
        duration: session.durationMinutes || 0,
        formattedDuration: session.formattedDuration || '0m',
        ip: session.ip,
        device: session.device,
        status: session.sessionStatus,
        activities: session.activities || [],
        autoLogout: session.autoLogout,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        
        // ✅ Status flags
        isClockedIn: !!session.clockIn && !session.clockOut,
        isClockedOut: !!session.clockOut
      }
    });
  } catch (error) {
    console.error('❌ getSessionById error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session',
      error: error.message
    });
  }
};

// ==================== GET SESSION STATISTICS WITH ATTENDANCE ====================
exports.getSessionAttendanceStats = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await SessionLog.aggregate([
      {
        $match: {
          userId: userId,
          loginAt: { $gte: thirtyDaysAgo },
          $or: [
            { clockIn: { $exists: true } },
            { clockOut: { $exists: true } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: '$durationMinutes' },
          totalHoursWorked: { $sum: '$totalHours' },
          daysClockedIn: { 
            $sum: { 
              $cond: [{ $ne: ['$clockIn', null] }, 1, 0] 
            } 
          },
          daysClockedOut: { 
            $sum: { 
              $cond: [{ $ne: ['$clockOut', null] }, 1, 0] 
            } 
          },
          avgHoursPerDay: { $avg: '$totalHours' }
        }
      }
    ]);

    const result = stats[0] || {
      totalSessions: 0,
      totalDuration: 0,
      totalHoursWorked: 0,
      daysClockedIn: 0,
      daysClockedOut: 0,
      avgHoursPerDay: 0
    };

    res.status(200).json({
      success: true,
      data: {
        totalSessions: result.totalSessions,
        totalDurationHours: (result.totalDuration / 60).toFixed(2),
        totalHoursWorked: result.totalHoursWorked.toFixed(2),
        daysClockedIn: result.daysClockedIn,
        daysClockedOut: result.daysClockedOut,
        avgHoursPerDay: result.avgHoursPerDay.toFixed(2),
        attendanceRate: result.totalSessions > 0 ? 
          ((result.daysClockedIn / result.totalSessions) * 100).toFixed(2) + '%' : '0%',
        period: 'Last 30 days'
      }
    });
  } catch (error) {
    console.error('❌ getSessionAttendanceStats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session statistics'
    });
  }
};
// ==================== ADMIN – DELETE SESSION BY ID ====================
exports.deleteSessionById = async (req, res) => {
  try {
    // Check if admin or superadmin
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const sessionId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session ID'
      });
    }

    const deletedSession = await SessionLog.findByIdAndDelete(sessionId);

    if (!deletedSession) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or already deleted'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
      data: deletedSession
    });
  } catch (error) {
    console.error('❌ deleteSessionById error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session',
      error: error.message
    });
  }
};
// controllers/sessionController.js - আপডেটেড

// ==================== USER – CLOCK IN ====================
exports.clockIn = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const now = new Date();
    
    // Check if already clocked in for today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    todayStart.setDate(todayStart.getDate() - 1); // 24 hours ago
    
    const existingClockIn = await SessionLog.findOne({
      userId,
      clockIn: { $gte: todayStart },
      clockOut: null
    });

    if (existingClockIn) {
      return res.status(400).json({
        success: false,
        message: 'You have already clocked in today',
        data: {
          sessionId: existingClockIn._id,
          clockIn: existingClockIn.clockIn,
          formattedClockIn: existingClockIn.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      });
    }

    // Create new session with clock-in
    const session = await SessionLog.create({
      userId,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userEmail: req.user.email,
      userRole: req.user.role,
      userDepartment: req.user.department,
      loginAt: now,
      sessionStatus: 'active',
      isActive: true,
      
      // Attendance data
      clockIn: now,
      
      // Device info from headers
      ip: req.ip || req.headers['x-forwarded-for'] || 'Unknown',
      device: req.headers['user-agent'] || 'Unknown',
      browser: getBrowserInfo(req.headers['user-agent']),
      os: getOSInfo(req.headers['user-agent']),
      
      activities: [{
        action: 'clock_in',
        timestamp: now,
        details: 'User clocked in for work'
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Successfully clocked in',
      data: {
        sessionId: session._id,
        clockIn: session.clockIn,
        formattedClockIn: session.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        loginAt: session.loginAt
      }
    });
  } catch (error) {
    console.error('❌ clockIn error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to clock in',
      error: error.message
    });
  }
};

// ==================== USER – CLOCK OUT ====================
exports.clockOut = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const now = new Date();
    
    // Find active session with clock-in
    const activeSession = await SessionLog.findOne({
      userId,
      clockIn: { $ne: null },
      clockOut: null,
      sessionStatus: 'active'
    }).sort({ loginAt: -1 });

    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active clock-in session found'
      });
    }

    // Calculate total hours
    const clockInTime = new Date(activeSession.clockIn);
    const totalHours = (now - clockInTime) / (1000 * 60 * 60);
    const durationMinutes = (now - clockInTime) / (1000 * 60);

    // Update session
    activeSession.clockOut = now;
    activeSession.totalHours = totalHours;
    activeSession.durationMinutes = durationMinutes;
    activeSession.formattedDuration = formatDuration(durationMinutes);
    activeSession.logoutAt = now;
    activeSession.sessionStatus = 'completed';
    activeSession.isActive = false;
    
    // Add activity
    activeSession.activities.push({
      action: 'clock_out',
      timestamp: now,
      details: 'User clocked out from work',
      duration: totalHours.toFixed(2) + ' hours'
    });

    await activeSession.save();

    res.status(200).json({
      success: true,
      message: 'Successfully clocked out',
      data: {
        sessionId: activeSession._id,
        clockIn: activeSession.clockIn,
        clockOut: activeSession.clockOut,
        totalHours: activeSession.totalHours,
        durationMinutes: activeSession.durationMinutes,
        formattedClockIn: activeSession.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        formattedClockOut: activeSession.clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        formattedTotalHours: `${activeSession.totalHours.toFixed(2)} hours`
      }
    });
  } catch (error) {
    console.error('❌ clockOut error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to clock out',
      error: error.message
    });
  }
};

// ==================== ADMIN – GET ADMIN STATISTICS ====================
exports.getAdminStatistics = async (req, res) => {
  try {
    // Check if admin
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Get overall statistics
    const stats = await SessionLog.aggregate([
      {
        $match: { loginAt: { $gte: thirtyDaysAgo } }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          activeSessions: {
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] }
          },
          totalHoursWorked: { $sum: '$totalHours' },
          totalUsers: { $addToSet: '$userId' },
          daysClockedIn: { 
            $sum: { $cond: [{ $ne: ['$clockIn', null] }, 1, 0] }
          },
          daysClockedOut: { 
            $sum: { $cond: [{ $ne: ['$clockOut', null] }, 1, 0] }
          }
        }
      }
    ]);

    // Get daily stats for last 7 days
    const dailyStats = await SessionLog.aggregate([
      {
        $match: { loginAt: { $gte: sevenDaysAgo } }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginAt' } },
          sessions: { $sum: 1 },
          clockIns: { $sum: { $cond: [{ $ne: ['$clockIn', null] }, 1, 0] } },
          clockOuts: { $sum: { $cond: [{ $ne: ['$clockOut', null] }, 1, 0] } },
          totalHours: { $sum: '$totalHours' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    const result = stats[0] || {
      totalSessions: 0,
      activeSessions: 0,
      totalHoursWorked: 0,
      totalUsers: [],
      daysClockedIn: 0,
      daysClockedOut: 0
    };

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalSessions: result.totalSessions,
          activeSessions: result.activeSessions,
          totalHoursWorked: result.totalHoursWorked.toFixed(2),
          uniqueUsers: result.totalUsers.length,
          daysClockedIn: result.daysClockedIn,
          daysClockedOut: result.daysClockedOut,
          attendanceRate: result.totalSessions > 0 ?
            ((result.daysClockedIn / result.totalSessions) * 100).toFixed(2) + '%' : '0%'
        },
        dailyStats: dailyStats.map(day => ({
          date: day._id,
          sessions: day.sessions,
          clockIns: day.clockIns,
          clockOuts: day.clockOuts,
          totalHours: day.totalHours.toFixed(2)
        })),
        period: {
          start: thirtyDaysAgo.toISOString(),
          end: now.toISOString()
        }
      }
    });
  } catch (error) {
    console.error('❌ getAdminStatistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin statistics',
      error: error.message
    });
  }
};

// ==================== ANALYTICS – DAILY ANALYTICS ====================
exports.getDailyAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginAt' } },
          totalSessions: { $sum: 1 },
          activeSessions: {
            $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] }
          },
          clockIns: { $sum: { $cond: [{ $ne: ['$clockIn', null] }, 1, 0] } },
          clockOuts: { $sum: { $cond: [{ $ne: ['$clockOut', null] }, 1, 0] } },
          totalHours: { $sum: '$totalHours' },
          avgDuration: { $avg: '$durationMinutes' },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: analytics.map(day => ({
        date: day._id,
        totalSessions: day.totalSessions,
        activeSessions: day.activeSessions,
        clockIns: day.clockIns,
        clockOuts: day.clockOuts,
        totalHours: day.totalHours.toFixed(2),
        avgDuration: (day.avgDuration || 0).toFixed(2),
        uniqueUsers: day.uniqueUsers.length
      })),
      period: {
        days,
        startDate: startDate.toISOString()
      }
    });
  } catch (error) {
    console.error('❌ getDailyAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily analytics',
      error: error.message
    });
  }
};

// ==================== ANALYTICS – DEVICE ANALYTICS ====================
exports.getDeviceAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const deviceStats = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            device: '$device',
            browser: '$browser',
            os: '$os'
          },
          count: { $sum: 1 },
          totalHours: { $sum: '$totalHours' },
          avgDuration: { $avg: '$durationMinutes' },
          clockIns: { $sum: { $cond: [{ $ne: ['$clockIn', null] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    const browserStats = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate },
          browser: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$browser',
          count: { $sum: 1 },
          percentage: { $avg: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        deviceStats: deviceStats.map(stat => ({
          device: stat._id.device || 'Unknown',
          browser: stat._id.browser || 'Unknown',
          os: stat._id.os || 'Unknown',
          count: stat.count,
          totalHours: stat.totalHours.toFixed(2),
          avgDuration: (stat.avgDuration || 0).toFixed(2),
          clockIns: stat.clockIns
        })),
        browserStats: browserStats.map(stat => ({
          browser: stat._id,
          count: stat.count,
          percentage: ((stat.count / browserStats.reduce((a, b) => a + b.count, 0)) * 100).toFixed(2) + '%'
        })),
        period: {
          days,
          startDate: startDate.toISOString()
        }
      }
    });
  } catch (error) {
    console.error('❌ getDeviceAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch device analytics',
      error: error.message
    });
  }
};

// ==================== ANALYTICS – TREND ANALYTICS ====================
exports.getTrendAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const months = parseInt(req.query.months) || 6;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const monthlyTrends = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$loginAt' } },
          totalSessions: { $sum: 1 },
          clockIns: { $sum: { $cond: [{ $ne: ['$clockIn', null] }, 1, 0] } },
          clockOuts: { $sum: { $cond: [{ $ne: ['$clockOut', null] }, 1, 0] } },
          totalHours: { $sum: '$totalHours' },
          uniqueUsers: { $addToSet: '$userId' },
          avgHoursPerUser: { $avg: '$totalHours' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    const hourlyTrends = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: startDate },
          clockIn: { $ne: null }
        }
      },
      {
        $group: {
          _id: { $hour: '$clockIn' },
          count: { $sum: 1 },
          avgHours: { $avg: '$totalHours' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        monthlyTrends: monthlyTrends.map(month => ({
          month: month._id,
          totalSessions: month.totalSessions,
          clockIns: month.clockIns,
          clockOuts: month.clockOuts,
          totalHours: month.totalHours.toFixed(2),
          uniqueUsers: month.uniqueUsers.length,
          avgHoursPerUser: (month.avgHoursPerUser || 0).toFixed(2)
        })),
        hourlyTrends: hourlyTrends.map(hour => ({
          hour: hour._id,
          label: `${hour._id}:00 - ${hour._id + 1}:00`,
          count: hour.count,
          avgHours: (hour.avgHours || 0).toFixed(2)
        })),
        period: {
          months,
          startDate: startDate.toISOString()
        }
      }
    });
  } catch (error) {
    console.error('❌ getTrendAnalytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trend analytics',
      error: error.message
    });
  }
};

// ==================== EXPORT – USER SESSIONS ====================
exports.exportMySessions = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    const { startDate, endDate } = req.query;
    const filter = { userId };
    
    if (startDate && endDate) {
      filter.loginAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const sessions = await SessionLog.find(filter)
      .sort({ loginAt: -1 })
      .select('-activities -__v');

    res.status(200).json({
      success: true,
      message: `Exported ${sessions.length} sessions`,
      data: sessions,
      format: 'JSON',
      total: sessions.length,
      exportDate: new Date()
    });
  } catch (error) {
    console.error('❌ exportMySessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export sessions',
      error: error.message
    });
  }
};

// ==================== EXPORT – ALL SESSIONS (ADMIN) ====================
exports.exportAllSessions = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    const { startDate, endDate, userId, format = 'json' } = req.query;
    const filter = {};
    
    if (userId) {
      filter.userId = new mongoose.Types.ObjectId(userId);
    }
    
    if (startDate && endDate) {
      filter.loginAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const sessions = await SessionLog.find(filter)
      .sort({ loginAt: -1 })
      .select('-activities -__v')
      .populate('userId', 'firstName lastName email role department');

    if (format === 'csv') {
      // CSV export logic (simplified)
      const csvData = sessions.map(session => ({
        SessionID: session._id,
        UserID: session.userId?._id,
        UserName: session.userName,
        UserEmail: session.userEmail,
        LoginAt: session.loginAt,
        LogoutAt: session.logoutAt,
        ClockIn: session.clockIn,
        ClockOut: session.clockOut,
        TotalHours: session.totalHours || 0,
        Duration: session.durationMinutes || 0,
        IP: session.ip,
        Device: session.device,
        Status: session.sessionStatus,
        CreatedAt: session.createdAt
      }));

      res.status(200).json({
        success: true,
        message: `Exported ${sessions.length} sessions as CSV`,
        data: csvData,
        format: 'CSV',
        total: sessions.length
      });
    } else {
      res.status(200).json({
        success: true,
        message: `Exported ${sessions.length} sessions`,
        data: sessions,
        format: 'JSON',
        total: sessions.length,
        exportDate: new Date()
      });
    }
  } catch (error) {
    console.error('❌ exportAllSessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export sessions',
      error: error.message
    });
  }
};

// ==================== HELPER FUNCTIONS ====================
const getBrowserInfo = (userAgent) => {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  
  return 'Unknown';
};

const getOSInfo = (userAgent) => {
  if (!userAgent) return 'Unknown';
  
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'MacOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  
  return 'Unknown';
};

const formatDuration = (minutes) => {
  if (!minutes) return '0m';
  
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};
