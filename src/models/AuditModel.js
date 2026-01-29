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
  // Auto-delete after 30 days
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: { expires: '30d' }
  }
}, { 
  timestamps: true 
});

// Compound indexes for better query performance
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ userRole: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Static method to create audit log for any user
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

// Static method to clean old logs
auditLogSchema.statics.cleanOldLogs = async function(days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.deleteMany({ createdAt: { $lt: cutoffDate } });
    return result;
  } catch (error) {
    console.error('Clean old logs error:', error);
    return null;
  }
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;