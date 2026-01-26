// models/MealModel.js
const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema({
  // Basic Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  userInfo: {
    employeeId: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    department: { type: String, default: '' },
    designation: { type: String, default: '' },
    role: { type: String, required: true }
  },
  
  // Meal Details
  mealType: {
    type: String,
    enum: ['lunch', 'dinner'],
    default: 'lunch'
  },
  
  preference: {
    type: String,
    enum: ['office', 'outside'],
    required: true
  },
  
  date: {
    type: Date,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'served'],
    default: 'pending'
  },
  
  // Approval Info
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  approvedAt: {
    type: Date
  },
  
  // Cost & Payment
  cost: {
    type: Number,
    default: 0
  },
  
  paymentMethod: {
    type: String,
    enum: ['salary_deduction', 'company_paid', 'cash', 'card'],
    default: 'salary_deduction'
  },
  
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'deducted'],
    default: 'pending'
  },
  
  // Meal Details
  mealDetails: {
    vendor: { type: String, default: '' },
    menu: { type: String, default: '' },
    deliveryTime: { type: String },
    specialInstructions: { type: String, default: '' },
    rating: { type: Number, min: 1, max: 5 },
    feedback: { type: String, default: '' },
    servedBy: { type: String, default: '' },
    servedAt: { type: Date }
  },
  
  // Cancellation
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  cancelledAt: {
    type: Date
  },
  
  cancellationReason: {
    type: String,
    default: ''
  },
  
  // System
  notes: {
    type: String,
    default: ''
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
mealSchema.index({ user: 1, date: 1 }, { unique: true });
mealSchema.index({ date: 1 });
mealSchema.index({ status: 1 });
mealSchema.index({ 'userInfo.employeeId': 1 });
mealSchema.index({ 'userInfo.department': 1 });

// Pre-save middleware
mealSchema.pre('save', async function(next) {
  if (!this.userInfo.employeeId && this.user) {
    const User = mongoose.model('User');
    const user = await User.findById(this.user)
      .select('employeeId firstName lastName email department designation role');
    
    if (user) {
      this.userInfo = {
        employeeId: user.employeeId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: user.department || '',
        designation: user.designation || '',
        role: user.role
      };
    }
  }
  next();
});

// Virtuals
mealSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0];
});

// Methods
mealSchema.methods.canCancel = function() {
  const now = new Date();
  const mealDate = new Date(this.date);
  const cutoffTime = new Date(mealDate);
  cutoffTime.setHours(10, 0, 0, 0); // Can cancel until 10AM
  
  return now < cutoffTime && 
         this.status !== 'cancelled' && 
         this.status !== 'served';
};

// Static Methods
mealSchema.statics.getDailyMeals = function(date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  return this.find({
    date: { $gte: startDate, $lte: endDate },
    isDeleted: false
  }).sort({ 'userInfo.department': 1, 'userInfo.employeeId': 1 });
};

module.exports = mongoose.model("Meal", mealSchema);