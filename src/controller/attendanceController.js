const mongoose = require('mongoose');
const UAParser = require('ua-parser-js');
const cron = require('node-cron');
const ExcelJS = require('exceljs');
const moment = require('moment-timezone');

const Attendance = require('../models/AttendanceModel');
const User = require('../models/UsersModel');
const Leave = require('../models/LeaveModel');
const Holiday = require('../models/HolidayModel');
const OfficeSchedule = require('../models/OfficeScheduleModel');
const OfficeScheduleOverride = require('../models/TemporaryOfficeSchedule');
const SessionLog = require('../models/SessionLogModel');

const TIMEZONE = 'Asia/Dhaka';

// ===================== Helper Functions =====================
// ===================== সার্ভার-সাইড Helper Functions =====================

const parseTimeString = (timeStr) => {
  if (!timeStr) return { hours: 0, minutes: 0 };
  
  // Handle both "HH:MM" format and Date object
  if (typeof timeStr === 'string') {
    const [hoursStr, minutesStr] = timeStr.split(':');
    const hours = parseInt(hoursStr, 10) || 0;
    const minutes = parseInt(minutesStr, 10) || 0;
    return { hours, minutes };
  }
  
  // If it's already a Date object
  if (timeStr instanceof Date) {
    return {
      hours: timeStr.getHours(),
      minutes: timeStr.getMinutes()
    };
  }
  
  return { hours: 0, minutes: 0 };
};

const timeToMinutes = (timeStr) => {
  const { hours, minutes } = parseTimeString(timeStr);
  return hours * 60 + minutes;
};

const addMinutesToTime = (timeStr, minutesToAdd) => {
  const { hours, minutes } = parseTimeString(timeStr);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  
  let resultHours = Math.floor(totalMinutes / 60) % 24;
  let resultMinutes = totalMinutes % 60;
  const isNextDay = totalMinutes >= 24 * 60;
  
  // If it's next day, handle properly
  if (isNextDay) {
    resultHours = Math.floor(totalMinutes / 60) % 24;
  }
  
  return {
    time: `${resultHours.toString().padStart(2, '0')}:${resultMinutes.toString().padStart(2, '0')}`,
    isNextDay,
    totalMinutes: totalMinutes % (24 * 60)
  };
};

// Improved checkLateEarlyForEmployee function
const checkLateEarlyForEmployee = (clockInDateTime, employeeShift) => {
  // Parse shift start time
  const shiftStartTime = parseTimeString(employeeShift.start);
  const clockInTime = parseTimeString(clockInDateTime);
  
  // Calculate shift start in minutes from midnight
  const shiftStartMinutes = shiftStartTime.hours * 60 + shiftStartTime.minutes;
  const clockInMinutes = clockInTime.hours * 60 + clockInTime.minutes;
  
  // Parse shift end time
  const shiftEndTime = parseTimeString(employeeShift.end);
  const shiftEndMinutes = shiftEndTime.hours * 60 + shiftEndTime.minutes;
  
  // Check if it's night shift (shift ends on next day)
  const isNightShift = shiftEndMinutes < shiftStartMinutes;
  
  let adjustedClockInMinutes = clockInMinutes;
  let adjustedShiftStartMinutes = shiftStartMinutes;
  
  if (isNightShift) {
    // For night shift, adjust calculations
    if (clockInMinutes < shiftEndMinutes) {
      // Clock in is after midnight (next day)
      adjustedClockInMinutes += 24 * 60;
    }
    // Shift start is on previous day
    adjustedShiftStartMinutes = shiftStartMinutes;
  }
  
  const difference = adjustedClockInMinutes - adjustedShiftStartMinutes;
  
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
  
  return { 
    isLate, 
    isEarly, 
    lateMinutes, 
    earlyMinutes, 
    difference,
    isNightShift
  };
};

