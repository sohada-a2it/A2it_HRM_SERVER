// server.js or app.js - Add this to your main server file
const schedule = require('node-schedule');
const SessionLog = require('../models/SessionLogModel');

// Schedule auto-delete job to run daily at 2:00 AM
schedule.scheduleJob('0 2 * * *', async () => {
  console.log('🕒 Running scheduled session cleanup...');
  
  try {
    const deletedCount = await SessionLog.cleanupExpiredSessions();
    console.log(`✅ Cleaned up ${deletedCount} expired sessions`);
    
    // Log the cleanup
    const CleanupLog = require('./models/CleanupLogModel');
    await CleanupLog.create({
      type: 'scheduled_cleanup',
      deletedCount,
      timestamp: new Date(),
      details: `Auto-deleted ${deletedCount} sessions older than 30 days`
    });
    
  } catch (error) {
    console.error('❌ Scheduled cleanup error:', error.message);
  }
});

// Optional: Monthly summary report
schedule.scheduleJob('0 0 1 * *', async () => {
  console.log('📊 Generating monthly session report...');
  
  try {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const monthlyStats = await SessionLog.aggregate([
      {
        $match: {
          loginAt: { $gte: lastMonth },
          sessionStatus: { $in: ['completed', 'expired', 'terminated'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalHours: { $sum: '$totalHours' },
          uniqueUsers: { $addToSet: '$userId' },
          autoDeleted: { 
            $sum: { 
              $cond: [{ $lte: ['$autoDeleteDate', new Date()] }, 1, 0] 
            } 
          }
        }
      }
    ]);
    
    console.log('📈 Monthly Session Report:', monthlyStats[0] || {});
    
  } catch (error) {
    console.error('❌ Monthly report error:', error.message);
  }
});