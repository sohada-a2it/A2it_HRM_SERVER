const Shift = require('../models/shiftModel');
const User = require('../models/UsersModel');
const AuditLog = require('../models/AuditModel');
const { addSessionActivity } = require('./userController');

// ================= ADMIN SHIFT MANAGEMENT =================

// Create new shift
exports.createShift = async (req, res) => {
  try {
    const {
      shiftName,
      startTime,
      endTime,
      shiftType = 'regular',
      breaks = [],
      overtimeSettings = {},
      lateThreshold = 5,
      earlyLeaveThreshold = -1,
      department = 'All',
      notes
    } = req.body;

    // Validation
    if (!shiftName || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Shift name, start time, and end time are required'
      });
    }

    // Time validation
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time format. Use HH:mm (24-hour format)'
      });
    }

    const shiftData = {
      shiftName,
      startTime,
      endTime,
      shiftType,
      breaks,
      overtimeSettings: {
        startAfterHours: overtimeSettings.startAfterHours || 8,
        overtimeRate: overtimeSettings.overtimeRate || 1.5
      },
      lateThreshold,
      earlyLeaveThreshold,
      department,
      createdBy: req.user._id,
      updatedBy: req.user._id
    };

    if (notes) {
      shiftData.notes = notes;
    }

    const shift = new Shift(shiftData);
    await shift.save();

    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'Created Shift',
      target: shift._id,
      details: {
        shiftName,
        startTime,
        endTime,
        department,
        createdBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent'],
      status: 'success'
    });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Created Shift',
      target: shift._id,
      details: {
        shiftName,
        time: `${startTime} - ${endTime}`
      }
    });

    res.status(201).json({
      success: true,
      message: 'Shift created successfully',
      shift
    });

  } catch (error) {
    console.error('Create shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all shifts
exports.getAllShifts = async (req, res) => {
  try {
    const { department, isActive, shiftType } = req.query;
    
    const query = {};
    
    if (department && department !== 'All') {
      query.department = department;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (shiftType) {
      query.shiftType = shiftType;
    }

    const shifts = await Shift.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .populate('assignedTo.userId', 'firstName lastName email employeeId')
      .populate('assignedTo.assignedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Viewed All Shifts',
      target: null,
      details: {
        filter: { department, isActive, shiftType },
        count: shifts.length
      }
    });

    res.json({
      success: true,
      count: shifts.length,
      shifts
    });

  } catch (error) {
    console.error('Get all shifts error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get shift by ID
exports.getShiftById = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email')
      .populate('assignedTo.userId', 'firstName lastName email employeeId department designation picture')
      .populate('assignedTo.assignedBy', 'firstName lastName email');

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    // Session activity for admin
    if (req.user.role === 'admin' || req.user.role === 'superAdmin') {
      await addSessionActivity({
        userId: req.user._id,
        action: 'Viewed Shift Details',
        target: shift._id,
        details: {
          shiftName: shift.shiftName
        }
      });
    }

    res.json({
      success: true,
      shift
    });

  } catch (error) {
    console.error('Get shift by ID error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update shift
exports.updateShift = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    // Store old data for audit
    const oldData = {
      shiftName: shift.shiftName,
      startTime: shift.startTime,
      endTime: shift.endTime,
      shiftType: shift.shiftType,
      department: shift.department,
      isActive: shift.isActive
    };

    const updates = {};
    
    // Allowed fields to update
    const allowedFields = [
      'shiftName', 'startTime', 'endTime', 'shiftType', 'breaks',
      'overtimeSettings', 'lateThreshold', 'earlyLeaveThreshold',
      'department', 'isActive', 'notes'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Time validation if updating times
    if (updates.startTime || updates.endTime) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (updates.startTime && !timeRegex.test(updates.startTime)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid start time format. Use HH:mm (24-hour format)'
        });
      }
      if (updates.endTime && !timeRegex.test(updates.endTime)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid end time format. Use HH:mm (24-hour format)'
        });
      }
    }

    updates.updatedBy = req.user._id;

    const updatedShift = await Shift.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('updatedBy', 'firstName lastName email');

    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'Updated Shift',
      target: shift._id,
      details: {
        oldData,
        newData: {
          shiftName: updatedShift.shiftName,
          startTime: updatedShift.startTime,
          endTime: updatedShift.endTime,
          shiftType: updatedShift.shiftType,
          department: updatedShift.department,
          isActive: updatedShift.isActive
        },
        updatedFields: Object.keys(updates)
      },
      ip: req.ip,
      device: req.headers['user-agent'],
      status: 'success'
    });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Updated Shift',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        updatedFields: Object.keys(updates)
      }
    });

    res.json({
      success: true,
      message: 'Shift updated successfully',
      shift: updatedShift
    });

  } catch (error) {
    console.error('Update shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete shift
exports.deleteShift = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    // Check if shift has active assignments
    const activeAssignments = shift.assignedTo.filter(a => a.isActive);
    if (activeAssignments.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete shift with active assignments. Remove assignments first.'
      });
    }

    await Shift.findByIdAndDelete(req.params.id);

    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'Deleted Shift',
      target: req.params.id,
      details: {
        shiftName: shift.shiftName,
        startTime: shift.startTime,
        endTime: shift.endTime,
        department: shift.department,
        deletedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent'],
      status: 'success'
    });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Deleted Shift',
      target: req.params.id,
      details: {
        shiftName: shift.shiftName
      }
    });

    res.json({
      success: true,
      message: 'Shift deleted successfully'
    });

  } catch (error) {
    console.error('Delete shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= SHIFT ASSIGNMENT =================

// Assign shift to user
exports.assignShiftToUser = async (req, res) => {
  try {
    const { shiftId, userId } = req.params;
    const { startDate, endDate, notes } = req.body;

    const shift = await Shift.findById(shiftId);
    const user = await User.findById(userId);

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is already assigned to this shift
    const existingAssignment = shift.assignedTo.find(
      assignment => 
        assignment.userId.toString() === userId &&
        assignment.isActive
    );

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'User is already assigned to this shift'
      });
    }

    const assignmentData = {
      userId: user._id,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      assignedBy: req.user._id,
      notes: notes || ''
    };

    // Add assignment
    shift.assignedTo.push(assignmentData);
    await shift.save();

    // Update user's shift reference (optional)
    await User.findByIdAndUpdate(userId, {
      $set: {
        'shiftTiming.assignedShift': {
          shiftId: shift._id,
          shiftName: shift.shiftName,
          startTime: shift.startTime,
          endTime: shift.endTime,
          assignedBy: req.user._id,
          assignedAt: new Date(),
          effectiveDate: assignmentData.startDate
        }
      }
    });

    const populatedShift = await Shift.findById(shiftId)
      .populate('assignedTo.userId', 'firstName lastName email employeeId')
      .populate('assignedTo.assignedBy', 'firstName lastName email');

    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'Assigned Shift to User',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        user: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        startDate: assignmentData.startDate,
        endDate: assignmentData.endDate,
        assignedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent'],
      status: 'success'
    });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Assigned Shift',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        user: `${user.firstName} ${user.lastName}`,
        startDate: assignmentData.startDate
      }
    });

    res.json({
      success: true,
      message: 'Shift assigned successfully',
      shift: populatedShift
    });

  } catch (error) {
    console.error('Assign shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Remove user from shift
exports.removeUserFromShift = async (req, res) => {
  try {
    const { shiftId, userId } = req.params;
    const { reason } = req.body;

    const shift = await Shift.findById(shiftId);
    const user = await User.findById(userId);

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const assignment = shift.assignedTo.find(
      assignment => 
        assignment.userId.toString() === userId &&
        assignment.isActive
    );

    if (!assignment) {
      return res.status(400).json({
        success: false,
        message: 'User is not assigned to this shift'
      });
    }

    // Deactivate assignment
    assignment.isActive = false;
    assignment.endDate = new Date();
    if (reason) assignment.notes = reason;

    await shift.save();

    // Reset user's shift reference
    await User.findByIdAndUpdate(userId, {
      $set: {
        'shiftTiming.assignedShift': null
      }
    });

    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'Removed User from Shift',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        user: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        reason: reason || 'No reason provided',
        removedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent'],
      status: 'success'
    });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Removed User from Shift',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        user: `${user.firstName} ${user.lastName}`,
        reason: reason
      }
    });

    res.json({
      success: true,
      message: 'User removed from shift successfully'
    });

  } catch (error) {
    console.error('Remove user from shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Bulk assign shift
exports.bulkAssignShift = async (req, res) => {
  try {
    const { shiftId } = req.params;
    const { userIds, startDate, endDate, notes } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    const shift = await Shift.findById(shiftId);
    
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const users = await User.find({ _id: { $in: userIds } });
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No users found'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const user of users) {
      try {
        // Check if already assigned
        const existingAssignment = shift.assignedTo.find(
          assignment => 
            assignment.userId.toString() === user._id.toString() &&
            assignment.isActive
        );

        if (existingAssignment) {
          results.failed.push({
            userId: user._id,
            email: user.email,
            error: 'Already assigned to this shift'
          });
          continue;
        }

        // Add assignment
        shift.assignedTo.push({
          userId: user._id,
          startDate: startDate ? new Date(startDate) : new Date(),
          endDate: endDate ? new Date(endDate) : null,
          assignedBy: req.user._id,
          notes: notes || ''
        });

        // Update user's shift reference
        await User.findByIdAndUpdate(user._id, {
          $set: {
            'shiftTiming.assignedShift': {
              shiftId: shift._id,
              shiftName: shift.shiftName,
              startTime: shift.startTime,
              endTime: shift.endTime,
              assignedBy: req.user._id,
              assignedAt: new Date(),
              effectiveDate: startDate ? new Date(startDate) : new Date()
            }
          }
        });

        results.successful.push({
          userId: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`
        });

      } catch (error) {
        results.failed.push({
          userId: user._id,
          email: user.email,
          error: error.message
        });
      }
    }

    await shift.save();

    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'Bulk Assigned Shift',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        totalUsers: userIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
        startDate: startDate,
        assignedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent'],
      status: 'success'
    });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Bulk Assigned Shift',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        successful: results.successful.length,
        failed: results.failed.length
      }
    });

    res.json({
      success: true,
      message: `Bulk assignment completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      results
    });

  } catch (error) {
    console.error('Bulk assign shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ================= USER SHIFT MANAGEMENT =================

// Get my current shift (for employees)
exports.getMyCurrentShift = async (req, res) => {
  try {
    const shift = await Shift.getUserCurrentShift(req.user._id);

    if (!shift) {
      // Check if user has default shift in profile
      const user = await User.findById(req.user._id);
      
      if (user.shiftTiming?.defaultShift) {
        return res.json({
          success: true,
          shift: null,
          defaultShift: user.shiftTiming.defaultShift,
          message: 'You are on default shift timing'
        });
      }
      
      return res.status(404).json({
        success: false,
        message: 'No shift assigned'
      });
    }

    // Get user's specific assignment
    const assignment = shift.assignedTo.find(
      a => a.userId.toString() === req.user._id.toString() && a.isActive
    );

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Viewed My Shift',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        time: shift.displayTime
      }
    });

    res.json({
      success: true,
      shift: {
        _id: shift._id,
        shiftName: shift.shiftName,
        startTime: shift.startTime,
        endTime: shift.endTime,
        displayTime: shift.displayTime,
        totalHours: shift.totalHours,
        duration: shift.duration,
        shiftType: shift.shiftType,
        breaks: shift.breaks,
        overtimeSettings: shift.overtimeSettings,
        assignment: assignment
      }
    });

  } catch (error) {
    console.error('Get my current shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get my shift history
exports.getMyShiftHistory = async (req, res) => {
  try {
    const shifts = await Shift.find({
      'assignedTo.userId': req.user._id
    })
      .select('shiftName startTime endTime shiftType department')
      .populate('assignedTo.$', 'startDate endDate assignedBy notes')
      .sort({ 'assignedTo.startDate': -1 });

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Viewed Shift History',
      target: null,
      details: {
        count: shifts.length
      }
    });

    res.json({
      success: true,
      count: shifts.length,
      shifts
    });

  } catch (error) {
    console.error('Get my shift history error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get employees by shift
exports.getEmployeesByShift = async (req, res) => {
  try {
    const { shiftId } = req.params;
    
    const shift = await Shift.findById(shiftId)
      .populate('assignedTo.userId', 'firstName lastName email employeeId department designation picture status isActive')
      .populate('assignedTo.assignedBy', 'firstName lastName email');

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found'
      });
    }

    const activeEmployees = shift.assignedTo
      .filter(a => a.isActive)
      .map(a => ({
        assignment: a,
        user: a.userId
      }));

    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Viewed Shift Employees',
      target: shift._id,
      details: {
        shiftName: shift.shiftName,
        employeeCount: activeEmployees.length
      }
    });

    res.json({
      success: true,
      shift: {
        _id: shift._id,
        shiftName: shift.shiftName,
        displayTime: shift.displayTime
      },
      employees: activeEmployees,
      count: activeEmployees.length
    });

  } catch (error) {
    console.error('Get employees by shift error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get shift statistics
exports.getShiftStatistics = async (req, res) => {
  try {
    // Total shifts
    const totalShifts = await Shift.countDocuments();
    
    // Active shifts
    const activeShifts = await Shift.countDocuments({ isActive: true });
    
    // Shifts by type
    const shiftsByType = await Shift.aggregate([
      { $group: { _id: '$shiftType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Shifts by department
    const shiftsByDepartment = await Shift.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Total employees assigned to shifts
    const totalAssignedEmployees = await Shift.aggregate([
      { $unwind: '$assignedTo' },
      { $match: { 'assignedTo.isActive': true } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]);
    
    // Most popular shift (by number of assignments)
    const mostPopularShift = await Shift.aggregate([
      { $unwind: '$assignedTo' },
      { $match: { 'assignedTo.isActive': true } },
      { $group: { _id: '$_id', shiftName: { $first: '$shiftName' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);
    
    // Session activity
    await addSessionActivity({
      userId: req.user._id,
      action: 'Viewed Shift Statistics',
      target: null,
      details: {
        totalShifts,
        activeShifts
      }
    });

    res.json({
      success: true,
      statistics: {
        totalShifts,
        activeShifts,
        inactiveShifts: totalShifts - activeShifts,
        shiftsByType,
        shiftsByDepartment,
        totalAssignedEmployees: totalAssignedEmployees[0]?.count || 0,
        mostPopularShift: mostPopularShift[0] || null
      }
    });

  } catch (error) {
    console.error('Get shift statistics error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};