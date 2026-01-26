// models/MealSubscriptionModel.js
const mongoose = require("mongoose");

const mealSubscriptionSchema = new mongoose.Schema({
  // ============ USER REFERENCE ============
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  userInfo: {
    employeeId: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    department: { type: String, default: '' }
  },
  
  // ============ SUBSCRIPTION SETTINGS ============
  preference: {
    type: String,
    enum: ['office', 'outside'],
    required: true,
    default: 'office'
  },
  
  // ============ STATUS ============
  status: {
    type: String,
    enum: ['active', 'paused', 'cancelled'],
    default: 'active'
  },
  
  autoRenew: {
    type: Boolean,
    default: true // ✅ AUTO-RENEW DEFAULT TRUE
  },
  
  // ============ DATES ============
  startDate: {
    type: Date,
    default: Date.now
  },
  
  // ============ MONTHLY APPROVAL RECORDS ============
  monthlyApprovals: [{
    month: { 
      type: String, 
      required: true 
    }, // Format: "2024-01"
    
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    
    preference: {
      type: String,
      enum: ['office', 'outside']
    },
    
    requestDate: {
      type: Date,
      default: Date.now
    },
    
    approvalDate: {
      type: Date
    },
    
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    note: {
      type: String,
      default: ''
    },
    
    // For payroll reference only (will be updated by payroll system)
    mealDays: {
      type: Number,
      default: 0
    }
  }],
  
  // ============ CANCELLATION ============
  cancelledAt: {
    type: Date
  },
  
  cancellationReason: {
    type: String,
    default: ''
  },
  
  // ============ PAUSE FUNCTIONALITY ============
  isPaused: {
    type: Boolean,
    default: false
  },
  
  pauseStartDate: {
    type: Date
  },
  
  pauseEndDate: {
    type: Date
  },
  
  pauseReason: {
    type: String,
    default: ''
  },
  
  // ============ SYSTEM ============
  notes: {
    type: String,
    default: ''
  },
  
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// ============ INDEXES ============
mealSubscriptionSchema.index({ user: 1 });
mealSubscriptionSchema.index({ status: 1 });
mealSubscriptionSchema.index({ autoRenew: 1 });
mealSubscriptionSchema.index({ 'monthlyApprovals.month': 1 });
mealSubscriptionSchema.index({ 'userInfo.employeeId': 1 });

// ============ VIRTUAL PROPERTIES ============
mealSubscriptionSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.isPaused;
});

mealSubscriptionSchema.virtual('currentMonthApproval').get(function() {
  const currentMonth = new Date().toISOString().slice(0, 7); // "2024-01"
  return this.monthlyApprovals.find(record => record.month === currentMonth);
});

// ============ METHODS ============
// Check if approved for specific month
mealSubscriptionSchema.methods.isApprovedForMonth = function(month) {
  const approval = this.monthlyApprovals.find(a => a.month === month);
  return approval && approval.status === 'approved';
};

// Add monthly approval request
mealSubscriptionSchema.methods.addMonthlyApproval = function(month, preference) {
  const existing = this.monthlyApprovals.find(a => a.month === month);
  
  if (existing) {
    existing.preference = preference;
    existing.status = 'pending';
    existing.requestDate = new Date();
  } else {
    this.monthlyApprovals.push({
      month: month,
      preference: preference,
      status: 'pending',
      requestDate: new Date()
    });
  }
};

// Approve for specific month
mealSubscriptionSchema.methods.approveForMonth = function(month, approvedBy, note = '') {
  const approval = this.monthlyApprovals.find(a => a.month === month);
  
  if (approval) {
    approval.status = 'approved';
    approval.approvalDate = new Date();
    approval.approvedBy = approvedBy;
    approval.note = note;
    return true;
  }
  return false;
};

// ============ STATIC METHODS ============
// Get active subscriptions for specific month
mealSubscriptionSchema.statics.getApprovedForMonth = function(month) {
  return this.find({
    status: 'active',
    isPaused: false,
    'monthlyApprovals.month': month,
    'monthlyApprovals.status': 'approved',
    isDeleted: false
  });
};

// Get subscriptions needing approval for month
mealSubscriptionSchema.statics.getPendingForMonth = function(month) {
  return this.find({
    status: 'active',
    isPaused: false,
    'monthlyApprovals.month': month,
    'monthlyApprovals.status': 'pending',
    isDeleted: false
  });
};

module.exports = mongoose.model("MealSubscription", mealSubscriptionSchema);