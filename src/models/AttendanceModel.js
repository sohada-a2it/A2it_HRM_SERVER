// models/AttendanceModel.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employee: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  date: { 
    type: Date, 
    required: true 
  },
  clockIn: { 
    type: Date 
  },
  clockOut: { 
    type: Date 
  },
  totalHours: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['Present', 'Absent', 'Leave', 'Govt Holiday', 'Weekly Off', 'Off Day', 'Late', 'Clocked In'], 
    default: 'Absent' 
  },
  ipAddress: { 
    type: String 
  },
  device: { 
    type: Object 
  },
  location: {
    type: String
  },
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
  autoMarked: {
    type: Boolean,
    default: false
  },
  leaveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leave'
  }
}, { 
  timestamps: true 
});

// Compound index for faster queries
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports =
  mongoose.models.Attendance ||
  mongoose.model('Attendance', attendanceSchema);
