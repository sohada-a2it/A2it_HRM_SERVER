const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // ============ COMMON FIELDS (Employee, Admin & Moderator) ============
    // Personal Info
    firstName: { 
      type: String, 
      required: [true, 'First name is required'],
      trim: true
    },
    lastName: { 
      type: String, 
      required: [true, 'Last name is required'],
      trim: true
    },
    email: { 
      type: String, 
      required: [true, 'Email is required'], 
      unique: true, 
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: { 
      type: String, 
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters']
    },

    // Role & Status
    role: { 
      type: String, 
      enum: ["superAdmin", "admin", "employee", "moderator"],  
      default: "employee",
      required: true
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    status: { 
      type: String, 
      enum: ['active', 'inactive', 'suspended'],
      default: 'active' 
    },

    // Professional Info
    department: { type: String, default: '' },
    designation: { type: String, default: '' },
    phone: { type: String, default: '' },

    // Employee ID - শুধুমাত্র String (ObjectId নয়)
    employeeId: { 
      type: String, 
      default: '', 
    },

    // Salary Info
    salaryType: { 
      type: String, 
      enum: ['hourly', 'monthly', 'project', 'yearly', 'commission', 'fixed'],
      default: 'monthly'
    },
    rate: { 
      type: Number,  
      min: 0,
      default: 0
    },
    salary: {
      type: Number,
      default: 0
    },
    basicSalary: {
      type: Number,
      min: 0,
      default: 0
    },
    joiningDate: { 
      type: Date,
      default: Date.now
    },

    // Profile
    picture: { 
      type: String,
      default: '' 
    },
    address: {
      type: String,
      default: ''
    },

    // Salary Rule
    salaryRule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryRule',
      default: null
    },

    // Salary Information
    salaryStructure: {
      basicSalary: { type: Number, default: 0 },
      houseRent: { type: Number, default: 0 },
      medicalAllowance: { type: Number, default: 0 },
      conveyance: { type: Number, default: 0 },
      otherAllowances: { type: Number, default: 0 },
      grossSalary: { type: Number, default: 0 },
      providentFund: { type: Number, default: 0 },
      tax: { type: Number, default: 0 }
    },
    
    // Payment Details
    bankDetails: {
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
      branchName: { type: String, default: '' },
      routingNumber: { type: String, default: '' }
    },
    
     // ============ WORK TYPE FIELDS ============ 
  workLocationType: {
    type: String,
    enum: ['onsite', 'remote', 'hybrid'],
    default: 'onsite'
  },
  workArrangement: {
    type: String,
    enum: ['full-time', 'part-time', 'contractual', 'freelance', 'internship', 'temporary'],
    default: 'full-time'
  },
    // ============ ONSITE BENEFITS FIELDS ============ (NEW)
onsiteBenefits: {
  // DEDUCTION - Salary থেকে বাদ যাবে
  fixedDeduction: {
    type: Number,
    default: 500, // মাসিক ৫০০ টাকা deduction
    min: 0
  },
  
  // ALLOWANCE - Salary-তে যোগ হবে (Present Days × 10)
  dailyAllowanceRate: {
    type: Number,
    default: 10, // দৈনিক ১০ টাকা allowance
    min: 0
  },
  
  isActive: {
    type: Boolean,
    default: function() {
      // শুধু onsite employees এর জন্য
      return this.workLocationType === 'onsite';
    }
  },
  
  // Calculation settings
  includeHalfDays: {
    type: Boolean,
    default: true // Half day-তেও allowance পাবে
  },
  
  startDate: {
    type: Date,
    default: function() {
      return this.joiningDate;
    }
  },
  
  lastCalculated: {
    type: Date
  },
  
  notes: {
    type: String,
    default: ''
  }
},

// ============ MEAL/FOOD ALLOWANCE FIELDS ============ 
mealEligibility: {
  type: Boolean,
  default: false
}, 
    dailyFoodCost: {
      type: Number,
      default: 0,
      min: 0
    },
    hasRequestedMeal: {
      type: Boolean,
      default: false
    },
    mealRequestDate: {
      type: Date
    },
    mealRequestApproved: {
      type: Boolean,
      default: false
    },
    mealApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    mealApprovedAt: {
      type: Date
    },

    // ============ ADMIN-SPECIFIC FIELDS ============
    companyName: {
      type: String,
      default: ''
    },
    adminLevel: {
      type: String,
      enum: ['super', 'admin', 'manager', 'moderator'],
      default: 'admin'
    },
    adminPosition: {
      type: String,
      default: 'Administrator'
    },
    isSuperAdmin: {
      type: Boolean,
      default: false
    },
    canManageUsers: {
      type: Boolean,
      default: false
    },
    canManagePayroll: {
      type: Boolean,
      default: false
    },

    // ============ MODERATOR-SPECIFIC FIELDS ============
    moderatorLevel: {
      type: String,
      enum: ['senior', 'junior', 'trainee'],
      default: 'junior'
    },
    moderatorScope: {
      type: [String], // ['users', 'content', 'reports', 'comments', 'posts']
      default: ['users', 'content']
    },
    canModerateUsers: {
      type: Boolean,
      default: false
    },
    canModerateContent: {
      type: Boolean,
      default: true
    },
    canViewReports: {
      type: Boolean,
      default: true
    },
    canManageReports: {
      type: Boolean,
      default: false
    },
    moderationLimits: {
      dailyActions: { type: Number, default: 50 },
      warningLimit: { type: Number, default: 3 },
      canBanUsers: { type: Boolean, default: false },
      canDeleteContent: { type: Boolean, default: true },
      canEditContent: { type: Boolean, default: true },
      canWarnUsers: { type: Boolean, default: true }
    },

    // Common permission field for all roles
    permissions: {
      type: [String],
      default: []
    },

    // ============ EMPLOYEE-SPECIFIC FIELDS ============
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    attendanceId: {
      type: String,
      default: ''
    },
// models/UserModel.js - SHIFT TIMING SECTION UPDATE
  shiftTiming: {
    defaultShift: {
      name: { type: String, default: 'Regular' },
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' },
      lateThreshold: { type: Number, default: 5 },
      earlyThreshold: { type: Number, default: -1 },
      autoClockOutDelay: { type: Number, default: 10 }
    },
    assignedShift: {
      name: { type: String },
      start: { type: String },
      end: { type: String },
      lateThreshold: { type: Number, default: 5 },
      earlyThreshold: { type: Number, default: -1 },
      autoClockOutDelay: { type: Number, default: 10 },
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      assignedAt: { type: Date },
      effectiveDate: { type: Date },
      isActive: { type: Boolean, default: false }
    },
    shiftHistory: [{
      name: { type: String },
      start: { type: String },
      end: { type: String },
      lateThreshold: { type: Number },
      earlyThreshold: { type: Number },
      autoClockOutDelay: { type: Number },
      assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      assignedAt: { type: Date },
      effectiveDate: { type: Date },
      endedAt: { type: Date },
      reason: { type: String }
    }]
  },

    // Shift Preferences
    preferredShift: {
      type: String,
      enum: ['morning', 'evening', 'night', 'flexible'],
      default: 'morning'
    },

    // Login Stats
    lastLogin: { 
      type: Date,
      default: null 
    },
    loginCount: { 
      type: Number, 
      default: 0
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { 
    timestamps: true,
    toJSON: { 
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// ✅ **সঠিক Password Hashing (একবারই রাখুন)**
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
    // Auto-set onsite benefits for onsite employees
  if (this.role === 'employee' && this.workLocationType === 'onsite') {
    if (!this.onsiteBenefits) {
      this.onsiteBenefits = {};
    }
    
    // Set default onsite benefits
    this.onsiteBenefits.fixedDeduction = this.onsiteBenefits.fixedDeduction || 500;
    this.onsiteBenefits.dailyAllowanceRate = this.onsiteBenefits.dailyAllowanceRate || 10;
    this.onsiteBenefits.isActive = true;
    this.onsiteBenefits.includeHalfDays = this.onsiteBenefits.includeHalfDays !== undefined ? 
      this.onsiteBenefits.includeHalfDays : true;
    
    if (!this.onsiteBenefits.startDate) {
      this.onsiteBenefits.startDate = this.joiningDate;
    }
  }
  
  // Clear onsite benefits for non-onsite employees
  if (this.role === 'employee' && this.workLocationType !== 'onsite') {
    this.onsiteBenefits = undefined;
  }
  
  next();
});

// ✅ **সঠিক Password Comparison Method (একবারই রাখুন)**
userSchema.methods.matchPassword = async function (enteredPassword) {
  try {
    console.log('🔐 matchPassword called:');
    console.log('- Entered password:', enteredPassword);
    console.log('- Stored hash exists:', !!this.password);
    console.log('- Hash starts with $2:', this.password?.startsWith('$2'));
    
    if (!this.password) {
      console.log('❌ No password stored for user');
      return false;
    }
    
    const result = await bcrypt.compare(enteredPassword, this.password);
    console.log('- bcrypt.compare result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ matchPassword error:', error);
    return false;
  }
};
// Method to check onsite benefits eligibility
userSchema.methods.getOnsiteBenefitsInfo = function() {
  if (this.workLocationType !== 'onsite' || this.role !== 'employee') {
    return {
      isEligible: false,
      reason: 'Only onsite employees are eligible'
    };
  }
  
  return {
    isEligible: true,
    fixedDeduction: this.onsiteBenefits?.fixedDeduction || 500,
    dailyAllowanceRate: this.onsiteBenefits?.dailyAllowanceRate || 10,
    includeHalfDays: this.onsiteBenefits?.includeHalfDays || true,
    startDate: this.onsiteBenefits?.startDate || this.joiningDate,
    description: '500 BDT deduction + 10 BDT per present day allowance'
  };
};

// Method to calculate onsite benefits
userSchema.methods.calculateOnsiteBenefits = function(presentDays) {
  if (!this.getOnsiteBenefitsInfo().isEligible) {
    return null;
  }
  
  const deduction = this.onsiteBenefits?.fixedDeduction || 500;
  const allowance = presentDays * (this.onsiteBenefits?.dailyAllowanceRate || 10);
  const netEffect = allowance - deduction;
  
  return {
    deduction: deduction,
    allowance: allowance,
    presentDays: presentDays,
    netEffect: netEffect,
    calculation: `${presentDays} days × ${this.onsiteBenefits?.dailyAllowanceRate || 10} = ${allowance} - ${deduction} = ${netEffect}`,
    description: `Onsite Benefits: ${allowance} BDT allowance - ${deduction} BDT deduction = ${netEffect} BDT net`
  };
};
// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Pre-save middleware to handle role-based logic
userSchema.pre('save', function(next) {
  // Generate employeeId for employees if not provided
  if (this.role === 'employee' && (!this.employeeId || this.employeeId === '')) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.employeeId = `EMP-${timestamp}${random}`;
  }

  // Generate moderatorId for moderators
  if (this.role === 'moderator' && (!this.employeeId || this.employeeId === '')) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.employeeId = `MOD-${timestamp}${random}`;
  }

  // Admin users - set empty employeeId
  if (this.role === 'admin' && (!this.employeeId || this.employeeId === '')) {
    this.employeeId = '';
  }

  // Set default permissions for admin
  if (this.role === 'admin') {
    if (!this.permissions || this.permissions.length === 0) {
      this.permissions = ['user:read', 'user:create', 'user:update'];
    }
    
    // Set default admin values if not provided
    if (!this.adminLevel) this.adminLevel = 'admin';
    if (!this.adminPosition) this.adminPosition = 'Administrator';
    if (!this.companyName) this.companyName = 'Default Company';
    
    // Ensure admin has proper access rights
    if (this.adminLevel === 'super' || this.isSuperAdmin) {
      this.canManageUsers = true;
      this.canManagePayroll = true;
      this.permissions = [...this.permissions, 'user:delete', 'admin:all'];
    }

    // Clear moderator-specific fields for admin
    this.moderatorLevel = undefined;
    this.moderatorScope = undefined;
    this.canModerateUsers = undefined;
    this.canModerateContent = undefined;
    this.canViewReports = undefined;
    this.canManageReports = undefined;
    this.moderationLimits = undefined;
  }

  // Set default values for moderator
  if (this.role === 'moderator') {
    // Set default moderator level
    if (!this.moderatorLevel) this.moderatorLevel = 'junior';
    
    // Set default moderator scope
    if (!this.moderatorScope || this.moderatorScope.length === 0) {
      this.moderatorScope = ['users', 'content'];
    }
    
    // Set permission-based flags
    if (this.moderatorScope.includes('users')) {
      this.canModerateUsers = true;
    }
    if (this.moderatorScope.includes('reports')) {
      this.canViewReports = true;
      this.canManageReports = true;
    }
    
    // Set moderation limits based on level
    if (!this.moderationLimits) {
      this.moderationLimits = {};
    }
    
    switch(this.moderatorLevel) {
      case 'senior':
        this.moderationLimits.dailyActions = 200;
        this.moderationLimits.warningLimit = 5;
        this.moderationLimits.canBanUsers = true;
        this.moderationLimits.canDeleteContent = true;
        this.moderationLimits.canEditContent = true;
        this.moderationLimits.canWarnUsers = true;
        this.permissions = [...this.permissions, 'moderator:senior', 'reports:manage', 'users:ban', 'content:delete'];
        break;
      case 'junior':
        this.moderationLimits.dailyActions = 100;
        this.moderationLimits.warningLimit = 3;
        this.moderationLimits.canBanUsers = false;
        this.moderationLimits.canDeleteContent = true;
        this.moderationLimits.canEditContent = true;
        this.moderationLimits.canWarnUsers = true;
        this.permissions = [...this.permissions, 'moderator:junior', 'content:delete', 'users:warn'];
        break;
      case 'trainee':
        this.moderationLimits.dailyActions = 30;
        this.moderationLimits.warningLimit = 1;
        this.moderationLimits.canBanUsers = false;
        this.moderationLimits.canDeleteContent = false;
        this.moderationLimits.canEditContent = false;
        this.moderationLimits.canWarnUsers = true;
        this.permissions = [...this.permissions, 'moderator:trainee', 'content:view', 'reports:view'];
        break;
    }

    // Clear admin-specific fields for moderator
    this.adminLevel = undefined;
    this.adminPosition = undefined;
    this.companyName = undefined;
    this.isSuperAdmin = undefined;
    this.canManageUsers = undefined;
    this.canManagePayroll = undefined;
  }

  // Clear both admin and moderator fields for employees
  if (this.role === 'employee') {
    this.adminLevel = undefined;
    this.adminPosition = undefined;
    this.companyName = undefined;
    this.isSuperAdmin = undefined;
    this.canManageUsers = undefined;
    this.canManagePayroll = undefined;
    this.moderatorLevel = undefined;
    this.moderatorScope = undefined;
    this.canModerateUsers = undefined;
    this.canModerateContent = undefined;
    this.canViewReports = undefined;
    this.canManageReports = undefined;
    this.moderationLimits = undefined;
    this.permissions = [];
  }

  // Calculate salary if rate is provided
  if (this.salaryType === 'monthly' && this.rate > 0 && this.salary === 0) {
    this.salary = this.rate;
    if (this.basicSalary === 0) {
      this.basicSalary = this.rate;
    }
  }

  next();
});

