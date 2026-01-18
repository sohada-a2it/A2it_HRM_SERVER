const mongoose = require('mongoose');
const softwareSubscriptionSchema = new mongoose.Schema({
  softwareName: {
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
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Mobile Banking', 'Card'],
    required: true
  },
  // Add duration fields
  durationNumber: {
    type: Number,
    min: 0,
    default: null
  },
  durationUnit: {
    type: String,
    enum: ['day', 'week', 'month', 'year', null],
    default: null
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
softwareSubscriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
module.exports = mongoose.model('SoftwareSubscription', softwareSubscriptionSchema);