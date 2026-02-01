const mongoose = require('mongoose');
const SessionLog = require('../models/SessionLogModel');
const moment = require('moment');
const geoip = require('geoip-lite'); // Install: npm install geoip-lite

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

// Get location from IP
const getLocationFromIP = (ip) => {
  try {
    if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1') {
      return {
        city: 'Local',
        country: 'Local',
        region: 'Local'
      };
    }
    
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        city: geo.city || 'Unknown',
        country: geo.country || 'Unknown',
        region: geo.region || 'Unknown',
        lat: geo.ll?.[0],
        lon: geo.ll?.[1],
        timezone: geo.timezone
      };
    }
    
    return {
      city: 'Unknown',
      country: 'Unknown',
      region: 'Unknown'
    };
  } catch (error) {
    console.error('Error getting location from IP:', error);
    return {
      city: 'Error',
      country: 'Error',
      region: 'Error'
    };
  }
};

// Format duration
const formatDuration = (minutes) => {
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

// Format date
const formatDate = (date) => {
  if (!date) return 'N/A';
  return moment(date).format('MMM DD, YYYY • hh:mm A');
};

// Get status color
const getStatusColor = (status) => {
  switch(status) {
    case 'active': return 'text-green-600 bg-green-100';
    case 'completed': return 'text-blue-600 bg-blue-100';
    case 'expired': return 'text-orange-600 bg-orange-100';
    case 'terminated': return 'text-red-600 bg-red-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};

// Parse userAgent - Advanced parsing
const parseUserAgent = (userAgent) => {
  if (!userAgent) return { 
    device: 'Unknown', 
    browser: 'Unknown', 
    os: 'Unknown',
    browserVersion: 'Unknown',
    isMobile: false,
    isTablet: false,
    isDesktop: true
  };
  
  const ua = userAgent.toLowerCase();
  const result = {
    device: 'Desktop',
    browser: 'Unknown',
    os: 'Unknown',
    browserVersion: 'Unknown',
    isMobile: false,
    isTablet: false,
    isDesktop: true
  };
  
  // Device detection
  if (ua.includes('mobile')) {
    result.device = 'Mobile';
    result.isMobile = true;
    result.isDesktop = false;
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    result.device = 'Tablet';
    result.isTablet = true;
    result.isDesktop = false;
  }
  
  // Browser detection with version
  if (ua.includes('chrome') && !ua.includes('edge')) {
    result.browser = 'Chrome';
    const chromeMatch = ua.match(/chrome\/([\d.]+)/);
    if (chromeMatch) result.browserVersion = chromeMatch[1];
  } else if (ua.includes('firefox')) {
    result.browser = 'Firefox';
    const firefoxMatch = ua.match(/firefox\/([\d.]+)/);
    if (firefoxMatch) result.browserVersion = firefoxMatch[1];
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    result.browser = 'Safari';
    const safariMatch = ua.match(/version\/([\d.]+)/);
    if (safariMatch) result.browserVersion = safariMatch[1];
  } else if (ua.includes('edge')) {
    result.browser = 'Edge';
    const edgeMatch = ua.match(/edge\/([\d.]+)/);
    if (edgeMatch) result.browserVersion = edgeMatch[1];
  } else if (ua.includes('opera')) {
    result.browser = 'Opera';
    const operaMatch = ua.match(/opr\/([\d.]+)/);
    if (operaMatch) result.browserVersion = operaMatch[1];
  } else if (ua.includes('brave')) {
    result.browser = 'Brave';
  }
  
  // OS detection
  if (ua.includes('windows')) result.os = 'Windows';
  else if (ua.includes('mac os') || ua.includes('macintosh')) result.os = 'macOS';
  else if (ua.includes('linux')) result.os = 'Linux';
  else if (ua.includes('android')) result.os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone')) result.os = 'iOS';
  else if (ua.includes('x11')) result.os = 'Unix';
  
  return result;
};

// Get real client IP
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         '0.0.0.0';
};

// ==================== CREATE SESSION (WITH REAL-TIME DATA) ====================
exports.createSession = async (req, res) => {
  try {
    const { userId, userAgent } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Get real IP from request
    const clientIP = getClientIP(req);
    
    // Get location from IP
    const location = getLocationFromIP(clientIP);
    
    // Parse user agent for detailed info
    const deviceInfo = parseUserAgent(userAgent || req.headers['user-agent'] || '');
    
    // Check for existing active session
    const existingSession = await SessionLog.findOne({
      userId,
      sessionStatus: 'active'
    });
    
    if (existingSession) {
      // Update existing session with new activity
      existingSession.lastActivity = new Date();
      existingSession.activities.push({
        action: 'reconnected',
        details: 'User reconnected to session',
        timestamp: new Date()
      });
      
      // Update IP and location if changed
      if (clientIP !== existingSession.ip) {
        existingSession.ip = clientIP;
        existingSession.location = location;
      }
      
      await existingSession.save();
      
      return res.status(200).json({
        success: true,
        message: 'Using existing active session',
        data: existingSession
      });
    }
    
    const sessionData = {
      userId,
      userName: req.user?.firstName ? `${req.user.firstName} ${req.user.lastName}` : 'Unknown User',
      userEmail: req.user?.email || 'No email',
      userRole: req.user?.role || 'employee',
      ip: clientIP,
      device: deviceInfo.device,
      browser: deviceInfo.browser,
      browserVersion: deviceInfo.browserVersion,
      os: deviceInfo.os,
      location: location,
      loginAt: new Date(),
      lastActivity: new Date(),
      sessionStatus: 'active',
      isActive: true,
      activities: [{
        action: 'login',
        details: 'User logged in successfully',
        timestamp: new Date(),
        ip: clientIP,
        location: `${location.city}, ${location.country}`
      }],
      userAgent: userAgent || req.headers['user-agent'] || ''
    };
    
    const session = new SessionLog(sessionData);
    await session.save();
    
    console.log(`✅ New session created: ${session._id} for user: ${userId}`);
    console.log(`📍 Location: ${location.city}, ${location.country}`);
    console.log(`💻 Device: ${deviceInfo.device} • ${deviceInfo.os} • ${deviceInfo.browser}`);
    
    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      data: session
    });
    
  } catch (error) {
    console.error('❌ createSession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session',
      error: error.message
    });
  }
};

