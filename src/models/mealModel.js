// models/MealModel.js
const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema(
  {
    // User reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required']
    },
    
    // User info for quick access (denormalized)
    userInfo: {
      employeeId: String,
      firstName: String,
      lastName: String,
      email: String,
      department: String,
      designation: String,
      role: String,
      workLocationType: String
    },
    
    // Meal Request Details
    mealType: {
      type: String,
      enum: ['lunch', 'dinner', 'both'],
      default: 'lunch'
    },
    
    preference: {
      type: String,
      enum: ['office', 'outside'],
      required: [true, 'Meal preference is required']
    },
    
    date: {
      type: Date,
      required: [true, 'Meal date is required']
    },
    
    // Status Management
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'served', 'not_served'],
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
    
    // Meal Cost & Billing
    cost: {
      type: Number,
      default: 0
    },
    
    isPaid: {
      type: Boolean,
      default: false
    },
    
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'mobile_banking', 'salary_deduction', 'company_paid', 'subscription'],
      default: 'salary_deduction'
    },
    
    // Meal Details
    mealDetails: {
      vendor: {
        type: String,
        default: ''
      },
      
      menu: {
        type: String,
        default: ''
      },
      
      deliveryTime: {
        type: String
      },
      
      specialInstructions: {
        type: String,
        default: ''
      },
      
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      
      feedback: {
        type: String,
        default: ''
      }
    },
    
    // Cancellation & Changes
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
    
    // System Fields
    requestTime: {
      type: Date,
      default: Date.now
    },
    
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    
    notes: {
      type: String,
      default: ''
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
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes for faster queries
mealSchema.index({ user: 1, date: 1 }, { unique: true }); // One meal per user per day
mealSchema.index({ date: 1, status: 1 });
mealSchema.index({ status: 1 });
mealSchema.index({ user: 1, status: 1 });
mealSchema.index({ 'userInfo.employeeId': 1 });
mealSchema.index({ date: 1, 'userInfo.department': 1 });

// Pre-save middleware to populate userInfo
mealSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('user')) {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(this.user).select('employeeId firstName lastName email department designation role workLocationType');
      
      if (user) {
        this.userInfo = {
          employeeId: user.employeeId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          department: user.department || '',
          designation: user.designation || '',
          role: user.role,
          workLocationType: user.workLocationType
        };
      }
    } catch (error) {
      return next(error);
    }
  }
  
  this.lastUpdated = new Date();
  next();
});

// Virtual for formatted date
mealSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0];
});

// Virtual for full name
mealSchema.virtual('userFullName').get(function() {
  if (this.userInfo) {
    return `${this.userInfo.firstName} ${this.userInfo.lastName}`;
  }
  return '';
});

// Method to check if meal can be cancelled
mealSchema.methods.canCancel = function() {
  const now = new Date();
  const mealDate = new Date(this.date);
  const dayBefore = new Date(mealDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  
  // Can cancel until 4PM the day before
  dayBefore.setHours(16, 0, 0, 0);
  
  return now < dayBefore && 
         this.status !== 'cancelled' && 
         this.status !== 'served' &&
         this.status !== 'rejected';
};

// Method to check if meal can be approved
mealSchema.methods.canApprove = function() {
  return this.status === 'pending' || this.status === 'rejected';
};

// Method to check if meal can be rejected
mealSchema.methods.canReject = function() {
  return this.status === 'pending' || this.status === 'approved';
};

// Method to mark as served
mealSchema.methods.markAsServed = function() {
  if (this.status === 'approved') {
    this.status = 'served';
    return true;
  }
  return false;
};

// Static method to get daily meals
mealSchema.statics.getDailyMeals = function(date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  return this.find({
    date: { $gte: startDate, $lte: endDate },
    isDeleted: false
  }).populate('user', 'firstName lastName employeeId department designation').sort({ 'userInfo.department': 1, 'userInfo.employeeId': 1 });
};

// Static method to get user's monthly meals
mealSchema.statics.getUserMonthlyMeals = function(userId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  return this.find({
    user: userId,
    date: { $gte: startDate, $lte: endDate },
    isDeleted: false
  }).sort({ date: 1 });
};

// Static method to get department meals
mealSchema.statics.getDepartmentMeals = function(department, date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  return this.find({
    date: { $gte: startDate, $lte: endDate },
    'userInfo.department': department,
    isDeleted: false
  }).populate('user', 'firstName lastName employeeId').sort({ 'userInfo.employeeId': 1 });
};

// Static method to count meals by status
mealSchema.statics.countMealsByStatus = function(date, status) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  return this.countDocuments({
    date: { $gte: startDate, $lte: endDate },
    status: status,
    isDeleted: false
  });
};

// Static method to get pending meal requests
mealSchema.statics.getPendingRequests = function(date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  return this.find({
    date: { $gte: startDate, $lte: endDate },
    status: 'pending',
    isDeleted: false
  }).populate('user', 'firstName lastName employeeId department').sort({ requestTime: 1 });
};

// Static method to get meal statistics
mealSchema.statics.getMealStatistics = function(startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          preference: "$preference",
          status: "$status"
        },
        count: { $sum: 1 },
        totalCost: { $sum: "$cost" }
      }
    },
    {
      $group: {
        _id: "$_id.date",
        preferences: {
          $push: {
            preference: "$_id.preference",
            status: "$_id.status",
            count: "$count",
            cost: "$totalCost"
          }
        },
        totalMeals: { $sum: "$count" },
        totalCost: { $sum: "$totalCost" }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// Static method to check if user has meal request for date
mealSchema.statics.hasMealRequest = async function(userId, date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  
  const meal = await this.findOne({
    user: userId,
    date: { $gte: startDate, $lte: endDate },
    isDeleted: false,
    status: { $nin: ['cancelled', 'rejected'] }
  });
  
  return meal;
};

// Static method to create bulk meal requests (for subscription)
mealSchema.statics.createBulkRequests = async function(requests) {
  return this.insertMany(requests);
};

// Static method to approve bulk meals
mealSchema.statics.approveBulkMeals = async function(mealIds, approvedBy) {
  return this.updateMany(
    {
      _id: { $in: mealIds },
      status: { $in: ['pending', 'rejected'] }
    },
    {
      $set: {
        status: 'approved',
        approvedBy: approvedBy,
        approvedAt: new Date()
      }
    }
  );
};

module.exports = mongoose.model("Meal", mealSchema);