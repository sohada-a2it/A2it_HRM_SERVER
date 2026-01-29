// models/AuditModel.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // ============ REQUIRED FIELDS ============
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true 
  },
  userRole: {  // ✅ ADD THIS
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
  
  // ============ OPTIONAL FIELDS ============
  target: { 
    type: String,
    default: null 
  },
  targetId: {  // ✅ ADD FOR BETTER QUERYING
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  details: { 
    type: mongoose.Schema.Types.Mixed,
    default: {} 
  },
  
  // ============ TECHNICAL INFO ============
  ip: { 
    type: String,
    default: 'Unknown' 
  },
  device: { 
    type: String,
    default: 'Unknown' 
  },
  browser: {  // ✅ ADD FOR BETTER TRACKING
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
  
  // ============ STATUS & METRICS ============
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  },
  severity: {  // ✅ ADD FOR PRIORITY
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  duration: {
    type: Number,
    default: 0
  },
  errorMessage: {  // ✅ ADD FOR FAILED LOGS
    type: String,
    default: null
  },
  
  // ============ AUTO-CLEANUP ============
  expiresAt: {  // ✅ ADD FOR AUTO DELETE
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: { expires: 0 }
  }
  
}, { 
  timestamps: true,
  collection: 'auditlogs' // ✅ Explicit collection name
});

// ============ COMPOUND INDEXES ============
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ userRole: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// ============ STATIC METHODS ============
auditLogSchema.statics.createLog = async function(logData) {
  try {
    // Ensure required fields
    const log = {
      ...logData,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
    
    return await this.create(log);
  } catch (error) {
    console.error('Audit log creation error:', error);
    
    // Fallback: Save error log in database
    try {
      await this.create({
        userId: logData.userId || null,
        userRole: 'system',
        action: 'AUDIT_LOG_ERROR',
        details: {
          originalAction: logData.action,
          error: error.message,
          timestamp: new Date()
        },
        status: 'failed',
        severity: 'high'
      });
    } catch (fallbackError) {
      console.error('Even fallback audit log failed:', fallbackError);
    }
    
    return null;
  }
};

auditLogSchema.statics.cleanOldLogs = async function(days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.deleteMany({ createdAt: { $lt: cutoffDate } });
    console.log(`✅ Cleaned ${result.deletedCount} old audit logs`);
    return result;
  } catch (error) {
    console.error('❌ Clean old logs error:', error);
    return null;
  }
};

// ============ PRE-SAVE HOOK ============
auditLogSchema.pre('save', function(next) {
  // Validate userRole if userId is provided
  if (this.userId && !this.userRole) {
    console.warn('⚠️ Audit log saved without userRole:', this.action);
  }
  next();
});

// ============ MODEL EXPORT ============
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;