// Method to check role
userSchema.methods.isAdmin = function() {
  return this.role === 'admin';
};

userSchema.methods.isEmployee = function() {
  return this.role === 'employee';
};

userSchema.methods.isModerator = function() {
  return this.role === 'moderator';
};

userSchema.methods.isSuperAdminUser = function() {
  return this.isSuperAdmin || this.adminLevel === 'super' || this.role === 'superAdmin';
};

// Method to check permissions
userSchema.methods.hasPermission = function(permission) {
  if (this.isSuperAdminUser()) return true;
  return this.permissions && this.permissions.includes(permission);
};

// Method to check moderator scope
userSchema.methods.canModerate = function(scope) {
  if (!this.isModerator()) return false;
  return this.moderatorScope && this.moderatorScope.includes(scope);
};

// Method to check if moderator can perform action
userSchema.methods.canPerformModeration = function(actionType) {
  if (!this.isModerator()) return false;
  
  if (!this.moderationLimits) return false;
  
  switch(actionType) {
    case 'ban_user':
      return this.moderationLimits.canBanUsers || false;
    case 'delete_content':
      return this.moderationLimits.canDeleteContent || false;
    case 'edit_content':
      return this.moderationLimits.canEditContent || false;
    case 'warn_user':
      return this.moderationLimits.canWarnUsers || false;
    case 'manage_reports':
      return this.canManageReports || false;
    case 'view_reports':
      return this.canViewReports || false;
    default:
      return false;
  }
};

