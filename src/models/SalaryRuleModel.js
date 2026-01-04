const mongoose = require('mongoose');

const salaryRuleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  ruleType: {
    type: String,
    enum: ['late_deduction', 'adjustment_deduction', 'bonus', 'allowance'],
    default: 'late_deduction',
    required: [true, 'Rule type is required']
  },
  calculation: {
    type: String,
    default: '',
    trim: true
  },
  deductionAmount: {
    type: Number,
    default: 1,
    min: [0, 'Deduction amount cannot be negative'],
    required: [true, 'Deduction amount is required']
  },
  conditions: {
    threshold: {
      type: Number,
      default: 1,
      min: [0, 'Threshold cannot be negative']
    },
    deductionType: {
      type: String,
      enum: ['daily_salary', 'percentage', 'fixed_amount'],
      default: 'daily_salary'
    },
    applicableTo: [{
      type: String,
      enum: ['all_employees', 'permanent', 'contractual', 'probation'],
      default: ['all_employees']
    }],
    effectiveFrom: {
      type: Date,
      default: Date.now,
      required: [true, 'Effective date is required']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSystemDefault: {
    type: Boolean,
    default: false
  },
  ruleCode: {
    type: String,
    unique: true,
    required: [true, 'Rule code is required']
  },
  date: {
    type: Date,
    default: Date.now,
    required: [true, 'Date is required']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by is required']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Update timestamp on save
salaryRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Generate rule code before save
salaryRuleSchema.pre('save', function(next) {
  if (!this.ruleCode) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.ruleCode = `SR-${timestamp}-${random}`;
  }
  next();
});

// Indexes for better performance
salaryRuleSchema.index({ ruleCode: 1 });
salaryRuleSchema.index({ isActive: 1 });
salaryRuleSchema.index({ ruleType: 1 });
salaryRuleSchema.index({ isSystemDefault: 1 });
salaryRuleSchema.index({ createdAt: -1 });

const SalaryRule = mongoose.model('SalaryRule', salaryRuleSchema);

module.exports = SalaryRule;