// controllers/attendanceController.js
const mongoose = require('mongoose');
const UAParser = require('ua-parser-js');
const cron = require('node-cron');
// const moment = require('moment-timezone');

const Attendance = require('../models/AttendanceModel');
const User = require('../models/UsersModel');
const Leave = require('../models/LeaveModel');
const Holiday = require('../models/HolidayModel');
const OfficeSchedule = require('../models/OfficeScheduleModel');
const OfficeScheduleOverride = require('../models/TemporaryOfficeSchedule');
const SessionLog = require('../models/SessionLogModel');

const TIMEZONE = 'Asia/Dhaka';

// ===================== Helper Functions =====================
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

const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const addMinutesToTime = (timeStr, minutes) => {
  const totalMinutes = timeToMinutes(timeStr) + minutes;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const checkLateEarlyForEmployee = (clockInTime, employeeShift) => {
  const clockInMinutes = clockInTime.getHours() * 60 + clockInTime.getMinutes();
  const shiftStartMinutes = timeToMinutes(employeeShift.start);
  const difference = clockInMinutes - shiftStartMinutes;
  const lateThreshold = employeeShift.lateThreshold || 5;
  const earlyThreshold = employeeShift.earlyThreshold || -1;
  
  let isLate = false, isEarly = false, lateMinutes = 0, earlyMinutes = 0;
  
  if (difference > lateThreshold) {
    isLate = true;
    lateMinutes = difference - lateThreshold;
  } else if (difference < earlyThreshold) {
    isEarly = true;
    earlyMinutes = Math.abs(difference - earlyThreshold);
  }
  
  return { isLate, isEarly, lateMinutes, earlyMinutes, difference };
};

const getEmployeeShiftDetails = async (employeeId, date) => {
  const today = new Date(date);
  today.setHours(0, 0, 0, 0);

  // Check admin adjusted shift
  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: today,
    adminAdjustedShift: true,
    isDeleted: false
  });

  if (attendance && attendance.adminShiftAdjustment) {
    const adjustment = attendance.adminShiftAdjustment;
    const autoClockOutDelay = adjustment.autoClockOutDelay || 10;
    return {
      name: 'Admin Adjusted',
      start: adjustment.start,
      end: adjustment.end,
      lateThreshold: adjustment.lateThreshold || 5,
      earlyThreshold: adjustment.earlyThreshold || -1,
      autoClockOutDelay: autoClockOutDelay,
      autoClockOutTime: addMinutesToTime(adjustment.end, autoClockOutDelay),
      isAdminAdjusted: true,
      source: 'attendance_adjustment'
    };
  }

  const employee = await User.findById(employeeId);
  if (!employee) {
    const defaultShift = {
      name: 'Default',
      start: '09:00',
      end: '18:00',
      lateThreshold: 5,
      earlyThreshold: -1,
      autoClockOutDelay: 10,
      autoClockOutTime: '18:10',
      isAdminAdjusted: false,
      source: 'system_default'
    };
    return defaultShift;
  }

  // Check assigned shift
  if (employee.shiftTiming?.assignedShift?.isActive && 
      employee.shiftTiming.assignedShift.start && 
      employee.shiftTiming.assignedShift.end) {
    
    const shift = employee.shiftTiming.assignedShift;
    const autoClockOutDelay = shift.autoClockOutDelay || 10;
    return {
      name: shift.name || 'Assigned Shift',
      start: shift.start,
      end: shift.end,
      lateThreshold: shift.lateThreshold || 5,
      earlyThreshold: shift.earlyThreshold || -1,
      autoClockOutDelay: autoClockOutDelay,
      autoClockOutTime: addMinutesToTime(shift.end, autoClockOutDelay),
      isAdminAdjusted: false,
      source: 'assigned_shift'
    };
  }

  // Use default shift
  const defaultShift = employee.shiftTiming?.defaultShift || {};
  const autoClockOutDelay = defaultShift.autoClockOutDelay || 10;
  
  return {
    name: defaultShift.name || 'Default',
    start: defaultShift.start || '09:00',
    end: defaultShift.end || '18:00',
    lateThreshold: defaultShift.lateThreshold || 5,
    earlyThreshold: defaultShift.earlyThreshold || -1,
    autoClockOutDelay: autoClockOutDelay,
    autoClockOutTime: addMinutesToTime(defaultShift.end || '18:00', autoClockOutDelay),
    isAdminAdjusted: false,
    source: 'default_shift'
  };
};

const checkLeaveStatus = async (employeeId, date) => {
  const today = new Date(date);
  today.setHours(0, 0, 0, 0);

  const leave = await Leave.findOne({
    employee: employeeId,
    startDate: { $lte: today },
    endDate: { $gte: today },
    status: 'Approved',
    isDeleted: { $ne: true }
  });

  if (!leave) return null;

  return {
    isOnLeave: true,
    leaveId: leave._id,
    leaveType: leave.leaveType,
    payStatus: leave.payStatus,
    days: leave.totalDays,
    reason: leave.reason,
    affectsAttendance: leave.affectsAttendance
  };
};

const checkDayStatus = async (employeeId, date) => {
  const today = new Date(date);
  today.setHours(0, 0, 0, 0);
  const dayName = today.toLocaleString("en-US", { weekday: "long" });

  // Check holiday
  const holiday = await Holiday.findOne({
    date: today,
    isActive: true
  });

  if (holiday) {
    return {
      status: holiday.type === "GOVT" ? "Govt Holiday" : "Off Day",
      isWorkingDay: false,
      reason: holiday.name || "Holiday",
      affectsAttendance: false,
      recordType: 'holiday'
    };
  }

  // Check temporary override
  const override = await OfficeScheduleOverride.findOne({
    isActive: true,
    startDate: { $lte: today },
    endDate: { $gte: today }
  });

  if (override && override.weeklyOffDays.includes(dayName)) {
    return {
      status: "Weekly Off",
      isWorkingDay: false,
      reason: "Temporary Weekly Off",
      affectsAttendance: false,
      recordType: 'weekly_off'
    };
  }

  // Check default schedule
  const schedule = await OfficeSchedule.findOne({ isActive: true });
  const weeklyOffDays = schedule?.weeklyOffDays || ["Friday", "Saturday"];

  if (weeklyOffDays.includes(dayName)) {
    return {
      status: "Weekly Off",
      isWorkingDay: false,
      reason: "Weekly Off Day",
      affectsAttendance: false,
      recordType: 'weekly_off'
    };
  }

  // Check leave
  const leaveStatus = await checkLeaveStatus(employeeId, date);
  if (leaveStatus) {
    let status = "Leave";
    if (leaveStatus.payStatus === 'Unpaid') {
      status = "Unpaid Leave";
    } else if (leaveStatus.payStatus === 'HalfPaid') {
      status = "Half Paid Leave";
    }
    
    return {
      status: status,
      isWorkingDay: false,
      reason: `${leaveStatus.leaveType} Leave (${leaveStatus.payStatus})`,
      affectsAttendance: leaveStatus.affectsAttendance,
      recordType: 'leave',
      leaveDetails: leaveStatus
    };
  }

  // Working day
  return {
    status: "Working Day",
    isWorkingDay: true,
    reason: null,
    affectsAttendance: true,
    recordType: 'working'
  };
};

const addSessionActivity = async (data) => {
  try {
    const sessionLog = new SessionLog({
      userId: data.userId,
      action: data.action,
      target: data.target,
      targetType: data.targetType,
      details: data.details,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      deviceInfo: data.deviceInfo,
      timestamp: new Date()
    });
    await sessionLog.save();
  } catch (error) {
    console.error('Session log error:', error);
  }
};

// ===================== Auto Clock Out Service =====================
class AutoClockOutService {
  constructor() {
    this.isRunning = false;
    this.initializeScheduler();
  }

  initializeScheduler() {
    const options = { scheduled: true, timezone: TIMEZONE };

    // Every 5 minutes check auto clock out
    cron.schedule('*/5 * * * *', async () => {
      await this.checkAndExecuteAutoClockOuts();
    }, options);

    // 12:10 AM - Daily reset
    cron.schedule('10 0 * * *', async () => {
      console.log('🔄 Daily reset at 12:10 AM');
    }, options);

    // 12:10 PM - Working day absent marking
    cron.schedule('10 12 * * *', async () => {
      console.log('⚠️ Working day absent marking at 12:10 PM');
      await this.markWorkingDayAbsent();
    }, options);

    // 1:00 AM - Tomorrow's non-working day records
    cron.schedule('0 1 * * *', async () => {
      console.log('📅 Generating tomorrow\'s non-working day records at 1:00 AM');
      await this.generateTomorrowsNonWorkingDayRecords();
    }, options);
  }

  async checkAndExecuteAutoClockOuts() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentTime = `${today.getHours().toString().padStart(2, '0')}:${today.getMinutes().toString().padStart(2, '0')}`;

      const pendingAttendances = await Attendance.find({
        date: today,
        clockIn: { $exists: true, $ne: null },
        clockOut: { $exists: false },
        status: { $in: ['Clocked In', 'Late', 'Early', 'Present'] },
        isDeleted: false,
        autoClockOut: { $ne: true }
      }).populate('employee', 'firstName lastName employeeId');

