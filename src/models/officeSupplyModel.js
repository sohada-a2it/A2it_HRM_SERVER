const mongoose = require("mongoose");
const officeSupplySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
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
module.exports = mongoose.model("OfficeSupply", officeSupplySchema);