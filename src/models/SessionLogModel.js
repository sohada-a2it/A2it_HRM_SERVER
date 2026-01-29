// models/SessionLogModel.js - Purple Theme Design with Auto Delete
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'clock_in', 'clock_out', 'break_start', 'break_end', 
      'login', 'logout', 'password_change', 'profile_update',
      'session_expired', 'auto_logout', 'manual_logout',
      'session_created', 'device_change', 'location_change'
    ]
  },
  details: {
    type: String
  },
  location: {
    type: String
  },
  device: {
    type: String
  },
  ip: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  color: {
    type: String,
    default: 'purple'
  }
});

const sessionLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // ✅ User details (purple theme style)
  userName: {
    type: String,
    index: true
  },
  userEmail: {
    type: String
  },
  userRole: {
    type: String,
    enum: ['admin', 'superAdmin', 'employee', 'moderator'],
    index: true
  },
  userDepartment: {
    type: String
  },
  
  // Session timings with purple theme
  loginAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  logoutAt: {
    type: Date,
    index: true
  },
  
  // ✅ Attendance tracking
  clockIn: {
    type: Date,
    index: true
  },
  clockOut: {
    type: Date
  },
  totalHours: {
    type: Number,
    default: 0
  },
  dailyRate: {
    type: Number,
    default: 0
  },
  
  // Device information
  ip: {
    type: String,
    index: true
  },
  device: {
    type: String
  },
  browser: {
    type: String
  },
  os: {
    type: String
  },
  location: {
    city: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Activities log
  activities: [activitySchema],
  
  // Auto logout flag
  autoLogout: {
    type: Boolean,
    default: false
  },
  
  // ✅ Session status with color codes
  sessionStatus: {
    type: String,
    enum: ['active', 'completed', 'expired', 'terminated'],
    default: 'active',
    index: true
  },
  
  // ✅ Purple theme status colors
  statusColor: {
    type: String,
    enum: ['purple', 'pink', 'indigo', 'violet'],
    default: 'purple'
  },
  
  // ✅ Auto delete settings
  autoDeleteDate: {
    type: Date,
    default: () => {
      const date = new Date();
      date.setDate(date.getDate() + 30); // 30 days from creation
      return date;
    }
  },
  
  // ✅ Session metadata for analytics
  metadata: {
    isMobile: Boolean,
    isTablet: Boolean,
    isDesktop: Boolean,
    screenResolution: String,
    timezone: String,
    language: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
sessionLogSchema.index({ userId: 1, loginAt: -1 });
sessionLogSchema.index({ sessionStatus: 1, loginAt: -1 });
sessionLogSchema.index({ autoDeleteDate: 1 });
sessionLogSchema.index({ clockIn: 1 });
sessionLogSchema.index({ userRole: 1, loginAt: -1 });

// ✅ Virtual for duration in minutes
sessionLogSchema.virtual('durationMinutes').get(function() {
  if (!this.loginAt) return 0;
  
  const endTime = this.logoutAt || new Date();
  const durationMs = endTime - this.loginAt;
  return Math.round(durationMs / (1000 * 60));
});

// ✅ Virtual for formatted duration with purple theme
sessionLogSchema.virtual('formattedDuration').get(function() {
  const minutes = this.durationMinutes;
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return `${days}d ${hours}h`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}m`;
});

// ✅ Virtual for isActive with purple theme style
sessionLogSchema.virtual('isActive').get(function() {
  return !this.logoutAt && this.sessionStatus === 'active';
});

// ✅ Virtual for hours worked
sessionLogSchema.virtual('hoursWorked').get(function() {
  if (this.clockIn && this.clockOut) {
    const diffMs = this.clockOut - this.clockIn;
    return (diffMs / (1000 * 60 * 60)).toFixed(2);
  }
  return 0;
});

// ✅ Virtual for daily earnings
sessionLogSchema.virtual('dailyEarnings').get(function() {
  const hours = parseFloat(this.hoursWorked);
  if (hours > 0 && this.dailyRate > 0) {
    return (hours * (this.dailyRate / 8)).toFixed(2); // Assuming 8 hour work day
  }
  return 0;
});

// ✅ Virtual for remaining days before auto-delete
sessionLogSchema.virtual('daysUntilDeletion').get(function() {
  if (!this.autoDeleteDate) return null;
  const now = new Date();
  const diffTime = this.autoDeleteDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// ✅ Virtual for deletion status color
sessionLogSchema.virtual('deletionStatusColor').get(function() {
  const days = this.daysUntilDeletion;
  if (days === null) return 'gray';
  if (days <= 7) return 'red';
  if (days <= 14) return 'orange';
  if (days <= 21) return 'yellow';
  return 'green';
});

// ✅ Auto populate user info before save
sessionLogSchema.pre('save', async function(next) {
  // If user details are missing, populate them
  if (!this.userName || !this.userEmail || !this.userRole) {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(this.userId).select('firstName lastName email role department');
      
      if (user) {
        this.userName = `${user.firstName} ${user.lastName}`;
        this.userEmail = user.email;
        this.userRole = user.role;
        this.userDepartment = user.department || 'Not assigned';
        
        // Set status color based on role
        if (user.role === 'admin' || user.role === 'superAdmin') {
          this.statusColor = 'indigo';
        } else if (user.role === 'moderator') {
          this.statusColor = 'violet';
        } else {
          this.statusColor = 'purple';
        }
      }
    } catch (error) {
      console.error('Error populating user info:', error);
    }
  }
  
  // Set autoDeleteDate if not set
  if (!this.autoDeleteDate) {
    const deleteDate = new Date();
    deleteDate.setDate(deleteDate.getDate() + 30);
    this.autoDeleteDate = deleteDate;
  }
  
  next();
});

// ✅ Middleware to auto-delete expired sessions
sessionLogSchema.statics.cleanupExpiredSessions = async function() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await this.deleteMany({
      loginAt: { $lt: thirtyDaysAgo },
      sessionStatus: { $in: ['completed', 'expired', 'terminated'] }
    });
    
    console.log(`✅ Cleaned up ${result.deletedCount} expired sessions`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
    return 0;
  }
};

// ✅ Method to check if session should be auto-deleted
sessionLogSchema.methods.shouldAutoDelete = function() {
  if (!this.autoDeleteDate) return false;
  const now = new Date();
  return now > this.autoDeleteDate;
};

// ✅ Static method to get role-based statistics
sessionLogSchema.statics.getRoleStatistics = async function(role, period = '30days') {
  const dateFilter = {};
  const now = new Date();
  
  if (period === '7days') {
    dateFilter.loginAt = { $gte: new Date(now.setDate(now.getDate() - 7)) };
  } else if (period === '30days') {
    dateFilter.loginAt = { $gte: new Date(now.setDate(now.getDate() - 30)) };
  }
  
  dateFilter.userRole = role;
  
  return await this.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        activeSessions: { $sum: { $cond: [{ $eq: ['$sessionStatus', 'active'] }, 1, 0] } },
        totalHours: { $sum: '$totalHours' },
        avgDuration: { $avg: '$durationMinutes' },
        uniqueUsers: { $addToSet: '$userId' },
        totalEarnings: { $sum: '$dailyEarnings' }
      }
    }
  ]);
};

module.exports = mongoose.model('SessionLog', sessionLogSchema);