import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// ============ SEQUENCE SCHEMA (প্রথমে declare করুন) ============
const sequenceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: Number,
    required: true,
    default: 0
  },
  prefix: {
    type: String,
    default: ''
  },
  lastGenerated: {
    type: Date,
    default: Date.now
  },
  description: {
    type: String,
    default: ''
  }
}, { 
  timestamps: true 
});

// Sequence static methods
sequenceSchema.statics.getNextSequence = async function(name, prefix = '') {
  try {
    const sequence = await this.findOneAndUpdate(
      { name },
      { 
        $inc: { value: 1 },
        $set: { lastGenerated: new Date() }
      },
      { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: true 
      }
    );
    
    return {
      value: sequence.value,
      formattedValue: String(sequence.value).padStart(4, '0'),
      fullId: prefix ? `${prefix}-${String(sequence.value).padStart(4, '0')}` : String(sequence.value).padStart(4, '0')
    };
  } catch (error) {
    console.error('❌ Sequence generation error:', error);
    throw error;
  }
};

// Initialize default sequences
sequenceSchema.statics.initializeDefaultSequences = async function() {
  try {
    const defaultSequences = [
      { 
        name: 'employeeSequence', 
        prefix: 'EMP', 
        value: 0, 
        description: 'For employee ID generation' 
      },
      { 
        name: 'adminSequence', 
        prefix: 'ADM', 
        value: 0, 
        description: 'For admin ID generation' 
      },
      { 
        name: 'superAdminSequence', 
        prefix: 'SUP', 
        value: 0, 
        description: 'For super admin ID generation' 
      },
      { 
        name: 'moderatorSequence', 
        prefix: 'MOD', 
        value: 0, 
        description: 'For moderator ID generation' 
      }
    ];

    for (const seq of defaultSequences) {
      await this.findOneAndUpdate(
        { name: seq.name },
        seq,
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    
    console.log('✅ Default sequences initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize sequences:', error);
    return false;
  }
};

// ✅ Sequence Model তৈরি করুন (User এর আগে)
const Sequence = mongoose.models.Sequence || mongoose.model("Sequence", sequenceSchema);

// ============ USER SCHEMA ============
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
      index: true
    },

    // Salary Info - শুধুমাত্র Employee এবং Moderator-এর জন্য
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

    // Salary Information - শুধুমাত্র Employee এবং Moderator-এর জন্য
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
    
    // ============ EMPLOYEE & MODERATOR SPECIFIC FIELDS ============
    // Contract Details - শুধুমাত্র Employee এবং Moderator-এর জন্য
    contractType: {
      type: String,
      enum: ['Permanent', 'Contractual', 'Probation', 'Part-time', 'Intern'],
      default: 'Permanent'
    },

    // Payment Details - শুধুমাত্র Employee এবং Moderator-এর জন্য
    bankDetails: {
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
      branchName: { type: String, default: '' },
      routingNumber: { type: String, default: '' }
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

    // ============ EMPLOYEE-SPECIFIC FIELDS (শুধুমাত্র Employee) ============
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    attendanceId: {
      type: String,
      default: ''
    },

    // Shift Management - শুধুমাত্র Employee-এর জন্য
    shiftTiming: {
      defaultShift: {
        start: { type: String, default: '09:00' },
        end: { type: String, default: '18:00' }
      },
      assignedShift: {
        start: { type: String, default: '' },
        end: { type: String, default: '' },
        assignedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null
        },
        assignedAt: { type: Date, default: null },
        effectiveDate: { type: Date, default: null },
        isActive: { type: Boolean, default: false }
      },
      shiftHistory: [{
        start: String,
        end: String,
        assignedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        assignedAt: Date,
        effectiveDate: Date,
        endedAt: Date,
        reason: String
      }]
    },

    // Shift Preferences - শুধুমাত্র Employee-এর জন্য
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
        
        // Role অনুযায়ী ফিল্ড hide/show
        if (ret.role === 'admin' || ret.role === 'superAdmin') {
          // Admin-দের জন্য Employee/MODERATOR specific ফিল্ড hide
          delete ret.contractType;
          delete ret.bankDetails;
          delete ret.salaryStructure;
          delete ret.shiftTiming;
          delete ret.preferredShift;
          delete ret.managerId;
          delete ret.attendanceId;
          delete ret.salaryType;
          delete ret.rate;
          delete ret.salary;
          delete ret.basicSalary;
        }
        
        return ret;
      }
    }
  }
);

