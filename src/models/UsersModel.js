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
      enum: ["admin", "employee"],  
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
      unique: true,
      sparse: true
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

// 🔹 **CRITICAL FIX: Password Hashing Middleware (First model থেকে নেওয়া)**
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return next();
  
  try {
    // ✅ প্রথম model থেকে সঠিক implementation
    const salt = await bcrypt.genSalt(10);  // 10 rounds of salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 🔹 **Password Comparison Method (First model থেকে নেওয়া)**
userSchema.methods.matchPassword = async function (enteredPassword) {
  try {
    // ✅ bcrypt.compare ব্যবহার করুন
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

// 🔹 **Alternative: Direct password check method (if matchPassword doesn't work)**
userSchema.methods.checkPassword = async function (password) {
  try {
    console.log('🔐 Checking password:');
    console.log('- Input password:', password);
    console.log('- Stored password hash:', this.password?.substring(0, 30) + '...');
    
    const result = await bcrypt.compare(password, this.password);
    console.log('- Bcrypt compare result:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Password check error:', error);
    
    // Fallback: If bcrypt fails, try direct comparison for plain text passwords
    if (this.password && !this.password.startsWith('$2')) {
      console.log('⚠️ Falling back to direct comparison');
      return password === this.password;
    }
    
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

// ✅ **সঠিক Password Hashing (আগের model থেকে)**
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);  // এই line টি crucial
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ✅ **সঠিক Password Comparison (আগের model থেকে)**
userSchema.methods.matchPassword = async function (password) {
  return await bcrypt.compare(password, this.password);  // await টি important
};

// Optional: Basic virtuals (নতুন model থেকে)
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model("User", userSchema);