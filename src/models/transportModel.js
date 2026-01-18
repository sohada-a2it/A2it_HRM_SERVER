const mongoose = require("mongoose");
const transportExpenseSchema = new mongoose.Schema({
  transportName: {
    type: String,
    required: true,
    trim: true
  },
  cost: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Mobile Banking', 'Card'],
    required: true
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
transportExpenseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
module.exports = mongoose.model('TransportExpense', transportExpenseSchema);
