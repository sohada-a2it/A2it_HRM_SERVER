const mongoose = require('mongoose');
const Leave = require('../models/LeaveModel');
const User = require('../models/UsersModel');
const Attendance = require('../models/AttendanceModel');
const SessionLog = require('../models/SessionLogModel');

// ===================== Helper: Add activity to session =====================
const addSessionActivity = async ({ userId, action, target = null, details = {} }) => {
  try {
    let session = await SessionLog.findOne({ userId, logoutAt: null }).sort({ loginAt: -1 });

    if (!session) {
      session = await SessionLog.create({
        userId,
        loginAt: new Date(),
        ip: details.ip || 'N/A',
        device: details.device || 'N/A',
        activities: []
      });
    }

    session.activities.push({
      action,
      target,
      details,
      timestamp: new Date()
    });

    await session.save();
    return session;
  } catch (error) {
    console.error('Add session activity failed:', error);
    return null;
  }
};

// ===================== Get All Leaves (Admin) =====================
exports.getAllLeaves = async (req, res) => {
  try {
    const {
      status,
      type,
      department,
      employeeId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const matchCondition = {};

    // Status filter
    if (status && status !== 'all') {
      matchCondition.status = status;
    }

    // Type filter
    if (type && type !== 'all') {
      matchCondition.leaveType = type;
    }

    // Date range filter
    if (startDate && endDate) {
      matchCondition.startDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default: Last 180 days
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      matchCondition.startDate = { $gte: sixMonthsAgo };
    }

    // Search by employee name or ID
    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { employeeId: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      matchCondition.employee = { $in: userIds };
    }

    // Employee ID filter
    if (employeeId) {
      const user = await User.findOne({ employeeId });
      if (user) {
        matchCondition.employee = user._id;
      }
    }

    // Department filter
    if (department && department !== 'all') {
      const users = await User.find({ department }).select('_id');
      const userIds = users.map(user => user._id);
      matchCondition.employee = { $in: userIds };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get leaves with populated employee data
    const leaves = await Leave.find(matchCondition)
      .populate({
        path: 'employee',
        select: 'firstName lastName email employeeId department profilePicture'
      })
      .populate({
        path: 'approvedBy',
        select: 'firstName lastName'
      })
      .populate({
        path: 'rejectedBy',
        select: 'firstName lastName'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Leave.countDocuments(matchCondition);

    // Transform data to include employee name
    const transformedLeaves = leaves.map(leave => {
      const leaveObj = leave.toObject();
      
      if (leaveObj.employee) {
        leaveObj.employeeName = `${leaveObj.employee.firstName} ${leaveObj.employee.lastName}`;
        leaveObj.employeeId = leaveObj.employee.employeeId;
        leaveObj.department = leaveObj.employee.department;
        leaveObj.profilePicture = leaveObj.employee.profilePicture;
      }
      
      if (leaveObj.approvedBy) {
        leaveObj.approvedByName = `${leaveObj.approvedBy.firstName} ${leaveObj.approvedBy.lastName}`;
      }
      
      if (leaveObj.rejectedBy) {
        leaveObj.rejectedByName = `${leaveObj.rejectedBy.firstName} ${leaveObj.rejectedBy.lastName}`;
      }

      // Calculate total days
      if (leaveObj.startDate && leaveObj.endDate) {
        const start = new Date(leaveObj.startDate);
        const end = new Date(leaveObj.endDate);
        const diffTime = Math.abs(end - start);
        leaveObj.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }

      return leaveObj;
    });

    res.status(200).json({
      status: "success",
      data: transformedLeaves,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get all leaves error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get My Leaves (Employee) =====================
exports.getMyLeaves = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      status,
      type,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    const matchCondition = { employee: userId };

    // Status filter
    if (status && status !== 'all') {
      matchCondition.status = status;
    }

    // Type filter
    if (type && type !== 'all') {
      matchCondition.leaveType = type;
    }

    // Date range filter
    if (startDate && endDate) {
      matchCondition.startDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default: Last 180 days
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      matchCondition.startDate = { $gte: sixMonthsAgo };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const leaves = await Leave.find(matchCondition)
      .populate({
        path: 'approvedBy',
        select: 'firstName lastName'
      })
      .populate({
        path: 'rejectedBy',
        select: 'firstName lastName'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Leave.countDocuments(matchCondition);

    // Transform data
    const transformedLeaves = leaves.map(leave => {
      const leaveObj = leave.toObject();
      
      // Add employee info
      leaveObj.employeeName = `${req.user.firstName} ${req.user.lastName}`;
      leaveObj.employeeId = req.user.employeeId;
      leaveObj.department = req.user.department;
      leaveObj.profilePicture = req.user.profilePicture;
      
      if (leaveObj.approvedBy) {
        leaveObj.approvedByName = `${leaveObj.approvedBy.firstName} ${leaveObj.approvedBy.lastName}`;
      }
      
      if (leaveObj.rejectedBy) {
        leaveObj.rejectedByName = `${leaveObj.rejectedBy.firstName} ${leaveObj.rejectedBy.lastName}`;
      }

      // Calculate total days
      if (leaveObj.startDate && leaveObj.endDate) {
        const start = new Date(leaveObj.startDate);
        const end = new Date(leaveObj.endDate);
        const diffTime = Math.abs(end - start);
        leaveObj.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }

      return leaveObj;
    });

    res.status(200).json({
      status: "success",
      data: transformedLeaves,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get my leaves error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Request Leave =====================
exports.requestLeave = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user._id;
    const { leaveType, payStatus, startDate, endDate, reason } = req.body;

    // Validate required fields
    if (!leaveType || !payStatus || !startDate || !endDate || !reason) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "All fields are required"
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Cannot request leave for past dates"
      });
    }

    if (start > end) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Start date cannot be after end date"
      });
    }

    // Check if there's already a pending leave for overlapping dates
    const existingLeave = await Leave.findOne({
      employee: userId,
      status: 'Pending',
      $or: [
        { startDate: { $lte: end, $gte: start } },
        { endDate: { $lte: end, $gte: start } },
        { 
          startDate: { $lte: start },
          endDate: { $gte: end }
        }
      ]
    }).session(session);

    if (existingLeave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "You already have a pending leave request for overlapping dates"
      });
    }

    // Calculate total days
    const diffTime = Math.abs(end - start);
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Check leave balance (you need to implement this based on your leave policy)
    // For now, we'll skip this check

    // Create leave request
    const leave = await Leave.create([{
      employee: userId,
      leaveType,
      payStatus,
      startDate: start,
      endDate: end,
      totalDays,
      reason,
      status: 'Pending',
      requestedAt: new Date()
    }], { session });

    await addSessionActivity({
      userId,
      action: "Requested Leave",
      target: leave[0]._id.toString(),
      details: {
        leaveType,
        payStatus,
        startDate: start,
        endDate: end,
        totalDays,
        reason
      }
    });

    await session.commitTransaction();
    session.endSession();

    // Populate employee data for response
    const populatedLeave = await Leave.findById(leave[0]._id)
      .populate({
        path: 'employee',
        select: 'firstName lastName email employeeId department profilePicture'
      });

    const leaveObj = populatedLeave.toObject();
    leaveObj.employeeName = `${req.user.firstName} ${req.user.lastName}`;
    leaveObj.employeeId = req.user.employeeId;
    leaveObj.department = req.user.department;
    leaveObj.profilePicture = req.user.profilePicture;
    leaveObj.totalDays = totalDays;

    res.status(201).json({
      status: "success",
      message: "Leave request submitted successfully",
      data: leaveObj
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Request leave error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get Leave By ID =====================
exports.getLeaveById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const leave = await Leave.findById(id)
      .populate({
        path: 'employee',
        select: 'firstName lastName email employeeId department profilePicture'
      })
      .populate({
        path: 'approvedBy',
        select: 'firstName lastName'
      })
      .populate({
        path: 'rejectedBy',
        select: 'firstName lastName'
      });

    if (!leave) {
      return res.status(404).json({
        status: "fail",
        message: "Leave request not found"
      });
    }

    // Check permission
    if (userRole !== 'admin' && leave.employee._id.toString() !== userId.toString()) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to view this leave"
      });
    }

    const leaveObj = leave.toObject();
    leaveObj.employeeName = `${leaveObj.employee.firstName} ${leaveObj.employee.lastName}`;
    leaveObj.employeeId = leaveObj.employee.employeeId;
    leaveObj.department = leaveObj.employee.department;
    leaveObj.profilePicture = leaveObj.employee.profilePicture;
    
    if (leaveObj.approvedBy) {
      leaveObj.approvedByName = `${leaveObj.approvedBy.firstName} ${leaveObj.approvedBy.lastName}`;
    }
    
    if (leaveObj.rejectedBy) {
      leaveObj.rejectedByName = `${leaveObj.rejectedBy.firstName} ${leaveObj.rejectedBy.lastName}`;
    }

    // Calculate total days
    if (leaveObj.startDate && leaveObj.endDate) {
      const start = new Date(leaveObj.startDate);
      const end = new Date(leaveObj.endDate);
      const diffTime = Math.abs(end - start);
      leaveObj.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    res.status(200).json({
      status: "success",
      data: leaveObj
    });

  } catch (error) {
    console.error('Get leave by ID error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Update Leave =====================
exports.updateLeave = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;
    const { leaveType, payStatus, startDate, endDate, reason } = req.body;

    const leave = await Leave.findById(id).session(session);

    if (!leave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "Leave request not found"
      });
    }

    // Check permission
    if (userRole !== 'admin' && leave.employee.toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to update this leave"
      });
    }

    // Can only update pending leaves
    if (leave.status !== 'Pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Only pending leaves can be updated"
      });
    }

    // Validate dates
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          status: "fail",
          message: "Cannot update leave to past dates"
        });
      }

      if (start > end) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          status: "fail",
          message: "Start date cannot be after end date"
        });
      }

      // Calculate total days
      const diffTime = Math.abs(end - start);
      leave.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      leave.startDate = start;
      leave.endDate = end;
    }

    // Update other fields
    if (leaveType) leave.leaveType = leaveType;
    if (payStatus) leave.payStatus = payStatus;
    if (reason) leave.reason = reason;

    await leave.save({ session });

    await addSessionActivity({
      userId,
      action: userRole === 'admin' ? "Admin Updated Leave" : "Updated Leave",
      target: leave._id.toString(),
      details: {
        leaveType: leave.leaveType,
        payStatus: leave.payStatus,
        startDate: leave.startDate,
        endDate: leave.endDate,
        totalDays: leave.totalDays,
        reason: leave.reason
      }
    });

    await session.commitTransaction();
    session.endSession();

    // Populate for response
    const populatedLeave = await Leave.findById(leave._id)
      .populate({
        path: 'employee',
        select: 'firstName lastName email employeeId department profilePicture'
      });

    const leaveObj = populatedLeave.toObject();
    leaveObj.employeeName = `${populatedLeave.employee.firstName} ${populatedLeave.employee.lastName}`;
    leaveObj.employeeId = populatedLeave.employee.employeeId;
    leaveObj.department = populatedLeave.employee.department;
    leaveObj.profilePicture = populatedLeave.employee.profilePicture;

    res.status(200).json({
      status: "success",
      message: "Leave updated successfully",
      data: leaveObj
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Update leave error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Approve Leave (Admin) =====================
exports.approveLeave = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const adminId = req.user._id;
    const { payStatus } = req.body;

    const leave = await Leave.findById(id).session(session);

    if (!leave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "Leave request not found"
      });
    }

    if (leave.status !== 'Pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: `Leave is already ${leave.status.toLowerCase()}`
      });
    }

    // Update leave status
    leave.status = 'Approved';
    leave.approvedBy = adminId;
    leave.approvedAt = new Date();
    if (payStatus) leave.payStatus = payStatus;

    // Mark attendance for leave days as "Leave"
    const startDate = new Date(leave.startDate);
    const endDate = new Date(leave.endDate);
    const employeeId = leave.employee;

    // Create attendance records for each day of leave
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateOnly = new Date(currentDate);
      dateOnly.setHours(0, 0, 0, 0);

      // Check if attendance record already exists
      let attendance = await Attendance.findOne({
        employee: employeeId,
        date: dateOnly
      }).session(session);

      if (!attendance) {
        // Create new attendance record
        attendance = new Attendance({
          employee: employeeId,
          date: dateOnly,
          status: 'Leave',
          autoMarked: true,
          leaveId: leave._id
        });
      } else {
        // Update existing attendance
        attendance.status = 'Leave';
        attendance.autoMarked = true;
        attendance.leaveId = leave._id;
      }

      await attendance.save({ session });

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await leave.save({ session });

    await addSessionActivity({
      userId: adminId,
      action: "Approved Leave",
      target: leave._id.toString(),
      details: {
        employeeId: leave.employee,
        startDate: leave.startDate,
        endDate: leave.endDate,
        totalDays: leave.totalDays,
        payStatus: leave.payStatus
      }
    });

    await session.commitTransaction();
    session.endSession();

    // Populate for response
    const populatedLeave = await Leave.findById(leave._id)
      .populate({
        path: 'employee',
        select: 'firstName lastName email employeeId department profilePicture'
      })
      .populate({
        path: 'approvedBy',
        select: 'firstName lastName'
      });

    const leaveObj = populatedLeave.toObject();
    leaveObj.employeeName = `${populatedLeave.employee.firstName} ${populatedLeave.employee.lastName}`;
    leaveObj.employeeId = populatedLeave.employee.employeeId;
    leaveObj.department = populatedLeave.employee.department;
    leaveObj.profilePicture = populatedLeave.employee.profilePicture;
    leaveObj.approvedByName = `${populatedLeave.approvedBy.firstName} ${populatedLeave.approvedBy.lastName}`;

    res.status(200).json({
      status: "success",
      message: "Leave approved successfully",
      data: leaveObj
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Approve leave error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Reject Leave (Admin) =====================
exports.rejectLeave = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const adminId = req.user._id;
    const { reason } = req.body;

    const leave = await Leave.findById(id).session(session);

    if (!leave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "Leave request not found"
      });
    }

    if (leave.status !== 'Pending') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: `Leave is already ${leave.status.toLowerCase()}`
      });
    }

    // Update leave status
    leave.status = 'Rejected';
    leave.rejectedBy = adminId;
    leave.rejectedAt = new Date();
    leave.rejectionReason = reason || "No reason provided";

    await leave.save({ session });

    await addSessionActivity({
      userId: adminId,
      action: "Rejected Leave",
      target: leave._id.toString(),
      details: {
        employeeId: leave.employee,
        rejectionReason: leave.rejectionReason
      }
    });

    await session.commitTransaction();
    session.endSession();

    // Populate for response
    const populatedLeave = await Leave.findById(leave._id)
      .populate({
        path: 'employee',
        select: 'firstName lastName email employeeId department profilePicture'
      })
      .populate({
        path: 'rejectedBy',
        select: 'firstName lastName'
      });

    const leaveObj = populatedLeave.toObject();
    leaveObj.employeeName = `${populatedLeave.employee.firstName} ${populatedLeave.employee.lastName}`;
    leaveObj.employeeId = populatedLeave.employee.employeeId;
    leaveObj.department = populatedLeave.employee.department;
    leaveObj.profilePicture = populatedLeave.employee.profilePicture;
    leaveObj.rejectedByName = `${populatedLeave.rejectedBy.firstName} ${populatedLeave.rejectedBy.lastName}`;

    res.status(200).json({
      status: "success",
      message: "Leave rejected successfully",
      data: leaveObj
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Reject leave error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Delete Leave =====================
exports.deleteLeave = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const leave = await Leave.findById(id).session(session);

    if (!leave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "Leave request not found"
      });
    }

    // Check permission
    if (userRole !== 'admin' && leave.employee.toString() !== userId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to delete this leave"
      });
    }

    // Can only delete pending leaves
    if (leave.status !== 'Pending' && userRole !== 'admin') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Only pending leaves can be deleted"
      });
    }

    // If leave was approved, update attendance records
    if (leave.status === 'Approved') {
      // Remove "Leave" status from attendance records
      await Attendance.updateMany(
        {
          employee: leave.employee,
          leaveId: leave._id
        },
        {
          $set: {
            status: 'Absent', // Or whatever default status you want
            autoMarked: false,
            leaveId: null
          }
        },
        { session }
      );
    }

    await leave.deleteOne({ session });

    await addSessionActivity({
      userId,
      action: userRole === 'admin' ? "Admin Deleted Leave" : "Deleted Leave",
      target: id,
      details: {
        employeeId: leave.employee,
        status: leave.status,
        leaveType: leave.leaveType
      }
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: "Leave deleted successfully"
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Delete leave error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get Leave Statistics =====================
exports.getLeaveStats = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user._id;

    let matchCondition = {};

    // For employees, only show their stats
    if (userRole !== 'admin') {
      matchCondition = { employee: userId };
    }

    // Get current year
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Add date filter for current year
    matchCondition.createdAt = { $gte: yearStart, $lte: yearEnd };

    const stats = await Leave.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalLeaves: { $sum: 1 },
          pendingLeaves: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] }
          },
          approvedLeaves: {
            $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] }
          },
          rejectedLeaves: {
            $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] }
          },
          paidLeaves: {
            $sum: { $cond: [{ $eq: ["$payStatus", "Paid"] }, 1, 0] }
          },
          unpaidLeaves: {
            $sum: { $cond: [{ $eq: ["$payStatus", "Unpaid"] }, 1, 0] }
          },
          halfPaidLeaves: {
            $sum: { $cond: [{ $eq: ["$payStatus", "HalfPaid"] }, 1, 0] }
          },
          totalLeaveDays: { $sum: "$totalDays" },
          uniqueEmployees: { $addToSet: "$employee" }
        }
      },
      {
        $project: {
          totalLeaves: 1,
          pendingLeaves: 1,
          approvedLeaves: 1,
          rejectedLeaves: 1,
          paidLeaves: 1,
          unpaidLeaves: 1,
          halfPaidLeaves: 1,
          totalLeaveDays: 1,
          averageLeaveDays: {
            $cond: [
              { $gt: ["$approvedLeaves", 0] },
              { $divide: ["$totalLeaveDays", "$approvedLeaves"] },
              0
            ]
          },
          totalEmployees: { $size: "$uniqueEmployees" }
        }
      }
    ]);

    // Get monthly stats
    const monthlyStats = await Leave.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 },
          approved: {
            $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] }
          }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Get leave type distribution
    const typeStats = await Leave.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: "$leaveType",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      status: "success",
      data: {
        summary: stats[0] || {
          totalLeaves: 0,
          pendingLeaves: 0,
          approvedLeaves: 0,
          rejectedLeaves: 0,
          paidLeaves: 0,
          unpaidLeaves: 0,
          halfPaidLeaves: 0,
          totalLeaveDays: 0,
          averageLeaveDays: 0,
          totalEmployees: 0
        },
        monthlyStats,
        typeStats,
        year: currentYear
      }
    });

  } catch (error) {
    console.error('Get leave stats error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get Leave Balance =====================
exports.getLeaveBalance = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    // If admin requesting balance for specific employee
    const { employeeId } = req.query;
    let targetUserId = userId;

    if (userRole === 'admin' && employeeId) {
      const user = await User.findOne({ employeeId });
      if (user) {
        targetUserId = user._id;
      }
    }

    // Get current year
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Get user's leave policy (you need to implement this based on your system)
    // For now, using default values
    const leavePolicy = {
      Sick: { allowed: 14, used: 0, remaining: 14 },
      Annual: { allowed: 18, used: 0, remaining: 18 },
      Casual: { allowed: 10, used: 0, remaining: 10 },
      Emergency: { allowed: 5, used: 0, remaining: 5 },
      Maternity: { allowed: 84, used: 0, remaining: 84 },
      Paternity: { allowed: 7, used: 0, remaining: 7 }
    };

    // Get approved leaves for this year
    const approvedLeaves = await Leave.find({
      employee: targetUserId,
      status: 'Approved',
      startDate: { $gte: yearStart, $lte: yearEnd }
    });

    // Calculate used leaves by type
    approvedLeaves.forEach(leave => {
      if (leavePolicy[leave.leaveType]) {
        leavePolicy[leave.leaveType].used += leave.totalDays;
        leavePolicy[leave.leaveType].remaining = 
          leavePolicy[leave.leaveType].allowed - leavePolicy[leave.leaveType].used;
      }
    });

    // Get pending leaves count
    const pendingLeaves = await Leave.countDocuments({
      employee: targetUserId,
      status: 'Pending'
    });

    // Get upcoming leaves (approved, starting in future)
    const upcomingLeaves = await Leave.find({
      employee: targetUserId,
      status: 'Approved',
      startDate: { $gt: new Date() }
    }).sort({ startDate: 1 }).limit(5);

    res.status(200).json({
      status: "success",
      data: {
        balance: leavePolicy,
        summary: {
          totalAllowed: Object.values(leavePolicy).reduce((sum, policy) => sum + policy.allowed, 0),
          totalUsed: Object.values(leavePolicy).reduce((sum, policy) => sum + policy.used, 0),
          totalRemaining: Object.values(leavePolicy).reduce((sum, policy) => sum + policy.remaining, 0),
          pendingRequests: pendingLeaves,
          upcomingLeaves: upcomingLeaves.length
        },
        employeeInfo: userRole === 'admin' ? {
          name: `${req.user.firstName} ${req.user.lastName}`,
          employeeId: req.user.employeeId,
          department: req.user.department
        } : null,
        year: currentYear
      }
    });

  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get Departments List =====================
exports.getDepartments = async (req, res) => {
  try {
    const departments = await User.distinct('department', { department: { $ne: null } });
    
    res.status(200).json({
      status: "success",
      data: departments.filter(dept => dept && dept.trim() !== '')
    });

  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Bulk Approve Leaves =====================
exports.bulkApproveLeaves = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminId = req.user._id;
    const { leaveIds } = req.body;

    if (!Array.isArray(leaveIds) || leaveIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Please provide leave IDs to approve"
      });
    }

    const leaves = await Leave.find({
      _id: { $in: leaveIds },
      status: 'Pending'
    }).session(session);

    if (leaves.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "No pending leaves found to approve"
      });
    }

    const approvedLeaves = [];
    const errors = [];

    for (const leave of leaves) {
      try {
        // Update leave status
        leave.status = 'Approved';
        leave.approvedBy = adminId;
        leave.approvedAt = new Date();
        await leave.save({ session });

        // Mark attendance for leave days
        const startDate = new Date(leave.startDate);
        const endDate = new Date(leave.endDate);

        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dateOnly = new Date(currentDate);
          dateOnly.setHours(0, 0, 0, 0);

          let attendance = await Attendance.findOne({
            employee: leave.employee,
            date: dateOnly
          }).session(session);

          if (!attendance) {
            attendance = new Attendance({
              employee: leave.employee,
              date: dateOnly,
              status: 'Leave',
              autoMarked: true,
              leaveId: leave._id
            });
          } else {
            attendance.status = 'Leave';
            attendance.autoMarked = true;
            attendance.leaveId = leave._id;
          }

          await attendance.save({ session });
          currentDate.setDate(currentDate.getDate() + 1);
        }

        approvedLeaves.push(leave._id);

      } catch (error) {
        errors.push({
          leaveId: leave._id,
          error: error.message
        });
      }
    }

    await addSessionActivity({
      userId: adminId,
      action: "Bulk Approved Leaves",
      details: {
        totalRequested: leaveIds.length,
        approved: approvedLeaves.length,
        errors: errors.length
      }
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: `Successfully approved ${approvedLeaves.length} leave requests`,
      data: {
        approved: approvedLeaves,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Bulk approve leaves error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Bulk Reject Leaves =====================
exports.bulkRejectLeaves = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminId = req.user._id;
    const { leaveIds, reason } = req.body;

    if (!Array.isArray(leaveIds) || leaveIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Please provide leave IDs to reject"
      });
    }

    const leaves = await Leave.find({
      _id: { $in: leaveIds },
      status: 'Pending'
    }).session(session);

    if (leaves.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "No pending leaves found to reject"
      });
    }

    const rejectedLeaves = [];

    for (const leave of leaves) {
      leave.status = 'Rejected';
      leave.rejectedBy = adminId;
      leave.rejectedAt = new Date();
      leave.rejectionReason = reason || "No reason provided";
      await leave.save({ session });
      rejectedLeaves.push(leave._id);
    }

    await addSessionActivity({
      userId: adminId,
      action: "Bulk Rejected Leaves",
      details: {
        totalRejected: rejectedLeaves.length,
        reason: reason || "No reason provided"
      }
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: `Successfully rejected ${rejectedLeaves.length} leave requests`,
      data: {
        rejected: rejectedLeaves
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Bulk reject leaves error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Bulk Delete Leaves =====================
exports.bulkDeleteLeaves = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const { leaveIds } = req.body;

    if (!Array.isArray(leaveIds) || leaveIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: "fail",
        message: "Please provide leave IDs to delete"
      });
    }

    // For non-admin users, they can only delete their own pending leaves
    let matchCondition = { _id: { $in: leaveIds } };
    
    if (userRole !== 'admin') {
      matchCondition.employee = userId;
      matchCondition.status = 'Pending';
    }

    const leaves = await Leave.find(matchCondition).session(session);

    if (leaves.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        status: "fail",
        message: "No leaves found to delete"
      });
    }

    const deletedLeaves = [];

    for (const leave of leaves) {
      // If leave was approved, update attendance records
      if (leave.status === 'Approved') {
        await Attendance.updateMany(
          {
            employee: leave.employee,
            leaveId: leave._id
          },
          {
            $set: {
              status: 'Absent',
              autoMarked: false,
              leaveId: null
            }
          },
          { session }
        );
      }

      await leave.deleteOne({ session });
      deletedLeaves.push(leave._id);
    }

    await addSessionActivity({
      userId,
      action: "Bulk Deleted Leaves",
      details: {
        totalDeleted: deletedLeaves.length,
        userRole: userRole
      }
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: `Successfully deleted ${deletedLeaves.length} leave requests`,
      data: {
        deleted: deletedLeaves
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Bulk delete leaves error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Export Leaves =====================
exports.exportLeaves = async (req, res) => {
  try {
    const {
      status,
      type,
      department,
      startDate,
      endDate
    } = req.query;

    const matchCondition = {};

    // Status filter
    if (status && status !== 'all') {
      matchCondition.status = status;
    }

    // Type filter
    if (type && type !== 'all') {
      matchCondition.leaveType = type;
    }

    // Date range filter
    if (startDate && endDate) {
      matchCondition.startDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Department filter
    if (department && department !== 'all') {
      const users = await User.find({ department }).select('_id');
      const userIds = users.map(user => user._id);
      matchCondition.employee = { $in: userIds };
    }

    const leaves = await Leave.find(matchCondition)
      .populate({
        path: 'employee',
        select: 'firstName lastName email employeeId department'
      })
      .populate({
        path: 'approvedBy',
        select: 'firstName lastName'
      })
      .populate({
        path: 'rejectedBy',
        select: 'firstName lastName'
      })
      .sort({ createdAt: -1 });

    // Transform data for export
    const exportData = leaves.map(leave => ({
      'Leave ID': leave._id,
      'Employee ID': leave.employee?.employeeId || 'N/A',
      'Employee Name': `${leave.employee?.firstName || ''} ${leave.employee?.lastName || ''}`.trim(),
      'Department': leave.employee?.department || 'N/A',
      'Leave Type': leave.leaveType,
      'Start Date': leave.startDate.toISOString().split('T')[0],
      'End Date': leave.endDate.toISOString().split('T')[0],
      'Total Days': leave.totalDays,
      'Status': leave.status,
      'Pay Status': leave.payStatus,
      'Reason': leave.reason,
      'Requested Date': leave.requestedAt?.toISOString().split('T')[0] || 'N/A',
      'Approved Date': leave.approvedAt?.toISOString().split('T')[0] || 'N/A',
      'Approved By': leave.approvedBy ? `${leave.approvedBy.firstName} ${leave.approvedBy.lastName}` : 'N/A',
      'Rejected Date': leave.rejectedAt?.toISOString().split('T')[0] || 'N/A',
      'Rejected By': leave.rejectedBy ? `${leave.rejectedBy.firstName} ${leave.rejectedBy.lastName}` : 'N/A',
      'Rejection Reason': leave.rejectionReason || 'N/A'
    }));

    res.status(200).json({
      status: "success",
      data: exportData,
      exportDate: new Date(),
      totalRecords: exportData.length
    });

  } catch (error) {
    console.error('Export leaves error:', error);
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};