const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  userRole: {
    type: String,
    enum: ['admin', 'employee', 'moderator', 'superAdmin'],
    required: true,
    index: true
  },
  action: { 
    type: String, 
    required: true,
    index: true 
  },
  target: { 
    type: String,
    default: null 
  },
  details: { 
    type: mongoose.Schema.Types.Mixed,
    default: {} 
  },
  ip: { 
    type: String,
    default: 'Unknown' 
  },
  device: { 
    type: String,
    default: 'Unknown' 
  },
  browser: {
    type: String,
    default: 'Unknown'
  },
  os: {
    type: String,
    default: 'Unknown'
  },
  location: {
    type: String,
    default: 'Unknown'
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  duration: {
    type: Number,
    default: 0
  },
  // TTL index এর জন্য সঠিক ফরম্যাট
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    index: { expires: 0 } // ✅ সঠিক ফরম্যাট
  }
}, { 
  timestamps: true,
  collection: 'auditlogs' // collection নাম আলাদাভাবে নির্দিষ্ট করুন
});

// Compound indexes
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ userRole: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Static methods
auditLogSchema.statics.createLog = async function(logData) {
  try {
    return await this.create({
      ...logData,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    console.error('Audit log creation error:', error);
    return null;
  }
};

auditLogSchema.statics.cleanOldLogs = async function(days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.deleteMany({ createdAt: { $lt: cutoffDate } });
    console.log(`Cleaned ${result.deletedCount} old audit logs`);
    return result;
  } catch (error) {
    console.error('Clean old logs error:', error);
    return null;
  }
};

// ✅ Model নাম Controller-এর সাথে মিলিয়ে দিন
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;