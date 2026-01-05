// models/SalaryRuleModel.js
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
  
  // Salary calculation method
  salaryType: {
    type: String,
    enum: ['hourly', 'daily', 'weekly', 'monthly', 'project'],
    default: 'monthly'
  },
  
  rate: {
    type: Number,
    required: [true, 'Rate is required'],
    min: [0, 'Rate cannot be negative']
  },
  
  // Working days per month for calculation
  workingDaysPerMonth: {
    type: Number,
    default: 26,
    min: [1, 'Working days must be at least 1']
  },
  
  // Whether to calculate per day or fixed monthly
  perDaySalaryCalculation: {
    type: Boolean,
    default: true
  },
  
  // Salary components (House Rent, Medical Allowance, etc.)
  components: [{
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'attendance_based'],
      default: 'percentage'
    },
    value: {
      type: Number,
      required: true
    },
    category: {
      type: String,
      enum: ['addition', 'deduction'],
      default: 'addition'
    },
    condition: String, // Optional condition for calculation
    description: String
  }],
  
  // Overtime rules
  overtimeEnabled: {
    type: Boolean,
    default: false
  },
  overtimeRate: {
    type: Number,
    min: [0, 'Overtime rate cannot be negative'],
    default: 0
  },
  
  // Leave rules
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
  
  // Who can use this rule
  applicableTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  department: {
    type: String
  },
  
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
  timestamps: true
});

// Update timestamp
salaryRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Salaryrule', salaryRuleSchema);