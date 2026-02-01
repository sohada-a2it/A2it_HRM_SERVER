// models/SessionLogModel.js - UPDATED
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'login', 'logout', 'activity_update', 'session_created',
      'device_change', 'location_change', 'session_terminated'
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
  }
});

const sessionLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // ✅ User details at time of session creation
  userName: {
    type: String,
    required: true
  },
  userEmail: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    enum: ['admin', 'superAdmin', 'employee', 'moderator'],
    required: true
  },
  
  // Session timings
  loginAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  logoutAt: {
    type: Date
  },
  
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  // Device information
  ip: {
    type: String,
    required: true
  },
  device: {
    type: String,
    default: 'Desktop'
  },
  browser: {
    type: String,
    default: 'Unknown'
  },
  browserVersion: {
    type: String
  },
  os: {
    type: String,
    default: 'Unknown'
  },
  location: {
    type: Object,
    default: {
      city: 'Unknown',
      country: 'Unknown',
      region: 'Unknown'
    }
  },
  
  // Activities log
  activities: [activitySchema],
  
  userAgent: {
    type: String,
    default: ''
  },
  
  // Session status
  sessionStatus: {
    type: String,
    enum: ['active', 'completed', 'expired', 'terminated'],
    default: 'active',
    index: true
  },
  
  // Session number
  sessionNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Auto delete
  autoDeleteDate: {
    type: Date,
    default: function() {
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ FIXED: Generate session number BEFORE saving
sessionLogSchema.pre('save', function(next) {
  if (!this.sessionNumber) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.sessionNumber = `SESS-${timestamp}-${random}`;
  }
  
  // Parse userAgent
  if (this.userAgent) {
    const ua = this.userAgent.toLowerCase();
    
    // Device
    if (ua.includes('mobile') && !ua.includes('tablet')) {
      this.device = 'Mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      this.device = 'Tablet';
    } else {
      this.device = 'Desktop';
    }
    
    // Browser
    if (ua.includes('chrome') && !ua.includes('edge')) {
      this.browser = 'Chrome';
    } else if (ua.includes('firefox')) {
      this.browser = 'Firefox';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      this.browser = 'Safari';
    } else if (ua.includes('edge')) {
      this.browser = 'Edge';
    }
    
    // OS
    if (ua.includes('windows')) this.os = 'Windows';
    else if (ua.includes('mac os')) this.os = 'macOS';
    else if (ua.includes('linux')) this.os = 'Linux';
    else if (ua.includes('android')) this.os = 'Android';
    else if (ua.includes('ios') || ua.includes('iphone')) this.os = 'iOS';
  }
  
  next();
});

// ✅ FIXED: Create new session method
sessionLogSchema.statics.createNewSession = async function(userId, userData = {}) {
  try {
    console.log('🔧 Creating session for userId:', userId);
    
    // Get user info first
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check for existing active session
    const existingActive = await this.findOne({
      userId,
      sessionStatus: 'active'
    });
    
    if (existingActive) {
      console.log('⚠️ Active session exists, updating last activity');
      existingActive.lastActivity = new Date();
      await existingActive.save();
      return existingActive;
    }
    
    // Create session data with user info
    const sessionData = {
      userId,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      userRole: user.role,
      userAgent: userData.userAgent || '',
      ip: userData.ip || '0.0.0.0',
      location: userData.location || {},
      loginAt: new Date(),
      lastActivity: new Date(),
      sessionStatus: 'active',
      activities: [{
        action: 'login',
        details: 'User logged in',
        timestamp: new Date(),
        ip: userData.ip || '0.0.0.0',
        location: JSON.stringify(userData.location || {})
      }]
    };
    
    console.log('📝 Session data prepared:', {
      userName: sessionData.userName,
      userEmail: sessionData.userEmail,
      ip: sessionData.ip
    });
    
    const session = new this(sessionData);
    await session.save();
    
    console.log(`✅ Session created successfully: ${session.sessionNumber}`);
    return session;
    
  } catch (error) {
    console.error('❌ Create session error:', error);
    throw error;
  }
};

module.exports = mongoose.model('SessionLog', sessionLogSchema);