      const results = {
        checked: pendingAttendances.length,
        autoClockOuts: 0,
        notTimeYet: 0,
        failed: 0
      };

      for (const att of pendingAttendances) {
        try {
          const shiftDetails = await getEmployeeShiftDetails(att.employee._id, today);
          const currentMinutes = timeToMinutes(currentTime);
          const autoClockOutMinutes = timeToMinutes(shiftDetails.autoClockOutTime);

          if (currentMinutes >= autoClockOutMinutes) {
            const clockOutTime = new Date();
            let totalHours = 0;
            if (att.clockIn) {
              const diffMs = clockOutTime - new Date(att.clockIn);
              totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(4));
            }

            await Attendance.findByIdAndUpdate(att._id, {
              $set: {
                clockOut: clockOutTime,
                totalHours: totalHours,
                autoClockOut: true,
                autoClockOutTime: shiftDetails.autoClockOutTime,
                status: 'Present',
                remarks: `Auto clocked out at ${clockOutTime.toLocaleTimeString()}`
              }
            });

            await addSessionActivity({
              userId: att.employee._id,
              action: "Auto Clocked Out",
              target: att._id.toString(),
              targetType: "Attendance",
              details: {
                shiftEnd: shiftDetails.end,
                autoClockOutTime: shiftDetails.autoClockOutTime,
                totalHours: totalHours
              }
            });

            results.autoClockOuts++;
          } else {
            results.notTimeYet++;
          }
        } catch (error) {
          console.error(`Auto clock out error for ${att._id}:`, error);
          results.failed++;
        }
      }

      if (results.autoClockOuts > 0) {
        console.log(`✅ Auto clocked out ${results.autoClockOuts} employees`);
      }

      return results;
    } catch (error) {
      console.error('Auto clock out check failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async markWorkingDayAbsent() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeEmployees = await User.find({
        status: 'active',
        role: 'employee'
      }).select('_id firstName lastName employeeId');

      const results = {
        totalEmployees: activeEmployees.length,
        markedAbsent: 0,
        nonWorkingDaySkipped: 0,
        alreadyExists: 0,
        failed: 0
      };

      for (const employee of activeEmployees) {
        try {
          // Check existing attendance
          const existingAttendance = await Attendance.findOne({
            employee: employee._id,
            date: today,
            isDeleted: false
          });

          if (existingAttendance) {
            results.alreadyExists++;
            continue;
          }

          // Check day status
          const dayStatus = await checkDayStatus(employee._id, today);
          
          // Only mark absent for working days
          if (dayStatus.isWorkingDay) {
            const shiftDetails = await getEmployeeShiftDetails(employee._id, today);
            
            const attendance = new Attendance({
              employee: employee._id,
              date: today,
              status: 'Absent',
              shift: {
                name: shiftDetails.name,
                start: shiftDetails.start,
                end: shiftDetails.end,
                lateThreshold: shiftDetails.lateThreshold,
                earlyThreshold: shiftDetails.earlyThreshold,
                autoClockOutDelay: shiftDetails.autoClockOutDelay
              },
              markedAbsent: true,
              absentMarkedAt: new Date(),
              autoMarked: true,
              remarks: `Auto-marked as Absent at 12:10 PM (no clock in)`,
              ipAddress: 'System',
              device: { type: 'system', os: 'Auto Attendance' },
              location: 'Office',
              autoClockOutTime: shiftDetails.autoClockOutTime
            });

            await attendance.save();
            results.markedAbsent++;
            
            await addSessionActivity({
              userId: employee._id,
              action: "Auto Marked Absent",
              target: attendance._id.toString(),
              targetType: "Attendance",
              details: {
                reason: 'No clock in by 12:10 PM on working day'
              }
            });
          } else {
            results.nonWorkingDaySkipped++;
          }
        } catch (error) {
          console.error(`Mark absent error for ${employee._id}:`, error);
          results.failed++;
        }
      }

      console.log(`📋 12:10 PM - Marked ${results.markedAbsent} employees as absent`);
      return results;
    } catch (error) {
      console.error('Mark working day absent failed:', error);
      throw error;
    }
  }

  async generateTomorrowsNonWorkingDayRecords() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const activeEmployees = await User.find({
        status: 'active',
        role: 'employee'
      }).select('_id firstName lastName employeeId');

      const results = {
        totalEmployees: activeEmployees.length,
        recordsCreated: 0,
        skippedWorkingDay: 0,
        skippedExists: 0,
        failed: 0
      };

      for (const employee of activeEmployees) {
        try {
          // Check existing attendance
          const existingAttendance = await Attendance.findOne({
            employee: employee._id,
            date: tomorrow,
            isDeleted: false
          });

          if (existingAttendance) {
            results.skippedExists++;
            continue;
          }

          // Check tomorrow's day status
          const dayStatus = await checkDayStatus(employee._id, tomorrow);
          
          // Only create records for non-working days
          if (!dayStatus.isWorkingDay) {
            const shiftDetails = await getEmployeeShiftDetails(employee._id, tomorrow);
            
            const attendance = new Attendance({
              employee: employee._id,
              date: tomorrow,
              status: dayStatus.status,
              shift: {
                name: shiftDetails.name,
                start: shiftDetails.start,
                end: shiftDetails.end,
                lateThreshold: shiftDetails.lateThreshold,
                earlyThreshold: shiftDetails.earlyThreshold,
                autoClockOutDelay: shiftDetails.autoClockOutDelay
              },
              autoMarked: true,
              remarks: `Auto-generated at 1:00 AM: ${dayStatus.reason}`,
              ipAddress: 'System',
              device: { type: 'system', os: 'Auto Generator' },
              location: 'Office',
              autoClockOutTime: shiftDetails.autoClockOutTime
            });

            await attendance.save();
            results.recordsCreated++;
            
            // Update leave with attendance record if applicable
            if (dayStatus.recordType === 'leave' && dayStatus.leaveDetails) {
              await Leave.findByIdAndUpdate(dayStatus.leaveDetails.leaveId, {
                $push: {
                  attendanceRecords: {
                    date: tomorrow,
                    attendanceId: attendance._id,
                    status: dayStatus.status
                  }
                },
                autoGeneratedAttendance: true
              });
            }
          } else {
            results.skippedWorkingDay++;
          }
        } catch (error) {
          console.error(`Generate record error for ${employee._id}:`, error);
          results.failed++;
        }
      }

      console.log(`📋 1:00 AM - Created ${results.recordsCreated} non-working day records for tomorrow`);
      return results;
    } catch (error) {
      console.error('Generate tomorrow records failed:', error);
      throw error;
    }
  }

  async triggerManualAutoClockOut() {
    return await this.checkAndExecuteAutoClockOuts();
  }

  async triggerManualAbsentMarking() {
    return await this.markWorkingDayAbsent();
  }

  async triggerManualTomorrowRecords() {
    return await this.generateTomorrowsNonWorkingDayRecords();
  }
}

const autoClockOutService = new AutoClockOutService();

// ===================== Controller Functions =====================

