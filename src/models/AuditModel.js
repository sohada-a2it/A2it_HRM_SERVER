// models/AuditModel.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  action: { 
    type: String, 
    required: true,
    enum: [
      'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 
      'VIEW', 'EXPORT', 'PASSWORD_CHANGE', 'PROFILE_UPDATE',
      'SETTINGS_CHANGE', 'SYSTEM', 'ERROR', 'SECURITY'
    ]
  },
  target: { 
    type: String 
  },
  details: { 
    type: mongoose.Schema.Types.Mixed 
  },
  ip: { 
    type: String,
    required: true 
  },
  device: { 
    type: String,
    required: true 
  },
  browser: { 
    type: String 
  },
  os: { 
    type: String 
  },
  location: {
    type: String
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'WARNING'],
    default: 'SUCCESS'
  },
  sessionId: {
    type: String
  },
  userAgent: {
    type: String
  }
}, { 
  timestamps: true 
});

// Index for faster queries
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);