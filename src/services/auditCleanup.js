const cron = require('node-cron');
const AuditService = require('../services/auditServiceCron');

// Run cleanup every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('🕒 Running scheduled audit log cleanup...');
  try {
    const result = await AuditService.cleanupOldLogs(30);
    console.log(`✅ Cleanup completed. Deleted ${result?.deletedCount || 0} logs.`);
  } catch (error) {
    console.error('❌ Cleanup job failed:', error);
  }
});

console.log('⏰ Audit log cleanup scheduler started');