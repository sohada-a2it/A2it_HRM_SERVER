const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Employee details (denormalized for better performance)
  employeeName: {
    type: String,
    required: true
  },
  employeeId: {
    type: String,
    required: true
  },
  employeeDepartment: {
    type: String,
    required: true
  },
  employeePosition: {
    type: String
  },
  employeeProfilePicture: {
    type: String,
    default: ''
  },
  employeeEmail: {
    type: String
  },
  employeePhoneNumber: {
    type: String
  },
  
  // Leave details
  leaveType: {
    type: String,
    enum: ['Sick', 'Annual', 'Casual', 'Emergency', 'Maternity', 'Paternity', 'Other'],
    default: 'Sick',
    required: true
  },
  payStatus: {
    type: String,
    enum: ['Paid', 'Unpaid', 'HalfPaid'],
    default: 'Paid',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  totalDays: {
    type: Number,
    required: true,
    min: 1
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  rejectionReason: {
    type: String,
    trim: true
  },
  
  // Approval/Rejection details
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedByName: {
    type: String
  },
  approvedByEmployeeId: {
    type: String
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedByName: {
    type: String
  },
  rejectedByEmployeeId: {
    type: String
  },
  approvedAt: {
    type: Date
  },
  rejectedAt: {
    type: Date
  },
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: {
    type: String
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedByName: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
LeaveSchema.index({ employee: 1, startDate: -1 });
LeaveSchema.index({ employeeId: 1 });
LeaveSchema.index({ employeeName: 1 });
LeaveSchema.index({ employeeDepartment: 1 });
LeaveSchema.index({ status: 1 });
LeaveSchema.index({ leaveType: 1 });
LeaveSchema.index({ startDate: 1, endDate: 1 });
LeaveSchema.index({ createdAt: -1 });

// Middleware to save employee details before saving
LeaveSchema.pre('save', async function(next) {
  try {
    // Only populate employee details if employee reference exists and fields are not already populated
    if (this.employee && mongoose.Types.ObjectId.isValid(this.employee)) {
      const User = mongoose.model('User');
      
      // Check if employee details are already populated
      if (!this.employeeName || !this.employeeId || !this.employeeDepartment) {
        const employee = await User.findById(this.employee).select('name employeeId department position profilePicture email phoneNumber');
        
        if (employee) {
          this.employeeName = employee.name;
          this.employeeId = employee.employeeId;
          this.employeeDepartment = employee.department || 'Not Assigned';
          this.employeePosition = employee.position || 'Not Specified';
          this.employeeProfilePicture = employee.profilePicture || '';
          this.employeeEmail = employee.email || '';
          this.employeePhoneNumber = employee.phoneNumber || '';
        }
      }
    }

    // Populate createdBy name
    if (this.createdBy && mongoose.Types.ObjectId.isValid(this.createdBy) && !this.createdByName) {
      const User = mongoose.model('User');
      const creator = await User.findById(this.createdBy).select('name');
      if (creator) {
        this.createdByName = creator.name;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Middleware to populate employee details before find queries
LeaveSchema.pre('find', function(next) {
  // Optionally populate the employee reference if needed
  // this.populate({
  //   path: 'employee',
  //   select: 'name employeeId department position profilePicture'
  // });
  next();
});

// Virtual for checking if leave is upcoming
LeaveSchema.virtual('isUpcoming').get(function() {
  return new Date(this.startDate) > new Date();
});

// Virtual for checking if leave is ongoing
LeaveSchema.virtual('isOngoing').get(function() {
  const now = new Date();
  return now >= new Date(this.startDate) && now <= new Date(this.endDate);
});

// Virtual for checking if leave is past
LeaveSchema.virtual('isPast').get(function() {
  return new Date(this.endDate) < new Date();
});

// Virtual for getting employee initials
LeaveSchema.virtual('employeeInitials').get(function() {
  if (!this.employeeName) return 'NA';
  return this.employeeName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
});

// Virtual for formatted date range
LeaveSchema.virtual('formattedDateRange').get(function() {
  const start = new Date(this.startDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
  const end = new Date(this.endDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  return `${start} - ${end}`;
});

// Method to update employee details if employee info changes
LeaveSchema.statics.updateEmployeeDetails = async function(employeeId, updateData) {
  return this.updateMany(
    { employee: employeeId },
    {
      $set: {
        employeeName: updateData.name,
        employeeId: updateData.employeeId,
        employeeDepartment: updateData.department || 'Not Assigned',
        employeePosition: updateData.position || 'Not Specified',
        employeeProfilePicture: updateData.profilePicture || '',
        employeeEmail: updateData.email || '',
        employeePhoneNumber: updateData.phoneNumber || ''
      }
    }
  );
};

// Method to check if dates overlap with another leave
LeaveSchema.methods.hasDateConflict = async function(employeeId, startDate, endDate, excludeId = null) {
  const query = {
    employee: employeeId,
    $or: [
      {
        $and: [
          { startDate: { $lte: endDate } },
          { endDate: { $gte: startDate } }
        ]
      }
    ],
    status: { $in: ['Pending', 'Approved'] }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const conflict = await this.constructor.findOne(query);
  return conflict !== null;
};

const Leave = mongoose.model('Leave', LeaveSchema);

module.exports = Leave;