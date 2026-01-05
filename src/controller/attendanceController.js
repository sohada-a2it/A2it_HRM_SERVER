const mongoose = require('mongoose');
const UAParser = require('ua-parser-js');

const Attendance = require('../models/AttendanceModel');
const User = require('../models/UsersModel');
const SessionLog = require('../models/SessionLogModel');
const Holiday = require('../models/HolidayModel');
const OfficeSchedule = require('../models/OfficeScheduleModel');
const OfficeScheduleOverride = require('../models/TemporaryOfficeSchedule');
const addSessionActivity = require('../utility/sessionLogModel'); 

// ===================== Parse Device Info =====================
const parseDeviceInfo = (userAgent) => {
  const parser = new UAParser(userAgent);
  const uaResult = parser.getResult();

  return {
    type: uaResult.device.type || 'desktop',
    os: uaResult.os.name || 'Unknown',
    browser: uaResult.browser.name || 'Unknown',
    userAgent
  };
};

// ===================== Get Today's Status =====================
exports.getTodayStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: userId,
      date: today
    });

    if (!attendance) {
      return res.status(200).json({
        clockedIn: false,
        clockedOut: false,
        attendance: null,
        message: "Not clocked in today"
      });
    }

    res.status(200).json({
      clockedIn: !!attendance.clockIn,
      clockedOut: !!attendance.clockOut,
      attendance,
      message: attendance.clockOut ? "Clocked out" : "Clocked in"
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get Attendance Records =====================
exports.getAttendanceRecords = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const matchCondition = { employee: userId };

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default: Last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchCondition.date = { $gte: thirtyDaysAgo };
    }

    const records = await Attendance.find(matchCondition)
      .sort({ date: -1 })
      .populate('employee', 'firstName lastName email')
      .lean();

    res.status(200).json({
      status: "success",
      count: records.length,
      records
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get User Summary =====================
// ===================== Get User Summary =====================
exports.getUserSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const matchCondition = { employee: userId };

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchCondition.date = { $gte: thirtyDaysAgo };
    }

    const summary = await Attendance.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalHours: { $sum: "$totalHours" },
          daysPresent: { 
            $sum: { 
              $cond: [
                { $in: ["$status", ["Present", "Clocked In", "Late"]] }, 
                1, 
                0 
              ] 
            } 
          },
          daysAbsent: { 
            $sum: { 
              $cond: [
                { $eq: ["$status", "Absent"] }, 
                1, 
                0 
              ] 
            } 
          },
          daysLeave: { 
            $sum: { 
              $cond: [
                { $eq: ["$status", "Leave"] }, 
                1, 
                0 
              ] 
            } 
          },
          daysWeeklyOff: { 
            $sum: { 
              $cond: [
                { $eq: ["$status", "Weekly Off"] }, 
                1, 
                0 
              ] 
            } 
          },
          daysGovtHoliday: { 
            $sum: { 
              $cond: [
                { $eq: ["$status", "Govt Holiday"] }, 
                1, 
                0 
              ] 
            } 
          },
          daysOffDay: { 
            $sum: { 
              $cond: [
                { $eq: ["$status", "Off Day"] }, 
                1, 
                0 
              ] 
            } 
          },
          lateArrivals: {
            $sum: {
              $cond: [
                { $eq: ["$status", "Late"] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const result = summary[0] || {
      totalRecords: 0,
      totalHours: 0,
      daysPresent: 0,
      daysAbsent: 0,
      daysLeave: 0,
      daysWeeklyOff: 0,
      daysGovtHoliday: 0,
      daysOffDay: 0,
      lateArrivals: 0
    };

    // Calculate additional metrics
    const nonWorkingDays = result.daysWeeklyOff + result.daysGovtHoliday + result.daysOffDay;
    const workingDays = result.totalRecords - nonWorkingDays;
    const attendanceRate = workingDays > 0 
      ? (result.daysPresent / workingDays) * 100 
      : 0;
    const averageHours = result.daysPresent > 0 
      ? result.totalHours / result.daysPresent 
      : 0;

    res.status(200).json({
      status: "success",
      summary: {
        ...result,
        workingDays,
        nonWorkingDays,
        attendanceRate: parseFloat(attendanceRate.toFixed(2)),
        averageHours: parseFloat(averageHours.toFixed(2))
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};
 
// ===================== Clock In =====================
exports.clockIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timestamp, location, device } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({ employee: userId, date: today });
    if (attendance && attendance.clockIn) {
      return res.status(400).json({
        status: "fail",
        message: "Already clocked in today"
      });
    }

    const deviceInfo = parseDeviceInfo(req.headers['user-agent']);

    // ================= AUTO DAY STATUS DETECT =================
    let attendanceStatus = "Present";
    const dayName = today.toLocaleString("en-US", { weekday: "long" });

    // 1️⃣ Govt / Company Holiday
    const holiday = await Holiday.findOne({
      date: today,
      isActive: true
    });

    if (holiday) {
      attendanceStatus = holiday.type === "GOVT" ? "Govt Holiday" : "Off Day";
    } else {
      // 2️⃣ Temporary Weekly Override
      const override = await OfficeScheduleOverride.findOne({
        isActive: true,
        startDate: { $lte: today },
        endDate: { $gte: today }
      });

      if (override && override.weeklyOffDays.includes(dayName)) {
        attendanceStatus = "Weekly Off";
      } else {
        // 3️⃣ Default Office Schedule
        const schedule = await OfficeSchedule.findOne({ isActive: true });
        const weeklyOffDays = schedule?.weeklyOffDays || ["Friday", "Saturday"];

        if (weeklyOffDays.includes(dayName)) {
          attendanceStatus = "Weekly Off";
        }
      }
    }

    // 4️⃣ Check if user is on leave
    const user = await User.findById(userId);
    if (user.leaveDays && user.leaveDays.length > 0) {
      const leaveToday = user.leaveDays.some(leave => {
        const leaveDate = new Date(leave.date);
        leaveDate.setHours(0, 0, 0, 0);
        return leaveDate.getTime() === today.getTime() && leave.status === "approved";
      });
      
      if (leaveToday) {
        attendanceStatus = "Leave";
      }
    }

    // Check if late (after 10:00 AM)
    const currentTime = new Date();
    const clockInTime = currentTime.getHours() * 60 + currentTime.getMinutes();
    const lateThreshold = 10 * 60; // 10:00 AM in minutes
    
    if (attendanceStatus === "Present" && clockInTime > lateThreshold) {
      attendanceStatus = "Late";
    }

    // Special case: If it's a holiday/weekly off/leave, don't require clock in
    const isNonWorkingDay = ["Govt Holiday", "Weekly Off", "Leave"].includes(attendanceStatus);
    
    if (!attendance) {
      attendance = new Attendance({
        employee: userId,
        date: today,
        clockIn: isNonWorkingDay ? null : (timestamp ? new Date(timestamp) : new Date()),
        status: attendanceStatus,
        ipAddress: req.ip,
        device: deviceInfo,
        location: location || "Office",
        autoMarked: isNonWorkingDay // Flag to indicate auto-marked
      });
    } else {
      attendance.clockIn = isNonWorkingDay ? null : (timestamp ? new Date(timestamp) : new Date());
      attendance.status = attendanceStatus;
      attendance.ipAddress = req.ip;
      attendance.device = deviceInfo;
      attendance.location = location || "Office";
      attendance.autoMarked = isNonWorkingDay;
    }

    await attendance.save();

    await addSessionActivity({
      userId,
      action: isNonWorkingDay ? "Auto-marked" : "Clocked In",
      target: attendance._id.toString(),
      details: {
        ip: req.ip,
        device: deviceInfo,
        dayStatus: attendanceStatus,
        location: location || "Office",
        timestamp: attendance.clockIn,
        autoMarked: isNonWorkingDay
      }
    });

    res.status(200).json({
      status: "success",
      message: isNonWorkingDay 
        ? `Auto-marked as ${attendanceStatus} (no clock in required)` 
        : `Clocked in successfully (${attendanceStatus})`,
      attendance,
      clockedIn: !isNonWorkingDay && !!attendance.clockIn,
      clockedOut: false,
      autoMarked: isNonWorkingDay
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Clock Out =====================
// attendanceController.js এ clockOut ফাংশনে

exports.clockOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timestamp, location, device, autoClockOut = false } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: userId,
      date: today
    });

    if (!attendance || !attendance.clockIn) {
      return res.status(400).json({
        status: "fail",
        message: "Clock in first"
      });
    }

    if (attendance.clockOut) {
      return res.status(400).json({
        status: "fail",
        message: "Already clocked out today"
      });
    }

    const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
    const clockOutTime = timestamp ? new Date(timestamp) : new Date();

    attendance.clockOut = clockOutTime;
    attendance.totalHours = parseFloat(
      ((clockOutTime - attendance.clockIn) / (1000 * 60 * 60)).toFixed(4)
    );
    attendance.ipAddress = req.ip;
    attendance.device = deviceInfo;
    attendance.location = location || "Office";
    attendance.clockOut = autoClockOut; // Add this field

    // Update status if it was "Clocked In" or "Late"
    if (attendance.status === "Clocked In" || attendance.status === "Late") {
      attendance.status = "Present";
    }

    await attendance.save();

    await addSessionActivity({
      userId,
      action: autoClockOut ? "Auto Clocked Out" : "Clocked Out",
      target: attendance._id.toString(),
      details: {
        totalHours: attendance.totalHours,
        ip: req.ip,
        device: deviceInfo,
        location: location || "Office",
        timestamp: clockOutTime,
        autoClockOut
      }
    });

    res.status(200).json({
      status: "success",
      message: autoClockOut ? "Auto clocked out successfully" : "Clocked out successfully",
      attendance,
      clockedIn: true,
      clockedOut: true,
      autoClockOut
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get Single Attendance =====================
exports.getAttendanceById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const attendance = await Attendance.findById(id)
      .populate('employee', 'firstName lastName email');

    if (!attendance) {
      return res.status(404).json({
        status: "fail",
        message: "Attendance record not found"
      });
    }

    // Check if user has permission to view this attendance
    const user = await User.findById(userId);
    if (attendance.employee._id.toString() !== userId.toString() && 
        user.role !== 'admin') {
      return res.status(403).json({
        status: "fail",
        message: "Not authorized to view this attendance"
      });
    }

    res.status(200).json({
      status: "success",
      attendance
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Admin Functions =====================

// Get All Attendance Records (Admin)
exports.getAllAttendanceRecords = async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query;

    const matchCondition = {};

    if (employeeId) {
      matchCondition.employee = employeeId;
    }

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchCondition.date = { $gte: thirtyDaysAgo };
    }

    const records = await Attendance.find(matchCondition)
      .sort({ date: -1 })
      .populate('employee', 'firstName lastName email')
      .lean();

    res.status(200).json({
      status: "success",
      count: records.length,
      records
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Attendance Summary for All or Specific Employee (Admin)
exports.getAllAttendanceSummary = async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query;

    const matchCondition = {};

    if (employeeId) {
      matchCondition.employee = employeeId;
    }

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchCondition.date = { $gte: thirtyDaysAgo };
    }

    // Get total employees count
    const totalEmployees = await User.countDocuments({ status: 'active' });

    // Get today's attendance stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const presentToday = await Attendance.countDocuments({
      date: today,
      status: { $in: ["Present", "Clocked In", "Late"] }
    });
    
    const absentToday = totalEmployees - presentToday;

    // Get aggregated summary
    const summary = await Attendance.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalHours: { $sum: "$totalHours" },
          daysPresent: { 
            $sum: { 
              $cond: [
                { $in: ["$status", ["Present", "Clocked In", "Late"]] }, 
                1, 
                0 
              ] 
            } 
          },
          daysAbsent: { 
            $sum: { 
              $cond: [
                { $eq: ["$status", "Absent"] }, 
                1, 
                0 
              ] 
            } 
          },
          daysLeave: { 
            $sum: { 
              $cond: [
                { $eq: ["$status", "Leave"] }, 
                1, 
                0 
              ] 
            } 
          },
          daysHoliday: { 
            $sum: { 
              $cond: [
                { $in: ["$status", ["Govt Holiday", "Weekly Off"]] }, 
                1, 
                0 
              ] 
            } 
          },
          lateArrivals: {
            $sum: {
              $cond: [
                { $eq: ["$status", "Late"] },
                1,
                0
              ]
            }
          },
          uniqueEmployees: { $addToSet: "$employee" }
        }
      },
      {
        $project: {
          totalRecords: 1,
          totalHours: 1,
          daysPresent: 1,
          daysAbsent: 1,
          daysLeave: 1,
          daysHoliday: 1,
          lateArrivals: 1,
          totalEmployees: { $size: "$uniqueEmployees" }
        }
      }
    ]);

    const result = summary[0] || {
      totalRecords: 0,
      totalHours: 0,
      daysPresent: 0,
      daysAbsent: 0,
      daysLeave: 0,
      daysHoliday: 0,
      lateArrivals: 0,
      totalEmployees: 0
    };

    // Calculate additional metrics
    const workingDays = result.totalRecords - result.daysHoliday;
    const attendanceRate = workingDays > 0 
      ? (result.daysPresent / workingDays) * 100 
      : 0;
    const averageHours = result.daysPresent > 0 
      ? result.totalHours / result.daysPresent 
      : 0;

    res.status(200).json({
      status: "success",
      summary: {
        ...result,
        totalEmployees,
        presentToday,
        absentToday,
        workingDays,
        attendanceRate: parseFloat(attendanceRate.toFixed(2)),
        averageHours: parseFloat(averageHours.toFixed(2))
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Admin Correct Attendance =====================
exports.adminCorrectAttendance = async (req, res) => {
  try {
    const { attendanceId, clockIn, clockOut, status } = req.body;
    const adminId = req.user._id;

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({
        status: "fail",
        message: "Attendance not found"
      });
    }

    const oldData = {
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: attendance.status
    };

    if (clockIn) attendance.clockIn = new Date(clockIn);
    if (clockOut) attendance.clockOut = new Date(clockOut);
    if (status) attendance.status = status;

    if (attendance.clockIn && attendance.clockOut) {
      attendance.totalHours = parseFloat(
        ((attendance.clockOut - attendance.clockIn) / (1000 * 60 * 60)).toFixed(4)
      );
    }

    attendance.correctedByAdmin = true;
    attendance.correctedBy = adminId;
    attendance.correctionDate = new Date();
    attendance.device = parseDeviceInfo(req.headers['user-agent']);

    await attendance.save();

    await addSessionActivity({
      userId: adminId,
      action: "Admin Corrected Attendance",
      target: attendance._id.toString(),
      details: {
        employeeId: attendance.employee,
        oldData,
        newData: { clockIn, clockOut, status },
        ip: req.ip
      }
    });

    res.status(200).json({
      status: "success",
      message: "Attendance corrected successfully",
      attendance
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Get Attendance by Date Range =====================
exports.getAttendanceByDateRange = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        status: "fail",
        message: "startDate and endDate are required"
      });
    }

    const records = await Attendance.find({
      employee: userId,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    })
    .sort({ date: -1 })
    .lean();

    res.status(200).json({
      status: "success",
      count: records.length,
      records
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== Export Attendance Data =====================
exports.exportAttendanceData = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    if (user.role !== 'admin') {
      return res.status(403).json({
        status: "fail",
        message: "Only admin can export attendance data"
      });
    }

    const { startDate, endDate, employeeId, format = 'json' } = req.query;

    const matchCondition = {};

    if (employeeId) {
      matchCondition.employee = employeeId;
    }

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchCondition.date = { $gte: thirtyDaysAgo };
    }

    const records = await Attendance.find(matchCondition)
      .populate('employee', 'firstName lastName email employeeId')
      .sort({ date: -1 })
      .lean();

    if (format === 'csv') {
      // Convert to CSV
      const csvData = records.map(record => ({
        Date: record.date.toISOString().split('T')[0],
        'Employee ID': record.employee?.employeeId || 'N/A',
        'Employee Name': `${record.employee?.firstName || ''} ${record.employee?.lastName || ''}`.trim(),
        'Clock In': record.clockIn ? new Date(record.clockIn).toLocaleTimeString() : 'N/A',
        'Clock Out': record.clockOut ? new Date(record.clockOut).toLocaleTimeString() : 'N/A',
        'Total Hours': record.totalHours || '0.00',
        Status: record.status || 'N/A',
        'IP Address': record.ipAddress || 'N/A',
        'Corrected by Admin': record.correctedByAdmin ? 'Yes' : 'No'
      }));

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.csv');
      
      // Simple CSV string generation
      const csvString = [
        Object.keys(csvData[0] || {}).join(','),
        ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
      ].join('\n');
      
      return res.send(csvString);
    }

    // Default JSON response
    res.status(200).json({
      status: "success",
      count: records.length,
      records,
      exportDate: new Date(),
      exportedBy: `${user.firstName} ${user.lastName}`
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};