const mongoose = require('mongoose');

// Helper function for number to words
const numberToWords = (num) => {
  if (num === 0) return 'Zero Taka Only';
  
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num < 100) {
    return convertTwoDigits(num) + ' Taka Only';
  }
  
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const remainder = num % 100;
  
  let result = '';
  
  if (crore > 0) result += `${convertThreeDigits(crore)} Crore `;
  if (lakh > 0) result += `${convertThreeDigits(lakh)} Lakh `;
  if (thousand > 0) result += `${convertThreeDigits(thousand)} Thousand `;
  if (hundred > 0) result += `${units[hundred]} Hundred `;
  if (remainder > 0) {
    if (result !== '') result += 'and ';
    result += convertTwoDigits(remainder);
  }
  
  return result.trim() + ' Taka Only';
  
  function convertThreeDigits(n) {
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    let result = '';
    
    if (hundred > 0) result += `${units[hundred]} Hundred `;
    if (remainder > 0) {
      if (hundred > 0) result += 'and ';
      result += convertTwoDigits(remainder);
    }
    
    return result.trim();
  }
  
  function convertTwoDigits(n) {
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    
    return unit > 0 ? `${tens[ten]} ${units[unit]}` : tens[ten];
  }
};

const payrollSchema = new mongoose.Schema({
  // ========== EMPLOYEE INFORMATION ==========
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employee is required']
  },
  employeeName: {
    type: String,
    required: [true, 'Employee name is required'],
    trim: true
  },
  employeeId: {
    type: String,
    required: [true, 'Employee ID is required'],
    trim: true
  },
  department: {
    type: String,
    default: ''
  },
  designation: {
    type: String,
    default: ''
  },
  
  // ========== PAY PERIOD ==========
  periodStart: {
    type: Date,
    required: [true, 'Period start date is required']
  },
  periodEnd: {
    type: Date,
    required: [true, 'Period end date is required']
  },
  month: {
    type: Number,
    min: 1,
    max: 12,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  
  // ========== PAYROLL STATUS ==========
  status: {
    type: String,
    enum: ['Draft', 'Pending', 'Approved', 'Paid', 'Rejected', 'Processing'],
    default: 'Pending',
    index: true
  },
  
  // ========== SALARY DETAILS ==========
  salaryDetails: {
    monthlySalary: {
      type: Number,
      required: true,
      min: 0
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0
    },
    overtimeRate: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'BDT',
      enum: ['BDT', 'USD', 'EUR', 'INR']
    },
    calculationBasis: {
      type: String,
      default: '23 days fixed calculation'
    }
  },
  
  // ========== ATTENDANCE SUMMARY ==========
  attendance: {
    totalWorkingDays: {
      type: Number,
      default: 23,
      min: 0
    },
    presentDays: {
      type: Number,
      default: 0,
      min: 0
    },
    absentDays: {
      type: Number,
      default: 0,
      min: 0
    },
    lateDays: {
      type: Number,
      default: 0,
      min: 0
    },
    leaveDays: {
      type: Number,
      default: 0,
      min: 0
    },
    halfDays: {
      type: Number,
      default: 0,
      min: 0
    },
    holidays: {
      type: Number,
      default: 0,
      min: 0
    },
    weeklyOffs: {
      type: Number,
      default: 0,
      min: 0
    },
    attendancePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  
  // ========== MONTH INFO ==========
  monthInfo: {
    totalHolidays: {
      type: Number,
      default: 0
    },
    totalWeeklyOffs: {
      type: Number,
      default: 0
    },
    holidayList: [String],
    weeklyOffDays: [String]
  },
  
  // ========== CALCULATION NOTES ==========
  calculationNotes: {
    holidayNote: {
      type: String,
      default: ''
    },
    weeklyOffNote: {
      type: String,
      default: ''
    },
    calculationNote: {
      type: String,
      default: '23 days fixed calculation basis'
    }
  },
  
  // ========== EARNINGS ==========
  earnings: {
    // Basic Pay (Auto calculated)
    basicPay: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Overtime (Manual only)
    overtime: {
      amount: {
        type: Number,
        default: 0,
        min: 0
      },
      hours: {
        type: Number,
        default: 0,
        min: 0
      },
      rate: {
        type: Number,
        default: 0,
        min: 0
      },
      source: {
        type: String,
        enum: ['manual', 'none'],
        default: 'none'
      },
      description: {
        type: String,
        default: ''
      }
    },
    
    // Bonus (Manual only)
    bonus: {
      amount: {
        type: Number,
        default: 0,
        min: 0
      },
      type: {
        type: String,
        enum: ['festival', 'performance', 'special', 'other', 'none'],
        default: 'none'
      },
      description: {
        type: String,
        default: ''
      }
    },
    
    // Allowance (Manual only)
    allowance: {
      amount: {
        type: Number,
        default: 0,
        min: 0
      },
      type: {
        type: String,
        enum: ['travel', 'food', 'housing', 'medical', 'other', 'none'],
        default: 'none'
      },
      description: {
        type: String,
        default: ''
      }
    },
    
    // Other allowances
    houseRent: {
      type: Number,
      default: 0,
      min: 0
    },
    medical: {
      type: Number,
      default: 0,
      min: 0
    },
    conveyance: {
      type: Number,
      default: 0,
      min: 0
    },
    incentives: {
      type: Number,
      default: 0,
      min: 0
    },
    otherAllowances: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Total earnings (auto-calculated)
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // ========== DEDUCTIONS ==========
  deductions: {
    // Auto-calculated deductions
    lateDeduction: {
      type: Number,
      default: 0,
      min: 0
    },
    absentDeduction: {
      type: Number,
      default: 0,
      min: 0
    },
    leaveDeduction: {
      type: Number,
      default: 0,
      min: 0
    },
    halfDayDeduction: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Other deductions
    taxDeduction: {
      type: Number,
      default: 0,
      min: 0
    },
    providentFund: {
      type: Number,
      default: 0,
      min: 0
    },
    advanceSalary: {
      type: Number,
      default: 0,
      min: 0
    },
    loanDeduction: {
      type: Number,
      default: 0,
      min: 0
    },
    otherDeductions: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Deduction rules applied
    deductionRules: {
      type: Map,
      of: String,
      default: {
        lateRule: "3 days late = 1 day salary deduction",
        absentRule: "1 day absent = 1 day salary deduction",
        leaveRule: "1 day leave = 1 day salary deduction",
        halfDayRule: "1 half day = 0.5 day salary deduction",
        holidayRule: "Holidays are not deducted",
        weeklyOffRule: "Weekly offs are not deducted"
      }
    },
    
    // Total deductions (auto-calculated)
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // ========== SUMMARY ==========
  summary: {
    grossEarnings: {
      type: Number,
      default: 0,
      min: 0
    },
    totalDeductions: {
      type: Number,
      default: 0,
      min: 0
    },
    netPayable: {
      type: Number,
      required: true,
      min: 0
    },
    inWords: {
      type: String,
      default: ''
    },
    payableDays: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // ========== MANUAL INPUTS ==========
  manualInputs: {
    overtime: {
      type: Number,
      default: 0,
      min: 0
    },
    overtimeHours: {
      type: Number,
      default: 0,
      min: 0
    },
    bonus: {
      type: Number,
      default: 0,
      min: 0
    },
    allowance: {
      type: Number,
      default: 0,
      min: 0
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enteredAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // ========== CALCULATION METADATA ==========
  calculation: {
    method: {
      type: String,
      enum: ['auto_backend', 'manual', 'hybrid'],
      default: 'auto_backend'
    },
    calculatedDate: {
      type: Date,
      default: Date.now
    },
    calculatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dataSources: [{
      type: String,
      enum: ['attendance', 'leaves', 'holidays', 'office_schedule', 'manual_input']
    }],
    calculationNotes: {
      type: String,
      default: ''
    }
  },
  
  // ========== PAYMENT INFORMATION ==========
  payment: {
    paymentDate: {
      type: Date
    },
    paymentMethod: {
      type: String,
      enum: ['Bank Transfer', 'Cash', 'Cheque', 'Online Payment', 'Mobile Banking', 'Not Paid'],
      default: 'Not Paid'
    },
    transactionId: {
      type: String,
      default: ''
    },
    bankAccount: {
      type: String,
      default: ''
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    paymentNotes: {
      type: String,
      default: ''
    }
  },
  
  // ========== METADATA ==========
  metadata: {
    isAutoGenerated: {
      type: Boolean,
      default: false
    },
    hasManualInputs: {
      type: Boolean,
      default: false
    },
    deductionRulesApplied: {
      type: Boolean,
      default: false
    },
    attendanceBased: {
      type: Boolean,
      default: true
    },
    fixed23Days: {
      type: Boolean,
      default: true
    },
    version: {
      type: String,
      default: '3.0'
    },
    batchId: {
      type: String,
      default: ''
    }
  },
  // Payroll Model-এ
  // ========== FOOD COST DEDUCTION ==========
  foodCostDetails: {
    totalMealCost: {
      type: Number,
      default: 0
    },
    fixedDeduction: {
      type: Number,
      default: 0
    },
    totalFoodDeduction: {
      type: Number,
      default: 0
    },
    mealDays: {
      type: Number,
      default: 0
    },
    calculationDate: {
      type: Date
    },
    selectedBills: [{
      id: mongoose.Schema.Types.ObjectId,
      date: Date,
      cost: Number,
      note: String
    }],
    calculationNote: {
      type: String,
      default: ''
    }
  },
  // ========== MEAL DEDUCTION SYSTEM ==========
  mealDeduction: {
    deductionType: {
      type: String,
      enum: ['monthly_subscription', 'daily_meal', 'none'],
      default: 'none'
    },
    
    // Monthly Subscription (Auto)
    subscriptionAuto: {
      hasSubscription: Boolean,
      subscriptionId: mongoose.Schema.Types.ObjectId,
      monthlyApprovalStatus: String,
      preference: String,
      approvedMealDays: Number,
      totalMonthlyFoodCost: Number,
      totalActiveSubscribers: Number,
      deductionPerEmployee: Number,
      calculationNote: String,
      foodCostBills: [{
        id: mongoose.Schema.Types.ObjectId,
        date: Date,
        cost: Number,
        note: String
      }]
    },
    
    // Daily Meal (Manual)
    dailyMealManual: {
      totalMealDays: Number,
      dailyRate: Number,
      totalAmount: Number,
      adminNote: String,
      enteredBy: mongoose.Schema.Types.ObjectId,
      enteredAt: Date,
      mealDetails: [{
        date: Date,
        preference: String,
        status: String
      }]
    },
    
    totalDeductionAmount: {
      type: Number,
      default: 0
    }
  },
  
  // ========== MEAL SYSTEM DATA ==========
  mealSystemData: {
    subscriptionStatus: Boolean,
    dailyMealDays: Number,
    hasDailyMeals: Boolean,
    totalMonthlyFoodCost: Number,
    foodCostDays: Number,
    averageDailyCost: Number,
    activeSubscribers: Number,
    mealDeduction: {
      type: {
        type: String,
        enum: ['monthly_subscription', 'daily_meal', 'none']
      },
      amount: Number,
      calculationNote: String,
      details: mongoose.Schema.Types.Mixed
    }
  },
    // ========== ONSITE BENEFITS DETAILS ==========
  onsiteBenefitsDetails: {
    serviceCharge: {
      type: Number,
      default: 0
    },
    teaAllowance: {
      type: Number,
      default: 0
    },
    totalAllowance: {
      type: Number,
      default: 0
    },
    totalDeduction: {
      type: Number,
      default: 0
    },
    presentDays: {
      type: Number,
      default: 0
    },
    netEffect: {
      type: Number,
      default: 0
    },
    calculationNote: {
      type: String,
      default: ''
    },
    details: mongoose.Schema.Types.Mixed,
    breakdown: mongoose.Schema.Types.Mixed
  },
  
  // ========== ONSITE BREAKDOWN ==========
  onsiteBreakdown: {
    teaAllowance: Number,
    serviceCharge: Number,
    netOnsiteEffect: Number,
    foodCostIncluded: Boolean,
    foodCostDeduction: Number,
    netPayable: Number
  },
  
  // ========== MEAL SYSTEM SUMMARY ==========
  mealSystemSummary: {
    type: String,
    deduction: Number,
    calculation: String,
    details: mongoose.Schema.Types.Mixed
  },

  // ========== AUDIT TRAIL ==========
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  
  // ========== SOFT DELETE ==========
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // ========== NOTES ==========
  notes: {
    type: String,
    default: ''
  },
  // Metadata-এ employeeAccepted field যোগ করুন:
employeeAccepted: {
  type: Boolean,
  default: false
},
  
  // ========== UPDATED SUMMARY ==========
  summary: {
    grossEarnings: {
      type: Number,
      default: 0,
      min: 0
    },
    totalDeductions: {
      type: Number,
      default: 0,
      min: 0
    },
    netPayable: {
      type: Number,
      required: true,
      min: 0
    },
    inWords: {
      type: String,
      default: ''
    },
    payableDays: {
      type: Number,
      default: 0,
      min: 0
    },
    deductionCapApplied: Boolean,
    rulesApplied: String,
    onsiteBenefitsApplied: Boolean,
    onsiteBenefitsDetails: mongoose.Schema.Types.Mixed,
    onsiteBreakdown: mongoose.Schema.Types.Mixed,
    mealSystemSummary: mongoose.Schema.Types.Mixed
  },
  
  // ========== UPDATED CALCULATION NOTES ==========
  calculationNotes: {
    holidayNote: String,
    weeklyOffNote: String,
    calculationNote: String,
    deductionNote: String,
    onsiteBenefitsNote: String,
    mealDeductionNote: String
  },
  
  // ========== UPDATED MANUAL INPUTS ==========
  manualInputs: {
    overtime: {
      type: Number,
      default: 0,
      min: 0
    },
    overtimeHours: {
      type: Number,
      default: 0,
      min: 0
    },
    bonus: {
      type: Number,
      default: 0,
      min: 0
    },
    allowance: {
      type: Number,
      default: 0,
      min: 0
    },
    dailyMealRate: {
      type: Number,
      default: 0
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enteredAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // ========== UPDATED CALCULATION ==========
  calculation: {
    method: {
      type: String,
      enum: ['auto_backend', 'manual', 'hybrid'],
      default: 'auto_backend'
    },
    calculatedDate: {
      type: Date,
      default: Date.now
    },
    calculatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dataSources: [{
      type: String,
      enum: [
        'attendance', 
        'leaves', 
        'holidays', 
        'office_schedule', 
        'manual_input',
        'meal_system',
        'food_cost_system'
      ]
    }],
    calculationNotes: {
      type: String,
      default: ''
    }
  },
  
  // ========== UPDATED METADATA ==========
  metadata: {
    isAutoGenerated: Boolean,
    hasManualInputs: Boolean,
    deductionRulesApplied: Boolean,
    deductionCapApplied: Boolean,
    attendanceBased: Boolean,
    fixed23Days: Boolean,
    version: String,
    batchId: String,
    safetyRules: [String],
    onsiteBenefitsIncluded: Boolean,
    workLocationType: String,
    mealSystemIncluded: Boolean,
    foodCostIncluded: Boolean,
    foodCostBillsCount: Number,
    activeSubscribersCount: Number,
    mealType: String
  },
    employeeAccepted: {
    accepted: {
      type: Boolean,
      default: false
    },
    acceptedAt: {
      type: Date
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    employeeName: {
      type: String
    },
    employeeId: {
      type: String
    },
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    }
  },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ========== INDEXES ==========
// payrollSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });
payrollSchema.index({ status: 1 });
payrollSchema.index({ month: 1, year: 1 });
payrollSchema.index({ periodStart: 1, periodEnd: 1 });
payrollSchema.index({ createdBy: 1 });
payrollSchema.index({ 'payment.paymentDate': 1 });
payrollSchema.index({ employeeId: 1 });

// ========== VIRTUALS ==========
payrollSchema.virtual('periodFormatted').get(function() {
  if (this.periodStart && this.periodEnd) {
    return `${this.periodStart.toLocaleDateString()} - ${this.periodEnd.toLocaleDateString()}`;
  }
  return '';
});

payrollSchema.virtual('monthName').get(function() {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return monthNames[this.month - 1] || '';
});

// ========== PRE-SAVE MIDDLEWARE ==========
payrollSchema.pre('save', function(next) {

  // Auto-calculate earnings total
  this.earnings.total = 
    (this.earnings.basicPay || 0) +
    (this.earnings.overtime?.amount || 0) +
    (this.earnings.bonus?.amount || 0) +
    (this.earnings.allowance?.amount || 0) +
    (this.earnings.houseRent || 0) +
    (this.earnings.medical || 0) +
    (this.earnings.conveyance || 0) +
    (this.earnings.incentives || 0) +
    (this.earnings.otherAllowances || 0);
  
  // **FIX 1: ADD MEAL DEDUCTION AMOUNT TO DEDUCTIONS OBJECT**
  const mealDeductionAmount = this.mealDeduction?.totalDeductionAmount || 0;
  const foodCostDeduction = this.foodCostDetails?.totalFoodDeduction || 0;
  
  // Use whichever is applicable
  const actualMealDeduction = mealDeductionAmount > 0 ? mealDeductionAmount : foodCostDeduction;
  
  // **FIX 2: ADD MEAL DEDUCTION FIELD TO DEDUCTIONS**
  this.deductions.mealDeduction = actualMealDeduction;
  this.deductions.foodCostDeduction = foodCostDeduction;
  
  // Auto-calculate deductions total (INCLUDING MEAL DEDUCTION)
  this.deductions.total = 
    (this.deductions.lateDeduction || 0) +
    (this.deductions.absentDeduction || 0) +
    (this.deductions.leaveDeduction || 0) +
    (this.deductions.halfDayDeduction || 0) +
    (this.deductions.taxDeduction || 0) +
    (this.deductions.providentFund || 0) +
    (this.deductions.advanceSalary || 0) +
    (this.deductions.loanDeduction || 0) +
    // (this.deductions.otherDeductions || 0) +
    actualMealDeduction + // **ADD MEAL DEDUCTION HERE**
    (this.onsiteBenefitsDetails?.serviceCharge || 0); // **ADD ONSITE SERVICE CHARGE**
  
  // Auto-calculate summary
  this.summary.grossEarnings = this.earnings.total;
  this.summary.totalDeductions = this.deductions.total;
  this.summary.netPayable = this.earnings.total - this.deductions.total;
  
  // Calculate attendance percentage - 23 দিনের ভিত্তিতে
  if (this.attendance.totalWorkingDays > 0) {
    this.attendance.attendancePercentage = Math.round(
      (this.attendance.presentDays / 23) * 100
    );
  }
  
  // Calculate payable days (প্রকৃত কর্মদিবস)
  this.summary.payableDays = this.attendance.presentDays;
  
  // Calculate weekly offs if not already calculated
  if (this.monthInfo.totalWeeklyOffs === 0 && this.periodStart && this.periodEnd) {
    const start = new Date(this.periodStart);
    const end = new Date(this.periodEnd);
    const weeklyOffDays = this.monthInfo.weeklyOffDays || ['Friday', 'Saturday'];
    
    let weeklyOffCount = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      if (weeklyOffDays.includes(dayName)) {
        weeklyOffCount++;
      }
    }
    this.monthInfo.totalWeeklyOffs = weeklyOffCount;
  }
  
  // Generate inWords if net payable is positive
  if (this.summary.netPayable > 0 && !this.summary.inWords) {
    this.summary.inWords = numberToWords(this.summary.netPayable);
  }
  
  // Update metadata
  this.metadata.hasManualInputs = 
    (this.manualInputs.overtime > 0) ||
    (this.manualInputs.bonus > 0) ||
    (this.manualInputs.allowance > 0) ||
    (this.manualInputs.dailyMealRate > 0);
  
  this.metadata.deductionRulesApplied = 
    (this.deductions.lateDeduction > 0) ||
    (this.deductions.absentDeduction > 0) ||
    (this.deductions.leaveDeduction > 0) ||
    (this.deductions.halfDayDeduction > 0);
  
  // Set overtime rate if not set
  if (!this.salaryDetails.overtimeRate && this.salaryDetails.hourlyRate) {
    this.salaryDetails.overtimeRate = Math.round(this.salaryDetails.hourlyRate * 1.5);
  }
  
  // Set calculation basis
  if (!this.salaryDetails.calculationBasis) {
    this.salaryDetails.calculationBasis = '23 days fixed calculation';
  }
  
  // Update manual inputs to earnings for overtime
  if (this.manualInputs.overtime > 0) {
    this.earnings.overtime.amount = this.manualInputs.overtime;
    this.earnings.overtime.source = 'manual';
  }
  
  // Set fixed23Days metadata
  this.metadata.fixed23Days = true;
  
  // **FIX 3: UPDATE MEAL SYSTEM METADATA**
  this.metadata.mealSystemIncluded = actualMealDeduction > 0;
  this.metadata.mealType = this.mealDeduction?.deductionType || 
                          (foodCostDeduction > 0 ? 'monthly_subscription' : 'none');
  this.metadata.foodCostIncluded = foodCostDeduction > 0;
  this.metadata.foodCostBillsCount = this.foodCostDetails?.selectedBills?.length || 0;
  
  next();
});

// ========== STATIC METHODS ==========
payrollSchema.statics.findByEmployeeAndMonth = async function(employeeId, month, year) {
  return this.findOne({
    employee: employeeId,
    month: month,
    year: year,
    isDeleted: false
  });
};

payrollSchema.statics.findByEmployee = async function(employeeId, year = null) {
  const query = {
    employee: employeeId,
    isDeleted: false
  };
  
  if (year) {
    query.year = year;
  }
  
  return this.find(query).sort({ year: -1, month: -1 });
};

payrollSchema.statics.getPayrollStats = async function(month, year) {
  const stats = await this.aggregate([
    {
      $match: {
        month: parseInt(month),
        year: parseInt(year),
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalPayrolls: { $sum: 1 },
        totalNetPayable: { $sum: '$summary.netPayable' },
        totalDeductions: { $sum: '$deductions.total' },
        totalEmployees: { $addToSet: '$employee' },
        paidCount: {
          $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
        },
        approvedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalPayrolls: 1,
        totalNetPayable: 1,
        totalDeductions: 1,
        totalEmployees: { $size: '$totalEmployees' },
        paidCount: 1,
        pendingCount: 1,
        approvedCount: 1
      }
    }
  ]);
  
  return stats[0] || {
    totalPayrolls: 0,
    totalNetPayable: 0,
    totalDeductions: 0,
    totalEmployees: 0,
    paidCount: 0,
    pendingCount: 0,
    approvedCount: 0
  };
};

payrollSchema.statics.getEmployeeYearlySummary = async function(employeeId, year) {
  const summary = await this.aggregate([
    {
      $match: {
        employee: mongoose.Types.ObjectId(employeeId),
        year: parseInt(year),
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$employee',
        totalPayrolls: { $sum: 1 },
        totalNetPayable: { $sum: '$summary.netPayable' },
        totalDeductions: { $sum: '$deductions.total' },
        totalBasicPay: { $sum: '$earnings.basicPay' },
        totalOvertime: { $sum: '$earnings.overtime.amount' },
        totalBonus: { $sum: '$earnings.bonus.amount' },
        totalAllowance: { $sum: '$earnings.allowance.amount' },
        months: { $addToSet: '$month' }
      }
    },
    {
      $project: {
        _id: 0,
        totalPayrolls: 1,
        totalNetPayable: 1,
        totalDeductions: 1,
        totalBasicPay: 1,
        totalOvertime: 1,
        totalBonus: 1,
        totalAllowance: 1,
        monthsCount: { $size: '$months' },
        averageMonthly: { $divide: ['$totalNetPayable', { $size: '$months' }] }
      }
    }
  ]);
  
  return summary[0] || null;
};

// Add numberToWords as static method
payrollSchema.statics.numberToWords = numberToWords;

// ========== INSTANCE METHODS ==========
payrollSchema.methods.markAsPaid = function(paymentData = {}) {
  this.status = 'Paid';
  this.payment = {
    ...this.payment,
    ...paymentData,
    paymentDate: paymentData.paymentDate || new Date()
  };
  return this.save();
};

payrollSchema.methods.markAsApproved = function(approvedBy) {
  this.status = 'Approved';
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  return this.save();
};

payrollSchema.methods.markAsRejected = function(rejectedBy, reason = '') {
  this.status = 'Rejected';
  this.rejectedBy = rejectedBy;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

payrollSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

payrollSchema.methods.getPayrollSlipData = function() {
  return {
    employee: {
      name: this.employeeName,
      id: this.employeeId,
      department: this.department,
      designation: this.designation
    },
    period: {
      start: this.periodStart,
      end: this.periodEnd,
      month: this.monthName,
      year: this.year,
      calculationBasis: this.salaryDetails.calculationBasis
    },
    salary: {
      monthly: this.salaryDetails.monthlySalary,
      daily: this.salaryDetails.dailyRate,
      hourly: this.salaryDetails.hourlyRate,
      overtimeRate: this.salaryDetails.overtimeRate
    },
    attendance: this.attendance,
    monthInfo: this.monthInfo,
    earnings: this.earnings,
    deductions: this.deductions,
    summary: this.summary,
    status: this.status,
    payment: this.payment,
    calculationNotes: this.calculationNotes,
    metadata: {
      generatedDate: this.createdAt,
      calculationMethod: this.calculation.method,
      fixed23Days: this.metadata.fixed23Days,
      version: this.metadata.version
    }
  };
};

const Payroll = mongoose.model('Payroll', payrollSchema);
module.exports = Payroll;