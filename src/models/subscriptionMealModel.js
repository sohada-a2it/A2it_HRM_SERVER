const mongoose = require("mongoose");

const mealSubscriptionSchema = new mongoose.Schema({
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
  
  preference: {
    type: String,
    enum: ['office', 'outside'],
    required: true,
    default: 'office'
  },
  
  status: {
    type: String,
    enum: ['active', 'paused', 'cancelled'],
    default: 'active'
  },
  
  autoRenew: {
    type: Boolean,
    default: true
  },
  
  startDate: {
    type: Date,
    default: Date.now
  },
  
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
    
    mealDays: {
      type: Number,
      default: 0
    }
  }],
  
  cancelledAt: {
    type: Date
  },
  
  cancellationReason: {
    type: String,
    default: ''
  },
  
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

// Indexes
mealSubscriptionSchema.index({ user: 1 });
mealSubscriptionSchema.index({ status: 1 });
mealSubscriptionSchema.index({ autoRenew: 1 });
mealSubscriptionSchema.index({ 'monthlyApprovals.month': 1 });
mealSubscriptionSchema.index({ 'userInfo.employeeId': 1 });

module.exports = mongoose.model("MealSubscription", mealSubscriptionSchema);