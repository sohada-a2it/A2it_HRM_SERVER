const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  // Shift details
  shiftName: {
    type: String,
    required: [true, 'Shift name is required'],
    trim: true
  },
  
  // Shift timing
  startTime: {
    type: String, // HH:mm format
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm (24-hour)']
  },
  
  endTime: {
    type: String, // HH:mm format
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm (24-hour)']
  },
  
  // Shift type
  shiftType: {
    type: String,
    enum: ['regular', 'flexible', 'night', 'rotational', 'custom'],
    default: 'regular'
  },
  
  // Breaks information
  breaks: [{
    name: String,
    startTime: String,
    endTime: String,
    duration: Number, // in minutes
    isPaid: {
      type: Boolean,
      default: true
    }
  }],
  
  totalHours: {
    type: Number,
    default: function() {
      // Calculate total working hours
      if (this.startTime && this.endTime) {
        const [startHour, startMinute] = this.startTime.split(':').map(Number);
        const [endHour, endMinute] = this.endTime.split(':').map(Number);
        
        let totalMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        
        // Subtract break times
        if (this.breaks && this.breaks.length > 0) {
          const breakMinutes = this.breaks.reduce((sum, br) => sum + (br.duration || 0), 0);
          totalMinutes -= breakMinutes;
        }
        
        return parseFloat((totalMinutes / 60).toFixed(2));
      }
      return 8;
    }
  },
  
  // Overtime settings
  overtimeSettings: {
    startAfterHours: {
      type: Number,
      default: 8
    },
    overtimeRate: {
      type: Number,
      default: 1.5
    }
  },
  
  // Late/Early settings
  lateThreshold: {
    type: Number,
    default: 5,
    comment: 'Minutes allowed before marking as late'
  },
  
  earlyLeaveThreshold: {
    type: Number,
    default: -1,
    comment: 'Minutes allowed before marking as early leave (-1 means disabled)'
  },
  
  // Assignment
  assignedTo: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  
  // Department specific
  department: {
    type: String,
    default: 'All'
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Pre-save middleware
shiftSchema.pre('save', function(next) {
  // Ensure end time is after start time
  if (this.startTime && this.endTime) {
    const [startHour, startMinute] = this.startTime.split(':').map(Number);
    const [endHour, endMinute] = this.endTime.split(':').map(Number);
    
    let startTotal = startHour * 60 + startMinute;
    let endTotal = endHour * 60 + endMinute;
    
    // Handle overnight shifts
    if (endTotal <= startTotal) {
      endTotal += 24 * 60;
    }
    
    // Calculate total hours
    this.totalHours = parseFloat(((endTotal - startTotal) / 60).toFixed(2));
  }
  
  next();
});

// Virtual for display time
shiftSchema.virtual('displayTime').get(function() {
  return `${this.startTime} - ${this.endTime}`;
});

// Virtual for duration
shiftSchema.virtual('duration').get(function() {
  const hours = Math.floor(this.totalHours);
  const minutes = Math.round((this.totalHours - hours) * 60);
  return `${hours}h ${minutes}m`;
});

// Method to check if shift is assigned to user
shiftSchema.methods.isAssignedToUser = function(userId) {
  return this.assignedTo.some(assignment => 
    assignment.userId.toString() === userId.toString() && 
    assignment.isActive
  );
};

// Method to get active assignments
shiftSchema.methods.getActiveAssignments = function() {
  return this.assignedTo.filter(assignment => assignment.isActive);
};

// Method to get user's current shift
shiftSchema.statics.getUserCurrentShift = async function(userId) {
  const now = new Date();
  const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return this.findOne({
    'assignedTo.userId': userId,
    'assignedTo.isActive': true,
    'assignedTo.startDate': { $lte: currentDate },
    $or: [
      { 'assignedTo.endDate': null },
      { 'assignedTo.endDate': { $gte: currentDate } }
    ],
    isActive: true
  }).sort({ 'assignedTo.startDate': -1 });
};

// Method to assign shift to user
shiftSchema.methods.assignToUser = function(userId, assignedBy, options = {}) {
  const assignment = {
    userId: userId,
    startDate: options.startDate || new Date(),
    endDate: options.endDate || null,
    assignedBy: assignedBy,
    assignedAt: new Date(),
    notes: options.notes || '',
    isActive: true
  };
  
  // Deactivate previous assignments
  this.assignedTo.forEach(ass => {
    if (ass.userId.toString() === userId.toString() && ass.isActive) {
      ass.isActive = false;
      ass.endDate = new Date();
    }
  });
  
  this.assignedTo.push(assignment);
  return this.save();
};

// Method to remove user from shift
shiftSchema.methods.removeUser = function(userId) {
  const assignment = this.assignedTo.find(ass => 
    ass.userId.toString() === userId.toString() && 
    ass.isActive
  );
  
  if (assignment) {
    assignment.isActive = false;
    assignment.endDate = new Date();
    return this.save();
  }
  
  return Promise.resolve(this);
};

module.exports = mongoose.model('Shift', shiftSchema);