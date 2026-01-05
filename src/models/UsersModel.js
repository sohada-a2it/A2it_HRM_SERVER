const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // Personal Info (পুরানো + নতুন থেকে নেওয়া)
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

    // Role & Status (পুরানো থেকে নেওয়া - সবচেয়ে important)
    role: { 
      type: String, 
      enum: ["admin", "employee"],  // আগেরটা থেকে
      default: "employee" 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    status: { 
      type: String, 
      enum: ['active', 'inactive', 'suspended'],  // আগেরটা থেকে
      default: 'active' 
    },

    // Professional Info (দুইটা থেকে merge)
    department: { type: String, default: '' },
    designation: { type: String, default: '' },
    phone: { type: String, default: '' },
    employeeId: { type: String, default: '' },

    // Salary Info (সহজ version নিন আগেরটা থেকে)
    salaryType: { 
      type: String, 
      enum: ['hourly', 'monthly', 'project'],  // আগেরটা থেকে
    },
    rate: { 
      type: Number,  
      min: 0 
    },
    joiningDate: { 
      type: Date,  
    },

    // Profile Picture
    picture: { 
      type: String,
      default: ''  // আগেরটা থেকে
    }
  },
  { 
    timestamps: true,
    // Optional: আপনি চাইলে toJSON transform add করতে পারেন
    toJSON: { 
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      }
    }
  }
);

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