// ==================== UPDATE SESSION ACTIVITY (REAL-TIME) ====================
exports.updateSessionActivity = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    const session = await SessionLog.findOne({
      userId,
      sessionStatus: 'active'
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'No active session found'
      });
    }
    
    // Update last activity time
    session.lastActivity = new Date();
    
    // Add activity if provided
    if (req.body.action) {
      session.activities.push({
        action: req.body.action,
        details: req.body.details || 'User activity',
        timestamp: new Date(),
        ip: session.ip,
        location: `${session.location?.city || 'Unknown'}, ${session.location?.country || 'Unknown'}`
      });
    }
    
    await session.save();
    
    res.status(200).json({
      success: true,
      message: 'Session activity updated',
      data: {
        sessionId: session._id,
        lastActivity: session.lastActivity
      }
    });
    
  } catch (error) {
    console.error('❌ updateSessionActivity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update session activity',
      error: error.message
    });
  }
};

// ==================== GET MY SESSIONS (EMPLOYEE) - WITH REAL-TIME DATA ====================
exports.getMySessions = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    const sessions = await SessionLog.find({ userId })
      .sort({ loginAt: -1 })
      .lean();
    
    const formattedSessions = sessions.map(session => {
      const deviceInfo = parseUserAgent(session.userAgent);
      
      let locationString = 'Location not available';
      if (session.location) {
        if (session.location.city && session.location.country) {
          locationString = `${session.location.city}, ${session.location.country}`;
          if (session.location.region && session.location.region !== session.location.city) {
            locationString = `${session.location.city}, ${session.location.region}, ${session.location.country}`;
          }
        } else if (session.ip) {
          locationString = `IP: ${session.ip}`;
        }
      }
      
      let durationMinutes = 0;
      if (session.loginAt && session.logoutAt) {
        durationMinutes = Math.round((new Date(session.logoutAt) - new Date(session.loginAt)) / (1000 * 60));
      } else if (session.loginAt && session.sessionStatus === 'active') {
        durationMinutes = Math.round((new Date() - new Date(session.loginAt)) / (1000 * 60));
      }
      
      // Get current session real-time status
      const isCurrentlyActive = session.sessionStatus === 'active' && 
                               session.lastActivity && 
                               (new Date() - new Date(session.lastActivity) < 5 * 60 * 1000); // 5 minutes
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        userId: session.userId,
        userName: session.userName || `${req.user.firstName} ${req.user.lastName}`,
        userEmail: session.userEmail || req.user.email,
        userRole: session.userRole || req.user.role,
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        lastActivity: session.lastActivity,
        formattedLogin: formatDate(session.loginAt),
        formattedLogout: session.logoutAt ? formatDate(session.logoutAt) : 
                       (isCurrentlyActive ? 'Active Now' : 'Inactive'),
        durationMinutes: durationMinutes,
        formattedDuration: formatDuration(durationMinutes),
        status: session.sessionStatus,
        statusColor: getStatusColor(session.sessionStatus),
        isActive: isCurrentlyActive,
        ip: session.ip || 'No IP',
        device: session.device || deviceInfo.device,
        browser: session.browser || deviceInfo.browser,
        browserVersion: session.browserVersion || deviceInfo.browserVersion,
        os: session.os || deviceInfo.os,
        location: session.location || {},
        locationString: locationString,
        userAgent: session.userAgent,
        activities: session.activities || [],
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        // Real-time indicators
        realTime: {
          lastSeen: session.lastActivity ? 
                   Math.round((new Date() - new Date(session.lastActivity)) / 1000) + ' seconds ago' : 
                   'Unknown',
          isOnline: isCurrentlyActive,
          connectionType: session.device === 'Mobile' ? 'Mobile Data/WiFi' : 
                         session.device === 'Tablet' ? 'Tablet WiFi' : 'Desktop Ethernet/WiFi'
        }
      };
    });

    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions`,
      data: formattedSessions,
      total: sessions.length
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

// ==================== GET ALL SESSIONS (ADMIN) - WITH REAL-TIME DATA ====================
exports.getAllSessions = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const sessions = await SessionLog.find()
      .sort({ loginAt: -1 })
      .lean();
    
    const formattedSessions = sessions.map(session => {
      const deviceInfo = parseUserAgent(session.userAgent);
      
      let locationString = 'Unknown Location';
      if (session.location) {
        if (session.location.city && session.location.country) {
          locationString = `${session.location.city}, ${session.location.country}`;
          if (session.location.region && session.location.region !== session.location.city) {
            locationString = `${session.location.city}, ${session.location.region}, ${session.location.country}`;
          }
        } else if (session.ip) {
          locationString = `IP: ${session.ip}`;
        }
      }
      
      let durationMinutes = 0;
      if (session.loginAt && session.logoutAt) {
        durationMinutes = Math.round((new Date(session.logoutAt) - new Date(session.loginAt)) / (1000 * 60));
      } else if (session.loginAt && session.sessionStatus === 'active') {
        durationMinutes = Math.round((new Date() - new Date(session.loginAt)) / (1000 * 60));
      }
      
      // Real-time activity check
      const isCurrentlyActive = session.sessionStatus === 'active' && 
                               session.lastActivity && 
                               (new Date() - new Date(session.lastActivity) < 5 * 60 * 1000);
      
      return {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        userId: session.userId,
        userName: session.userName || 'Unknown User',
        userEmail: session.userEmail || 'No email',
        userRole: session.userRole || 'employee',
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        lastActivity: session.lastActivity,
        formattedLogin: formatDate(session.loginAt),
        formattedLogout: session.logoutAt ? formatDate(session.logoutAt) : 
                       (isCurrentlyActive ? 'Active Now' : 'Inactive'),
        durationMinutes: durationMinutes,
        formattedDuration: formatDuration(durationMinutes),
        status: session.sessionStatus,
        statusColor: getStatusColor(session.sessionStatus),
        isActive: isCurrentlyActive,
        ip: session.ip || 'No IP',
        device: session.device || deviceInfo.device,
        browser: session.browser || deviceInfo.browser,
        browserVersion: session.browserVersion || deviceInfo.browserVersion,
        os: session.os || deviceInfo.os,
        location: session.location || {},
        locationString: locationString,
        userAgent: session.userAgent,
        activities: session.activities || [],
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        // Real-time data
        realTime: {
          lastSeen: session.lastActivity ? 
                   Math.round((new Date() - new Date(session.lastActivity)) / 1000) + ' seconds ago' : 
                   'Unknown',
          isOnline: isCurrentlyActive,
          timezone: session.location?.timezone || 'Unknown'
        }
      };
    });

    res.status(200).json({
      success: true,
      message: `Found ${sessions.length} sessions`,
      data: formattedSessions,
      total: sessions.length
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

// ==================== GET SESSION DETAILS WITH REAL-TIME INFO ====================
exports.getSessionDetails = async (req, res) => {
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
    
    // Check permission: employee can only view their own sessions
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      const userId = validateUserId(req.user);
      if (session.userId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own sessions.'
        });
      }
    }
    
    const deviceInfo = parseUserAgent(session.userAgent);
    
    let locationString = 'Location not available';
    if (session.location) {
      if (session.location.city && session.location.country) {
        locationString = `${session.location.city}, ${session.location.country}`;
        if (session.location.region && session.location.region !== session.location.city) {
          locationString = `${session.location.city}, ${session.location.region}, ${session.location.country}`;
        }
      } else if (session.ip) {
        locationString = `IP: ${session.ip}`;
      }
    }
    
    let durationMinutes = 0;
    if (session.loginAt && session.logoutAt) {
      durationMinutes = Math.round((new Date(session.logoutAt) - new Date(session.loginAt)) / (1000 * 60));
    } else if (session.loginAt && session.sessionStatus === 'active') {
      durationMinutes = Math.round((new Date() - new Date(session.loginAt)) / (1000 * 60));
    }
    
    // Real-time activity status
    const isCurrentlyActive = session.sessionStatus === 'active' && 
                             session.lastActivity && 
                             (new Date() - new Date(session.lastActivity) < 5 * 60 * 1000);
    
    const formattedSession = {
      id: session._id,
      sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
      userId: session.userId,
      userName: session.userName || 'Unknown User',
      userEmail: session.userEmail || 'No email',
      userRole: session.userRole || 'employee',
      loginAt: session.loginAt,
      logoutAt: session.logoutAt,
      lastActivity: session.lastActivity,
      formattedLogin: formatDate(session.loginAt),
      formattedLogout: session.logoutAt ? formatDate(session.logoutAt) : 
                     (isCurrentlyActive ? 'Active Now' : 'Inactive'),
      sessionStatus: session.sessionStatus,
      statusColor: getStatusColor(session.sessionStatus),
      isActive: isCurrentlyActive,
      durationMinutes: durationMinutes,
      formattedDuration: formatDuration(durationMinutes),
      ip: session.ip,
      device: session.device || deviceInfo.device,
      browser: session.browser || deviceInfo.browser,
      browserVersion: session.browserVersion || deviceInfo.browserVersion,
      os: session.os || deviceInfo.os,
      location: session.location || {},
      locationString: locationString,
      userAgent: session.userAgent,
      activities: session.activities || [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      // Real-time data
      realTimeData: {
        currentStatus: isCurrentlyActive ? 'Online' : 'Offline',
        lastSeen: session.lastActivity ? 
                 Math.round((new Date() - new Date(session.lastActivity)) / 1000) + ' seconds ago' : 
                 'Unknown',
        connectionDuration: formatDuration(durationMinutes),
        locationDetails: {
          city: session.location?.city || 'Unknown',
          country: session.location?.country || 'Unknown',
          region: session.location?.region || 'Unknown',
          coordinates: session.location?.lat && session.location?.lon ? 
                      `${session.location.lat}, ${session.location.lon}` : 'Unknown',
          timezone: session.location?.timezone || 'Unknown'
        },
        deviceDetails: {
          type: deviceInfo.device,
          isMobile: deviceInfo.isMobile,
          isTablet: deviceInfo.isTablet,
          isDesktop: deviceInfo.isDesktop,
          browserWithVersion: `${deviceInfo.browser} ${deviceInfo.browserVersion || ''}`.trim(),
          operatingSystem: deviceInfo.os
        }
      }
    };
    
    res.status(200).json({
      success: true,
      message: 'Session details retrieved',
      data: formattedSession
    });
    
  } catch (error) {
    console.error('❌ getSessionDetails error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session details',
      error: error.message
    });
  }
};

// ==================== LOGOUT (END SESSION) - FIXED VERSION ====================
exports.logoutSession = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    console.log(`🔍 Logging out user: ${userId}`);
    
    // Find ALL active sessions for this user
    const activeSessions = await SessionLog.find({
      userId,
      sessionStatus: 'active'
    });
    
    console.log(`📊 Found ${activeSessions.length} active sessions to logout`);
    
    if (activeSessions.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active sessions found to logout',
        data: null
      });
    }
    
    // Update all active sessions
    const updatePromises = activeSessions.map(async (session) => {
      session.sessionStatus = 'completed';
      session.logoutAt = new Date();
      session.isActive = false;
      session.lastActivity = new Date();
      
      session.activities.push({
        action: 'logout',
        details: 'User logged out normally',
        timestamp: new Date(),
        ip: session.ip,
        location: `${session.location?.city || 'Unknown'}, ${session.location?.country || 'Unknown'}`
      });
      
      console.log(`✅ Logging out session: ${session._id}`);
      return session.save();
    });
    
    await Promise.all(updatePromises);
    
    console.log(`✅ Successfully logged out ${activeSessions.length} sessions`);
    
    res.status(200).json({
      success: true,
      message: `Successfully logged out from ${activeSessions.length} session(s)`,
      data: {
        sessionsEnded: activeSessions.length,
        logoutTime: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ logoutSession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout',
      error: error.message,
      stack: error.stack
    });
  }
};

// ==================== AUTO CLEANUP INACTIVE SESSIONS ====================
exports.autoCleanupSessions = async () => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Find sessions that have been inactive for 24+ hours but still marked as active
    const inactiveSessions = await SessionLog.find({
      sessionStatus: 'active',
      lastActivity: { $lt: twentyFourHoursAgo }
    });
    
    console.log(`🔄 Found ${inactiveSessions.length} inactive sessions to cleanup`);
    
    if (inactiveSessions.length === 0) {
      return { success: true, message: 'No inactive sessions found' };
    }
    
    const updatePromises = inactiveSessions.map(async (session) => {
      session.sessionStatus = 'expired';
      session.logoutAt = new Date();
      session.isActive = false;
      
      session.activities.push({
        action: 'auto_logout',
        details: 'Session automatically expired due to 24 hours of inactivity',
        timestamp: new Date(),
        ip: session.ip,
        location: `${session.location?.city || 'Unknown'}, ${session.location?.country || 'Unknown'}`
      });
      
      return session.save();
    });
    
    await Promise.all(updatePromises);
    
    console.log(`✅ Cleaned up ${inactiveSessions.length} inactive sessions`);
    
    return {
      success: true,
      message: `Cleaned up ${inactiveSessions.length} inactive sessions`,
      cleanedCount: inactiveSessions.length
    };
    
  } catch (error) {
    console.error('❌ autoCleanupSessions error:', error);
    throw error;
  }
};

// ==================== GET REAL-TIME SESSION STATS ====================
exports.getRealTimeStats = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superAdmin';
    
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let query = {};
    if (!isAdmin) {
      query.userId = userId;
    }
    
    const [
      totalSessions,
      activeSessions,
      activeNowSessions,
      todaySessions,
      lastHourSessions
    ] = await Promise.all([
      SessionLog.countDocuments(query),
      SessionLog.countDocuments({ ...query, sessionStatus: 'active' }),
      SessionLog.countDocuments({ 
        ...query, 
        sessionStatus: 'active',
        lastActivity: { $gte: fiveMinutesAgo }
      }),
      SessionLog.countDocuments({ 
        ...query, 
        loginAt: { $gte: todayStart }
      }),
      SessionLog.countDocuments({ 
        ...query, 
        loginAt: { $gte: oneHourAgo }
      })
    ]);
    
    // Get unique devices and locations
    const uniqueDevices = await SessionLog.distinct('device', query);
    const uniqueLocations = await SessionLog.distinct('locationString', query);
    
    res.status(200).json({
      success: true,
      message: 'Real-time session statistics',
      data: {
        summary: {
          totalSessions,
          activeSessions,
          activeNow: activeNowSessions,
          todaySessions,
          lastHourSessions
        },
        devices: {
          total: uniqueDevices.length,
          list: uniqueDevices.filter(Boolean)
        },
        locations: {
          total: uniqueLocations.length,
          list: uniqueLocations.filter(Boolean).slice(0, 10) // Top 10 locations
        },
        timestamp: now
      }
    });
    
  } catch (error) {
    console.error('❌ getRealTimeStats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch real-time stats',
      error: error.message
    });
  }
};

// ==================== DELETE SESSION (ADMIN ONLY) ====================
exports.deleteSession = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
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
    
    const session = await SessionLog.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    await SessionLog.findByIdAndDelete(sessionId);
    
    res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
      deletedSession: {
        id: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        userName: session.userName,
        userEmail: session.userEmail,
        loginAt: session.loginAt
      }
    });
    
  } catch (error) {
    console.error('❌ deleteSession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session',
      error: error.message
    });
  }
};

// ==================== TERMINATE SESSION (ADMIN ONLY) ====================
exports.terminateSession = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
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
    
    const session = await SessionLog.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    session.sessionStatus = 'terminated';
    session.logoutAt = new Date();
    session.isActive = false;
    session.lastActivity = new Date();
    
    session.activities.push({
      action: 'session_terminated',
      details: 'Session terminated by admin',
      timestamp: new Date(),
      performedBy: `${req.user.firstName} ${req.user.lastName}`,
      ip: session.ip,
      location: `${session.location?.city || 'Unknown'}, ${session.location?.country || 'Unknown'}`
    });
    
    await session.save();
    
    res.status(200).json({
      success: true,
      message: 'Session terminated successfully',
      data: {
        sessionId: session._id,
        sessionNumber: `SESS-${session._id.toString().slice(-6).toUpperCase()}`,
        terminatedAt: new Date(),
        terminatedBy: `${req.user.firstName} ${req.user.lastName}`
      }
    });
    
  } catch (error) {
    console.error('❌ terminateSession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to terminate session',
      error: error.message
    });
  }
};

// ==================== GET CURRENT SESSION WITH REAL-TIME DATA ====================
exports.getCurrentSession = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    
    const currentSession = await SessionLog.findOne({
      userId,
      sessionStatus: 'active'
    }).sort({ loginAt: -1 }).lean();
    
    if (!currentSession) {
      return res.status(200).json({
        success: true,
        message: 'No active session found',
        hasActiveSession: false,
        data: null
      });
    }
    
    const deviceInfo = parseUserAgent(currentSession.userAgent);
    
    let locationString = 'Location not available';
    if (currentSession.location) {
      if (currentSession.location.city && currentSession.location.country) {
        locationString = `${currentSession.location.city}, ${currentSession.location.country}`;
      } else if (currentSession.ip) {
        locationString = `IP: ${currentSession.ip}`;
      }
    }
    
    const durationMinutes = Math.round((new Date() - currentSession.loginAt) / (1000 * 60));
    const lastActivitySeconds = Math.round((new Date() - currentSession.lastActivity) / 1000);
    const isCurrentlyActive = lastActivitySeconds < 300; // 5 minutes
    
    const formattedSession = {
      id: currentSession._id,
      sessionNumber: `SESS-${currentSession._id.toString().slice(-6).toUpperCase()}`,
      userId: currentSession.userId,
      userName: currentSession.userName || `${req.user.firstName} ${req.user.lastName}`,
      userRole: currentSession.userRole || req.user.role,
      loginAt: currentSession.loginAt,
      lastActivity: currentSession.lastActivity,
      formattedLogin: formatDate(currentSession.loginAt),
      sessionDuration: formatDuration(durationMinutes),
      status: getStatusColor(currentSession.sessionStatus),
      isActive: isCurrentlyActive,
      ip: currentSession.ip,
      device: currentSession.device || deviceInfo.device,
      browser: currentSession.browser || deviceInfo.browser,
      browserVersion: currentSession.browserVersion || deviceInfo.browserVersion,
      os: currentSession.os || deviceInfo.os,
      locationString: locationString,
      location: currentSession.location || {},
      activities: currentSession.activities || [],
      // Real-time info
      realTime: {
        lastSeen: `${lastActivitySeconds} seconds ago`,
        isOnline: isCurrentlyActive,
        connectionType: currentSession.device === 'Mobile' ? 'Mobile Data/WiFi' : 
                       currentSession.device === 'Tablet' ? 'Tablet WiFi' : 'Desktop Ethernet/WiFi'
      }
    };
    
    res.status(200).json({
      success: true,
      message: 'Current session found',
      hasActiveSession: true,
      data: formattedSession
    });
    
  } catch (error) {
    console.error('❌ getCurrentSession error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current session',
      error: error.message
    });
  }
};

// ==================== SIMPLE STATISTICS WITH REAL-TIME DATA ====================
exports.getSimpleStats = async (req, res) => {
  try {
    const userId = validateUserId(req.user);
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superAdmin';
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let query = { loginAt: { $gte: thirtyDaysAgo } };
    if (!isAdmin) {
      query.userId = userId;
    }
    
    const sessions = await SessionLog.find(query).lean();
    
    if (!isAdmin) {
      // Employee stats
      const activeSession = await SessionLog.findOne({
        userId,
        sessionStatus: 'active'
      });
      
      const totalDuration = sessions.reduce((sum, session) => {
        if (session.loginAt && session.logoutAt) {
          return sum + Math.round((session.logoutAt - session.loginAt) / (1000 * 60));
        } else if (session.loginAt && session.sessionStatus === 'active') {
          return sum + Math.round((new Date() - session.loginAt) / (1000 * 60));
        }
        return sum;
      }, 0);
      
      res.status(200).json({
        success: true,
        message: 'Your session statistics',
        stats: {
          totalSessions: sessions.length,
          activeSession: !!activeSession,
          totalDuration: formatDuration(totalDuration),
          avgSessionDuration: formatDuration(sessions.length > 0 ? totalDuration / sessions.length : 0),
          lastLogin: sessions.length > 0 ? formatDate(sessions[0].loginAt) : 'Never',
          // Real-time data
          currentDevice: activeSession?.device || 'None',
          currentLocation: activeSession?.location?.city ? 
                         `${activeSession.location.city}, ${activeSession.location.country}` : 
                         'Unknown',
          currentBrowser: activeSession?.browser || 'None'
        }
      });
    } else {
      // Admin stats
      const [totalSessions, activeSessions, uniqueUsers] = await Promise.all([
        SessionLog.countDocuments(query),
        SessionLog.countDocuments({ 
          sessionStatus: 'active',
          loginAt: { $gte: thirtyDaysAgo }
        }),
        SessionLog.distinct('userId', query)
      ]);
      
      // Get real-time active sessions
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activeNowSessions = await SessionLog.countDocuments({ 
        sessionStatus: 'active',
        lastActivity: { $gte: fiveMinutesAgo }
      });
      
      res.status(200).json({
        success: true,
        message: 'Admin session statistics',
        stats: {
          totalSessions,
          activeSessions,
          activeNowSessions,
          uniqueUsers: uniqueUsers.length,
          sessionsPerDay: (totalSessions / 30).toFixed(1),
          // Real-time insights
          currentOnline: activeNowSessions,
          offlineButActive: activeSessions - activeNowSessions
        }
      });
    }
    
  } catch (error) {
    console.error('❌ getSimpleStats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};