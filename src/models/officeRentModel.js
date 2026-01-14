// Office Rent Schema
const officeRentSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  rent: {
    type: Number,
    required: true,
    min: 0
  },
paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'other'],
    default: 'cash'
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
officeRentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});
module.exports = mongoose.model('OfficeRent', officeRentSchema);