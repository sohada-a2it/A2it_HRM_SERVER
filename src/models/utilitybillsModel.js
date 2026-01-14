const mongoose = require("mongoose");
const billSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Add month and year fields for easier querying
  month: {
    type: Number, // 1-12
    required: true
  },
  year: {
    type: Number, // 2024, 2025, etc.
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'other'],
    default: 'bank_transfer'
  },
  paymentStatus: {
    type: String,
    enum: ['paid', 'unpaid', 'pending'],
    default: 'paid'
  },
  isFixed: {
    type: Boolean,
    default: false
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

// Add unique compound index to prevent duplicate bills for same month-year
billSchema.index({ name: 1, month: 1, year: 1 }, { unique: true });
module.exports = mongoose.model('UtilityBill', billSchema);