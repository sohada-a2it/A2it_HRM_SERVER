// =============== FOOD COST SCHEMA ===============
const mongoose = require("mongoose");
const foodCostSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true, // This ensures only one entry per date
    index: true
  },
  cost: {
    type: Number,
    required: true,
    min: 0
  },
  note: {
    type: String,
    trim: true,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Add pre-save middleware
foodCostSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
module.exports = mongoose.model('FoodCost', foodCostSchema);