// ============ PRE-SAVE MIDDLEWARE (একটি মাত্র) ============
userSchema.pre('save', async function(next) {
  try {
    // 1. Password hashing
    if (this.isModified("password") && this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }

    // 2. ID generation logic
    if ((!this.employeeId || this.employeeId === '') && !this.isDeleted) {
      const rolePrefixes = {
        'employee': { name: 'employeeSequence', prefix: 'EMP' },
        'admin': { name: 'adminSequence', prefix: 'ADM' },
        'superAdmin': { name: 'superAdminSequence', prefix: 'SUP' },
        'moderator': { name: 'moderatorSequence', prefix: 'MOD' }
      };

      const roleConfig = rolePrefixes[this.role] || rolePrefixes['employee'];
      
      const sequenceResult = await Sequence.getNextSequence(
        roleConfig.name, 
        roleConfig.prefix
      );
      
      this.employeeId = sequenceResult.fullId;
      
      if (this.role === 'employee') {
        this.attendanceId = this.employeeId;
      }
    }

    // ============ ADMIN LOGIC ============
    if (this.role === 'admin' || this.role === 'superAdmin') {
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

      // Clear Employee/MODERATOR specific fields for admin
      this.contractType = undefined;
      this.bankDetails = undefined;
      this.salaryStructure = undefined;
      this.salaryType = undefined;
      this.rate = undefined;
      this.salary = undefined;
      this.basicSalary = undefined;
      this.shiftTiming = undefined;
      this.preferredShift = undefined;
      this.managerId = undefined;
      this.attendanceId = undefined;
      
      // Clear moderator-specific fields for admin
      this.moderatorLevel = undefined;
      this.moderatorScope = undefined;
      this.canModerateUsers = undefined;
      this.canModerateContent = undefined;
      this.canViewReports = undefined;
      this.canManageReports = undefined;
      this.moderationLimits = undefined;
    }

    // ============ MODERATOR LOGIC ============
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

      // Set default contract type for moderator
      if (!this.contractType || this.contractType === '') {
        this.contractType = 'Permanent';
      }

      // Set default bank details structure for moderator
      if (!this.bankDetails) {
        this.bankDetails = {
          bankName: '',
          accountNumber: '',
          accountHolderName: '',
          branchName: '',
          routingNumber: ''
        };
      }

      // Set default salary structure for moderator
      if (!this.salaryStructure) {
        this.salaryStructure = {
          basicSalary: 0,
          houseRent: 0,
          medicalAllowance: 0,
          conveyance: 0,
          otherAllowances: 0,
          grossSalary: 0,
          providentFund: 0,
          tax: 0
        };
      }

      // Clear admin-specific fields for moderator
      this.adminLevel = undefined;
      this.adminPosition = undefined;
      this.companyName = undefined;
      this.isSuperAdmin = undefined;
      this.canManageUsers = undefined;
      this.canManagePayroll = undefined;
      
      // Clear employee-specific fields for moderator
      this.shiftTiming = undefined;
      this.preferredShift = undefined;
      this.managerId = undefined;
      this.attendanceId = undefined;
    }

    // ============ EMPLOYEE LOGIC ============
    if (this.role === 'employee') {
      // Set default contract type for employee
      if (!this.contractType || this.contractType === '') {
        this.contractType = 'Permanent';
      }

      // Set default bank details structure for employee
      if (!this.bankDetails) {
        this.bankDetails = {
          bankName: '',
          accountNumber: '',
          accountHolderName: '',
          branchName: '',
          routingNumber: ''
        };
      }

      // Set default salary structure for employee
      if (!this.salaryStructure) {
        this.salaryStructure = {
          basicSalary: 0,
          houseRent: 0,
          medicalAllowance: 0,
          conveyance: 0,
          otherAllowances: 0,
          grossSalary: 0,
          providentFund: 0,
          tax: 0
        };
      }

      // Set default shift timing for employee
      if (!this.shiftTiming) {
        this.shiftTiming = {
          defaultShift: {
            start: '09:00',
            end: '18:00'
          },
          assignedShift: {
            start: '',
            end: '',
            assignedBy: null,
            assignedAt: null,
            effectiveDate: null,
            isActive: false
          },
          shiftHistory: []
        };
      }

      // Clear admin-specific fields for employee
      this.adminLevel = undefined;
      this.adminPosition = undefined;
      this.companyName = undefined;
      this.isSuperAdmin = undefined;
      this.canManageUsers = undefined;
      this.canManagePayroll = undefined;
      
      // Clear moderator-specific fields for employee
      this.moderatorLevel = undefined;
      this.moderatorScope = undefined;
      this.canModerateUsers = undefined;
      this.canModerateContent = undefined;
      this.canViewReports = undefined;
      this.canManageReports = undefined;
      this.moderationLimits = undefined;
      this.permissions = [];
    }

    // Calculate salary if rate is provided (only for employee and moderator)
    if ((this.role === 'employee' || this.role === 'moderator') && 
        this.salaryType === 'monthly' && this.rate > 0 && this.salary === 0) {
      this.salary = this.rate;
      if (this.basicSalary === 0) {
        this.basicSalary = this.rate;
      }
    }

    next();
  } catch (error) {
    console.error('❌ Error in user pre-save middleware:', error);
    next(error);
  }
});

