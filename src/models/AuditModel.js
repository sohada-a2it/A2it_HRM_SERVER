// models/AuditModel.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
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
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  },
  duration: {
    type: Number, // in milliseconds
    default: 0
  }
}, { 
  timestamps: true 
});

// Compound indexes for better query performance
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;