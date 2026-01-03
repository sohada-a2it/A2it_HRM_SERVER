const Leave = require('../models/LeaveModel');
const Payroll = require('../models/PayrollModel');
const Attendance = require('../models/AttendanceModel');
const Holiday = require('../models/HolidayModel');
const OfficeSchedule = require('../models/OfficeScheduleModel');
const User = require('../models/UsersModel');
const mongoose = require('mongoose');

// ---------------- Employee leave request ----------------
exports.requestLeave = async (req, res) => {
  try {
    const { leaveType, payStatus, startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ status: 'fail', message: 'Start and End Date are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Check if start date is not before today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Cannot request leave for past dates' 
      });
    }

    // Calculate total days
    const diffTime = Math.abs(end - start);
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Duplicate check - overlapping leaves
    const existingLeave = await Leave.findOne({
      employee: req.user._id,
      $or: [
        {
          $and: [
            { startDate: { $lte: end } },
            { endDate: { $gte: start } }
          ]
        }
      ],
      status: { $in: ['Pending', 'Approved'] }
    });

    if (existingLeave) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'You already have a leave request for these dates' 
      });
    }

    // Get current user details for denormalization
    const currentUser = await User.findById(req.user._id)
      .select('name employeeId department position profilePicture email phoneNumber');

    // Leave create with denormalized data
    const leave = await Leave.create({
      employee: req.user._id,
      // Denormalized employee data
      employeeName: currentUser.name,
      employeeId: currentUser.employeeId,
      employeeDepartment: currentUser.department || 'Not Assigned',
      employeePosition: currentUser.position || 'Not Specified',
      employeeProfilePicture: currentUser.profilePicture || '',
      employeeEmail: currentUser.email || '',
      employeePhoneNumber: currentUser.phoneNumber || '',
      // Leave details
      leaveType: leaveType || 'Sick',
      payStatus: payStatus || 'Paid',
      startDate: start,
      endDate: end,
      totalDays,
      reason,
      createdBy: req.user._id,
      createdByName: currentUser.name
    });

    res.status(201).json({ 
      status: 'success', 
      message: 'Leave request submitted successfully',
      data: leave 
    });

  } catch (err) {
    console.error("Leave request error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Get employee's own leaves ----------------
exports.getMyLeaves = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const filter = { employee: req.user._id };

    // Apply filters if provided
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    if (req.query.type && req.query.type !== 'all') {
      filter.leaveType = req.query.type;
    }
    if (req.query.startDate && req.query.endDate) {
      filter.startDate = { 
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // Search by reason
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { reason: searchRegex },
        { leaveType: searchRegex }
      ];
    }

    // Get total count for pagination
    const total = await Leave.countDocuments(filter);

    // Get leaves with pagination - No need to populate!
    const leaves = await Leave.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      data: leaves,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      count: leaves.length
    });

  } catch (err) {
    console.error("Get my leaves error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Get all leaves (Admin only) ----------------
exports.getAllLeaves = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Access denied. Only admin can view all leaves' 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const filter = {};

    // Apply filters if provided
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    if (req.query.type && req.query.type !== 'all') {
      filter.leaveType = req.query.type;
    }
    
    // Employee ID filter
    if (req.query.employeeId) {
      filter.employeeId = req.query.employeeId;
    }
    
    // Department filter
    if (req.query.department && req.query.department !== 'all') {
      filter.employeeDepartment = req.query.department;
    }
    
    // Date range filter
    if (req.query.startDate && req.query.endDate) {
      filter.startDate = { 
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }
    
    // Search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { employeeName: searchRegex },
        { employeeId: searchRegex },
        { employeeDepartment: searchRegex },
        { reason: searchRegex },
        { leaveType: searchRegex }
      ];
    }

    // Get total count for pagination
    const total = await Leave.countDocuments(filter);

    // Get leaves with pagination - No need to populate!
    const leaves = await Leave.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      status: 'success',
      data: leaves,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      count: leaves.length
    });

  } catch (err) {
    console.error("Get all leaves error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Admin approve leave ----------------
exports.approveLeave = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can approve leaves' 
      });
    }

    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Leave not found' 
      });
    }

    if (leave.status !== 'Pending') {
      return res.status(400).json({ 
        status: 'fail', 
        message: `Leave is already ${leave.status.toLowerCase()}` 
      });
    }

    // Get admin user details for denormalization
    const adminUser = await User.findById(req.user._id)
      .select('name employeeId');

    // Admin can override payStatus
    if (req.body.payStatus) {
      leave.payStatus = req.body.payStatus; // Paid / Unpaid / HalfPaid
    }

    leave.status = 'Approved';
    leave.approvedBy = req.user._id;
    leave.approvedByName = adminUser.name;
    leave.approvedByEmployeeId = adminUser.employeeId;
    leave.approvedAt = new Date();
    await leave.save();

    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);

    // ======== Update attendance for leave days =========
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);

      let attendance = await Attendance.findOne({ 
        employee: leave.employee, 
        date: day 
      });
      
      if (!attendance) {
        attendance = new Attendance({ 
          employee: leave.employee, 
          date: day,
          status: 'Leave',
          remarks: `Approved ${leave.leaveType} Leave (${leave.payStatus})`,
          createdBy: req.user._id,
          updatedBy: req.user._id
        });
      } else {
        attendance.status = 'Leave';
        attendance.remarks = `Approved ${leave.leaveType} Leave (${leave.payStatus})`;
        attendance.updatedBy = req.user._id;
        attendance.updatedAt = new Date();
      }
      
      await attendance.save();
    }

    // ======== Payroll adjustment for Unpaid / HalfPaid leave =========
    if (leave.payStatus === 'Unpaid' || leave.payStatus === 'HalfPaid') {
      const payroll = await Payroll.findOne({
        employee: leave.employee,
        periodStart: { $lte: start },
        periodEnd: { $gte: end },
      });

      if (payroll) {
        const dailyRate = payroll.basicPay / 30;
        let deduction = dailyRate * leave.totalDays;
        
        if (leave.payStatus === 'HalfPaid') {
          deduction = deduction / 2;
        }

        payroll.deductions = (payroll.deductions || 0) + deduction;
        payroll.netPayable = payroll.basicPay + 
                           (payroll.overtimePay || 0) + 
                           (payroll.bonus || 0) + 
                           (payroll.allowances || 0) - 
                           payroll.deductions;
        payroll.updatedBy = req.user._id;
        payroll.updatedAt = new Date();
        await payroll.save();
      }
    }

    // No need to populate since we have denormalized data
    res.status(200).json({ 
      status: 'success', 
      message: 'Leave approved successfully',
      data: leave 
    });

  } catch (err) {
    console.error("Approve leave error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Admin reject leave ----------------
exports.rejectLeave = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can reject leaves' 
      });
    }

    const leave = await Leave.findById(req.params.id).populate('employee');
    if (!leave) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Leave not found' 
      });
    }

    if (leave.status !== 'Pending') {
      return res.status(400).json({ 
        status: 'fail', 
        message: `Leave is already ${leave.status.toLowerCase()}` 
      });
    }

    leave.status = 'Rejected';
    leave.rejectionReason = req.body.reason || 'No reason provided';
    leave.rejectedBy = req.user._id;
    leave.rejectedAt = new Date();
    await leave.save();

    // Remove any attendance entries created for this leave (if any)
    await Attendance.deleteMany({
      employee: leave.employee._id,
      date: { $gte: leave.startDate, $lte: leave.endDate },
      status: 'Leave'
    });

    const updatedLeave = await Leave.findById(leave._id)
      .populate({ 
        path: 'employee', 
        select: 'name employeeId department email position' 
      })
      .populate({ 
        path: 'rejectedBy', 
        select: 'name employeeId' 
      });

    res.status(200).json({ 
      status: 'success', 
      message: 'Leave rejected successfully',
      data: updatedLeave 
    });

  } catch (err) {
    console.error("Reject leave error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Update leave (Employee can update pending leaves) ----------------
exports.updateLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Leave not found' 
      });
    }

    // Check permissions
    const isEmployeeOwner = leave.employee.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isEmployeeOwner && !isAdmin) {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'You can only update your own leaves' 
      });
    }

    // Only pending leaves can be updated by employees
    if (isEmployeeOwner && leave.status !== 'Pending') {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Only pending leaves can be updated' 
      });
    }

    // Allow updates
    const { leaveType, payStatus, startDate, endDate, reason } = req.body;
    
    if (leaveType) leave.leaveType = leaveType;
    if (payStatus) leave.payStatus = payStatus;
    if (reason) leave.reason = reason;
    
    // If dates change, recalculate totalDays
    if (startDate || endDate) {
      const newStartDate = startDate ? new Date(startDate) : leave.startDate;
      const newEndDate = endDate ? new Date(endDate) : leave.endDate;
      
      // Validate dates
      if (newStartDate > newEndDate) {
        return res.status(400).json({ 
          status: 'fail', 
          message: 'Start date cannot be after end date' 
        });
      }
      
      leave.startDate = newStartDate;
      leave.endDate = newEndDate;
      
      const diffTime = Math.abs(newEndDate - newStartDate);
      leave.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    
    leave.updatedAt = new Date();
    leave.updatedBy = req.user._id;
    await leave.save();

    const updatedLeave = await Leave.findById(leave._id)
      .populate({ 
        path: 'employee', 
        select: 'name employeeId department email position' 
      });

    res.status(200).json({ 
      status: 'success', 
      message: 'Leave updated successfully',
      data: updatedLeave 
    });

  } catch (err) {
    console.error("Update leave error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Delete leave ----------------
exports.deleteLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Leave not found' 
      });
    }

    // Check permissions
    const isEmployeeOwner = leave.employee.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isEmployeeOwner && !isAdmin) {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'You can only delete your own leaves' 
      });
    }

    // Only pending leaves can be deleted by employees
    if (isEmployeeOwner && leave.status !== 'Pending') {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Only pending leaves can be deleted' 
      });
    }

    // Remove attendance entries if leave was approved
    if (leave.status === 'Approved') {
      await Attendance.deleteMany({
        employee: leave.employee,
        date: { $gte: leave.startDate, $lte: leave.endDate },
        status: 'Leave'
      });
    }

    await Leave.findByIdAndDelete(req.params.id);

    res.status(200).json({ 
      status: 'success', 
      message: 'Leave deleted successfully' 
    });

  } catch (err) {
    console.error("Delete leave error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Get leave by ID ----------------
exports.getLeaveById = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate({ 
        path: 'employee', 
        select: 'name employeeId department email position phoneNumber' 
      })
      .populate({ 
        path: 'approvedBy', 
        select: 'name employeeId' 
      })
      .populate({ 
        path: 'rejectedBy', 
        select: 'name employeeId' 
      });

    if (!leave) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Leave not found' 
      });
    }

    // Check permissions
    const isEmployeeOwner = leave.employee._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isEmployeeOwner && !isAdmin) {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'You can only view your own leaves' 
      });
    }

    res.status(200).json({ 
      status: 'success', 
      data: leave 
    });

  } catch (err) {
    console.error("Get leave by ID error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Get leave statistics ----------------
exports.getLeaveStats = async (req, res) => {
  try {
    let filter = {};

    // For employees, only show their own stats
    if (req.user.role !== 'admin') {
      filter.employee = req.user._id;
    }

    // Apply date filter if provided
    if (req.query.year) {
      const year = parseInt(req.query.year);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      filter.startDate = { $gte: startDate, $lt: endDate };
    }

    // Get statistics
    const totalLeaves = await Leave.countDocuments(filter);
    const pendingLeaves = await Leave.countDocuments({ ...filter, status: 'Pending' });
    const approvedLeaves = await Leave.countDocuments({ ...filter, status: 'Approved' });
    const rejectedLeaves = await Leave.countDocuments({ ...filter, status: 'Rejected' });

    // Get leave type distribution
    const leaveTypes = await Leave.aggregate([
      { $match: filter },
      { $group: { _id: '$leaveType', count: { $sum: 1 }, totalDays: { $sum: '$totalDays' } } },
      { $sort: { count: -1 } }
    ]);

    // Get monthly distribution for the current year
    const currentYear = new Date().getFullYear();
    const monthlyData = await Leave.aggregate([
      { 
        $match: { 
          ...filter,
          startDate: { 
            $gte: new Date(currentYear, 0, 1),
            $lt: new Date(currentYear + 1, 0, 1)
          }
        } 
      },
      {
        $group: {
          _id: { $month: '$startDate' },
          count: { $sum: 1 },
          totalDays: { $sum: '$totalDays' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Format monthly data
    const formattedMonthlyData = Array.from({ length: 12 }, (_, i) => {
      const monthData = monthlyData.find(m => m._id === i + 1);
      return {
        month: i + 1,
        monthName: new Date(currentYear, i, 1).toLocaleString('default', { month: 'short' }),
        count: monthData ? monthData.count : 0,
        totalDays: monthData ? monthData.totalDays : 0
      };
    });

    // Get department-wise stats (for admin only)
    let departmentStats = [];
    if (req.user.role === 'admin') {
      departmentStats = await Leave.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'employee',
            foreignField: '_id',
            as: 'employeeData'
          }
        },
        { $unwind: '$employeeData' },
        {
          $group: {
            _id: '$employeeData.department',
            totalLeaves: { $sum: 1 },
            pending: { 
              $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } 
            },
            approved: { 
              $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } 
            },
            rejected: { 
              $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } 
            }
          }
        },
        { $sort: { totalLeaves: -1 } }
      ]);
    }

    res.status(200).json({
      status: 'success',
      data: {
        total: totalLeaves,
        pending: pendingLeaves,
        approved: approvedLeaves,
        rejected: rejectedLeaves,
        leaveTypes,
        monthlyData: formattedMonthlyData,
        departmentStats: req.user.role === 'admin' ? departmentStats : []
      }
    });

  } catch (err) {
    console.error("Get leave stats error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Get employee's leave balance ----------------
exports.getLeaveBalance = async (req, res) => {
  try {
    let employeeId = req.user._id;
    let employeeInfo = {};
    
    // Admin can view any employee's balance
    if (req.user.role === 'admin' && req.query.employeeId) {
      const employee = await User.findOne({ employeeId: req.query.employeeId });
      if (!employee) {
        return res.status(404).json({ 
          status: 'fail', 
          message: 'Employee not found' 
        });
      }
      employeeId = employee._id;
      employeeInfo = employee;
    } else {
      employeeInfo = await User.findById(employeeId).select('name employeeId department position joiningDate');
    }

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear + 1, 0, 1);

    // Get employee's approved leaves for current year
    const approvedLeaves = await Leave.find({
      employee: employeeId,
      status: 'Approved',
      startDate: { $gte: yearStart, $lt: yearEnd }
    });

    // Calculate total leave days by type
    const leaveBalance = {
      Sick: { 
        allowed: 15, 
        used: 0, 
        remaining: 15,
        description: 'For health issues with medical certificate' 
      },
      Annual: { 
        allowed: 20, 
        used: 0, 
        remaining: 20,
        description: 'Earned vacation days' 
      },
      Casual: { 
        allowed: 10, 
        used: 0, 
        remaining: 10,
        description: 'For personal or family matters' 
      },
      Maternity: { 
        allowed: 180, 
        used: 0, 
        remaining: 180,
        description: 'For female employees' 
      },
      Paternity: { 
        allowed: 15, 
        used: 0, 
        remaining: 15,
        description: 'For new fathers' 
      },
      Emergency: { 
        allowed: 5, 
        used: 0, 
        remaining: 5,
        description: 'For urgent unforeseen situations' 
      }
    };

    // Count used leaves
    approvedLeaves.forEach(leave => {
      if (leaveBalance[leave.leaveType]) {
        leaveBalance[leave.leaveType].used += leave.totalDays;
        leaveBalance[leave.leaveType].remaining = 
          leaveBalance[leave.leaveType].allowed - leaveBalance[leave.leaveType].used;
      }
    });

    // Calculate overall statistics
    const totalAllowed = Object.values(leaveBalance).reduce((sum, type) => sum + type.allowed, 0);
    const totalUsed = Object.values(leaveBalance).reduce((sum, type) => sum + type.used, 0);
    const totalRemaining = Object.values(leaveBalance).reduce((sum, type) => sum + type.remaining, 0);

    // Get upcoming leaves (next 30 days)
    const upcomingLeaves = await Leave.find({
      employee: employeeId,
      status: 'Approved',
      startDate: { 
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    })
    .sort({ startDate: 1 })
    .limit(5)
    .select('leaveType startDate endDate totalDays reason');

    res.status(200).json({
      status: 'success',
      data: {
        employee: employeeInfo,
        year: currentYear,
        balance: leaveBalance,
        summary: {
          totalAllowed,
          totalUsed,
          totalRemaining,
          utilizationRate: ((totalUsed / totalAllowed) * 100).toFixed(1)
        },
        upcomingLeaves,
        approvedLeavesCount: approvedLeaves.length,
        totalApprovedDays: approvedLeaves.reduce((sum, leave) => sum + leave.totalDays, 0)
      }
    });

  } catch (err) {
    console.error("Get leave balance error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Bulk approve leaves ----------------
exports.bulkApproveLeaves = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can approve leaves' 
      });
    }

    const { leaveIds } = req.body;
    
    if (!leaveIds || !Array.isArray(leaveIds) || leaveIds.length === 0) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Please provide leave IDs' 
      });
    }

    const results = [];
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const leaveId of leaveIds) {
        try {
          const leave = await Leave.findById(leaveId).session(session);
          
          if (!leave) {
            results.push({ 
              leaveId, 
              success: false, 
              message: 'Leave not found' 
            });
            continue;
          }

          if (leave.status !== 'Pending') {
            results.push({ 
              leaveId, 
              success: false, 
              message: `Leave is already ${leave.status}` 
            });
            continue;
          }

          leave.status = 'Approved';
          leave.approvedBy = req.user._id;
          leave.approvedAt = new Date();
          await leave.save({ session });

          // Update attendance records
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const day = new Date(d);
            day.setHours(0, 0, 0, 0);

            let attendance = await Attendance.findOne({ 
              employee: leave.employee, 
              date: day 
            }).session(session);
            
            if (!attendance) {
              attendance = new Attendance({ 
                employee: leave.employee, 
                date: day,
                status: 'Leave',
                remarks: `Approved ${leave.leaveType} Leave`,
                createdBy: req.user._id,
                updatedBy: req.user._id
              });
            } else {
              attendance.status = 'Leave';
              attendance.remarks = `Approved ${leave.leaveType} Leave`;
              attendance.updatedBy = req.user._id;
              attendance.updatedAt = new Date();
            }
            
            await attendance.save({ session });
          }

          results.push({ 
            leaveId, 
            success: true,
            message: 'Approved successfully'
          });

        } catch (error) {
          results.push({ 
            leaveId, 
            success: false, 
            message: error.message 
          });
        }
      }

      await session.commitTransaction();
      session.endSession();

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.status(200).json({
        status: 'success',
        message: `Bulk approval completed: ${successful} successful, ${failed} failed`,
        results,
        summary: {
          total: leaveIds.length,
          successful,
          failed
        }
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      throw error;
    }

  } catch (err) {
    console.error("Bulk approve error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Bulk reject leaves ----------------
exports.bulkRejectLeaves = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can reject leaves' 
      });
    }

    const { leaveIds, reason } = req.body;
    
    if (!leaveIds || !Array.isArray(leaveIds) || leaveIds.length === 0) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Please provide leave IDs' 
      });
    }

    const results = await Promise.all(
      leaveIds.map(async (leaveId) => {
        try {
          const leave = await Leave.findById(leaveId);
          
          if (!leave) {
            return { 
              leaveId, 
              success: false, 
              message: 'Leave not found' 
            };
          }

          if (leave.status !== 'Pending') {
            return { 
              leaveId, 
              success: false, 
              message: `Leave is already ${leave.status}` 
            };
          }

          leave.status = 'Rejected';
          leave.rejectionReason = reason || 'No reason provided';
          leave.rejectedBy = req.user._id;
          leave.rejectedAt = new Date();
          await leave.save();

          return { 
            leaveId, 
            success: true,
            message: 'Rejected successfully'
          };

        } catch (error) {
          return { 
            leaveId, 
            success: false, 
            message: error.message 
          };
        }
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.status(200).json({
      status: 'success',
      message: `Bulk rejection completed: ${successful} successful, ${failed} failed`,
      results,
      summary: {
        total: leaveIds.length,
        successful,
        failed
      }
    });

  } catch (err) {
    console.error("Bulk reject error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Bulk delete leaves ----------------
exports.bulkDeleteLeaves = async (req, res) => {
  try {
    const { leaveIds } = req.body;
    
    if (!leaveIds || !Array.isArray(leaveIds) || leaveIds.length === 0) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Please provide leave IDs' 
      });
    }

    const results = await Promise.all(
      leaveIds.map(async (leaveId) => {
        try {
          const leave = await Leave.findById(leaveId);
          
          if (!leave) {
            return { 
              leaveId, 
              success: false, 
              message: 'Leave not found' 
            };
          }

          // Check permissions
          const isEmployeeOwner = leave.employee.toString() === req.user._id.toString();
          const isAdmin = req.user.role === 'admin';
          
          if (!isEmployeeOwner && !isAdmin) {
            return { 
              leaveId, 
              success: false, 
              message: 'Permission denied' 
            };
          }

          // Only pending leaves can be deleted by employees
          if (isEmployeeOwner && leave.status !== 'Pending') {
            return { 
              leaveId, 
              success: false, 
              message: 'Only pending leaves can be deleted' 
            };
          }

          // Remove attendance entries if leave was approved
          if (leave.status === 'Approved') {
            await Attendance.deleteMany({
              employee: leave.employee,
              date: { $gte: leave.startDate, $lte: leave.endDate },
              status: 'Leave'
            });
          }

          await Leave.findByIdAndDelete(leaveId);

          return { 
            leaveId, 
            success: true,
            message: 'Deleted successfully'
          };

        } catch (error) {
          return { 
            leaveId, 
            success: false, 
            message: error.message 
          };
        }
      })
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.status(200).json({
      status: 'success',
      message: `Bulk deletion completed: ${successful} successful, ${failed} failed`,
      results,
      summary: {
        total: leaveIds.length,
        successful,
        failed
      }
    });

  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Export leaves to CSV/Excel ----------------
exports.exportLeaves = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can export leaves' 
      });
    }

    const filter = {};

    // Apply filters if provided
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    if (req.query.type && req.query.type !== 'all') {
      filter.leaveType = req.query.type;
    }
    if (req.query.department && req.query.department !== 'all') {
      const users = await User.find({ department: req.query.department });
      if (users.length > 0) {
        filter.employee = { $in: users.map(u => u._id) };
      }
    }
    if (req.query.startDate && req.query.endDate) {
      filter.startDate = { 
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    // Get leaves with filters
    const leaves = await Leave.find(filter)
      .populate({ 
        path: 'employee', 
        select: 'name employeeId department email position' 
      })
      .populate({ 
        path: 'approvedBy', 
        select: 'name employeeId' 
      })
      .populate({ 
        path: 'rejectedBy', 
        select: 'name employeeId' 
      })
      .sort({ createdAt: -1 });

    // Format data for export
    const exportData = leaves.map(leave => ({
      'Employee ID': leave.employee?.employeeId || 'N/A',
      'Employee Name': leave.employee?.name || 'N/A',
      'Department': leave.employee?.department || 'N/A',
      'Leave Type': leave.leaveType,
      'Start Date': leave.startDate.toISOString().split('T')[0],
      'End Date': leave.endDate.toISOString().split('T')[0],
      'Total Days': leave.totalDays,
      'Status': leave.status,
      'Pay Status': leave.payStatus,
      'Reason': leave.reason,
      'Requested On': leave.createdAt.toISOString(),
      'Approved/Rejected By': leave.approvedBy?.name || leave.rejectedBy?.name || 'N/A',
      'Approved/Rejected At': leave.approvedAt || leave.rejectedAt || 'N/A',
      'Rejection Reason': leave.rejectionReason || 'N/A'
    }));

    res.status(200).json({
      status: 'success',
      data: exportData,
      count: exportData.length,
      filters: req.query
    });

  } catch (err) {
    console.error("Export leaves error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Get departments for filter ----------------
exports.getDepartments = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Access denied' 
      });
    }

    const departments = await User.distinct('department', { department: { $ne: null } });
    
    res.status(200).json({
      status: 'success',
      data: departments.sort()
    });

  } catch (err) {
    console.error("Get departments error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};

// ---------------- Get leave type summary ----------------
exports.getLeaveTypeSummary = async (req, res) => {
  try {
    let filter = {};

    // For employees, only show their own data
    if (req.user.role !== 'admin') {
      filter.employee = req.user._id;
    }

    // Apply year filter if provided
    if (req.query.year) {
      const year = parseInt(req.query.year);
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      filter.startDate = { $gte: startDate, $lt: endDate };
    } else {
      // Default to current year
      const currentYear = new Date().getFullYear();
      const startDate = new Date(currentYear, 0, 1);
      const endDate = new Date(currentYear + 1, 0, 1);
      filter.startDate = { $gte: startDate, $lt: endDate };
    }

    // Get summary by leave type
    const summary = await Leave.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            type: '$leaveType',
            status: '$status'
          },
          count: { $sum: 1 },
          totalDays: { $sum: '$totalDays' }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count',
              totalDays: '$totalDays'
            }
          },
          totalCount: { $sum: '$count' },
          totalDays: { $sum: '$totalDays' }
        }
      },
      { $sort: { totalCount: -1 } }
    ]);

    // Format the response
    const formattedSummary = summary.map(item => ({
      type: item._id,
      statuses: item.statuses,
      totalCount: item.totalCount,
      totalDays: item.totalDays
    }));

    res.status(200).json({
      status: 'success',
      data: formattedSummary
    });

  } catch (err) {
    console.error("Get leave type summary error:", err);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      error: err.message 
    });
  }
};