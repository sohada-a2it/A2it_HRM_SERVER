const mongoose = require('mongoose');

const salaryRuleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  
  description: {
    type: String,
    trim: true
  },
  
  // ✅ Updated salaryType enum to match frontend
  salaryType: {
    type: String,
    enum: ['fixed', 'hourly', 'commission', 'contract', 'daily', 'weekly', 'monthly', 'project'],
    default: 'fixed'
  },
  
  // ✅ Rate for salary calculation
  rate: {
    type: Number,
    required: [true, 'Rate is required'],
    min: [0, 'Rate cannot be negative']
  },
  
  // ✅ Overtime configuration
  overtimeEnabled: {
    type: Boolean,
    default: false
  },
  overtimeRate: {
    type: Number,
    min: [0, 'Overtime rate cannot be negative'],
    default: 0
  },
  
  // ✅ Leave rule configuration
  leaveRule: {
    enabled: {
      type: Boolean,
      default: false
    },
    paidLeaves: {
      type: Number,
      min: [0, 'Paid leaves cannot be negative'],
      default: 0
    },
    perDayDeduction: {
      type: Number,
      min: [0, 'Per day deduction cannot be negative'],
      default: 0
    }
  },
  
  // ✅ Late rule configuration
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
  
  // ✅ Bonus configuration
  bonusAmount: {
    type: Number,
    min: [0, 'Bonus amount cannot be negative'],
    default: 0
  },
  bonusConditions: {
    type: String,
    trim: true
  },
  
  // ✅ Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // ✅ Department
  department: {
    type: String,
    trim: true
  },
  
  // ✅ Applicable to
  applicableTo: [{
    type: String,
    enum: ['all_employees', 'permanent', 'contractual', 'probation', 'intern'],
    default: 'all_employees'
  }],
  
  // ✅ Reference to creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // ✅ Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ✅ Update timestamp on save
salaryRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// ✅ Virtual for formatted salary type
salaryRuleSchema.virtual('salaryTypeLabel').get(function() {
  const labels = {
    'fixed': 'Fixed Salary',
    'hourly': 'Hourly Rate',
    'commission': 'Commission Based',
    'contract': 'Contract Based',
    'daily': 'Daily Rate',
    'weekly': 'Weekly Rate',
    'monthly': 'Monthly Salary',
    'project': 'Project Based'
  };
  return labels[this.salaryType] || this.salaryType;
});

module.exports = mongoose.model('SalaryRule', salaryRuleSchema);