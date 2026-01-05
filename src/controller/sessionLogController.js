// Add these new methods to your existing controller

// ==================== USER - CLOCK IN ====================
exports.clockIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timestamp, location, device } = req.body;

    // Find active session or create new
    let session = await SessionLog.findOne({
      userId,
      logoutAt: null,
      sessionStatus: 'active'
    });

    const now = timestamp ? new Date(timestamp) : new Date();

    if (!session) {
      session = new SessionLog({
        userId,
        userName: `${req.user.firstName} ${req.user.lastName}`,
        userEmail: req.user.email,
        userRole: req.user.role,
        loginAt: now,
        ip: req.ip,
        device: device || req.headers['user-agent'],
        clockIn: now,
        sessionStatus: 'active'
      });
    } else {
      session.clockIn = now;
      session.updatedAt = now;
    }

    // Add activity
    session.activities.push({
      action: 'Clock In',
      details: { 
        location: location || 'Office',
        device: device || req.headers['user-agent'],
        ip: req.ip
      }
    });

    await session.save();

    res.status(200).json({
      success: true,
      message: 'Clocked in successfully',
      data: {
        sessionId: session._id,
        clockIn: session.clockIn,
        formattedClockIn: session.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    });
  } catch (error) {
    console.error('❌ clockIn error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clock in',
      error: error.message
    });
  }
};

// ==================== USER - CLOCK OUT ====================
exports.clockOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timestamp, location, device } = req.body;

    const session = await SessionLog.findOne({
      userId,
      logoutAt: null,
      sessionStatus: 'active'
    });

    if (!session || !session.clockIn) {
      return res.status(400).json({
        success: false,
        message: 'No active session or clock in found'
      });
    }

    const now = timestamp ? new Date(timestamp) : new Date();
    
    session.clockOut = now;
    session.logoutAt = now;
    session.sessionStatus = 'logged_out';
    
    // Calculate total hours
    if (session.clockIn) {
      const diffMs = session.clockOut - session.clockIn;
      session.totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
    }

    // Add activity
    session.activities.push({
      action: 'Clock Out',
      details: { 
        location: location || 'Office',
        device: device || req.headers['user-agent'],
        ip: req.ip,
        totalHours: session.totalHours
      }
    });

    await session.save();

    res.status(200).json({
      success: true,
      message: 'Clocked out successfully',
      data: {
        sessionId: session._id,
        clockIn: session.clockIn,
        clockOut: session.clockOut,
        totalHours: session.totalHours,
        formattedClockOut: session.clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    });
  } catch (error) {
    console.error('❌ clockOut error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clock out',
      error: error.message
    });
  }
};

