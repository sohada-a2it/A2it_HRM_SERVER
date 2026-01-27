const mongoose = require("mongoose");

const mealSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required']
    },
    
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
    
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'served', 'not_served'],
      default: 'pending'
    },
    
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    approvedAt: {
      type: Date
    },
    
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
    
    notes: {
      type: String,
      default: ''
    },
    
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { 
    timestamps: true
  }
);

mealSchema.index({ user: 1, date: 1 }, { unique: true });
mealSchema.index({ date: 1, status: 1 });
mealSchema.index({ status: 1 });

module.exports = mongoose.model("Meal", mealSchema);