// Improved formatTimeWithDayOffset
const formatTimeWithDayOffset = (baseDate, timeStr, dayOffset = 0) => {
  const { hours, minutes } = parseTimeString(timeStr);
  const date = new Date(baseDate);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  
  // Adjust for timezone
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - timezoneOffset);
  
  return localDate;
};
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
    const autoClockOutResult = addMinutesToTime(adjustment.end, autoClockOutDelay);
    
    const shiftStartMinutes = timeToMinutes(adjustment.start);
    const shiftEndMinutes = timeToMinutes(adjustment.end);
    const isNightShift = shiftEndMinutes < shiftStartMinutes;
    
    return {
      name: 'Admin Adjusted',
      start: adjustment.start,
      end: adjustment.end,
      lateThreshold: adjustment.lateThreshold || 5,
      earlyThreshold: adjustment.earlyThreshold || -1,
      autoClockOutDelay: autoClockOutDelay,
      autoClockOutTime: autoClockOutResult.time,
      autoClockOutIsNextDay: autoClockOutResult.isNextDay,
      isAdminAdjusted: true,
      source: 'attendance_adjustment',
      isNightShift: isNightShift
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
      autoClockOutIsNextDay: false,
      isAdminAdjusted: false,
      source: 'system_default',
      isNightShift: false
    };
    return defaultShift;
  }

  // Check assigned shift
  if (employee.shiftTiming?.assignedShift?.isActive && 
      employee.shiftTiming.assignedShift.start && 
      employee.shiftTiming.assignedShift.end) {
    
    const shift = employee.shiftTiming.assignedShift;
    const autoClockOutDelay = shift.autoClockOutDelay || 10;
    const autoClockOutResult = addMinutesToTime(shift.end, autoClockOutDelay);
    
    const shiftStartMinutes = timeToMinutes(shift.start);
    const shiftEndMinutes = timeToMinutes(shift.end);
    const isNightShift = shiftEndMinutes < shiftStartMinutes;
    
    return {
      name: shift.name || 'Assigned Shift',
      start: shift.start,
      end: shift.end,
      lateThreshold: shift.lateThreshold || 5,
      earlyThreshold: shift.earlyThreshold || -1,
      autoClockOutDelay: autoClockOutDelay,
      autoClockOutTime: autoClockOutResult.time,
      autoClockOutIsNextDay: autoClockOutResult.isNextDay,
      isAdminAdjusted: false,
      source: 'assigned_shift',
      isNightShift: isNightShift
    };
  }

  // Use default shift
  const defaultShift = employee.shiftTiming?.defaultShift || {};
  const autoClockOutDelay = defaultShift.autoClockOutDelay || 10;
  const startTime = defaultShift.start || '09:00';
  const endTime = defaultShift.end || '18:00';
  const autoClockOutResult = addMinutesToTime(endTime, autoClockOutDelay);
  
  const shiftStartMinutes = timeToMinutes(startTime);
  const shiftEndMinutes = timeToMinutes(endTime);
  const isNightShift = shiftEndMinutes < shiftStartMinutes;
  
  return {
    name: defaultShift.name || 'Default',
    start: startTime,
    end: endTime,
    lateThreshold: defaultShift.lateThreshold || 5,
    earlyThreshold: defaultShift.earlyThreshold || -1,
    autoClockOutDelay: autoClockOutDelay,
    autoClockOutTime: autoClockOutResult.time,
    autoClockOutIsNextDay: autoClockOutResult.isNextDay,
    isAdminAdjusted: false,
    source: 'default_shift',
    isNightShift: isNightShift
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
    this.lastAbsentMarking = null;
    this.lastNonWorkingDayGeneration = null;
    this.initializeScheduler();
  }

  initializeScheduler() {
    const options = { scheduled: true, timezone: TIMEZONE };

    // Every 5 minutes check auto clock out
    cron.schedule('*/5 * * * *', async () => {
      await this.checkAndExecuteAutoClockOuts();
    }, options);

    // 1:00 AM - Tomorrow's non-working day records
    cron.schedule('0 1 * * *', async () => {
      console.log('📅 [1:00 AM] Generating tomorrow\'s non-working day records');
      await this.generateTomorrowsNonWorkingDayRecords();
    }, options);

    // 12:10 PM - Working day absent marking
    cron.schedule('10 12 * * *', async () => {
      console.log('⚠️ [12:10 PM] Working day absent marking');
      await this.markWorkingDayAbsent();
    }, options);
  }

  async checkAndExecuteAutoClockOuts() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const currentTimeDhaka = moment().tz(TIMEZONE);
      const currentTimeStr = currentTimeDhaka.format('HH:mm');
      const currentMinutes = timeToMinutes(currentTimeStr);

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
          
          const autoClockOutMinutes = timeToMinutes(shiftDetails.autoClockOutTime);
          
          let comparisonTime = autoClockOutMinutes;
          if (shiftDetails.autoClockOutIsNextDay) {
            comparisonTime += 24 * 60;
            
            const midnightMinutes = 24 * 60;
            if (currentMinutes < midnightMinutes) {
              const currentTimeWithDay = currentMinutes;
              const autoClockOutWithDay = comparisonTime;
              
              if (currentTimeWithDay >= autoClockOutWithDay - (24 * 60)) {
                await this.performAutoClockOut(att, shiftDetails);
                results.autoClockOuts++;
                continue;
              }
            }
          }
          
          if (currentMinutes >= comparisonTime) {
            await this.performAutoClockOut(att, shiftDetails);
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

  async performAutoClockOut(attendance, shiftDetails) {
    const clockOutTime = new Date();
    
    if (shiftDetails.isNightShift) {
      const clockInTime = new Date(attendance.clockIn);
      const clockInDay = clockInTime.getDate();
      const clockOutDay = clockOutTime.getDate();
      
      if (clockOutDay !== clockInDay) {
        // This is expected for night shift
      }
    }
    
    let totalHours = 0;
    if (attendance.clockIn) {
      const diffMs = clockOutTime - new Date(attendance.clockIn);
      totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(4));
    }

    await Attendance.findByIdAndUpdate(attendance._id, {
      $set: {
        clockOut: clockOutTime,
        totalHours: totalHours,
        autoClockOut: true,
        autoClockOutTime: shiftDetails.autoClockOutTime,
        autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false,
        status: 'Present',
        remarks: `Auto clocked out at ${clockOutTime.toLocaleTimeString('en-US', { hour12: false, timeZone: TIMEZONE })}`
      }
    });

    await addSessionActivity({
      userId: attendance.employee._id,
      action: "Auto Clocked Out",
      target: attendance._id.toString(),
      targetType: "Attendance",
      details: {
        shiftEnd: shiftDetails.end,
        autoClockOutTime: shiftDetails.autoClockOutTime,
        totalHours: totalHours,
        isNightShift: shiftDetails.isNightShift || false
      }
    });
  }

  async markWorkingDayAbsent() {
    // Prevent duplicate execution on same day
    const todayStr = new Date().toISOString().split('T')[0];
    if (this.lastAbsentMarking === todayStr) {
      console.log('✅ [12:10 PM] Absent marking already done today');
      return { message: 'Already marked today', skipped: true };
    }

    this.isRunning = true;
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeEmployees = await User.find({
        status: 'active',
        role: 'employee'
      }).select('_id firstName lastName employeeId department position');

      const results = {
        totalEmployees: activeEmployees.length,
        markedAbsent: 0,
        nonWorkingDaySkipped: 0,
        alreadyClockedIn: 0,
        failed: 0
      };

      for (const employee of activeEmployees) {
        try {
          // Check if TODAY is a working day
          const dayStatus = await checkDayStatus(employee._id, today);
          
          // Only process WORKING DAYS at 12:10 PM
          if (dayStatus.isWorkingDay) {
            // Check existing attendance
            const existingAttendance = await Attendance.findOne({
              employee: employee._id,
              date: today,
              isDeleted: false
            });

            // Only mark absent if:
            // 1. No attendance record exists, OR
            // 2. Record exists but employee hasn't clocked in
            if (!existingAttendance) {
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
                  autoClockOutDelay: shiftDetails.autoClockOutDelay,
                  isNightShift: shiftDetails.isNightShift || false
                },
                markedAbsent: true,
                absentMarkedAt: new Date(),
                autoMarked: true,
                remarks: `Auto-marked as Absent at 12:10 PM (no clock in on working day)`,
                ipAddress: 'System',
                device: { type: 'system', os: 'Auto Attendance' },
                location: 'Office',
                autoClockOutTime: shiftDetails.autoClockOutTime,
                autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false
              });

              await attendance.save();
              results.markedAbsent++;
            } 
            else if (existingAttendance && !existingAttendance.clockIn) {
              // Update existing record to Absent if no clock in
              existingAttendance.status = 'Absent';
              existingAttendance.markedAbsent = true;
              existingAttendance.absentMarkedAt = new Date();
              existingAttendance.autoMarked = true;
              existingAttendance.remarks = `Auto-marked as Absent at 12:10 PM (no clock in)`;
              
              await existingAttendance.save();
              results.markedAbsent++;
            }
            else if (existingAttendance && existingAttendance.clockIn) {
              // Employee already clocked in - skip
              results.alreadyClockedIn++;
            }
          } else {
            // Skip non-working days at 12:10 PM
            results.nonWorkingDaySkipped++;
          }
        } catch (error) {
          console.error(`Mark absent error for ${employee._id}:`, error);
          results.failed++;
        }
      }

      console.log(`📋 [12:10 PM] Marked ${results.markedAbsent} employees as absent`);
      this.lastAbsentMarking = todayStr;
      
      return results;
    } catch (error) {
      console.error('Mark working day absent failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async generateTomorrowsNonWorkingDayRecords() {
    // Prevent duplicate execution on same day
    const todayStr = new Date().toISOString().split('T')[0];
    if (this.lastNonWorkingDayGeneration === todayStr) {
      console.log('✅ [1:00 AM] Non-working day records already generated today');
      return { message: 'Already generated today', skipped: true };
    }

    this.isRunning = true;
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const activeEmployees = await User.find({
        status: 'active',
        role: 'employee'
      }).select('_id firstName lastName employeeId department');

      const results = {
        totalEmployees: activeEmployees.length,
        recordsCreated: 0,
        skippedWorkingDay: 0,
        skippedExists: 0,
        failed: 0
      };

      for (const employee of activeEmployees) {
        try {
          // Check day status for TOMORROW
          const dayStatus = await checkDayStatus(employee._id, tomorrow);
          
          // ONLY create record for NON-WORKING days
          if (!dayStatus.isWorkingDay) {
            // Check existing attendance
            const existingAttendance = await Attendance.findOne({
              employee: employee._id,
              date: tomorrow,
              isDeleted: false
            });

            if (!existingAttendance) {
              const shiftDetails = await getEmployeeShiftDetails(employee._id, tomorrow);
              
              // Determine status based on day type
              let status = 'Absent'; // Default fallback
              
              if (dayStatus.status === 'Govt Holiday') {
                status = 'Govt Holiday';
              } else if (dayStatus.status === 'Weekly Off') {
                status = 'Weekly Off';
              } else if (dayStatus.status === 'Off Day') {
                status = 'Off Day';
              } else if (dayStatus.recordType === 'leave') {
                // Leave type from leaveDetails
                if (dayStatus.leaveDetails?.payStatus === 'Unpaid') {
                  status = 'Unpaid Leave';
                } else if (dayStatus.leaveDetails?.payStatus === 'HalfPaid') {
                  status = 'Half Paid Leave';
                } else {
                  status = 'Leave'; // Paid Leave
                }
              }

              const attendance = new Attendance({
                employee: employee._id,
                date: tomorrow,
                status: status,
                shift: {
                  name: shiftDetails.name,
                  start: shiftDetails.start,
                  end: shiftDetails.end,
                  lateThreshold: shiftDetails.lateThreshold,
                  earlyThreshold: shiftDetails.earlyThreshold,
                  autoClockOutDelay: shiftDetails.autoClockOutDelay,
                  isNightShift: shiftDetails.isNightShift || false
                },
                autoMarked: true,
                remarks: `Auto-generated at 1:00 AM: ${dayStatus.reason || dayStatus.status}`,
                ipAddress: 'System',
                device: { type: 'system', os: 'Auto Generator' },
                location: 'Office',
                autoClockOutTime: shiftDetails.autoClockOutTime,
                autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false,
                autoGenerated: true
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
                      status: status
                    }
                  },
                  autoGeneratedAttendance: true
                });
              }
            } else {
              results.skippedExists++;
            }
          } else {
            // Skip WORKING DAYS - NO auto record for working days at 1:00 AM
            results.skippedWorkingDay++;
          }
        } catch (error) {
          console.error(`Generate record error for ${employee._id}:`, error);
          results.failed++;
        }
      }

      console.log(`📋 [1:00 AM] Created ${results.recordsCreated} non-working day records for tomorrow`);
      this.lastNonWorkingDayGeneration = todayStr;
      
      return results;
    } catch (error) {
      console.error('Generate tomorrow records failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
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
    
    // If attendance exists and has Absent status from auto-marking, update it
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
      end: shiftDetails.end,
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
          autoClockOutDelay: shiftDetails.autoClockOutDelay,
          isNightShift: shiftDetails.isNightShift || false
        },
        lateMinutes: lateEarlyCheck.lateMinutes,
        earlyMinutes: lateEarlyCheck.earlyMinutes,
        isLate: lateEarlyCheck.isLate,
        isEarly: lateEarlyCheck.isEarly,
        ipAddress: req.ip,
        device: deviceInfo,
        location: location || "Office",
        remarks: `Clocked in at ${clockInTime.toLocaleTimeString('en-US', { hour12: false, timeZone: TIMEZONE })}`,
        autoClockOutTime: shiftDetails.autoClockOutTime,
        autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false
      });
    } else {
      // Update existing attendance (e.g., if it was auto-marked as Absent)
      attendance.clockIn = clockInTime;
      attendance.status = status;
      attendance.shift = {
        name: shiftDetails.name,
        start: shiftDetails.start,
        end: shiftDetails.end,
        lateThreshold: shiftDetails.lateThreshold,
        earlyThreshold: shiftDetails.earlyThreshold,
        autoClockOutDelay: shiftDetails.autoClockOutDelay,
        isNightShift: shiftDetails.isNightShift || false
      };
      attendance.lateMinutes = lateEarlyCheck.lateMinutes;
      attendance.earlyMinutes = lateEarlyCheck.earlyMinutes;
      attendance.isLate = lateEarlyCheck.isLate;
      attendance.isEarly = lateEarlyCheck.isEarly;
      attendance.ipAddress = req.ip;
      attendance.device = deviceInfo;
      attendance.location = location || "Office";
      attendance.remarks = `Clocked in at ${clockInTime.toLocaleTimeString('en-US', { hour12: false, timeZone: TIMEZONE })}`;
      attendance.autoClockOutTime = shiftDetails.autoClockOutTime;
      attendance.autoClockOutIsNextDay = shiftDetails.autoClockOutIsNextDay || false;
      
      // Clear absent marking flags if they exist
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
        clockInTime: clockInTime.toLocaleTimeString('en-US', { hour12: false, timeZone: TIMEZONE }),
        isLate: lateEarlyCheck.isLate,
        isEarly: lateEarlyCheck.isEarly,
        location: location || "Office",
        isNightShift: shiftDetails.isNightShift || false
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
    
    if (shiftDetails.isNightShift) {
      message += `. Night shift: ${shiftDetails.start} to ${shiftDetails.end}`;
    }

    res.status(200).json({
      status: "success",
      message,
      attendance: {
        ...attendance.toObject(),
        shiftDetails,
        autoClockOutTime: shiftDetails.autoClockOutTime,
        autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false
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

    // Calculate total hours
    const diffMs = clockOutTime - new Date(attendance.clockIn);
    const totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(4));

    attendance.clockOut = clockOutTime;
    attendance.totalHours = totalHours;
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
        totalHours: totalHours,
        clockOutTime: clockOutTime.toLocaleTimeString('en-US', { hour12: false, timeZone: TIMEZONE }),
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
        end: finalShiftEnd,
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
    const autoClockOutResult = addMinutesToTime(finalShiftEnd, autoClockOutDelay);

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
        autoClockOutDelay: autoClockOutDelay,
        isNightShift: shiftDetails.isNightShift || false
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
      autoClockOutTime: autoClockOutResult.time,
      autoClockOutIsNextDay: autoClockOutResult.isNextDay || false
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
      
      if (attendance.clockIn) {
        const lateEarlyCheck = checkLateEarlyForEmployee(attendance.clockIn, {
          start: attendance.shift.start,
          end: attendance.shift.end,
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

// Update Employee Shift Timing (Admin)
exports.updateEmployeeShiftTiming = async (req, res) => {
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
    const isNightShift = endMinutes < startMinutes;

    const autoClockOutDelay = shiftData.autoClockOutDelay || 10;
    const autoClockOutResult = addMinutesToTime(shiftData.end, autoClockOutDelay);

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
            autoClockOutDelay: autoClockOutDelay,
            isNightShift: isNightShift
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
          autoClockOutTime: autoClockOutResult.time,
          autoClockOutIsNextDay: autoClockOutResult.isNextDay || false,
          remarks: `Shift adjusted by admin`
        });
      } else {
        attendance.shift = {
          name: shiftData.name || 'Admin Adjusted',
          start: shiftData.start,
          end: shiftData.end,
          lateThreshold: shiftData.lateThreshold || 5,
          earlyThreshold: shiftData.earlyThreshold || -1,
          autoClockOutDelay: autoClockOutDelay,
          isNightShift: isNightShift
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
        attendance.autoClockOutTime = autoClockOutResult.time;
        attendance.autoClockOutIsNextDay = autoClockOutResult.isNextDay || false;
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
            autoClockOutTime: autoClockOutResult.time,
            isNightShift: isNightShift
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
          isNightShift: employee.shiftTiming.assignedShift.isNightShift || false,
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
        isNightShift: isNightShift,
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
            autoClockOutTime: autoClockOutResult.time,
            isNightShift: isNightShift
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
          name: shiftDetails.name,
          isNightShift: shiftDetails.isNightShift || false
        },
        autoClockOut: {
          time: shiftDetails.autoClockOutTime,
          delay: shiftDetails.autoClockOutDelay,
          isNextDay: shiftDetails.autoClockOutIsNextDay || false
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
          autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false,
          isNightShift: shiftDetails.isNightShift || false,
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
          autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false,
          isNightShift: shiftDetails.isNightShift || false,
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
        const lateEarlyCheck = checkLateEarlyForEmployee(attendance.clockIn, {
          start: attendance.shift.start,
          end: attendance.shift.end,
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
    const isNightShift = endMinutes < startMinutes;

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
        isNightShift: employee.shiftTiming.assignedShift.isNightShift || false,
        assignedBy: employee.shiftTiming.assignedShift.assignedBy,
        assignedAt: employee.shiftTiming.assignedShift.assignedAt,
        effectiveDate: employee.shiftTiming.assignedShift.effectiveDate,
        endedAt: now,
        reason: reason || 'Shift updated by admin'
      });
    }

    // Update with new shift
    const autoClockOutDelay = 10; // Default 10 minutes
    const autoClockOutResult = addMinutesToTime(endTime, autoClockOutDelay);

    employee.shiftTiming.assignedShift = {
      name: 'Custom Shift',
      start: startTime,
      end: endTime,
      lateThreshold: 5,
      earlyThreshold: -1,
      autoClockOutDelay: autoClockOutDelay,
      isNightShift: isNightShift,
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
          autoClockOutTime: autoClockOutResult.time,
          isNightShift: isNightShift
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
          autoClockOutTime: autoClockOutResult.time,
          isNightShift: isNightShift
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
          
          const shiftStart = defaultShiftStart || record.shiftStart || '09:00';
          const shiftEnd = defaultShiftEnd || record.shiftEnd || '18:00';
          const shiftStartMinutes = timeToMinutes(shiftStart);
          const shiftEndMinutes = timeToMinutes(shiftEnd);
          const isNightShift = shiftEndMinutes < shiftStartMinutes;
          const autoClockOutResult = addMinutesToTime(shiftEnd, 10);
          
          existingAttendance.shift = {
            name: 'Bulk Updated',
            start: shiftStart,
            end: shiftEnd,
            lateThreshold: 5,
            earlyThreshold: -1,
            autoClockOutDelay: 10,
            isNightShift: isNightShift
          };
          
          existingAttendance.autoClockOutTime = autoClockOutResult.time;
          existingAttendance.autoClockOutIsNextDay = autoClockOutResult.isNextDay || false;
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
          const shiftStartMinutes = timeToMinutes(shiftStart);
          const shiftEndMinutes = timeToMinutes(shiftEnd);
          const isNightShift = shiftEndMinutes < shiftStartMinutes;
          
          // Calculate late/early for Present status
          let lateMinutes = 0;
          let earlyMinutes = 0;
          let isLate = false;
          let isEarly = false;

          if (clockIn && record.status === 'Present') {
            const clockInTime = new Date(clockIn);
            const lateEarlyCheck = checkLateEarlyForEmployee(clockInTime, {
              start: shiftStart,
              end: shiftEnd,
              lateThreshold: 5,
              earlyThreshold: -1
            });
            lateMinutes = lateEarlyCheck.lateMinutes;
            earlyMinutes = lateEarlyCheck.earlyMinutes;
            isLate = lateEarlyCheck.isLate;
            isEarly = lateEarlyCheck.isEarly;
          }

          const autoClockOutDelay = 10;
          const autoClockOutResult = addMinutesToTime(shiftEnd, autoClockOutDelay);

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
              autoClockOutDelay,
              isNightShift: isNightShift
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
            autoClockOutTime: autoClockOutResult.time,
            autoClockOutIsNextDay: autoClockOutResult.isNextDay || false,
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
        { header: 'Night Shift', key: 'isNightShift', width: 10 },
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
          isNightShift: record.shift?.isNightShift ? 'Yes' : 'No',
          remarks: record.remarks || ''
        });
      });

      // Add summary row
      const totalHours = attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0);
      const presentDays = attendance.filter(record => record.status === 'Present').length;
      const absentDays = attendance.filter(record => record.status === 'Absent').length;

      worksheet.addRow([]);
      worksheet.addRow(['Summary', '', '', '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Total Days', attendance.length, '', '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Present Days', presentDays, '', '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Absent Days', absentDays, '', '', '', '', '', '', '', '', '']);
      worksheet.addRow(['Total Hours', totalHours.toFixed(2), '', '', '', '', '', '', '', '', '']);

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
        { header: 'Night Shift', key: 'isNightShift', width: 10 },
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
          isNightShift: record.shift?.isNightShift ? 'Yes' : 'No',
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
exports.triggerManualAutoClockOut = async (req, res) => {
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
      } else if (record.status === 'Govt Holiday' || record.status === 'Off Day' || record.status === 'Weekly Off') {
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
exports.createBulkAttendanceV2 = async (req, res) => {
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
          
          // Calculate night shift
          const shiftStartMinutes = timeToMinutes(defaultShiftStart);
          const shiftEndMinutes = timeToMinutes(defaultShiftEnd);
          const isNightShift = shiftEndMinutes < shiftStartMinutes;
          const autoClockOutResult = addMinutesToTime(defaultShiftEnd, 10);
          
          existingAttendance.shift = {
            name: 'Bulk Updated',
            start: defaultShiftStart,
            end: defaultShiftEnd,
            lateThreshold: 5,
            earlyThreshold: -1,
            autoClockOutDelay: 10,
            isNightShift: isNightShift
          };
          
          existingAttendance.autoClockOutTime = autoClockOutResult.time;
          existingAttendance.autoClockOutIsNextDay = autoClockOutResult.isNextDay || false;
          existingAttendance.remarks = `Bulk attendance updated for ${dateString}`;
          existingAttendance.correctedByAdmin = true;
          existingAttendance.correctedBy = adminId;
          existingAttendance.correctionDate = new Date();
          
          await existingAttendance.save();
          results.updated++;
        } else {
          // Create new attendance record
          const shiftStartMinutes = timeToMinutes(defaultShiftStart);
          const shiftEndMinutes = timeToMinutes(defaultShiftEnd);
          const isNightShift = shiftEndMinutes < shiftStartMinutes;
          const autoClockOutResult = addMinutesToTime(defaultShiftEnd, 10);
          
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
              autoClockOutDelay: 10,
              isNightShift: isNightShift
            },
            ipAddress: 'System',
            device: { type: 'system', os: 'Bulk Import' },
            location: "Office",
            correctedByAdmin: true,
            correctedBy: adminId,
            correctionDate: new Date(),
            remarks: `Bulk attendance created for ${dateString}`,
            autoClockOutTime: autoClockOutResult.time,
            autoClockOutIsNextDay: autoClockOutResult.isNextDay || false
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
      action: "Bulk Attendance Created V2",
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

// Get Employee Attendance Calendar
exports.getEmployeeCalendar = async (req, res) => {
  try {
    const userId = req.user._id;
    const { year, month } = req.query;

    const targetYear = year || new Date().getFullYear();
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    const matchCondition = {
      employee: userId,
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false
    };

    const attendance = await Attendance.find(matchCondition)
      .sort({ date: 1 })
      .lean();

    // Generate calendar days
    const calendar = [];
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(targetYear, targetMonth, day);
      const dateString = currentDate.toISOString().split('T')[0];
      
      const attendanceRecord = attendance.find(record => 
        record.date.toISOString().split('T')[0] === dateString
      );

      const dayStatus = await checkDayStatus(userId, currentDate);
      
      calendar.push({
        date: dateString,
        day: day,
        dayName: currentDate.toLocaleString('en-US', { weekday: 'short' }),
        isWorkingDay: dayStatus.isWorkingDay,
        status: attendanceRecord ? attendanceRecord.status : (dayStatus.isWorkingDay ? 'Not Recorded' : dayStatus.status),
        clockIn: attendanceRecord?.clockIn,
        clockOut: attendanceRecord?.clockOut,
        totalHours: attendanceRecord?.totalHours,
        isLate: attendanceRecord?.isLate,
        lateMinutes: attendanceRecord?.lateMinutes,
        isEarly: attendanceRecord?.isEarly,
        earlyMinutes: attendanceRecord?.earlyMinutes,
        remarks: attendanceRecord?.remarks
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        year: targetYear,
        month: targetMonth + 1,
        monthName: new Date(targetYear, targetMonth, 1).toLocaleString('default', { month: 'long' }),
        totalDays: daysInMonth,
        calendar,
        summary: {
          present: calendar.filter(day => day.status === 'Present' || day.status === 'Late' || day.status === 'Early').length,
          absent: calendar.filter(day => day.status === 'Absent').length,
          leave: calendar.filter(day => day.status.includes('Leave')).length,
          holiday: calendar.filter(day => day.status === 'Govt Holiday' || day.status === 'Off Day').length,
          weeklyOff: calendar.filter(day => day.status === 'Weekly Off').length
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

// Get Monthly Report
exports.getMonthlyReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { year, month } = req.query;

    const targetYear = year || new Date().getFullYear();
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth();

    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    const matchCondition = {
      employee: userId,
      date: { $gte: startDate, $lte: endDate },
      isDeleted: false
    };

    const attendance = await Attendance.find(matchCondition)
      .sort({ date: 1 })
      .lean();

    // Calculate statistics
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLeave = 0;
    let totalHoliday = 0;
    let totalWeeklyOff = 0;
    let totalHours = 0;
    let totalLateMinutes = 0;
    let lateCount = 0;
    let totalEarlyMinutes = 0;
    let earlyCount = 0;

    attendance.forEach(record => {
      if (record.status === 'Present' || record.status === 'Late' || record.status === 'Early') {
        totalPresent++;
        totalHours += record.totalHours || 0;
        
        if (record.isLate) {
          lateCount++;
          totalLateMinutes += record.lateMinutes || 0;
        }
        
        if (record.isEarly) {
          earlyCount++;
          totalEarlyMinutes += record.earlyMinutes || 0;
        }
      } else if (record.status === 'Absent') {
        totalAbsent++;
      } else if (record.status.includes('Leave')) {
        totalLeave++;
      } else if (record.status === 'Govt Holiday' || record.status === 'Off Day') {
        totalHoliday++;
      } else if (record.status === 'Weekly Off') {
        totalWeeklyOff++;
      }
    });

    // Get employee details
    const employee = await User.findById(userId).select('firstName lastName employeeId department designation');

    res.status(200).json({
      status: "success",
      data: {
        employee: {
          name: `${employee.firstName} ${employee.lastName}`,
          employeeId: employee.employeeId,
          department: employee.department,
          designation: employee.designation
        },
        period: {
          year: targetYear,
          month: targetMonth + 1,
          monthName: new Date(targetYear, targetMonth, 1).toLocaleString('default', { month: 'long' }),
          startDate,
          endDate
        },
        statistics: {
          totalDays: attendance.length,
          totalPresent,
          totalAbsent,
          totalLeave,
          totalHoliday,
          totalWeeklyOff,
          totalHours: parseFloat(totalHours.toFixed(2)),
          averageHours: totalPresent > 0 ? parseFloat((totalHours / totalPresent).toFixed(2)) : 0,
          lateCount,
          averageLateMinutes: lateCount > 0 ? parseFloat((totalLateMinutes / lateCount).toFixed(1)) : 0,
          earlyCount,
          averageEarlyMinutes: earlyCount > 0 ? parseFloat((totalEarlyMinutes / earlyCount).toFixed(1)) : 0,
          attendanceRate: attendance.length > 0 ? parseFloat(((totalPresent / attendance.length) * 100).toFixed(2)) : 0
        },
        dailyRecords: attendance.map(record => ({
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

// Get Attendance Analytics
exports.getAttendanceAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate } = req.query;

    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);

    const matchCondition = {
      employee: userId,
      date: { 
        $gte: startDate ? new Date(startDate) : defaultStartDate,
        $lte: endDate ? new Date(endDate) : defaultEndDate
      },
      isDeleted: false
    };

    const attendance = await Attendance.find(matchCondition)
      .sort({ date: 1 })
      .lean();

    // Prepare data for charts
    const dailyData = [];
    const weeklyData = {};
    const monthlyData = {};

    attendance.forEach(record => {
      const date = new Date(record.date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const weekNumber = Math.ceil(date.getDate() / 7);
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      const weekKey = `${year}-W${weekNumber}`;

      // Daily data
      dailyData.push({
        date: record.date,
        status: record.status,
        totalHours: record.totalHours || 0,
        isLate: record.isLate,
        lateMinutes: record.lateMinutes || 0
      });

      // Weekly data
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          week: weekKey,
          present: 0,
          absent: 0,
          leave: 0,
          totalHours: 0
        };
      }

      if (record.status === 'Present' || record.status === 'Late' || record.status === 'Early') {
        weeklyData[weekKey].present++;
        weeklyData[weekKey].totalHours += record.totalHours || 0;
      } else if (record.status === 'Absent') {
        weeklyData[weekKey].absent++;
      } else if (record.status.includes('Leave')) {
        weeklyData[weekKey].leave++;
      }

      // Monthly data
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          present: 0,
          absent: 0,
          leave: 0,
          totalHours: 0
        };
      }

      if (record.status === 'Present' || record.status === 'Late' || record.status === 'Early') {
        monthlyData[monthKey].present++;
        monthlyData[monthKey].totalHours += record.totalHours || 0;
      } else if (record.status === 'Absent') {
        monthlyData[monthKey].absent++;
      } else if (record.status.includes('Leave')) {
        monthlyData[monthKey].leave++;
      }
    });

    // Calculate trends
    const statusTrends = {
      present: 0,
      absent: 0,
      late: 0,
      early: 0,
      leave: 0
    };

    attendance.forEach(record => {
      if (record.status === 'Present') {
        statusTrends.present++;
      } else if (record.status === 'Absent') {
        statusTrends.absent++;
      } else if (record.status === 'Late') {
        statusTrends.late++;
      } else if (record.status === 'Early') {
        statusTrends.early++;
      } else if (record.status.includes('Leave')) {
        statusTrends.leave++;
      }
    });

    // Calculate average hours per day
    const totalHours = attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0);
    const presentDays = attendance.filter(record => 
      record.status === 'Present' || record.status === 'Late' || record.status === 'Early'
    ).length;

    res.status(200).json({
      status: "success",
      data: {
        period: {
          startDate: startDate || defaultStartDate,
          endDate: endDate || defaultEndDate
        },
        summary: {
          totalRecords: attendance.length,
          presentDays,
          absentDays: statusTrends.absent,
          leaveDays: statusTrends.leave,
          lateDays: statusTrends.late,
          earlyDays: statusTrends.early,
          totalHours: parseFloat(totalHours.toFixed(2)),
          averageHoursPerDay: presentDays > 0 ? parseFloat((totalHours / presentDays).toFixed(2)) : 0,
          attendanceRate: attendance.length > 0 ? parseFloat(((presentDays / attendance.length) * 100).toFixed(2)) : 0
        },
        analytics: {
          dailyData,
          weeklyData: Object.values(weeklyData),
          monthlyData: Object.values(monthlyData),
          statusDistribution: statusTrends,
          trends: {
            averageHours: parseFloat(totalHours.toFixed(2)),
            presentPercentage: attendance.length > 0 ? parseFloat(((presentDays / attendance.length) * 100).toFixed(2)) : 0,
            latePercentage: presentDays > 0 ? parseFloat(((statusTrends.late / presentDays) * 100).toFixed(2)) : 0,
            earlyPercentage: presentDays > 0 ? parseFloat(((statusTrends.early / presentDays) * 100).toFixed(2)) : 0
          }
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

// Get Employee Today's Schedule
exports.getEmployeeSchedule = async (req, res) => {
  try {
    const userId = req.user._id;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const shiftDetails = await getEmployeeShiftDetails(userId, targetDate);
    const dayStatus = await checkDayStatus(userId, targetDate);
    const attendance = await Attendance.findOne({
      employee: userId,
      date: targetDate,
      isDeleted: false
    });

    // Calculate remaining time for auto clock out
    let timeRemaining = null;
    let autoClockOutStatus = 'not_applicable';

    if (attendance && attendance.clockIn && !attendance.clockOut) {
      const currentTime = moment().tz(TIMEZONE);
      const todayStr = targetDate.toISOString().split('T')[0];
      
      // Parse auto clock out time
      const [autoHour, autoMinute] = shiftDetails.autoClockOutTime.split(':').map(Number);
      let autoClockOutMoment = moment.tz(`${todayStr} ${shiftDetails.autoClockOutTime}`, 'YYYY-MM-DD HH:mm', TIMEZONE);
      
      // If auto clock out is next day, add 1 day
      if (shiftDetails.autoClockOutIsNextDay) {
        autoClockOutMoment = autoClockOutMoment.add(1, 'day');
      }
      
      const diffMinutes = Math.floor(autoClockOutMoment.diff(currentTime, 'minutes', true));
      
      if (diffMinutes > 0) {
        timeRemaining = diffMinutes;
        autoClockOutStatus = 'pending';
      } else if (diffMinutes === 0) {
        autoClockOutStatus = 'due';
      } else {
        autoClockOutStatus = 'overdue';
      }
    }

    res.status(200).json({
      status: "success",
      data: {
        date: targetDate,
        dayStatus: {
          isWorkingDay: dayStatus.isWorkingDay,
          status: dayStatus.status,
          reason: dayStatus.reason
        },
        shiftDetails: {
          name: shiftDetails.name,
          start: shiftDetails.start,
          end: shiftDetails.end,
          autoClockOutTime: shiftDetails.autoClockOutTime,
          autoClockOutDelay: shiftDetails.autoClockOutDelay,
          autoClockOutIsNextDay: shiftDetails.autoClockOutIsNextDay || false,
          lateThreshold: shiftDetails.lateThreshold,
          earlyThreshold: shiftDetails.earlyThreshold,
          isNightShift: shiftDetails.isNightShift || false,
          source: shiftDetails.source
        },
        attendance: attendance ? {
          clockIn: attendance.clockIn,
          clockOut: attendance.clockOut,
          status: attendance.status,
          totalHours: attendance.totalHours,
          isLate: attendance.isLate,
          lateMinutes: attendance.lateMinutes,
          isEarly: attendance.isEarly,
          earlyMinutes: attendance.earlyMinutes,
          remarks: attendance.remarks
        } : null,
        autoClockOut: {
          status: autoClockOutStatus,
          timeRemaining,
          nextCheck: 'Every 5 minutes'
        },
        actions: {
          canClockIn: dayStatus.isWorkingDay && (!attendance || !attendance.clockIn),
          canClockOut: attendance && attendance.clockIn && !attendance.clockOut,
          isClockedIn: attendance && attendance.clockIn,
          isClockedOut: attendance && attendance.clockOut
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

// Quick Clock In/Out
exports.quickClockAction = async (req, res) => {
  try {
    const userId = req.user._id;
    const { action, location } = req.body;

    if (!action || !['clockin', 'clockout'].includes(action.toLowerCase())) {
      return res.status(400).json({
        status: "fail",
        message: "Valid action required: clockin or clockout"
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (action.toLowerCase() === 'clockin') {
      // Check if already clocked in
      const existingAttendance = await Attendance.findOne({
        employee: userId,
        date: today,
        clockIn: { $exists: true },
        isDeleted: false
      });

      if (existingAttendance && existingAttendance.clockIn) {
        return res.status(400).json({
          status: "fail",
          message: "Already clocked in today"
        });
      }

      // Call clockIn function
      req.body = { timestamp: new Date().toISOString(), location };
      return exports.clockIn(req, res);
    } else {
      // Check if clocked in
      const existingAttendance = await Attendance.findOne({
        employee: userId,
        date: today,
        clockIn: { $exists: true },
        clockOut: { $exists: false },
        isDeleted: false
      });

      if (!existingAttendance || !existingAttendance.clockIn) {
        return res.status(400).json({
          status: "fail",
          message: "Clock in first"
        });
      }

      if (existingAttendance.clockOut) {
        return res.status(400).json({
          status: "fail",
          message: "Already clocked out today"
        });
      }

      // Call clockOut function
      req.body = { timestamp: new Date().toISOString(), location };
      return exports.clockOut(req, res);
    }

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Attendance Notifications
exports.getAttendanceNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const notifications = [];
    
    // Check today's attendance status
    const attendance = await Attendance.findOne({
      employee: userId,
      date: today,
      isDeleted: false
    });

    const shiftDetails = await getEmployeeShiftDetails(userId, today);
    const dayStatus = await checkDayStatus(userId, today);

    // Notification for non-working day
    if (!dayStatus.isWorkingDay) {
      notifications.push({
        type: 'info',
        title: `${dayStatus.status}`,
        message: dayStatus.reason,
        priority: 'low',
        timestamp: new Date()
      });
    }

    // Notification if not clocked in on working day
    if (dayStatus.isWorkingDay && (!attendance || !attendance.clockIn)) {
      const currentHour = new Date().getHours();
      
      if (currentHour >= 9 && currentHour < 12) {
        notifications.push({
          type: 'warning',
          title: 'Clock In Reminder',
          message: 'You haven\'t clocked in yet today',
          priority: 'medium',
          timestamp: new Date()
        });
      }
    }

    // Notification for late clock in
    if (attendance && attendance.isLate) {
      notifications.push({
        type: 'warning',
        title: 'Late Arrival',
        message: `You were ${attendance.lateMinutes} minutes late today`,
        priority: 'medium',
        timestamp: new Date()
      });
    }

    // Notification for early clock in
    if (attendance && attendance.isEarly) {
      notifications.push({
        type: 'info',
        title: 'Early Arrival',
        message: `You arrived ${attendance.earlyMinutes} minutes early today`,
        priority: 'low',
        timestamp: new Date()
      });
    }

    // Notification for pending clock out
    if (attendance && attendance.clockIn && !attendance.clockOut) {
      const currentTime = new Date();
      const [endHour, endMinute] = shiftDetails.end.split(':').map(Number);
      const shiftEndTime = new Date(today);
      shiftEndTime.setHours(endHour, endMinute, 0, 0);
      
      if (currentTime >= shiftEndTime) {
        notifications.push({
          type: 'warning',
          title: 'Clock Out Reminder',
          message: 'Remember to clock out',
          priority: 'high',
          timestamp: new Date()
        });
      }
    }

    // Sort notifications by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    notifications.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

    res.status(200).json({
      status: "success",
      data: {
        total: notifications.length,
        unread: notifications.length,
        notifications
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// Get Attendance History by Date Range
exports.getAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, status, includeDetails = true } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        status: "fail",
        message: "Start date and end date are required"
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const matchCondition = {
      employee: userId,
      date: { $gte: start, $lte: end },
      isDeleted: false
    };

    if (status) {
      matchCondition.status = status;
    }

    const attendance = await Attendance.find(matchCondition)
      .sort({ date: -1 })
      .lean();

    // Get employee details
    const employee = await User.findById(userId).select('firstName lastName employeeId department');

    // Calculate summary
    const summary = {
      totalDays: attendance.length,
      present: 0,
      absent: 0,
      late: 0,
      early: 0,
      leave: 0,
      holiday: 0,
      weeklyOff: 0,
      totalHours: 0,
      averageHours: 0
    };

    attendance.forEach(record => {
      if (record.status === 'Present' || record.status === 'Late' || record.status === 'Early') {
        summary.present++;
        summary.totalHours += record.totalHours || 0;
        
        if (record.isLate) summary.late++;
        if (record.isEarly) summary.early++;
      } else if (record.status === 'Absent') {
        summary.absent++;
      } else if (record.status.includes('Leave')) {
        summary.leave++;
      } else if (record.status === 'Govt Holiday' || record.status === 'Off Day') {
        summary.holiday++;
      } else if (record.status === 'Weekly Off') {
        summary.weeklyOff++;
      }
    });

    summary.averageHours = summary.present > 0 ? parseFloat((summary.totalHours / summary.present).toFixed(2)) : 0;

    res.status(200).json({
      status: "success",
      data: {
        employee: {
          name: `${employee.firstName} ${employee.lastName}`,
          employeeId: employee.employeeId,
          department: employee.department
        },
        period: {
          startDate: start,
          endDate: end,
          totalDays: Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        },
        summary,
        records: includeDetails ? attendance.map(record => ({
          date: record.date,
          clockIn: record.clockIn,
          clockOut: record.clockOut,
          totalHours: record.totalHours,
          status: record.status,
          isLate: record.isLate,
          lateMinutes: record.lateMinutes,
          isEarly: record.isEarly,
          earlyMinutes: record.earlyMinutes,
          shift: record.shift,
          remarks: record.remarks,
          correctedByAdmin: record.correctedByAdmin,
          autoMarked: record.autoMarked,
          markedAbsent: record.markedAbsent
        })) : []
      }
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

module.exports = exports;