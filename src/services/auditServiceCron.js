const AuditLog = require('../models/AuditModel');
const detectDevice = (userAgent) => {
  const ua = userAgent.toLowerCase();
  
  // Detect device type
  let device = 'Unknown Device';
  let deviceType = 'unknown';
  let browser = 'Unknown';
  let os = 'Unknown';
  let browserVersion = 'Unknown';
  let osVersion = 'Unknown';
  
  try {
    // Detect OS
    if (ua.includes('windows')) {
      os = 'Windows';
      if (ua.includes('windows nt 10')) osVersion = '10';
      else if (ua.includes('windows nt 6.3')) osVersion = '8.1';
      else if (ua.includes('windows nt 6.2')) osVersion = '8';
      else if (ua.includes('windows nt 6.1')) osVersion = '7';
    } else if (ua.includes('mac os') || ua.includes('macintosh')) {
      os = 'macOS';
      const match = ua.match(/mac os x (\d+[._]\d+)/);
      if (match) osVersion = match[1].replace(/_/g, '.');
    } else if (ua.includes('android')) {
      os = 'Android';
      const match = ua.match(/android (\d+\.?\d*)/);
      if (match) osVersion = match[1];
    } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
      os = ua.includes('ipad') ? 'iPadOS' : 'iOS';
      const match = ua.match(/(iphone|ipad) os (\d+[._]\d+)/);
      if (match) osVersion = match[2].replace(/_/g, '.');
    } else if (ua.includes('linux')) {
      os = 'Linux';
    }
    
    // Detect Browser
    if (ua.includes('chrome') && !ua.includes('edg')) {
      browser = 'Chrome';
      const match = ua.match(/chrome\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('firefox')) {
      browser = 'Firefox';
      const match = ua.match(/firefox\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      browser = 'Safari';
      const match = ua.match(/version\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('edg')) {
      browser = 'Edge';
      const match = ua.match(/edg\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('opera') || ua.includes('opr')) {
      browser = 'Opera';
      const match = ua.match(/(?:opera|opr)\/(\d+\.?\d*)/);
      if (match) browserVersion = match[1];
    }
    
    // Detect Device Type
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      deviceType = 'mobile';
      if (ua.includes('iphone')) device = 'iPhone';
      else if (ua.includes('android')) device = 'Android Phone';
      else device = 'Mobile Phone';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      deviceType = 'tablet';
      if (ua.includes('ipad')) device = 'iPad';
      else if (ua.includes('android')) device = 'Android Tablet';
      else device = 'Tablet';
    } else if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
      deviceType = 'bot';
      device = 'Bot/Crawler';
    } else {
      deviceType = 'desktop';
      device = os.includes('Windows') ? 'Windows PC' : 
               os.includes('macOS') ? 'Mac' : 
               os.includes('Linux') ? 'Linux PC' : 'Desktop/Laptop';
    }
    
  } catch (error) {
    console.error('Error parsing user agent:', error);
  }
  
  return {
    device,
    deviceType,
    browser,
    browserVersion: browserVersion === 'Unknown' ? undefined : browserVersion,
    os,
    osVersion: osVersion === 'Unknown' ? undefined : osVersion
  };
};
class AuditService {
  
  // Create audit log with proper tech info
  static async createLog(logData, req = null) {
    try {
      console.log('📝 [AuditService] Creating audit log:', {
        action: logData.action,
        userId: logData.userId,
        userRole: logData.userRole
      });
      
      // Get technical info from request
      let techInfo = {};
      if (req) {
        techInfo = await AuditLog.extractTechnicalInfo(req);
        console.log('🖥️ [AuditService] Extracted tech info:', {
          ip: techInfo.ip,
          device: techInfo.device,
          browser: techInfo.browser,
          os: techInfo.os,
          deviceType: techInfo.deviceType
        });
      } else {
        techInfo = AuditLog.getDefaultTechInfo();
      }
      
      // Ensure we have valid user data
      if (!logData.userId) {
        console.warn('⚠️ [AuditService] No userId provided for audit log');
      }
      
      // Merge data
      const auditLog = new AuditLog({
        userId: logData.userId || null,
        userRole: logData.userRole || 'employee',
        action: logData.action || 'UNKNOWN_ACTION',
        target: logData.target || null,
        targetId: logData.targetId || null,
        details: logData.details || {},
        status: logData.status || 'success',
        severity: logData.severity || 'low',
        errorMessage: logData.errorMessage || null,
        duration: logData.duration || 0,
        ...techInfo,
        createdAt: new Date()
      });
      
      // Save log
      const savedLog = await auditLog.save();
      console.log('✅ [AuditService] Audit log saved successfully:', {
        id: savedLog._id,
        action: savedLog.action,
        device: savedLog.device,
        browser: savedLog.browser,
        ip: savedLog.ip
      });
      
      return savedLog;
      
    } catch (error) {
      console.error('❌ [AuditService] Audit log creation error:', error);
      
      // Try to save fallback log
      try {
        const fallbackLog = new AuditLog({
          userId: logData.userId || null,
          userRole: logData.userRole || 'system',
          action: 'AUDIT_LOG_ERROR',
          details: {
            originalAction: logData.action,
            error: error.message,
            stack: error.stack,
            timestamp: new Date()
          },
          status: 'failed',
          severity: 'high',
          ip: req ? AuditLog.extractIP(req) : 'Unknown',
          userAgent: req?.headers?.['user-agent'] || 'Unknown',
          device: 'Unknown',
          deviceType: 'unknown',
          browser: 'Unknown',
          os: 'Unknown',
          location: {
            country: 'Unknown',
            city: 'Unknown',
            region: 'Unknown'
          }
        });
        
        await fallbackLog.save();
        console.log('⚠️ [AuditService] Fallback audit log saved');
        
      } catch (fallbackError) {
        console.error('❌ [AuditService] Fallback log also failed:', fallbackError);
      }
      
      return null;
    }
  }

  // Get logs with tech info for a specific user
  static async getLogsWithTechInfo(userId, page = 1, limit = 20) {
    try {
      console.log(`🔍 [AuditService] Getting logs for user ${userId}`);
      
      const skip = (page - 1) * limit;
      
      // Find logs with all tech fields
      const logs = await AuditLog.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('action details createdAt updatedAt device deviceType browser browserVersion os osVersion location ip userAgent status severity errorMessage');
      
      const total = await AuditLog.countDocuments({ userId });
      
      console.log(`📊 [AuditService] Found ${logs.length} logs with tech info for user ${userId}`);
      
      // Log sample data for debugging
      if (logs.length > 0) {
        const sampleLog = logs[0];
        console.log('📋 [AuditService] Sample log data:', {
          action: sampleLog.action,
          device: sampleLog.device,
          browser: sampleLog.browser,
          ip: sampleLog.ip,
          os: sampleLog.os,
          deviceType: sampleLog.deviceType
        });
      }
      
      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ [AuditService] Error getting logs with tech info:', error);
      throw error;
    }
  }

  // Get logs for admin with full tech info
  static async getAdminLogsWithTechInfo(filter = {}, page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;
      
      const logs = await AuditLog.find(filter)
        .populate('userId', 'firstName lastName email role department avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('action details createdAt device deviceType browser browserVersion os osVersion location ip userAgent status severity userRole');
      
      const total = await AuditLog.countDocuments(filter);
      
      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ [AuditService] Error getting admin logs:', error);
      throw error;
    }
  }

  // Get activity summary for a user
  static async getActivitySummary(userId, days = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const summary = await AuditLog.aggregate([
        {
          $match: {
            userId: require('mongoose').Types.ObjectId(userId),
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
            },
            count: { $sum: 1 },
            devices: { $addToSet: { $ifNull: ["$device", "Unknown"] } },
            browsers: { $addToSet: { $ifNull: ["$browser", "Unknown"] } },
            locations: { $addToSet: { $ifNull: ["$location.country", "Unknown"] } },
            actions: { $push: "$action" },
            successCount: {
              $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] }
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: days }
      ]);
      
      // Get device distribution
      const deviceStats = await AuditLog.aggregate([
        {
          $match: {
            userId: require('mongoose').Types.ObjectId(userId),
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $ifNull: ["$deviceType", "unknown"] },
            count: { $sum: 1 },
            devices: { $addToSet: { $ifNull: ["$device", "Unknown"] } }
          }
        },
        { $sort: { count: -1 } }
      ]);
      
      // Get browser distribution
      const browserStats = await AuditLog.aggregate([
        {
          $match: {
            userId: require('mongoose').Types.ObjectId(userId),
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $ifNull: ["$browser", "Unknown"] },
            count: { $sum: 1 },
            versions: { $addToSet: { $ifNull: ["$browserVersion", "Unknown"] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      return {
        dailyActivity: summary,
        deviceStats,
        browserStats,
        period: `${days} days`
      };
    } catch (error) {
      console.error('❌ [AuditService] Error getting activity summary:', error);
      return {
        dailyActivity: [],
        deviceStats: [],
        browserStats: [],
        period: `${days} days`
      };
    }
  }

  // Cleanup old logs
  static async cleanupOldLogs(days = 30) {
    try {
      console.log(`🧹 [AuditService] Cleaning logs older than ${days} days`);
      const result = await AuditLog.cleanOldLogs(days);
      return result;
    } catch (error) {
      console.error('❌ [AuditService] Cleanup error:', error);
      return null;
    }
  }

  // Get system-wide stats
  static async getSystemStats() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const totalLogs = await AuditLog.countDocuments();
      const todaysLogs = await AuditLog.countDocuments({ createdAt: { $gte: today } });
      
      // Device distribution
      const deviceDistribution = await AuditLog.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$deviceType", "unknown"] },
            count: { $sum: 1 },
            percentage: {
              $round: [
                {
                  $multiply: [
                    { $divide: [{ $sum: 1 }, totalLogs] },
                    100
                  ]
                },
                2
              ]
            }
          }
        },
        { $sort: { count: -1 } }
      ]);
      
      // Browser distribution
      const browserDistribution = await AuditLog.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$browser", "Unknown"] },
            count: { $sum: 1 },
            percentage: {
              $round: [
                {
                  $multiply: [
                    { $divide: [{ $sum: 1 }, totalLogs] },
                    100
                  ]
                },
                2
              ]
            }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      // Top actions
      const topActions = await AuditLog.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$action", "Unknown"] },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      
      // Location stats
      const locationStats = await AuditLog.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$location.country", "Unknown"] },
            count: { $sum: 1 },
            cities: { $addToSet: { $ifNull: ["$location.city", "Unknown"] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      
      return {
        totalLogs,
        todaysLogs,
        deviceDistribution,
        browserDistribution,
        topActions,
        locationStats,
        autoDelete: {
          enabled: true,
          daysToKeep: 30,
          nextCleanup: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      };
    } catch (error) {
      console.error('❌ [AuditService] Error getting system stats:', error);
      throw error;
    }
  }
}

module.exports = AuditService;