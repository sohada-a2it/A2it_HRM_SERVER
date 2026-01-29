// Backup হিসেবে cron job setup করুন
const cron = require('node-cron');
const AuditLog = require('../models/AuditModel');

// প্রতিদিন রাত 3টায় old logs clean করবে
cron.schedule('0 3 * * *', async () => {
  console.log('Running manual audit log cleanup...');
  const result = await AuditLog.cleanOldLogs(30);
  console.log(`Cleaned ${result?.deletedCount || 0} logs`);
});

// অথবা শুধু startup-এ TTL verify করুন
async function ensureTTLIndex() {
  try {
    const indexes = await AuditLog.collection.indexes();
    const hasTTL = indexes.some(idx => idx.expireAfterSeconds !== undefined);
    
    if (!hasTTL) {
      console.log('Creating TTL index...');
      await AuditLog.collection.createIndex(
        { expiresAt: 1 }, 
        { expireAfterSeconds: 0 }
      );
      console.log('✅ TTL index created successfully');
    } else {
      console.log('✅ TTL index already exists');
    }
  } catch (error) {
    console.error('TTL index creation failed:', error);
  }
}

// App startup-এ call করুন
ensureTTLIndex();