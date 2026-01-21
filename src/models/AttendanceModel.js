// models/AttendanceModel.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employee: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  date: { 
    type: Date, 
    required: true,
    index: true 
  },
  clockIn: { 
    type: Date 
  },
  clockOut: { 
    type: Date 
  },
  totalHours: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 24
  },
  status: { 
    type: String, 
    enum: ['Present', 'Absent', 'Leave', 'Govt Holiday', 'Weekly Off', 'Off Day', 'Late', 'Clocked In', 'Half Day', 'Early', 'Unpaid Leave', 'Half Paid Leave'], 
    default: 'Absent' 
  },
  
  // Shift Details (employee specific)
  shift: {
    type: {
      name: { type: String, default: 'Regular' },
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' },
      lateThreshold: { type: Number, default: 5 },
      earlyThreshold: { type: Number, default: -1 },
      autoClockOutDelay: { type: Number, default: 10 }
    },
    default: {
      name: "Regular",
      start: "09:00",
      end: "18:00",
      lateThreshold: 5,
      earlyThreshold: -1,
      autoClockOutDelay: 10
    }
  },
  
  // Late/Early Calculation
  lateMinutes: {
    type: Number,
    default: 0
  },
  earlyMinutes: {
    type: Number,
    default: 0
  },
  isLate: {
    type: Boolean,
    default: false
  },
  isEarly: {
    type: Boolean,
    default: false
  },
  
  // Auto Operations
  autoClockOut: {
    type: Boolean,
    default: false
  },
  autoClockOutTime: {
    type: String
  },
  autoMarked: {
    type: Boolean,
    default: false
  },
  markedAbsent: {
    type: Boolean,
    default: false
  },
  absentMarkedAt: {
    type: Date
  },
  
  // Location and Device
  ipAddress: { 
    type: String 
  },
  device: { 
    type: Object 
  },
  location: {
    type: String
  },
  
  // Admin operations
  correctedByAdmin: { 
    type: Boolean, 
    default: false 
  },
  correctedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  correctionDate: {
    type: Date
  },
  correctionReason: {
    type: String
  },
  
  // Admin adjusted shift
  adminAdjustedShift: {
    type: Boolean,
    default: false
  },
  adminShiftAdjustment: {
    start: String,
    end: String,
    lateThreshold: Number,
    earlyThreshold: Number,
    autoClockOutDelay: Number,
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    adjustmentDate: Date,
    reason: String
  },
  
  // Leave reference (if applicable)
  leaveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leave'
  },
  leavePayStatus: {
    type: String,
    enum: ['Paid', 'Unpaid', 'HalfPaid', null],
    default: null
  },
  
  // Overtime
  overtimeHours: {
    type: Number,
    default: 0
  },
  remarks: {
    type: String
  },
  
  // Status flags
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  }
}, { 
  timestamps: true 
});

// Indexes
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ employee: 1, status: 1 });
attendanceSchema.index({ isLate: 1 });
attendanceSchema.index({ autoClockOut: 1 });
attendanceSchema.index({ markedAbsent: 1 });
attendanceSchema.index({ isDeleted: 1 });

// Pre-save middleware to calculate hours
attendanceSchema.pre('save', function(next) {
  if (this.clockIn && this.clockOut) {
    const diffMs = this.clockOut - this.clockIn;
    this.totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(4));
  }
  next();
});

// Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0];
});

// Method to check if attendance is working day
attendanceSchema.methods.isWorkingDay = function() {
  const nonWorkingStatuses = ['Govt Holiday', 'Weekly Off', 'Off Day', 'Leave', 'Unpaid Leave', 'Half Paid Leave'];
  return !nonWorkingStatuses.includes(this.status);
};

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);