// ==================== ADMIN - GET STATISTICS ====================
exports.getAdminStatistics = async (req, res) => {
  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = await SessionLog.aggregate([
      {
        $facet: {
          // Total sessions
          totalSessions: [
            { $group: { _id: null, count: { $sum: 1 } } }
          ],
          // Active sessions today
          activeSessions: [
            { 
              $match: { 
                sessionStatus: 'active',
                loginAt: { $gte: today, $lt: tomorrow }
              } 
            },
            { $group: { _id: null, count: { $sum: 1 } } }
          ],
          // Today's sessions
          todaySessions: [
            { 
              $match: { 
                loginAt: { $gte: today, $lt: tomorrow }
              } 
            },
            { $group: { _id: null, count: { $sum: 1 } } }
          ],
          // Average duration
          avgDuration: [
            { $match: { logoutAt: { $ne: null } } },
            {
              $group: {
                _id: null,
                avgMinutes: { $avg: '$durationMinutes' }
              }
            }
          ],
          // Device distribution
          deviceStats: [
            { $group: { _id: '$device', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
          ]
        }
      }
    ]);

    const result = {
      totalSessions: stats[0]?.totalSessions[0]?.count || 0,
      activeSessions: stats[0]?.activeSessions[0]?.count || 0,
      todaySessions: stats[0]?.todaySessions[0]?.count || 0,
      avgDuration: stats[0]?.avgDuration[0]?.avgMinutes 
        ? `${Math.round(stats[0].avgDuration[0].avgMinutes / 60)}h ${Math.round(stats[0].avgDuration[0].avgMinutes % 60)}m`
        : '0h 0m',
      topDevices: stats[0]?.deviceStats || [],
      attendanceRate: '85%' // You can calculate this based on your logic
    };

    res.status(200).json({
      success: true,
      message: 'Admin statistics fetched successfully',
      data: result
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

// ==================== ANALYTICS - DAILY ACTIVITY ====================
exports.getDailyAnalytics = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyStats = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$loginAt" }
          },
          sessions: { $sum: 1 },
          activeUsers: { $addToSet: "$userId" },
          totalHours: { $sum: "$totalHours" }
        }
      },
      {
        $project: {
          date: "$_id",
          sessions: 1,
          activeUsers: { $size: "$activeUsers" },
          totalHours: { $round: ["$totalHours", 2] },
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.status(200).json({
      success: true,
      message: 'Daily analytics fetched',
      data: dailyStats
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

// ==================== ANALYTICS - DEVICE DISTRIBUTION ====================
exports.getDeviceAnalytics = async (req, res) => {
  try {
    const deviceStats = await SessionLog.aggregate([
      {
        $group: {
          _id: "$device",
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          _id: { $ne: null }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'Device analytics fetched',
      data: deviceStats.map(stat => ({
        device: stat._id || 'Unknown',
        count: stat.count
      }))
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

// ==================== ANALYTICS - TRENDS ====================
exports.getTrendAnalytics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendStats = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$loginAt" }
          },
          sessions: { $sum: 1 },
          totalHours: { $sum: "$totalHours" },
          uniqueUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          date: "$_id",
          sessions: 1,
          totalHours: { $round: ["$totalHours", 2] },
          uniqueUsers: { $size: "$uniqueUsers" },
          avgHoursPerSession: {
            $cond: [
              { $eq: ["$sessions", 0] },
              0,
              { $round: [{ $divide: ["$totalHours", "$sessions"] }, 2] }
            ]
          }
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.status(200).json({
      success: true,
      message: 'Trend analytics fetched',
      data: trendStats
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

// ==================== EXPORT - MY SESSIONS ====================
exports.exportMySessions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, format = 'csv' } = req.query;

    const matchCondition = { userId };
    
    if (startDate && endDate) {
      matchCondition.loginAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const sessions = await SessionLog.find(matchCondition)
      .sort({ loginAt: -1 })
      .lean();

    if (format === 'csv') {
      // CSV export logic
      const csvData = sessions.map(session => ({
        Date: session.loginAt.toISOString().split('T')[0],
        'Clock In': session.clockIn ? session.clockIn.toLocaleTimeString() : 'N/A',
        'Clock Out': session.clockOut ? session.clockOut.toLocaleTimeString() : 'N/A',
        'Total Hours': session.totalHours || '0.00',
        'Session Duration': session.formattedDuration || '0m',
        Device: session.device || 'N/A',
        IP: session.ip || 'N/A',
        Status: session.sessionStatus || 'N/A'
      }));

      // Convert to CSV string
      const csvString = [
        Object.keys(csvData[0] || {}).join(','),
        ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=my_sessions_export.csv');
      return res.send(csvString);
    }

    res.status(200).json({
      success: true,
      message: 'Sessions export ready',
      data: sessions,
      count: sessions.length
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

// ==================== EXPORT - ALL SESSIONS (ADMIN) ====================
exports.exportAllSessions = async (req, res) => {
  try {
    const { startDate, endDate, userId, format = 'csv' } = req.query;

    const matchCondition = {};
    
    if (startDate && endDate) {
      matchCondition.loginAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (userId) {
      matchCondition.userId = userId;
    }

    const sessions = await SessionLog.find(matchCondition)
      .populate('userId', 'firstName lastName email employeeId')
      .sort({ loginAt: -1 })
      .lean();

    if (format === 'csv') {
      // CSV export logic for admin
      const csvData = sessions.map(session => ({
        Date: session.loginAt.toISOString().split('T')[0],
        'Employee ID': session.userId?.employeeId || 'N/A',
        'Employee Name': `${session.userId?.firstName || ''} ${session.userId?.lastName || ''}`.trim() || 'N/A',
        'Email': session.userId?.email || 'N/A',
        'Clock In': session.clockIn ? session.clockIn.toLocaleTimeString() : 'N/A',
        'Clock Out': session.clockOut ? session.clockOut.toLocaleTimeString() : 'N/A',
        'Total Hours': session.totalHours || '0.00',
        'Session Duration': session.formattedDuration || '0m',
        Device: session.device || 'N/A',
        IP: session.ip || 'N/A',
        Status: session.sessionStatus || 'N/A'
      }));

      const csvString = [
        Object.keys(csvData[0] || {}).join(','),
        ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=all_sessions_export.csv');
      return res.send(csvString);
    }

    res.status(200).json({
      success: true,
      message: 'All sessions export ready',
      data: sessions,
      count: sessions.length
    });
  } catch (error) {
    console.error('❌ exportAllSessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export sessions',
      error: error.message
    });
  }
};