// Clock In
exports.clockIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timestamp, location } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({ 
      employee: userId, 
      date: today,
      isDeleted: false 
    });
    
    if (attendance && attendance.clockIn) {
      return res.status(400).json({
        status: "fail",
        message: "Already clocked in today"
      });
    }

    const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
    const clockInTime = timestamp ? new Date(timestamp) : new Date();

    const shiftDetails = await getEmployeeShiftDetails(userId, today);
    const dayStatus = await checkDayStatus(userId, today);
    
    if (!dayStatus.isWorkingDay) {
      return res.status(400).json({
        status: "fail",
        message: `Cannot clock in on ${dayStatus.status.toLowerCase()} days`,
        dayStatus
      });
    }

    const lateEarlyCheck = checkLateEarlyForEmployee(clockInTime, {
      start: shiftDetails.start,
      lateThreshold: shiftDetails.lateThreshold,
      earlyThreshold: shiftDetails.earlyThreshold
    });

    let status = "Present";
    if (lateEarlyCheck.isLate) status = "Late";
    else if (lateEarlyCheck.isEarly) status = "Early";

    if (!attendance) {
      attendance = new Attendance({
        employee: userId,
        date: today,
        clockIn: clockInTime,
        status: status,
        shift: {
          name: shiftDetails.name,
          start: shiftDetails.start,
          end: shiftDetails.end,
          lateThreshold: shiftDetails.lateThreshold,
          earlyThreshold: shiftDetails.earlyThreshold,
          autoClockOutDelay: shiftDetails.autoClockOutDelay
        },
        lateMinutes: lateEarlyCheck.lateMinutes,
        earlyMinutes: lateEarlyCheck.earlyMinutes,
        isLate: lateEarlyCheck.isLate,
        isEarly: lateEarlyCheck.isEarly,
        ipAddress: req.ip,
        device: deviceInfo,
        location: location || "Office",
        remarks: `Clocked in at ${clockInTime.toLocaleTimeString()}`,
        autoClockOutTime: shiftDetails.autoClockOutTime
      });
    } else {
      attendance.clockIn = clockInTime;
      attendance.status = status;
      attendance.shift = {
        name: shiftDetails.name,
        start: shiftDetails.start,
        end: shiftDetails.end,
        lateThreshold: shiftDetails.lateThreshold,
        earlyThreshold: shiftDetails.earlyThreshold,
        autoClockOutDelay: shiftDetails.autoClockOutDelay
      };
      attendance.lateMinutes = lateEarlyCheck.lateMinutes;
      attendance.earlyMinutes = lateEarlyCheck.earlyMinutes;
      attendance.isLate = lateEarlyCheck.isLate;
      attendance.isEarly = lateEarlyCheck.isEarly;
      attendance.ipAddress = req.ip;
      attendance.device = deviceInfo;
      attendance.location = location || "Office";
      attendance.remarks = `Clocked in at ${clockInTime.toLocaleTimeString()}`;
      attendance.autoClockOutTime = shiftDetails.autoClockOutTime;
      
      if (attendance.markedAbsent) {
        attendance.markedAbsent = false;
        attendance.absentMarkedAt = null;
      }
    }

    await attendance.save();

    await addSessionActivity({
      userId: userId,
      action: "Clocked In",
      target: attendance._id.toString(),
      targetType: "Attendance",
      details: {
        shift: `${shiftDetails.start}-${shiftDetails.end}`,
        clockInTime: clockInTime.toLocaleTimeString(),
        isLate: lateEarlyCheck.isLate,
        isEarly: lateEarlyCheck.isEarly,
        location: location || "Office"
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: deviceInfo
    });

    let message = `Clocked in successfully (${status})`;
    if (lateEarlyCheck.isLate) {
      message += `. ${lateEarlyCheck.lateMinutes} minutes late`;
    } else if (lateEarlyCheck.isEarly) {
      message += `. ${lateEarlyCheck.earlyMinutes} minutes early`;
    }

    res.status(200).json({
      status: "success",
      message,
      attendance: {
        ...attendance.toObject(),
        shiftDetails,
        autoClockOutTime: shiftDetails.autoClockOutTime
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Clock Out
exports.clockOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timestamp, location } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: userId,
      date: today,
      isDeleted: false
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
    attendance.ipAddress = req.ip;
    attendance.device = deviceInfo;
    attendance.location = location || "Office";
    
    if (attendance.status === 'Clocked In' || attendance.status === 'Late' || attendance.status === 'Early') {
      attendance.status = 'Present';
    }

    await attendance.save();

    await addSessionActivity({
      userId: userId,
      action: "Clocked Out",
      target: attendance._id.toString(),
      targetType: "Attendance",
      details: {
        totalHours: attendance.totalHours,
        clockOutTime: clockOutTime.toLocaleTimeString(),
        location: location || "Office"
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(200).json({
      status: "success",
      message: "Clocked out successfully",
      attendance
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Today's Status
exports.getTodayStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employee: userId,
      date: today,
      isDeleted: false
    });

    const shiftDetails = await getEmployeeShiftDetails(userId, today);
    const dayStatus = await checkDayStatus(userId, today);

    if (!attendance) {
      return res.status(200).json({
        clockedIn: false,
        clockedOut: false,
        dayStatus,
        shiftDetails,
        attendance: null,
        message: dayStatus.isWorkingDay ? "Not clocked in yet" : `${dayStatus.status}: ${dayStatus.reason}`
      });
    }

    res.status(200).json({
      clockedIn: !!attendance.clockIn,
      clockedOut: !!attendance.clockOut,
      dayStatus,
      shiftDetails,
      attendance,
      message: attendance.clockOut ? "Clocked out" : 
               attendance.clockIn ? "Clocked in" : 
               attendance.status
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Attendance Records
exports.getAttendanceRecords = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    const matchCondition = { employee: userId, isDeleted: false };
    const skip = (page - 1) * limit;

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

    const total = await Attendance.countDocuments(matchCondition);
    const records = await Attendance.find(matchCondition)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Add shift details to each record
    const recordsWithShift = await Promise.all(
      records.map(async (record) => {
        const shiftDetails = await getEmployeeShiftDetails(userId, record.date);
        return {
          ...record,
          shiftDetails
        };
      })
    );

    res.status(200).json({
      status: "success",
      count: records.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      records: recordsWithShift
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Attendance Summary
exports.getAttendanceSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const matchCondition = { employee: userId, isDeleted: false };

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const endOfMonth = new Date();
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);
      
      matchCondition.date = { $gte: startOfMonth, $lte: endOfMonth };
    }

    const attendance = await Attendance.find(matchCondition).lean();

    let totalDays = attendance.length;
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let earlyDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let halfPaidLeaveDays = 0;
    let holidayDays = 0;
    let weeklyOffDays = 0;
    let totalHours = 0;
    let totalLateMinutes = 0;
    let totalEarlyMinutes = 0;

    attendance.forEach(record => {
      if (record.status === 'Present' || record.status === 'Clocked In') {
        presentDays++;
        totalHours += record.totalHours || 0;
      } 
      else if (record.status === 'Absent') {
        absentDays++;
      }
      else if (record.status === 'Late') {
        presentDays++;
        lateDays++;
        totalHours += record.totalHours || 0;
        totalLateMinutes += record.lateMinutes || 0;
      }
      else if (record.status === 'Early') {
        presentDays++;
        earlyDays++;
        totalHours += record.totalHours || 0;
        totalEarlyMinutes += record.earlyMinutes || 0;
      }
      else if (record.status === 'Unpaid Leave') {
        unpaidLeaveDays++;
        absentDays++;
      }
      else if (record.status === 'Half Paid Leave') {
        halfPaidLeaveDays++;
        presentDays += 0.5;
        absentDays += 0.5;
      }
      else if (record.status === 'Leave') {
        paidLeaveDays++;
      }
      else if (record.status === 'Govt Holiday' || record.status === 'Off Day') {
        holidayDays++;
      }
      else if (record.status === 'Weekly Off') {
        weeklyOffDays++;
      }
    });

    const workingDays = totalDays - holidayDays - weeklyOffDays;
    const attendanceRate = workingDays > 0 
      ? ((presentDays + paidLeaveDays + (halfPaidLeaveDays * 0.5)) / workingDays) * 100 
      : 0;

    res.status(200).json({
      status: "success",
      summary: {
        totalDays,
        workingDays,
        presentDays: parseFloat(presentDays.toFixed(1)),
        absentDays: parseFloat(absentDays.toFixed(1)),
        lateDays,
        earlyDays,
        paidLeaveDays,
        unpaidLeaveDays: parseFloat(unpaidLeaveDays.toFixed(1)),
        halfPaidLeaveDays: parseFloat(halfPaidLeaveDays.toFixed(1)),
        holidayDays,
        weeklyOffDays,
        totalHours: parseFloat(totalHours.toFixed(2)),
        totalLateMinutes,
        totalEarlyMinutes,
        attendanceRate: parseFloat(attendanceRate.toFixed(2)),
        averageHours: presentDays > 0 ? parseFloat((totalHours / presentDays).toFixed(2)) : 0,
        averageLateMinutes: lateDays > 0 ? parseFloat((totalLateMinutes / lateDays).toFixed(1)) : 0,
        averageEarlyMinutes: earlyDays > 0 ? parseFloat((totalEarlyMinutes / earlyDays).toFixed(1)) : 0
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// ===================== ADMIN FUNCTIONS =====================

// Get All Attendance Records (Admin)
exports.getAllAttendanceRecords = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { 
      startDate, 
      endDate, 
      employeeId, 
      department, 
      status, 
      page = 1, 
      limit = 50 
    } = req.query;

    const matchCondition = { isDeleted: false };
    const skip = (page - 1) * limit;

    if (employeeId) {
      matchCondition.employee = employeeId;
    }

    if (department) {
      const employees = await User.find({ department }).select('_id');
      matchCondition.employee = { $in: employees.map(e => e._id) };
    }

    if (status) {
      matchCondition.status = status;
    }

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const endOfMonth = new Date();
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);
      
      matchCondition.date = { $gte: startOfMonth, $lte: endOfMonth };
    }

    const total = await Attendance.countDocuments(matchCondition);
    const records = await Attendance.find(matchCondition)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('employee', 'firstName lastName employeeId department designation')
      .populate('correctedBy', 'firstName lastName')
      .lean();

    res.status(200).json({
      status: "success",
      count: records.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      records
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Create Manual Attendance (Admin)
exports.createManualAttendance = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { 
      employeeId, 
      date, 
      clockIn, 
      clockOut, 
      status,
      shiftStart,
      shiftEnd,
      remarks
    } = req.body;

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found"
      });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const existingAttendance = await Attendance.findOne({
      employee: employeeId,
      date: attendanceDate,
      isDeleted: false
    });

    if (existingAttendance) {
      return res.status(400).json({
        status: "fail",
        message: "Attendance already exists",
        attendanceId: existingAttendance._id
      });
    }

    const shiftDetails = await getEmployeeShiftDetails(employeeId, attendanceDate);
    
    // Use provided shift or employee's shift
    const finalShiftStart = shiftStart || shiftDetails.start;
    const finalShiftEnd = shiftEnd || shiftDetails.end;

    let totalHours = 0;
    let lateMinutes = 0;
    let earlyMinutes = 0;
    let isLate = false;
    let isEarly = false;

    if (clockIn) {
      const clockInTime = new Date(clockIn);
      const lateEarlyCheck = checkLateEarlyForEmployee(clockInTime, {
        start: finalShiftStart,
        lateThreshold: shiftDetails.lateThreshold,
        earlyThreshold: shiftDetails.earlyThreshold
      });
      
      lateMinutes = lateEarlyCheck.lateMinutes;
      earlyMinutes = lateEarlyCheck.earlyMinutes;
      isLate = lateEarlyCheck.isLate;
      isEarly = lateEarlyCheck.isEarly;
    }

    if (clockIn && clockOut) {
      const clockInTime = new Date(clockIn);
      const clockOutTime = new Date(clockOut);
      const diffMs = clockOutTime - clockInTime;
      totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(4));
    }

    const autoClockOutDelay = shiftDetails.autoClockOutDelay;
    const autoClockOutTime = addMinutesToTime(finalShiftEnd, autoClockOutDelay);

    const attendance = new Attendance({
      employee: employeeId,
      date: attendanceDate,
      clockIn: clockIn ? new Date(clockIn) : null,
      clockOut: clockOut ? new Date(clockOut) : null,
      totalHours,
      status: status || 'Present',
      shift: {
        name: shiftDetails.name,
        start: finalShiftStart,
        end: finalShiftEnd,
        lateThreshold: shiftDetails.lateThreshold,
        earlyThreshold: shiftDetails.earlyThreshold,
        autoClockOutDelay: autoClockOutDelay
      },
      lateMinutes,
      earlyMinutes,
      isLate,
      isEarly,
      ipAddress: req.ip || 'Admin System',
      device: { type: 'admin', os: 'Manual Entry' },
      location: "Office",
      correctedByAdmin: true,
      correctedBy: adminId,
      correctionDate: new Date(),
      remarks: remarks || 'Manual entry by admin',
      autoClockOutTime: autoClockOutTime
    });

    await attendance.save();

    await addSessionActivity({
      userId: adminId,
      action: "Manual Attendance Created",
      target: attendance._id.toString(),
      targetType: "Attendance",
      details: {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        date: attendanceDate,
        status: attendance.status,
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
    });

    res.status(201).json({
      status: "success",
      message: "Manual attendance created",
      attendance
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Update Attendance (Admin)
exports.updateAttendance = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { id } = req.params;
    const { 
      clockIn, 
      clockOut, 
      status,
      shiftStart,
      shiftEnd,
      remarks,
      correctionReason
    } = req.body;

    const attendance = await Attendance.findById(id);
    if (!attendance || attendance.isDeleted) {
      return res.status(404).json({
        status: "fail",
        message: "Attendance not found"
      });
    }

    const oldData = {
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: attendance.status,
      shift: { ...attendance.shift },
      remarks: attendance.remarks
    };

    if (clockIn !== undefined) attendance.clockIn = clockIn ? new Date(clockIn) : null;
    if (clockOut !== undefined) attendance.clockOut = clockOut ? new Date(clockOut) : null;
    if (status) attendance.status = status;
    if (remarks) attendance.remarks = remarks;

    if (shiftStart || shiftEnd) {
      attendance.shift.start = shiftStart || attendance.shift.start;
      attendance.shift.end = shiftEnd || attendance.shift.end;
      
      attendance.adminAdjustedShift = true;
      attendance.adminShiftAdjustment = {
        start: shiftStart || attendance.shift.start,
        end: shiftEnd || attendance.shift.end,
        lateThreshold: attendance.shift.lateThreshold,
        earlyThreshold: attendance.shift.earlyThreshold,
        autoClockOutDelay: attendance.shift.autoClockOutDelay,
        adjustedBy: adminId,
        adjustmentDate: new Date(),
        reason: correctionReason || "Admin updated attendance"
      };
    }

    attendance.correctedByAdmin = true;
    attendance.correctedBy = adminId;
    attendance.correctionDate = new Date();

    await attendance.save();

    await addSessionActivity({
      userId: adminId,
      action: "Updated Attendance",
      target: attendance._id.toString(),
      targetType: "Attendance",
      details: {
        employeeId: attendance.employee,
        oldData,
        newData: {
          clockIn: attendance.clockIn,
          clockOut: attendance.clockOut,
          status: attendance.status,
          shift: attendance.shift,
          remarks: attendance.remarks
        },
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
    });

    res.status(200).json({
      status: "success",
      message: "Attendance updated",
      attendance
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Delete Attendance (Admin)
exports.deleteAttendance = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({
        status: "fail",
        message: "Attendance not found"
      });
    }

    if (attendance.isDeleted) {
      return res.status(400).json({
        status: "fail",
        message: "Already deleted"
      });
    }

    attendance.isDeleted = true;
    attendance.deletedBy = adminId;
    attendance.deletedAt = new Date();
    await attendance.save();

    await addSessionActivity({
      userId: adminId,
      action: "Deleted Attendance",
      target: id,
      targetType: "Attendance",
      details: {
        employeeId: attendance.employee,
        date: attendance.date,
        reason: reason || "No reason provided",
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
    });

    res.status(200).json({
      status: "success",
      message: "Attendance deleted"
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Dashboard Stats (Admin)
exports.getDashboardStats = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    // Today's stats
    const todayStats = await Attendance.aggregate([
      {
        $match: {
          date: today,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Month stats
    const monthStats = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth, $lte: endOfMonth },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalHours: { $sum: "$totalHours" }
        }
      }
    ]);

    // Total employees
    const totalEmployees = await User.countDocuments({ 
      status: 'active',
      role: 'employee'
    });

    // Today's present employees
    const presentToday = await Attendance.countDocuments({
      date: today,
      status: { $in: ['Present', 'Late', 'Early', 'Clocked In'] },
      isDeleted: false
    });

    // Pending clock outs
    const pendingClockOut = await Attendance.countDocuments({
      date: today,
      clockIn: { $exists: true, $ne: null },
      clockOut: { $exists: false },
      status: { $in: ['Clocked In', 'Late', 'Early', 'Present'] },
      isDeleted: false
    });

    const todayFormatted = {};
    todayStats.forEach(stat => {
      todayFormatted[stat._id] = stat.count;
    });

    const monthFormatted = {};
    monthStats.forEach(stat => {
      monthFormatted[stat._id] = {
        count: stat.count,
        totalHours: stat.totalHours || 0
      };
    });

    res.status(200).json({
      status: "success",
      dashboard: {
        date: today.toISOString().split('T')[0],
        totalEmployees,
        presentToday,
        absentToday: totalEmployees - presentToday,
        pendingClockOut,
        today: todayFormatted,
        month: monthFormatted,
        dateRange: {
          monthStart: startOfMonth.toISOString().split('T')[0],
          monthEnd: endOfMonth.toISOString().split('T')[0]
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Update Employee Shift (Admin)
exports.updateEmployeeShift = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { employeeId, shiftData, effectiveDate, reason } = req.body;

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found"
      });
    }

    // Validate shift data
    if (!shiftData || !shiftData.start || !shiftData.end) {
      return res.status(400).json({
        status: "fail",
        message: "Shift start and end times are required"
      });
    }

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(shiftData.start) || !timeRegex.test(shiftData.end)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid time format (HH:MM)"
      });
    }

    const startMinutes = timeToMinutes(shiftData.start);
    const endMinutes = timeToMinutes(shiftData.end);
    if (endMinutes <= startMinutes) {
      return res.status(400).json({
        status: "fail",
        message: "End time must be after start time"
      });
    }

    const autoClockOutDelay = shiftData.autoClockOutDelay || 10;
    const autoClockOutTime = addMinutesToTime(shiftData.end, autoClockOutDelay);

    // If effectiveDate provided, adjust specific date
    if (effectiveDate) {
      const targetDate = new Date(effectiveDate);
      targetDate.setHours(0, 0, 0, 0);

      let attendance = await Attendance.findOne({
        employee: employeeId,
        date: targetDate,
        isDeleted: false
      });

      if (!attendance) {
        attendance = new Attendance({
          employee: employeeId,
          date: targetDate,
          status: 'Absent',
          shift: {
            name: shiftData.name || 'Admin Adjusted',
            start: shiftData.start,
            end: shiftData.end,
            lateThreshold: shiftData.lateThreshold || 5,
            earlyThreshold: shiftData.earlyThreshold || -1,
            autoClockOutDelay: autoClockOutDelay
          },
          adminAdjustedShift: true,
          adminShiftAdjustment: {
            start: shiftData.start,
            end: shiftData.end,
            lateThreshold: shiftData.lateThreshold || 5,
            earlyThreshold: shiftData.earlyThreshold || -1,
            autoClockOutDelay: autoClockOutDelay,
            adjustedBy: adminId,
            adjustmentDate: new Date(),
            reason: reason || "Admin adjusted shift"
          },
          autoClockOutTime: autoClockOutTime,
          remarks: `Shift adjusted by admin`
        });
      } else {
        attendance.shift = {
          name: shiftData.name || 'Admin Adjusted',
          start: shiftData.start,
          end: shiftData.end,
          lateThreshold: shiftData.lateThreshold || 5,
          earlyThreshold: shiftData.earlyThreshold || -1,
          autoClockOutDelay: autoClockOutDelay
        };
        attendance.adminAdjustedShift = true;
        attendance.adminShiftAdjustment = {
          start: shiftData.start,
          end: shiftData.end,
          lateThreshold: shiftData.lateThreshold || 5,
          earlyThreshold: shiftData.earlyThreshold || -1,
          autoClockOutDelay: autoClockOutDelay,
          adjustedBy: adminId,
          adjustmentDate: new Date(),
          reason: reason || "Admin adjusted shift"
        };
        attendance.autoClockOutTime = autoClockOutTime;
      }

      await attendance.save();

      res.status(200).json({
        status: "success",
        message: `Shift updated for specific date`,
        data: {
          employee: `${employee.firstName} ${employee.lastName}`,
          shift: {
            start: shiftData.start,
            end: shiftData.end,
            autoClockOutTime: autoClockOutTime
          },
          effectiveDate: targetDate
        }
      });

    } else {
      // Update employee's assigned shift
      const now = new Date();
      
      if (employee.shiftTiming?.assignedShift?.isActive) {
        if (!employee.shiftTiming.shiftHistory) {
          employee.shiftTiming.shiftHistory = [];
        }
        
        employee.shiftTiming.shiftHistory.push({
          name: employee.shiftTiming.assignedShift.name || 'Previous Shift',
          start: employee.shiftTiming.assignedShift.start,
          end: employee.shiftTiming.assignedShift.end,
          lateThreshold: employee.shiftTiming.assignedShift.lateThreshold || 5,
          earlyThreshold: employee.shiftTiming.assignedShift.earlyThreshold || -1,
          autoClockOutDelay: employee.shiftTiming.assignedShift.autoClockOutDelay || 10,
          assignedBy: employee.shiftTiming.assignedShift.assignedBy,
          assignedAt: employee.shiftTiming.assignedShift.assignedAt,
          effectiveDate: employee.shiftTiming.assignedShift.effectiveDate,
          endedAt: now,
          reason: 'Updated by admin'
        });
      }

      employee.shiftTiming.assignedShift = {
        name: shiftData.name || 'Assigned Shift',
        start: shiftData.start,
        end: shiftData.end,
        lateThreshold: shiftData.lateThreshold || 5,
        earlyThreshold: shiftData.earlyThreshold || -1,
        autoClockOutDelay: autoClockOutDelay,
        assignedBy: adminId,
        assignedAt: now,
        effectiveDate: now,
        isActive: true
      };

      await employee.save();

      res.status(200).json({
        status: "success",
        message: `Shift timing updated for ${employee.firstName}`,
        data: {
          employee: `${employee.firstName} ${employee.lastName}`,
          shift: {
            start: shiftData.start,
            end: shiftData.end,
            autoClockOutTime: autoClockOutTime
          },
          updatedBy: `${admin.firstName} ${admin.lastName}`
        }
      });
    }

    await addSessionActivity({
      userId: adminId,
      action: "Updated Employee Shift",
      target: employeeId,
      targetType: "User",
      details: {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        shiftData,
        effectiveDate,
        reason,
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Manual Trigger Functions (Admin)
exports.triggerAutoClockOut = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const results = await autoClockOutService.triggerManualAutoClockOut();

    res.status(200).json({
      status: "success",
      message: "Auto clock out triggered",
      results
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

exports.triggerAbsentMarking = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const results = await autoClockOutService.triggerManualAbsentMarking();

    res.status(200).json({
      status: "success",
      message: "Absent marking triggered",
      results
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

exports.triggerTomorrowRecords = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const results = await autoClockOutService.triggerManualTomorrowRecords();

    res.status(200).json({
      status: "success",
      message: "Tomorrow records generation triggered",
      results
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Auto Clock Out Schedule
exports.getAutoClockOutSchedule = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const activeEmployees = await User.find({
      status: 'active',
      role: 'employee'
    }).select('_id firstName lastName employeeId department');

    const schedule = [];

    for (const employee of activeEmployees) {
      const shiftDetails = await getEmployeeShiftDetails(employee._id, targetDate);
      
      schedule.push({
        employee: {
          id: employee._id,
          name: `${employee.firstName} ${employee.lastName}`,
          employeeId: employee.employeeId,
          department: employee.department
        },
        shift: {
          start: shiftDetails.start,
          end: shiftDetails.end,
          name: shiftDetails.name
        },
        autoClockOut: {
          time: shiftDetails.autoClockOutTime,
          delay: shiftDetails.autoClockOutDelay
        }
      });
    }

    // Sort by auto clock out time
    schedule.sort((a, b) => {
      const timeA = timeToMinutes(a.autoClockOut.time);
      const timeB = timeToMinutes(b.autoClockOut.time);
      return timeA - timeB;
    });

    res.status(200).json({
      status: "success",
      date: targetDate.toISOString().split('T')[0],
      totalEmployees: schedule.length,
      schedule
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};
// ===================== NEW CONTROLLER FUNCTIONS =====================

// Get Late Statistics (Employee)
exports.getLateStatistics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const matchCondition = {
      employee: userId,
      isDeleted: false,
      isLate: true
    };

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

    const lateRecords = await Attendance.find(matchCondition).lean();

    const totalLate = lateRecords.length;
    const totalLateMinutes = lateRecords.reduce((sum, record) => sum + (record.lateMinutes || 0), 0);
    const averageLateMinutes = totalLate > 0 ? totalLateMinutes / totalLate : 0;

    res.status(200).json({
      status: "success",
      statistics: {
        totalLate,
        totalLateMinutes,
        averageLateMinutes: parseFloat(averageLateMinutes.toFixed(1)),
        records: lateRecords.map(record => ({
          date: record.date,
          lateMinutes: record.lateMinutes,
          clockIn: record.clockIn
        }))
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Late Statistics (Admin)
exports.getAdminLateStatistics = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { startDate, endDate, employeeId } = req.query;

    const matchCondition = {
      isDeleted: false,
      isLate: true
    };

    if (employeeId) {
      matchCondition.employee = employeeId;
    }

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const lateRecords = await Attendance.find(matchCondition)
      .populate('employee', 'firstName lastName employeeId department')
      .lean();

    const totalLate = lateRecords.length;
    const totalLateMinutes = lateRecords.reduce((sum, record) => sum + (record.lateMinutes || 0), 0);
    const averageLateMinutes = totalLate > 0 ? totalLateMinutes / totalLate : 0;

    // Group by employee
    const employeeStats = {};
    lateRecords.forEach(record => {
      const empId = record.employee._id;
      if (!employeeStats[empId]) {
        employeeStats[empId] = {
          employee: record.employee,
          lateCount: 0,
          totalLateMinutes: 0,
          records: []
        };
      }
      employeeStats[empId].lateCount++;
      employeeStats[empId].totalLateMinutes += record.lateMinutes || 0;
      employeeStats[empId].records.push({
        date: record.date,
        lateMinutes: record.lateMinutes
      });
    });

    res.status(200).json({
      status: "success",
      statistics: {
        totalLate,
        totalLateMinutes,
        averageLateMinutes: parseFloat(averageLateMinutes.toFixed(1)),
        employeeStats: Object.values(employeeStats).map(stat => ({
          employee: stat.employee,
          lateCount: stat.lateCount,
          averageLateMinutes: parseFloat((stat.totalLateMinutes / stat.lateCount).toFixed(1))
        })),
        records: lateRecords
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Late & Early Statistics
exports.getLateEarlyStatistics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const matchCondition = {
      employee: userId,
      isDeleted: false,
      $or: [
        { isLate: true },
        { isEarly: true }
      ]
    };

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const records = await Attendance.find(matchCondition).lean();

    const stats = {
      totalLate: 0,
      totalEarly: 0,
      totalLateMinutes: 0,
      totalEarlyMinutes: 0,
      averageLateMinutes: 0,
      averageEarlyMinutes: 0,
      records: []
    };

    records.forEach(record => {
      if (record.isLate) {
        stats.totalLate++;
        stats.totalLateMinutes += record.lateMinutes || 0;
      }
      if (record.isEarly) {
        stats.totalEarly++;
        stats.totalEarlyMinutes += record.earlyMinutes || 0;
      }
      stats.records.push({
        date: record.date,
        isLate: record.isLate,
        isEarly: record.isEarly,
        lateMinutes: record.lateMinutes,
        earlyMinutes: record.earlyMinutes,
        clockIn: record.clockIn,
        shiftStart: record.shift?.start
      });
    });

    if (stats.totalLate > 0) {
      stats.averageLateMinutes = parseFloat((stats.totalLateMinutes / stats.totalLate).toFixed(1));
    }
    if (stats.totalEarly > 0) {
      stats.averageEarlyMinutes = parseFloat((stats.totalEarlyMinutes / stats.totalEarly).toFixed(1));
    }

    res.status(200).json({
      status: "success",
      statistics: stats
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Admin Late & Early Statistics
exports.getAdminLateEarlyStatistics = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { startDate, endDate, employeeId, department } = req.query;

    const matchCondition = {
      isDeleted: false,
      $or: [
        { isLate: true },
        { isEarly: true }
      ]
    };

    if (employeeId) {
      matchCondition.employee = employeeId;
    }

    if (department) {
      const employees = await User.find({ department }).select('_id');
      matchCondition.employee = { $in: employees.map(e => e._id) };
    }

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const records = await Attendance.find(matchCondition)
      .populate('employee', 'firstName lastName employeeId department')
      .lean();

    const stats = {
      totalLate: 0,
      totalEarly: 0,
      totalLateMinutes: 0,
      totalEarlyMinutes: 0,
      averageLateMinutes: 0,
      averageEarlyMinutes: 0,
      byEmployee: {},
      byDepartment: {},
      records: []
    };

    records.forEach(record => {
      const empId = record.employee?._id || 'unknown';
      const dept = record.employee?.department || 'Unknown';
      
      if (!stats.byEmployee[empId]) {
        stats.byEmployee[empId] = {
          employee: record.employee,
          lateCount: 0,
          earlyCount: 0,
          totalLateMinutes: 0,
          totalEarlyMinutes: 0
        };
      }
      
      if (!stats.byDepartment[dept]) {
        stats.byDepartment[dept] = {
          department: dept,
          lateCount: 0,
          earlyCount: 0
        };
      }

      if (record.isLate) {
        stats.totalLate++;
        stats.totalLateMinutes += record.lateMinutes || 0;
        stats.byEmployee[empId].lateCount++;
        stats.byEmployee[empId].totalLateMinutes += record.lateMinutes || 0;
        stats.byDepartment[dept].lateCount++;
      }
      
      if (record.isEarly) {
        stats.totalEarly++;
        stats.totalEarlyMinutes += record.earlyMinutes || 0;
        stats.byEmployee[empId].earlyCount++;
        stats.byEmployee[empId].totalEarlyMinutes += record.earlyMinutes || 0;
        stats.byDepartment[dept].earlyCount++;
      }
    });

    if (stats.totalLate > 0) {
      stats.averageLateMinutes = parseFloat((stats.totalLateMinutes / stats.totalLate).toFixed(1));
    }
    if (stats.totalEarly > 0) {
      stats.averageEarlyMinutes = parseFloat((stats.totalEarlyMinutes / stats.totalEarly).toFixed(1));
    }

    res.status(200).json({
      status: "success",
      statistics: stats
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Shift Timing
exports.getShiftTiming = async (req, res) => {
  try {
    const userId = req.user._id;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const shiftDetails = await getEmployeeShiftDetails(userId, targetDate);

    res.status(200).json({
      status: "success",
      data: {
        shiftTiming: {
          name: shiftDetails.name,
          start: shiftDetails.start,
          end: shiftDetails.end,
          lateThreshold: shiftDetails.lateThreshold,
          earlyThreshold: shiftDetails.earlyThreshold,
          autoClockOutTime: shiftDetails.autoClockOutTime,
          isAdminAdjusted: shiftDetails.isAdminAdjusted || false,
          source: shiftDetails.source
        },
        date: targetDate
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Admin Shift Timing
exports.getAdminShiftTiming = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { employeeId, date } = req.query;

    if (!employeeId) {
      return res.status(400).json({
        status: "fail",
        message: "Employee ID is required"
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found"
      });
    }

    const shiftDetails = await getEmployeeShiftDetails(employeeId, targetDate);

    res.status(200).json({
      status: "success",
      data: {
        employee: {
          _id: employee._id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeId: employee.employeeId,
          department: employee.department
        },
        shiftTiming: {
          name: shiftDetails.name,
          start: shiftDetails.start,
          end: shiftDetails.end,
          lateThreshold: shiftDetails.lateThreshold,
          earlyThreshold: shiftDetails.earlyThreshold,
          autoClockOutTime: shiftDetails.autoClockOutTime,
          isAdminAdjusted: shiftDetails.isAdminAdjusted || false,
          source: shiftDetails.source
        },
        date: targetDate
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Correct Attendance (Admin)
exports.correctAttendance = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { id } = req.params;
    const { clockIn, clockOut, status, shiftStart, shiftEnd, remarks } = req.body;

    const attendance = await Attendance.findById(id);
    if (!attendance || attendance.isDeleted) {
      return res.status(404).json({
        status: "fail",
        message: "Attendance not found"
      });
    }

    const oldData = {
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      status: attendance.status,
      shift: { ...attendance.shift },
      remarks: attendance.remarks
    };

    // Update clock times
    if (clockIn !== undefined) {
      attendance.clockIn = clockIn ? new Date(clockIn) : null;
    }
    if (clockOut !== undefined) {
      attendance.clockOut = clockOut ? new Date(clockOut) : null;
    }
    
    // Update status
    if (status) {
      attendance.status = status;
    }

    // Update shift if provided
    if (shiftStart || shiftEnd) {
      attendance.shift.start = shiftStart || attendance.shift.start;
      attendance.shift.end = shiftEnd || attendance.shift.end;
      
      // Recalculate late/early if clock in exists
      if (attendance.clockIn) {
        const clockInTime = new Date(attendance.clockIn);
        const clockInHour = clockInTime.getHours().toString().padStart(2, '0');
        const clockInMinute = clockInTime.getMinutes().toString().padStart(2, '0');
        const clockInFormatted = `${clockInHour}:${clockInMinute}`;
        
        const lateEarlyCheck = checkLateEarlyForEmployee(clockInTime, {
          start: attendance.shift.start,
          lateThreshold: attendance.shift.lateThreshold || 5,
          earlyThreshold: attendance.shift.earlyThreshold || -1
        });
        
        attendance.lateMinutes = lateEarlyCheck.lateMinutes;
        attendance.earlyMinutes = lateEarlyCheck.earlyMinutes;
        attendance.isLate = lateEarlyCheck.isLate;
        attendance.isEarly = lateEarlyCheck.isEarly;
      }
      
      attendance.adminAdjustedShift = true;
      attendance.adminShiftAdjustment = {
        start: shiftStart || attendance.shift.start,
        end: shiftEnd || attendance.shift.end,
        lateThreshold: attendance.shift.lateThreshold,
        earlyThreshold: attendance.shift.earlyThreshold,
        autoClockOutDelay: attendance.shift.autoClockOutDelay,
        adjustedBy: adminId,
        adjustmentDate: new Date(),
        reason: remarks || "Admin corrected attendance"
      };
    }

    // Mark as corrected by admin
    attendance.correctedByAdmin = true;
    attendance.correctedBy = adminId;
    attendance.correctionDate = new Date();
    
    if (remarks) {
      attendance.remarks = remarks;
    }

    // Save the updated attendance
    await attendance.save();

    await addSessionActivity({
      userId: adminId,
      action: "Corrected Attendance",
      target: attendance._id.toString(),
      targetType: "Attendance",
      details: {
        employeeId: attendance.employee,
        oldData,
        newData: {
          clockIn: attendance.clockIn,
          clockOut: attendance.clockOut,
          status: attendance.status,
          shift: attendance.shift,
          remarks: attendance.remarks
        },
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
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

// Update Employee Shift (Separate function for admin panel)
exports.updateEmployeeShift = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { employeeId, startTime, endTime, reason } = req.body;

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found"
      });
    }

    // Validate times
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid time format (HH:MM)"
      });
    }

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (endMinutes <= startMinutes) {
      return res.status(400).json({
        status: "fail",
        message: "End time must be after start time"
      });
    }

    // Update employee's assigned shift
    const now = new Date();
    
    // Save old shift to history
    if (employee.shiftTiming?.assignedShift?.isActive) {
      if (!employee.shiftTiming.shiftHistory) {
        employee.shiftTiming.shiftHistory = [];
      }
      
      employee.shiftTiming.shiftHistory.push({
        name: employee.shiftTiming.assignedShift.name || 'Previous Shift',
        start: employee.shiftTiming.assignedShift.start,
        end: employee.shiftTiming.assignedShift.end,
        lateThreshold: employee.shiftTiming.assignedShift.lateThreshold || 5,
        earlyThreshold: employee.shiftTiming.assignedShift.earlyThreshold || -1,
        autoClockOutDelay: employee.shiftTiming.assignedShift.autoClockOutDelay || 10,
        assignedBy: employee.shiftTiming.assignedShift.assignedBy,
        assignedAt: employee.shiftTiming.assignedShift.assignedAt,
        effectiveDate: employee.shiftTiming.assignedShift.effectiveDate,
        endedAt: now,
        reason: reason || 'Shift updated by admin'
      });
    }

    // Update with new shift
    const autoClockOutDelay = 10; // Default 10 minutes
    const autoClockOutTime = addMinutesToTime(endTime, autoClockOutDelay);

    employee.shiftTiming.assignedShift = {
      name: 'Custom Shift',
      start: startTime,
      end: endTime,
      lateThreshold: 5,
      earlyThreshold: -1,
      autoClockOutDelay: autoClockOutDelay,
      assignedBy: adminId,
      assignedAt: now,
      effectiveDate: now,
      isActive: true
    };

    await employee.save();

    await addSessionActivity({
      userId: adminId,
      action: "Updated Employee Shift",
      target: employeeId,
      targetType: "User",
      details: {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        oldShift: employee.shiftTiming.shiftHistory?.[employee.shiftTiming.shiftHistory.length - 1],
        newShift: {
          start: startTime,
          end: endTime,
          autoClockOutTime: autoClockOutTime
        },
        reason: reason || 'No reason provided',
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
    });

    res.status(200).json({
      status: "success",
      message: "Shift timing updated successfully",
      data: {
        employee: {
          _id: employee._id,
          name: `${employee.firstName} ${employee.lastName}`,
          employeeId: employee.employeeId
        },
        newShift: {
          start: startTime,
          end: endTime,
          autoClockOutTime: autoClockOutTime
        },
        updatedBy: `${admin.firstName} ${admin.lastName}`,
        updatedAt: now
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Create Bulk Attendance
exports.createBulkAttendance = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { employeeId, month, year, records, defaultShiftStart, defaultShiftEnd, skipWeekends, markAllAsPresent } = req.body;

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found"
      });
    }

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    // Process each record
    for (const record of records) {
      try {
        const attendanceDate = new Date(record.date);
        attendanceDate.setHours(0, 0, 0, 0);

        // Check existing attendance
        let existingAttendance = await Attendance.findOne({
          employee: employeeId,
          date: attendanceDate,
          isDeleted: false
        });

        // Auto clear clock in/out for non-working days
        let clockIn = null;
        let clockOut = null;
        let totalHours = 0;
        
        if (record.status === 'Present') {
          clockIn = record.clockIn ? `${record.date}T${record.clockIn}:00` : null;
          clockOut = record.clockOut ? `${record.date}T${record.clockOut}:00` : null;
          
          if (clockIn && clockOut) {
            const diffMs = new Date(clockOut) - new Date(clockIn);
            totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(4));
          }
        }

        if (existingAttendance) {
          // Update existing record
          existingAttendance.clockIn = clockIn ? new Date(clockIn) : null;
          existingAttendance.clockOut = clockOut ? new Date(clockOut) : null;
          existingAttendance.totalHours = totalHours;
          existingAttendance.status = record.status;
          existingAttendance.shift = {
            name: 'Bulk Updated',
            start: defaultShiftStart || record.shiftStart || '09:00',
            end: defaultShiftEnd || record.shiftEnd || '18:00',
            lateThreshold: 5,
            earlyThreshold: -1,
            autoClockOutDelay: 10
          };
          existingAttendance.remarks = record.remarks || 'Updated via bulk import';
          existingAttendance.correctedByAdmin = true;
          existingAttendance.correctedBy = adminId;
          existingAttendance.correctionDate = new Date();

          await existingAttendance.save();
          results.updated++;
        } else {
          // Create new record
          const shiftStart = defaultShiftStart || record.shiftStart || '09:00';
          const shiftEnd = defaultShiftEnd || record.shiftEnd || '18:00';
          
          // Calculate late/early for Present status
          let lateMinutes = 0;
          let earlyMinutes = 0;
          let isLate = false;
          let isEarly = false;

          if (clockIn && record.status === 'Present') {
            const clockInTime = new Date(clockIn);
            const lateEarlyCheck = checkLateEarlyForEmployee(clockInTime, {
              start: shiftStart,
              lateThreshold: 5,
              earlyThreshold: -1
            });
            lateMinutes = lateEarlyCheck.lateMinutes;
            earlyMinutes = lateEarlyCheck.earlyMinutes;
            isLate = lateEarlyCheck.isLate;
            isEarly = lateEarlyCheck.isEarly;
          }

          const autoClockOutDelay = 10;
          const autoClockOutTime = addMinutesToTime(shiftEnd, autoClockOutDelay);

          const newAttendance = new Attendance({
            employee: employeeId,
            date: attendanceDate,
            clockIn: clockIn ? new Date(clockIn) : null,
            clockOut: clockOut ? new Date(clockOut) : null,
            totalHours,
            status: record.status,
            shift: {
              name: 'Bulk Created',
              start: shiftStart,
              end: shiftEnd,
              lateThreshold: 5,
              earlyThreshold: -1,
              autoClockOutDelay
            },
            lateMinutes,
            earlyMinutes,
            isLate,
            isEarly,
            ipAddress: req.ip || 'Admin System',
            device: { type: 'admin', os: 'Bulk Import' },
            location: "Office",
            correctedByAdmin: true,
            correctedBy: adminId,
            correctionDate: new Date(),
            remarks: record.remarks || 'Created via bulk import',
            autoClockOutTime,
            autoGenerated: record.status !== 'Present'
          });

          await newAttendance.save();
          results.created++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          date: record.date,
          error: error.message
        });
      }
    }

    await addSessionActivity({
      userId: adminId,
      action: "Bulk Attendance Created",
      target: employeeId,
      targetType: "User",
      details: {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        month,
        year,
        results,
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
    });

    res.status(200).json({
      status: "success",
      message: "Bulk attendance processed successfully",
      results
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Export Attendance Data
exports.exportAttendanceData = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, format = 'json' } = req.query;

    const matchCondition = {
      employee: userId,
      isDeleted: false
    };

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendance = await Attendance.find(matchCondition)
      .sort({ date: -1 })
      .lean();

    const user = await User.findById(userId);

    if (format === 'csv') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Attendance');

      // Add headers
      worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Day', key: 'day', width: 10 },
        { header: 'Clock In', key: 'clockIn', width: 12 },
        { header: 'Clock Out', key: 'clockOut', width: 12 },
        { header: 'Total Hours', key: 'totalHours', width: 12 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Late Minutes', key: 'lateMinutes', width: 12 },
        { header: 'Early Minutes', key: 'earlyMinutes', width: 12 },
        { header: 'Shift Start', key: 'shiftStart', width: 12 },
        { header: 'Shift End', key: 'shiftEnd', width: 12 },
        { header: 'Remarks', key: 'remarks', width: 30 }
      ];

      // Add data rows
      attendance.forEach(record => {
        worksheet.addRow({
          date: new Date(record.date).toLocaleDateString('en-US'),
          day: new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' }),
          clockIn: record.clockIn ? new Date(record.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
          clockOut: record.clockOut ? new Date(record.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
          totalHours: record.totalHours?.toFixed(2) || '0.00',
          status: record.status,
          lateMinutes: record.lateMinutes || 0,
          earlyMinutes: record.earlyMinutes || 0,
          shiftStart: record.shift?.start || '09:00',
          shiftEnd: record.shift?.end || '18:00',
          remarks: record.remarks || ''
        });
      });

      // Add summary row
      const totalHours = attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0);
      const presentDays = attendance.filter(record => record.status === 'Present').length;
      const absentDays = attendance.filter(record => record.status === 'Absent').length;

      worksheet.addRow([]);
      worksheet.addRow(['Summary', '', '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Total Days', attendance.length, '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Present Days', presentDays, '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Absent Days', absentDays, '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Total Hours', totalHours.toFixed(2), '', '', '', '', '', '', '', '']);

      // Set response headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=attendance_${startDate}_${endDate}.csv`);

      await workbook.csv.write(res);
    } else {
      // Default to JSON
      res.status(200).json({
        status: "success",
        data: {
          employee: {
            name: `${user.firstName} ${user.lastName}`,
            employeeId: user.employeeId,
            department: user.department
          },
          period: {
            startDate,
            endDate
          },
          attendance,
          summary: {
            totalDays: attendance.length,
            presentDays: attendance.filter(record => record.status === 'Present').length,
            absentDays: attendance.filter(record => record.status === 'Absent').length,
            totalHours: attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0)
          }
        }
      });
    }

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Export Admin Attendance Data
exports.exportAdminAttendanceData = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { startDate, endDate, employeeId, department, format = 'json' } = req.query;

    const matchCondition = { isDeleted: false };

    if (employeeId) {
      matchCondition.employee = employeeId;
    }

    if (department) {
      const employees = await User.find({ department }).select('_id');
      matchCondition.employee = { $in: employees.map(e => e._id) };
    }

    if (startDate && endDate) {
      matchCondition.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const attendance = await Attendance.find(matchCondition)
      .populate('employee', 'firstName lastName employeeId department')
      .sort({ date: -1 })
      .lean();

    if (format === 'csv') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Attendance Report');

      worksheet.columns = [
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Employee Name', key: 'employeeName', width: 20 },
        { header: 'Department', key: 'department', width: 15 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Day', key: 'day', width: 10 },
        { header: 'Clock In', key: 'clockIn', width: 12 },
        { header: 'Clock Out', key: 'clockOut', width: 12 },
        { header: 'Total Hours', key: 'totalHours', width: 12 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Late Minutes', key: 'lateMinutes', width: 12 },
        { header: 'Early Minutes', key: 'earlyMinutes', width: 12 },
        { header: 'Shift', key: 'shift', width: 20 },
        { header: 'Remarks', key: 'remarks', width: 30 }
      ];

      attendance.forEach(record => {
        worksheet.addRow({
          employeeId: record.employee?.employeeId || 'N/A',
          employeeName: record.employee ? `${record.employee.firstName} ${record.employee.lastName}` : 'N/A',
          department: record.employee?.department || 'N/A',
          date: new Date(record.date).toLocaleDateString('en-US'),
          day: new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' }),
          clockIn: record.clockIn ? new Date(record.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
          clockOut: record.clockOut ? new Date(record.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
          totalHours: record.totalHours?.toFixed(2) || '0.00',
          status: record.status,
          lateMinutes: record.lateMinutes || 0,
          earlyMinutes: record.earlyMinutes || 0,
          shift: record.shift ? `${record.shift.start} - ${record.shift.end}` : '09:00 - 18:00',
          remarks: record.remarks || ''
        });
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${startDate}_${endDate}.csv`);
      
      await workbook.csv.write(res);
    } else {
      res.status(200).json({
        status: "success",
        data: {
          period: { startDate, endDate },
          filters: { employeeId, department },
          attendance,
          summary: {
            totalRecords: attendance.length,
            uniqueEmployees: [...new Set(attendance.map(a => a.employee?._id))].length,
            totalHours: attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0)
          }
        }
      });
    }

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Check Working Day
exports.checkWorkingDay = async (req, res) => {
  try {
    const userId = req.user._id;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const dayStatus = await checkDayStatus(userId, targetDate);

    res.status(200).json({
      status: "success",
      data: {
        date: targetDate,
        isWorkingDay: dayStatus.isWorkingDay,
        dayStatus: dayStatus.status,
        reason: dayStatus.reason,
        recordType: dayStatus.recordType
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Manual Trigger Auto Clock Out
exports.triggerAutoClockOut = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const results = await autoClockOutService.triggerManualAutoClockOut();

    res.status(200).json({
      status: "success",
      message: "Auto clock out triggered successfully",
      results
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};
// Get Admin Employee Attendance
exports.getAdminEmployeeAttendance = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { employeeId, month, year } = req.query;

    if (!employeeId || !month || !year) {
      return res.status(400).json({
        status: "fail",
        message: "Employee ID, month and year are required"
      });
    }

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found"
      });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    endDate.setHours(23, 59, 59, 999);

    const matchCondition = {
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false
    };

    const attendance = await Attendance.find(matchCondition)
      .sort({ date: 1 })
      .lean();

    // Calculate statistics
    const workingDays = attendance.length;
    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let holidayDays = 0;
    let totalHours = 0;
    let totalLateMinutes = 0;
    let lateCount = 0;

    attendance.forEach(record => {
      if (record.status === 'Present' || record.status === 'Late' || record.status === 'Early') {
        presentDays++;
        totalHours += record.totalHours || 0;
        if (record.isLate) {
          lateCount++;
          totalLateMinutes += record.lateMinutes || 0;
        }
      } else if (record.status === 'Absent') {
        absentDays++;
      } else if (record.status === 'Leave' || record.status === 'Unpaid Leave' || record.status === 'Half Paid Leave') {
        leaveDays++;
      } else if (record.status === 'Govt Holiday' || record.status === 'Weekly Off' || record.status === 'Off Day') {
        holidayDays++;
      }
    });

    const attendanceRate = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

    res.status(200).json({
      status: "success",
      data: {
        employee: {
          _id: employee._id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeId: employee.employeeId,
          department: employee.department,
          designation: employee.designation
        },
        period: {
          month: parseInt(month),
          year: parseInt(year),
          monthName: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' }),
          startDate: startDate,
          endDate: endDate
        },
        attendance: attendance.map(record => ({
          date: record.date,
          clockIn: record.clockIn,
          clockOut: record.clockOut,
          totalHours: record.totalHours,
          status: record.status,
          isLate: record.isLate,
          lateMinutes: record.lateMinutes,
          isEarly: record.isEarly,
          earlyMinutes: record.earlyMinutes,
          remarks: record.remarks,
          shift: record.shift
        })),
        statistics: {
          workingDays,
          presentDays,
          absentDays,
          leaveDays,
          holidayDays,
          totalHours: parseFloat(totalHours.toFixed(2)),
          averageHours: presentDays > 0 ? parseFloat((totalHours / presentDays).toFixed(2)) : 0,
          attendanceRate: parseFloat(attendanceRate.toFixed(2)),
          lateCount,
          averageLateMinutes: lateCount > 0 ? parseFloat((totalLateMinutes / lateCount).toFixed(1)) : 0
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Bulk Attendance Creation (Improved)
exports.createBulkAttendance = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId);
    
    if (admin.role !== 'admin' && admin.role !== 'superAdmin') {
      return res.status(403).json({
        status: "fail",
        message: "Access denied"
      });
    }

    const { 
      employeeId, 
      month, 
      year, 
      defaultShiftStart = "09:00", 
      defaultShiftEnd = "18:00",
      holidays = [],
      leaveDates = [],
      workingDays = [],
      markAllAsPresent = false,
      skipWeekends = true 
    } = req.body;

    if (!employeeId || !month || !year) {
      return res.status(400).json({
        status: "fail",
        message: "Employee ID, month and year are required"
      });
    }

    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found"
      });
    }

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    // Generate all dates for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      try {
        const currentDate = new Date(date);
        const dateString = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Skip weekends if enabled
        if (skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
          results.skipped++;
          continue;
        }
        
        // Check if date is in holidays
        const isHoliday = holidays.some(h => h.date === dateString);
        if (isHoliday) {
          results.skipped++;
          continue;
        }
        
        // Check if date is in leave dates
        const isLeave = leaveDates.includes(dateString);
        if (isLeave) {
          results.skipped++;
          continue;
        }
        
        // Check if date is in working days (if workingDays array is provided)
        const isWorkingDay = workingDays.includes(dateString);
        if (workingDays.length > 0 && !isWorkingDay) {
          results.skipped++;
          continue;
        }
        
        // Determine status
        let status = "Present";
        let clockIn = null;
        let clockOut = null;
        
        if (isHoliday) {
          const holiday = holidays.find(h => h.date === dateString);
          status = holiday?.type === "Govt Holiday" ? "Govt Holiday" : "Off Day";
        } else if (isLeave) {
          status = "Leave";
        } else if (!markAllAsPresent) {
          // For actual attendance, you might want to calculate based on employee's schedule
          status = "Present";
          // Set default clock in/out times
          clockIn = `${dateString}T${defaultShiftStart}:00`;
          clockOut = `${dateString}T${defaultShiftEnd}:00`;
        } else {
          status = "Present";
          clockIn = `${dateString}T${defaultShiftStart}:00`;
          clockOut = `${dateString}T${defaultShiftEnd}:00`;
        }
        
        // Check existing attendance
        const existingAttendance = await Attendance.findOne({
          employee: employeeId,
          date: currentDate,
          isDeleted: false
        });
        
        if (existingAttendance) {
          // Update existing record
          existingAttendance.status = status;
          existingAttendance.clockIn = clockIn ? new Date(clockIn) : null;
          existingAttendance.clockOut = clockOut ? new Date(clockOut) : null;
          
          if (clockIn && clockOut) {
            const diffMs = new Date(clockOut) - new Date(clockIn);
            existingAttendance.totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(4));
          } else {
            existingAttendance.totalHours = 0;
          }
          
          existingAttendance.shift = {
            name: 'Bulk Updated',
            start: defaultShiftStart,
            end: defaultShiftEnd,
            lateThreshold: 5,
            earlyThreshold: -1,
            autoClockOutDelay: 10
          };
          
          existingAttendance.remarks = `Bulk attendance updated for ${dateString}`;
          existingAttendance.correctedByAdmin = true;
          existingAttendance.correctedBy = adminId;
          existingAttendance.correctionDate = new Date();
          
          await existingAttendance.save();
          results.updated++;
        } else {
          // Create new attendance record
          const attendance = new Attendance({
            employee: employeeId,
            date: currentDate,
            clockIn: clockIn ? new Date(clockIn) : null,
            clockOut: clockOut ? new Date(clockOut) : null,
            totalHours: clockIn && clockOut ? parseFloat(((new Date(clockOut) - new Date(clockIn)) / (1000 * 60 * 60)).toFixed(4)) : 0,
            status: status,
            shift: {
              name: 'Bulk Created',
              start: defaultShiftStart,
              end: defaultShiftEnd,
              lateThreshold: 5,
              earlyThreshold: -1,
              autoClockOutDelay: 10
            },
            ipAddress: 'System',
            device: { type: 'system', os: 'Bulk Import' },
            location: "Office",
            correctedByAdmin: true,
            correctedBy: adminId,
            correctionDate: new Date(),
            remarks: `Bulk attendance created for ${dateString}`,
            autoClockOutTime: addMinutesToTime(defaultShiftEnd, 10)
          });
          
          await attendance.save();
          results.created++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          date: date.toISOString().split('T')[0],
          error: error.message
        });
      }
    }
    
    await addSessionActivity({
      userId: adminId,
      action: "Bulk Attendance Created",
      target: employeeId,
      targetType: "User",
      details: {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        month,
        year,
        results,
        adminName: `${admin.firstName} ${admin.lastName}`
      },
      ipAddress: req.ip
    });
    
    res.status(200).json({
      status: "success",
      message: "Bulk attendance processed successfully",
      results
    });
    
  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};