// ============ VIRTUAL FIELDS ============
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// ============ METHODS ============
// ✅ **সঠিক Password Comparison Method**
userSchema.methods.matchPassword = async function (enteredPassword) {
  try {
    if (!this.password) {
      console.log('❌ No password stored for user');
      return false;
    }
    
    const result = await bcrypt.compare(enteredPassword, this.password);
    return result;
  } catch (error) {
    console.error('❌ matchPassword error:', error);
    return false;
  }
};

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

// Method to check if user can have bank details
userSchema.methods.canHaveBankDetails = function() {
  return this.role === 'employee' || this.role === 'moderator';
};

// Method to check if user can have contract type
userSchema.methods.canHaveContractType = function() {
  return this.role === 'employee' || this.role === 'moderator';
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
    isSuperAdmin: this.isSuperAdminUser(),
    employeeId: this.employeeId,
    canHaveBankDetails: this.canHaveBankDetails(),
    canHaveContractType: this.canHaveContractType()
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
    details.contractType = this.contractType;
    details.hasBankDetails = !!this.bankDetails;
  }
  
  if (this.isEmployee()) {
    details.contractType = this.contractType;
    details.hasBankDetails = !!this.bankDetails;
    details.hasShiftTiming = !!this.shiftTiming;
    details.managerId = this.managerId;
  }
  
  return details;
};

// ============ STATIC METHODS ============
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
  }).select('-password -__v -contractType -bankDetails -salaryStructure -shiftTiming -preferredShift -managerId -attendanceId');
};

// Static method to get all moderators
userSchema.statics.getAllModerators = function() {
  return this.find({ 
    role: 'moderator', 
    isDeleted: false 
  }).select('-password -__v -shiftTiming -preferredShift -managerId -attendanceId');
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

// Static method to generate user ID (for manual creation)
userSchema.statics.generateUserId = async function(role) {
  const rolePrefixes = {
    'employee': { name: 'employeeSequence', prefix: 'EMP' },
    'admin': { name: 'adminSequence', prefix: 'ADM' },
    'superAdmin': { name: 'superAdminSequence', prefix: 'SUP' },
    'moderator': { name: 'moderatorSequence', prefix: 'MOD' }
  };

  const roleConfig = rolePrefixes[role] || rolePrefixes['employee'];
  const sequenceResult = await Sequence.getNextSequence(
    roleConfig.name, 
    roleConfig.prefix
  );
  
  return sequenceResult.fullId;
};

// Static method to initialize sequences (call once at app startup)
userSchema.statics.initializeSequences = async function() {
  return await Sequence.initializeDefaultSequences();
};

// ============ EXPORT ============
const User = mongoose.models.User || mongoose.model("User", userSchema);

export { User, Sequence };