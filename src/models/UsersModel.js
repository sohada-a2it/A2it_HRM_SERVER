const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // ============ COMMON FIELDS (Employee & Admin) ============
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
      enum: ["superAdmin", "admin", "employee"],  
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
  salary: {
    type: Number,
    default: 0
  },
  
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
  
  // Contract Details
  contractType: {
    type: String,
    enum: ['Permanent', 'Contractual', 'Probation', 'Part-time', 'Intern'],
    default: 'Permanent'
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
    permissions: {
      type: [String],
      default: []
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
    shiftTiming: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' }
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
  }

  // Clear admin-specific fields for employees
  if (this.role === 'employee') {
    this.adminLevel = undefined;
    this.adminPosition = undefined;
    this.companyName = undefined;
    this.isSuperAdmin = undefined;
    this.canManageUsers = undefined;
    this.canManagePayroll = undefined;
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

// Method to check permissions
userSchema.methods.hasPermission = function(permission) {
  if (this.role !== 'admin') return false;
  if (this.isSuperAdmin || this.adminLevel === 'super') return true;
  return this.permissions && this.permissions.includes(permission);
};

// Static method to get user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Static method to check if email exists
userSchema.statics.emailExists = async function(email) {
  const user = await this.findOne({ email: email.toLowerCase().trim() });
  return !!user;
};

module.exports = mongoose.model("User", userSchema);