// Method to get moderator capabilities
userSchema.methods.getModerationCapabilities = function() {
  if (!this.isModerator()) return null;
  
  return {
    level: this.moderatorLevel,
    scope: this.moderatorScope,
    limits: this.moderationLimits,
    permissions: this.permissions,
    canModerateUsers: this.canModerateUsers,
    canModerateContent: this.canModerateContent,
    canViewReports: this.canViewReports,
    canManageReports: this.canManageReports
  };
};

// Method to check if user can manage other users
userSchema.methods.canManageOtherUsers = function() {
  if (this.isSuperAdminUser()) return true;
  
  if (this.role === 'admin') {
    return this.canManageUsers || this.adminLevel === 'super';
  }
  
  if (this.role === 'moderator') {
    return this.canModerateUsers || false;
  }
  
  return false;
};

// Method to check if user can manage payroll
userSchema.methods.canManagePayrollSystem = function() {
  if (this.isSuperAdminUser()) return true;
  
  if (this.role === 'admin') {
    return this.canManagePayroll || this.adminLevel === 'super';
  }
  
  return false;
};

// Method to get user's role details
userSchema.methods.getRoleDetails = function() {
  const details = {
    role: this.role,
    isAdmin: this.isAdmin(),
    isEmployee: this.isEmployee(),
    isModerator: this.isModerator(),
    isSuperAdmin: this.isSuperAdminUser()
  };
  
  if (this.isAdmin()) {
    details.adminLevel = this.adminLevel;
    details.adminPosition = this.adminPosition;
    details.companyName = this.companyName;
    details.canManageUsers = this.canManageUsers;
    details.canManagePayroll = this.canManagePayroll;
  }
  
  if (this.isModerator()) {
    details.moderatorLevel = this.moderatorLevel;
    details.moderatorScope = this.moderatorScope;
    details.moderationLimits = this.moderationLimits;
  }
  
  return details;
};

