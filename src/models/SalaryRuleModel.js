const mongoose = require('mongoose');

const SalaryRuleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  
  salaryType: {
    type: String,
    required: [true, 'Salary type is required'],
    enum: ['Monthly', 'Hourly', 'Project', 'Daily', 'Weekly'],
    default: 'Monthly'
  },
  
  rate: {
    type: Number,
    required: [true, 'Rate is required'],
    min: [0, 'Rate cannot be negative'],
    default: 0
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Overtime rules
  overtimeRate: {
    type: Number,
    min: [0, 'Overtime rate cannot be negative'],
    default: 0
  },
  overtimeEnabled: {
    type: Boolean,
    default: false
  },
  
  // Leave rules
  leaveRule: {
    enabled: {
      type: Boolean,
      default: false
    },
    perDayDeduction: {
      type: Number,
      min: [0, 'Per day deduction cannot be negative'],
      default: 0
    },
    paidLeaves: {
      type: Number,
      min: [0, 'Paid leaves cannot be negative'],
      default: 0
    }
  },
  
  // Late rules
  lateRule: {
    enabled: {
      type: Boolean,
      default: false
    },
    lateDaysThreshold: {
      type: Number,
      min: [1, 'Late days threshold must be at least 1'],
      default: 3
    },
    equivalentLeaveDays: {
      type: Number,
      min: [0, 'Equivalent leave days cannot be negative'],
      default: 0.5
    }
  },
  
  // Bonus rules
  bonusAmount: {
    type: Number,
    min: [0, 'Bonus amount cannot be negative'],
    default: 0
  },
  bonusConditions: {
    type: String,
    trim: true
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Additional fields
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  
  applicableTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Timestamps
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // This will auto-add createdAt and updatedAt
});

// Update the updatedAt field before saving
SalaryRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('SalaryRule', SalaryRuleSchema);