// Static method to get user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase().trim(), isDeleted: false });
};

// Static method to check if email exists
userSchema.statics.emailExists = async function(email) {
  const user = await this.findOne({ 
    email: email.toLowerCase().trim(), 
    isDeleted: false 
  });
  return !!user;
};

// Static method to get all admins
userSchema.statics.getAllAdmins = function() {
  return this.find({ 
    role: 'admin', 
    isDeleted: false 
  }).select('-password -__v');
};

// Static method to get all moderators
userSchema.statics.getAllModerators = function() {
  return this.find({ 
    role: 'moderator', 
    isDeleted: false 
  }).select('-password -__v');
};

// Static method to get all employees
userSchema.statics.getAllEmployees = function() {
  return this.find({ 
    role: 'employee', 
    isDeleted: false 
  }).select('-password -__v');
};

// Static method to find by employeeId
userSchema.statics.findByEmployeeId = function(employeeId) {
  return this.findOne({ 
    employeeId: employeeId, 
    isDeleted: false 
  });
};

// Static method to get users by department
userSchema.statics.getByDepartment = function(department) {
  return this.find({ 
    department: department, 
    isDeleted: false 
  }).select('-password -__v');
};
// Static method to get all onsite employees
userSchema.statics.getAllOnsiteEmployees = function() {
  return this.find({ 
    role: 'employee', 
    workLocationType: 'onsite',
    isDeleted: false,
    isActive: true 
  }).select('-password -__v');
};

// Static method to get employees by work location
userSchema.statics.getByWorkLocation = function(locationType) {
  return this.find({ 
    workLocationType: locationType,
    isDeleted: false 
  }).select('-password -__v');
};

module.exports = mongoose.model("User", userSchema);