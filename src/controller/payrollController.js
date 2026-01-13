const Payroll = require('../models/PayrollModel');  
const User = require('../models/UsersModel');
const Attendance = require('../models/AttendanceModel');
const Leave = require('../models/LeaveModel');
const SalaryRule = require('../models/SalaryRuleModel');
const OfficeSchedule = require('../models/OfficeScheduleModel');
const OfficeScheduleOverride = require('../models/TemporaryOfficeSchedule');

// ==================== HELPER FUNCTIONS ====================

// Get working days from Office Schedule & Override
const getWorkingDaysForPeriod = async (periodStart, periodEnd) => {
  try {
    // Get active office schedule
    const schedule = await OfficeSchedule.findOne({ isActive: true });
    let weeklyOffDays = schedule?.weeklyOffDays || ['Friday', 'Saturday'];

    // Check for override in this period
    const override = await OfficeScheduleOverride.findOne({
      startDate: { $lte: periodEnd },
      endDate: { $gte: periodStart },
      isActive: true
    });

    if (override) {
      weeklyOffDays = override.weeklyOffDays;
    }

    // Calculate total working days in period (excluding weekly off)
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    let workingDays = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      if (!weeklyOffDays.includes(dayName)) {
        workingDays++;
      }
    }

    return {
      workingDays,
      weeklyOffDays,
      isOverride: !!override
    };
  } catch (error) {
    console.error('Error getting working days:', error);
    return {
      workingDays: 23, // Fallback to 23 days
      weeklyOffDays: ['Friday', 'Saturday'],
      isOverride: false
    };
  }
};

// Fetch all attendance data with overtime, late minutes, etc. (Using new Attendance Model)
const fetchAttendanceDetails = async (employeeId, periodStart, periodEnd) => {
  try {
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: { 
        $gte: new Date(periodStart), 
        $lte: new Date(periodEnd) 
      }
    }).sort({ date: 1 });

    // Initialize counters using new model structure
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let totalOvertimeHours = 0;
    let totalLateMinutes = 0;
    let totalOvertimeAmount = 0;
    let totalLateDeduction = 0;
    let totalAbsentDeduction = 0;
    let totalHalfDayDeduction = 0;
    let totalDailyEarnings = 0;

    attendanceRecords.forEach(record => {
      const status = record.status;
      
      switch(status) {
        case 'Present':
        case 'Clocked In':
        case 'Auto Clocked In':
          presentDays++;
          break;
        case 'Absent':
          absentDays++;
          break;
        case 'Late':
          lateDays++;
          presentDays++; // Late is still present
          break;
        case 'Half Day':
          halfDays++;
          presentDays += 0.5;
          break;
        case 'Leave':
          leaveDays++;
          presentDays++; // Leave is counted as present
          break;
      }

      // Get payroll metrics from new model
      if (record.payrollMetrics) {
        totalDailyEarnings += record.payrollMetrics.dailyEarnings || 0;
        totalOvertimeHours += record.payrollMetrics.overtimeHours || 0;
        totalOvertimeAmount += record.payrollMetrics.overtimeAmount || 0;
        totalLateMinutes += record.payrollMetrics.lateMinutes || 0;
        totalLateDeduction += record.payrollMetrics.lateDeduction || 0;
        totalAbsentDeduction += record.payrollMetrics.absentDeduction || 0;
        totalHalfDayDeduction += record.payrollMetrics.halfDayDeduction || 0;
      }
    });

    // Fetch leave details (optional - as we already have from attendance)
    const approvedLeaves = await Leave.find({
      employee: employeeId,
      status: 'Approved',
      $or: [
        { 
          startDate: { $lte: periodEnd, $gte: periodStart }
        },
        { 
          endDate: { $lte: periodEnd, $gte: periodStart }
        },
        {
          startDate: { $lte: periodStart },
          endDate: { $gte: periodEnd }
        }
      ]
    });

    // Process leave types
    const leaveTypesMap = new Map();
    let totalLeaveDays = 0;

    approvedLeaves.forEach(leave => {
      const leaveStart = new Date(Math.max(new Date(leave.startDate), new Date(periodStart)));
      const leaveEnd = new Date(Math.min(new Date(leave.endDate), new Date(periodEnd)));
      const diffTime = Math.abs(leaveEnd - leaveStart);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      totalLeaveDays += diffDays;
      const leaveType = leave.leaveType || 'Casual';
      leaveTypesMap.set(leaveType, (leaveTypesMap.get(leaveType) || 0) + diffDays);
    });

    // Convert map to array
    const leaveTypes = Array.from(leaveTypesMap.entries()).map(([type, days]) => ({
      type,
      days
    }));

    return {
      presentDays,
      absentDays,
      lateDays,
      halfDays,
      leaveDays: totalLeaveDays,
      leaveTypes,
      overtimeHours: totalOvertimeHours,
      overtimeAmount: totalOvertimeAmount,
      lateMinutes: totalLateMinutes,
      lateDeduction: totalLateDeduction,
      absentDeduction: totalAbsentDeduction,
      halfDayDeduction: totalHalfDayDeduction,
      dailyEarnings: totalDailyEarnings
    };
  } catch (error) {
    console.error('Error fetching attendance details:', error);
    throw error;
  }
};

// Number to Words function
const numberToWords = (num) => {
  // Simple implementation - you can use a library
  return new Intl.NumberFormat('en-BD').format(num) + ' Taka Only';
};

// ==================== MAIN CALCULATION FUNCTION ====================

// -------------------- Calculate Salary Automatically --------------------
const calculateSalary = async (employeeId, periodStart, periodEnd) => {
  try {
    // Fetch employee with salary rule
    const employee = await User.findById(employeeId)
      .select('firstName lastName employeeId salary salaryStructure department designation');
    
    if (!employee) {
      throw new Error('Employee not found');
    }

    // Get employee's actual salary from database
    let employeeSalary = 0;
    
    // Priority 1: Check salary structure
    if (employee.salaryStructure?.basicSalary > 0) {
      employeeSalary = employee.salaryStructure.basicSalary;
    }
    // Priority 2: Check salary field
    else if (employee.salary > 0) {
      employeeSalary = employee.salary;
    }
    // Priority 3: Use default
    else {
      employeeSalary = 30000; // Default fallback
    }

    console.log(`Employee Salary Calculation for ${employee.employeeId}:`);
    console.log(`- Employee ID: ${employee.employeeId}`);
    console.log(`- Name: ${employee.firstName} ${employee.lastName}`);
    console.log(`- Salary from DB: ${employeeSalary}`);
    console.log(`- Salary Structure:`, employee.salaryStructure);

    // Get working days for period
    const workingDaysInfo = await getWorkingDaysForPeriod(periodStart, periodEnd);
    const workingDaysPerMonth = workingDaysInfo.workingDays;

    // Get attendance details using new model
    const attendanceData = await fetchAttendanceDetails(employeeId, periodStart, periodEnd);

    // Calculate basic pay based on attendance (per day calculation)
    const dailyRate = employeeSalary / workingDaysPerMonth;
    const effectivePresentDays = attendanceData.presentDays + (attendanceData.halfDays * 0.5);
    const calculatedBasic = dailyRate * effectivePresentDays;

    // Calculate attendance percentage
    const attendancePercentage = workingDaysPerMonth > 0 
      ? (attendanceData.presentDays / workingDaysPerMonth) * 100 
      : 0;

    // Calculate totals from attendance metrics
    const totalAddition = attendanceData.overtimeAmount + attendanceData.dailyEarnings;
    const totalDeduction = attendanceData.lateDeduction + attendanceData.absentDeduction + attendanceData.halfDayDeduction;
    
    // Calculate net payable
    const netPayable = calculatedBasic + totalAddition - totalDeduction;

    return {
      basicPay: parseFloat(calculatedBasic.toFixed(2)),
      monthlyBasic: parseFloat(employeeSalary.toFixed(2)),
      presentDays: attendanceData.presentDays,
      absentDays: attendanceData.absentDays,
      lateDays: attendanceData.lateDays,
      halfDays: attendanceData.halfDays,
      leaveDays: attendanceData.leaveDays,
      totalWorkingDays: workingDaysPerMonth,
      attendancePercentage: parseFloat(attendancePercentage.toFixed(2)),
      totalAddition: parseFloat(totalAddition.toFixed(2)),
      totalDeduction: parseFloat(totalDeduction.toFixed(2)),
      netPayable: parseFloat(netPayable.toFixed(2)),
      overtime: {
        hours: attendanceData.overtimeHours,
        amount: parseFloat(attendanceData.overtimeAmount.toFixed(2)),
        rate: (dailyRate / 8) * 1.5 // Overtime rate (1.5x hourly rate)
      },
      leaveDeduction: parseFloat(attendanceData.absentDeduction.toFixed(2)),
      lateDeduction: parseFloat(attendanceData.lateDeduction.toFixed(2)),
      bonusAmount: 0, // Can be added based on rules
      rulesApplied: {
        salaryRuleId: null,
        ruleName: 'Attendance Based Calculation',
        calculationMethod: 'Per Day Attendance Based'
      },
      employeeDetails: {
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        designation: employee.designation
      },
      calculationPeriod: {
        start: periodStart,
        end: periodEnd,
        daysInPeriod: Math.ceil((new Date(periodEnd) - new Date(periodStart)) / (1000 * 60 * 60 * 24)) + 1
      },
      calculatedDate: new Date(),
      dailyRate: parseFloat(dailyRate.toFixed(2)),
      hourlyRate: parseFloat((dailyRate / 8).toFixed(2))
    };
  } catch (error) {
    console.error('Salary calculation error:', error);
    throw error;
  }
};

// ==================== PAYROLL CONTROLLER FUNCTIONS ====================

// -------------------- Create Payroll with Auto Calculation --------------------  
exports.createPayroll = async (req, res) => {
  try {
    const {
      employee,
      periodStart,
      periodEnd,
      status = 'Pending',
      
      // ✅ Accept frontend data (either partial or full)
      earnings,
      deductions,
      summary,
      attendance,
      netSalary,       // Individual field
      basicPay,        // Individual field
      monthlySalary    // Individual field
    } = req.body;

    // Validate required fields
    if (!employee || !periodStart || !periodEnd) {
      return res.status(400).json({ 
        status: "fail", 
        message: "Employee, periodStart and periodEnd are required" 
      });
    }

    const employeeData = await User.findById(employee);
    
    if (!employeeData) {
      return res.status(404).json({ 
        status: "fail", 
        message: "Employee not found" 
      });
    }

    // ✅ Check if frontend sent sufficient data for auto-calculation
    // We need either the full structured data OR the individual calculated values
    const hasFullFrontendData = earnings && deductions && summary;
    const hasSimpleFrontendData = netSalary !== undefined && basicPay !== undefined && monthlySalary !== undefined;
    
    let salaryCalculation;
    if (hasFullFrontendData || hasSimpleFrontendData) {
      // Use frontend provided data
      const presentDays = attendance?.presentDays || 23;
      const totalWorkingDays = attendance?.totalWorkingDays || 23;
      
      if (hasFullFrontendData) {
        // Use complete frontend data structure
        salaryCalculation = {
          monthlyBasic: monthlySalary || earnings?.basicPay || 30000,
          basicPay: basicPay || earnings?.basicPay || 0,
          netPayable: netSalary || summary?.netPayable || 0,
          presentDays: presentDays,
          totalWorkingDays: totalWorkingDays,
          lateDays: attendance?.lateDays || deductions?.lateDeduction > 0 ? 1 : 0,
          leaveDays: attendance?.leaveDays || deductions?.absentDeduction > 0 ? 1 : 0,
          overtime: {
            hours: attendance?.overtimeHours || 0,
            amount: earnings?.overtimeAmount || earnings?.overtime || 0,
            rate: 0
          },
          bonusAmount: earnings?.bonus || 0,
          lateDeduction: deductions?.lateDeduction || 0,
          leaveDeduction: deductions?.absentDeduction || 0,
          attendancePercentage: Math.round((presentDays / totalWorkingDays) * 100),
          rulesApplied: {
            ruleName: "Frontend Provided Calculation",
            calculationMethod: "Frontend Auto-calculation",
            salaryRuleId: "frontend"
          },
          dailyRate: Math.round((monthlySalary || earnings?.basicPay || 30000) / totalWorkingDays),
          hourlyRate: Math.round((monthlySalary || earnings?.basicPay || 30000) / totalWorkingDays / 8),
          calculatedDate: new Date()
        };
      } else {
        // Use simple frontend data (just the calculated values)
        salaryCalculation = {
          monthlyBasic: monthlySalary || 30000,
          basicPay: basicPay || 0,
          netPayable: netSalary || 0,
          presentDays: presentDays,
          totalWorkingDays: totalWorkingDays,
          lateDays: 0,
          leaveDays: 0,
          overtime: {
            hours: 0,
            amount: 0,
            rate: 0
          },
          bonusAmount: 0,
          lateDeduction: 0,
          leaveDeduction: 0,
          attendancePercentage: Math.round((presentDays / totalWorkingDays) * 100),
          rulesApplied: {
            ruleName: "Frontend Provided Calculation",
            calculationMethod: "Frontend Auto-calculation",
            salaryRuleId: "frontend"
          },
          dailyRate: Math.round((monthlySalary || 30000) / totalWorkingDays),
          hourlyRate: Math.round((monthlySalary || 30000) / totalWorkingDays / 8),
          calculatedDate: new Date()
        };
      }
    } else {
      // Use backend calculation
      salaryCalculation = await calculateSalary(employee, periodStart, periodEnd);
    }

    // Check if payroll already exists
    const existingPayroll = await Payroll.findOne({
      employee,
      periodStart: { $lte: periodEnd },
      periodEnd: { $gte: periodStart }
    });

    if (existingPayroll) {
      return res.status(400).json({
        status: "fail",
        message: "Payroll already exists for this period"
      });
    }

    // Create payroll - use whichever data is available
    const payroll = new Payroll({
      employee,
      periodStart,
      periodEnd,
      
      // Attendance Data
      attendanceData: {
        totalWorkingDays: salaryCalculation.totalWorkingDays,
        presentDays: salaryCalculation.presentDays,
        absentDays: salaryCalculation.absentDays || 
                   (salaryCalculation.totalWorkingDays - salaryCalculation.presentDays - (salaryCalculation.leaveDays || 0)),
        halfDays: salaryCalculation.halfDays || 0,
        lateDays: salaryCalculation.lateDays,
        leaveDays: salaryCalculation.leaveDays,
        overtimeHours: salaryCalculation.overtime.hours,
        attendancePercentage: salaryCalculation.attendancePercentage,
        leaveTypes: salaryCalculation.leaveTypes || []
      },
      
      // Salary Structure
      salaryStructure: {
        basicSalary: salaryCalculation.monthlyBasic,
        houseRent: 0,
        medicalAllowance: 0,
        conveyance: 0,
        otherAllowances: 0,
        grossSalary: salaryCalculation.monthlyBasic
      },
      
      // Earnings - Use frontend data if available
      earnings: earnings || {
        basicPay: salaryCalculation.basicPay,
        houseRent: 0,
        medicalAllowance: 0,
        conveyance: 0,
        overtimeAmount: salaryCalculation.overtime.amount,
        bonus: salaryCalculation.bonusAmount,
        incentives: 0,
        otherAdditions: 0,
        totalEarnings: salaryCalculation.basicPay + 
                      salaryCalculation.overtime.amount + 
                      salaryCalculation.bonusAmount
      },
      
      // Deductions - Use frontend data if available
      deductions: deductions || {
        absentDeduction: salaryCalculation.leaveDeduction,
        lateDeduction: salaryCalculation.lateDeduction,
        halfDayDeduction: 0,
        unpaidLeaveDeduction: 0,
        advanceDeduction: 0,
        taxDeduction: 0,
        providentFund: 0,
        otherDeductions: 0,
        totalDeductions: salaryCalculation.lateDeduction + 
                        salaryCalculation.leaveDeduction
      },
      
      // Summary - Create from available data
      summary: summary || {
        grossEarnings: (earnings?.totalEarnings) || 
                      (salaryCalculation.basicPay + 
                       salaryCalculation.overtime.amount + 
                       salaryCalculation.bonusAmount),
        totalDeductions: (deductions?.totalDeductions) || 
                        (salaryCalculation.lateDeduction + 
                         salaryCalculation.leaveDeduction),
        netPayable: salaryCalculation.netPayable,
        inWords: numberToWords(salaryCalculation.netPayable)
      },
      
      status: status,
      
      // Calculation Details
      calculation: {
        salaryRule: salaryCalculation.rulesApplied?.salaryRuleId || "frontend",
        ruleApplied: salaryCalculation.rulesApplied?.ruleName || "Frontend Provided",
        calculationMethod: (hasFullFrontendData || hasSimpleFrontendData) ? 
                          "Frontend Auto-calculation" : 
                          salaryCalculation.rulesApplied?.calculationMethod || "Backend Calculation",
        dailyRate: salaryCalculation.dailyRate,
        hourlyRate: salaryCalculation.hourlyRate,
        overtimeRate: salaryCalculation.overtime.rate,
        calculationDate: salaryCalculation.calculatedDate,
        calculatedBy: req.user?._id,
        dataSource: (hasFullFrontendData || hasSimpleFrontendData) ? "frontend" : "backend"
      },
      
      // Metadata
      metadata: {
        autoGenerated: false,
        generatedDate: new Date(),
        isLocked: false,
        version: 1,
        frontendProvided: hasFullFrontendData || hasSimpleFrontendData
      },
      
      notes: (hasFullFrontendData || hasSimpleFrontendData) 
        ? `Created with frontend auto-calculation (${salaryCalculation.totalWorkingDays} days month)` 
        : `Created with backend auto calculation based on attendance data`
    });

    await payroll.save();

    res.status(201).json({
      status: "success",
      message: "Payroll created successfully",
      dataSource: (hasFullFrontendData || hasSimpleFrontendData) ? "frontend" : "backend",
      data: payroll
    });

  } catch (error) {
    console.error('Create payroll error:', error);
    res.status(500).json({ 
      status: "fail", 
      message: error.message 
    });
  }
};

// ==================== AUTO CALCULATION FUNCTIONS ====================

// -------------------- Auto Calculate Payroll from Attendance --------------------
exports.calculatePayrollFromAttendance = async (req, res) => {
  try {
    const { employeeId, periodStart, periodEnd } = req.body;

    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({
        status: 'fail',
        message: 'Employee ID, periodStart, and periodEnd are required'
      });
    }

    // Use the calculateSalary function
    const salaryCalculation = await calculateSalary(employeeId, periodStart, periodEnd);

    // Format response for frontend
    const formattedResponse = {
      employeeDetails: {
        name: salaryCalculation.employeeDetails.name,
        employeeId: salaryCalculation.employeeDetails.employeeId,
        department: salaryCalculation.employeeDetails.department,
        designation: salaryCalculation.employeeDetails.designation
      },
      periodStart: salaryCalculation.calculationPeriod.start,
      periodEnd: salaryCalculation.calculationPeriod.end,
      presentDays: salaryCalculation.presentDays,
      attendancePercentage: salaryCalculation.attendancePercentage,
      basicPay: salaryCalculation.basicPay,
      monthlyBasic: salaryCalculation.monthlyBasic,
      overtime: salaryCalculation.overtime,
      totalAddition: salaryCalculation.totalAddition,
      lateDeduction: salaryCalculation.lateDeduction,
      leaveDeduction: salaryCalculation.leaveDeduction,
      bonusAmount: salaryCalculation.bonusAmount,
      totalDeduction: salaryCalculation.totalDeduction,
      netPayable: salaryCalculation.netPayable,
      rulesApplied: salaryCalculation.rulesApplied
    };

    res.status(200).json({
      status: 'success',
      message: 'Payroll calculated from attendance successfully',
      data: formattedResponse
    });

  } catch (error) {
    console.error('Calculate payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// -------------------- Auto Generate Payroll with Attendance Data --------------------
exports.autoGeneratePayroll = async (req, res) => {
  try {
    const { employeeId, periodStart, periodEnd } = req.body;

    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({
        status: 'fail',
        message: 'Employee ID, periodStart, and periodEnd are required'
      });
    }

    // Check if payroll already exists
    const existingPayroll = await Payroll.findOne({
      employee: employeeId,
      periodStart: { $lte: new Date(periodEnd) },
      periodEnd: { $gte: new Date(periodStart) }
    });

    if (existingPayroll) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payroll already exists for this period',
        data: existingPayroll
      });
    }

    // Calculate salary
    const salaryCalculation = await calculateSalary(employeeId, periodStart, periodEnd);

    // Create payroll
    const payroll = new Payroll({
      employee: employeeId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      
      // Attendance Data
      attendanceData: {
        totalWorkingDays: salaryCalculation.totalWorkingDays,
        presentDays: salaryCalculation.presentDays,
        absentDays: salaryCalculation.absentDays,
        halfDays: salaryCalculation.halfDays,
        lateDays: salaryCalculation.lateDays,
        leaveDays: salaryCalculation.leaveDays,
        overtimeHours: salaryCalculation.overtime.hours,
        attendancePercentage: salaryCalculation.attendancePercentage,
        leaveTypes: []
      },
      
      // Salary Structure
      salaryStructure: {
        basicSalary: salaryCalculation.monthlyBasic,
        houseRent: 0,
        medicalAllowance: 0,
        conveyance: 0,
        otherAllowances: 0,
        grossSalary: salaryCalculation.monthlyBasic
      },
      
      // Earnings
      earnings: {
        basicPay: salaryCalculation.basicPay,
        houseRent: 0,
        medicalAllowance: 0,
        conveyance: 0,
        overtimeAmount: salaryCalculation.overtime.amount,
        bonus: salaryCalculation.bonusAmount,
        incentives: 0,
        otherAdditions: 0,
        totalEarnings: salaryCalculation.basicPay + salaryCalculation.overtime.amount + salaryCalculation.bonusAmount
      },
      
      // Deductions
      deductions: {
        absentDeduction: 0,
        lateDeduction: salaryCalculation.lateDeduction,
        halfDayDeduction: 0,
        unpaidLeaveDeduction: salaryCalculation.leaveDeduction,
        advanceDeduction: 0,
        taxDeduction: 0,
        providentFund: 0,
        otherDeductions: 0,
        totalDeductions: salaryCalculation.lateDeduction + salaryCalculation.leaveDeduction
      },
      
      // Summary
      summary: {
        grossEarnings: salaryCalculation.basicPay + salaryCalculation.overtime.amount + salaryCalculation.bonusAmount,
        totalDeductions: salaryCalculation.lateDeduction + salaryCalculation.leaveDeduction,
        netPayable: salaryCalculation.netPayable,
        inWords: numberToWords(salaryCalculation.netPayable)
      },
      
      status: 'Pending',
      
      // Calculation Details
      calculation: {
        salaryRule: salaryCalculation.rulesApplied.salaryRuleId,
        ruleApplied: salaryCalculation.rulesApplied.ruleName,
        calculationMethod: salaryCalculation.rulesApplied.calculationMethod,
        dailyRate: salaryCalculation.dailyRate,
        hourlyRate: salaryCalculation.hourlyRate,
        overtimeRate: salaryCalculation.overtime.rate,
        calculationDate: new Date(),
        calculatedBy: req.user._id
      },
      
      // Metadata
      metadata: {
        autoGenerated: true,
        generatedBy: req.user._id,
        generatedDate: new Date(),
        isLocked: false,
        version: 1,
        source: 'Attendance Auto Calculation'
      },
      
      notes: `Auto-generated from attendance data: ${periodStart} to ${periodEnd}`
    });

    await payroll.save();

    // Update attendance records with payroll ID
    await Attendance.updateMany(
      {
        employee: employeeId,
        date: {
          $gte: new Date(periodStart),
          $lte: new Date(periodEnd)
        }
      },
      {
        $set: {
          'payrollMetrics.payrollId': payroll._id,
          'payrollMetrics.calculatedAt': new Date(),
          'payrollMetrics.calculatedBy': req.user._id
        }
      }
    );

    res.status(201).json({
      status: 'success',
      message: 'Payroll auto-generated successfully',
      data: payroll
    });

  } catch (error) {
    console.error('Auto generate payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// -------------------- Bulk Auto Generate Payroll --------------------
exports.bulkAutoGeneratePayroll = async (req, res) => {
  try {
    const { periodStart, periodEnd } = req.body;

    // Get all active employees
    const employees = await User.find({
      status: 'Active',
      role: { $nin: ['admin', 'superadmin'] }
    }).select('_id employeeId firstName lastName');

    const results = {
      total: employees.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    // Generate payroll for each employee
    for (const employee of employees) {
      try {
        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          employee: employee._id,
          periodStart: { $lte: new Date(periodEnd) },
          periodEnd: { $gte: new Date(periodStart) }
        });

        if (existingPayroll) {
          results.skipped++;
          results.details.push({
            employeeId: employee.employeeId,
            status: 'skipped',
            reason: 'Payroll already exists'
          });
          continue;
        }

        // Generate payroll
        await this.autoGeneratePayroll({
          body: {
            employeeId: employee._id,
            periodStart,
            periodEnd
          },
          user: req.user
        });

        results.success++;
        results.details.push({
          employeeId: employee.employeeId,
          status: 'success',
          message: 'Payroll generated'
        });

      } catch (error) {
        results.failed++;
        results.details.push({
          employeeId: employee.employeeId,
          status: 'failed',
          reason: error.message
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Bulk payroll generation completed. Success: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`,
      data: results
    });

  } catch (error) {
    console.error('Bulk auto generate error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// ==================== EXISTING FUNCTIONS ====================

// -------------------- Get All Payrolls --------------------
exports.getAllPayrolls = async (req, res) => {
  try {
    const payrolls = await Payroll.find()
      .populate(
        'employee',
        'firstName lastName email employeeId salary salaryStructure department designation'
      )
      .sort({ periodStart: -1 });

    res.status(200).json({
      status: "success",
      payrolls
    });

  } catch (error) {
    res.status(500).json({
      status: "fail",
      message: error.message
    });
  }
};

// -------------------- Get Payroll by ID --------------------
exports.getPayrollById = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate('employee', 'firstName lastName email employeeId salary salaryStructure department designation');

    if (!payroll) {
      return res.status(404).json({ status: "fail", message: "Payroll not found" });
    }

    // Get related attendance records
    const attendanceRecords = await Attendance.find({
      employee: payroll.employee._id,
      date: {
        $gte: payroll.periodStart,
        $lte: payroll.periodEnd
      },
      'payrollMetrics.payrollId': payroll._id
    }).sort({ date: 1 });

    // Calculate attendance percentage if not present
    if (!payroll.attendanceData.attendancePercentage && payroll.attendanceData.totalWorkingDays > 0) {
      payroll.attendanceData.attendancePercentage = 
        (payroll.attendanceData.presentDays / payroll.attendanceData.totalWorkingDays) * 100;
    }

    res.status(200).json({ 
      status: "success", 
      data: {
        payroll,
        attendanceRecords
      }
    });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

// -------------------- Update Payroll Status --------------------
exports.updatePayrollStatus = async (req, res) => {
  try {
    const { status, employeeApproved } = req.body;

    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ status: "fail", message: "Payroll not found" });
    }

    // Update status
    if (status) payroll.status = status;
    
    // Mark employee approval
    if (employeeApproved !== undefined) {
      payroll.employeeApproved = employeeApproved;
      payroll.employeeApprovedAt = employeeApproved ? new Date() : null;
    }

    await payroll.save();

    res.status(200).json({ 
      status: "success", 
      message: "Payroll updated successfully", 
      payroll 
    });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

// -------------------- Delete Payroll --------------------
exports.deletePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findByIdAndDelete(req.params.id);
    if (!payroll) {
      return res.status(404).json({ status: "fail", message: "Payroll not found" });
    }

    // Remove payroll reference from attendance records
    await Attendance.updateMany(
      { 'payrollMetrics.payrollId': req.params.id },
      {
        $unset: {
          'payrollMetrics.payrollId': '',
          'payrollMetrics.calculatedAt': '',
          'payrollMetrics.calculatedBy': ''
        }
      }
    );

    res.status(200).json({ status: "success", message: "Payroll deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

// -------------------- Generate Payroll for All Employees --------------------
exports.generateMonthlyPayroll = async (req, res) => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    // Set period for previous month
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of previous month

    // Get all active employees
    const employees = await User.find({ 
      status: 'Active',
      role: { $ne: 'admin' } // Exclude admins
    });

    const generatedPayrolls = [];
    const errors = [];

    // Generate payroll for each employee
    for (const employee of employees) {
      try {
        // Calculate salary using the enhanced function
        const salaryCalculation = await calculateSalary(employee._id, periodStart, periodEnd);

        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          employee: employee._id,
          periodStart: periodStart,
          periodEnd: periodEnd
        });

        if (existingPayroll) {
          continue; // Skip if already exists
        }

        // Create payroll with detailed data
        const payroll = new Payroll({
          employee: employee._id,
          periodStart,
          periodEnd,
          
          // Attendance Data
          attendanceData: {
            totalWorkingDays: salaryCalculation.totalWorkingDays,
            presentDays: salaryCalculation.presentDays,
            absentDays: salaryCalculation.absentDays,
            lateDays: salaryCalculation.lateDays,
            leaveDays: salaryCalculation.leaveDays,
            overtimeHours: salaryCalculation.overtime.hours,
            attendancePercentage: salaryCalculation.attendancePercentage
          },
          
          // Salary Structure
          salaryStructure: {
            basicSalary: salaryCalculation.monthlyBasic,
            grossSalary: salaryCalculation.monthlyBasic
          },
          
          // Earnings
          earnings: {
            basicPay: salaryCalculation.basicPay,
            overtimeAmount: salaryCalculation.overtime.amount,
            bonus: salaryCalculation.bonusAmount,
            totalEarnings: salaryCalculation.basicPay + salaryCalculation.totalAddition
          },
          
          // Deductions
          deductions: {
            lateDeduction: salaryCalculation.lateDeduction,
            unpaidLeaveDeduction: salaryCalculation.leaveDeduction,
            totalDeductions: salaryCalculation.totalDeduction
          },
          
          // Summary
          summary: {
            grossEarnings: salaryCalculation.basicPay + salaryCalculation.totalAddition,
            totalDeductions: salaryCalculation.totalDeduction,
            netPayable: salaryCalculation.netPayable,
            inWords: numberToWords(salaryCalculation.netPayable)
          },
          
          status: 'Pending',
          
          // Calculation Details
          calculation: {
            salaryRule: salaryCalculation.rulesApplied.salaryRuleId,
            ruleApplied: salaryCalculation.rulesApplied.ruleName,
            calculationMethod: salaryCalculation.rulesApplied.calculationMethod,
            calculationDate: salaryCalculation.calculatedDate
          },
          
          // Metadata
          metadata: {
            autoGenerated: true,
            generatedDate: new Date(),
            version: 1
          },
          
          notes: 'Monthly auto-generated payroll'
        });

        await payroll.save();
        generatedPayrolls.push(payroll._id);

      } catch (error) {
        errors.push(`Error for ${employee.employeeId}: ${error.message}`);
      }
    }

    res.status(200).json({
      status: "success",
      message: `Generated ${generatedPayrolls.length} payrolls for ${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`,
      generatedCount: generatedPayrolls.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Monthly payroll generation error:', error);
    res.status(500).json({ 
      status: "fail", 
      message: error.message 
    });
  }
};

// -------------------- Get Employee Payrolls --------------------
exports.getEmployeePayrolls = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    
    const payrolls = await Payroll.find({ employee: employeeId })
      .sort({ periodStart: -1 })
      .populate('employee', 'firstName lastName employeeId');

    res.status(200).json({
      status: "success",
      payrolls
    });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

// -------------------- Accept/Reject Payroll by Employee --------------------
exports.employeeActionOnPayroll = async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    const { id } = req.params;
    
    const payroll = await Payroll.findById(id);
    if (!payroll) {
      return res.status(404).json({ status: "fail", message: "Payroll not found" });
    }

    // Check if payroll belongs to the requesting employee
    // (Add authentication check in production)

    if (action === 'accept') {
      payroll.employeeApproved = true;
      payroll.employeeApprovedAt = new Date();
      payroll.status = 'Paid'; // Auto approve after employee acceptance
      payroll.paymentDate = new Date();
    } else if (action === 'reject') {
      payroll.employeeApproved = false;
      payroll.employeeApprovedAt = new Date();
      payroll.status = 'Rejected';
      payroll.rejectionReason = req.body.reason || '';
    }

    await payroll.save();

    res.status(200).json({
      status: "success",
      message: `Payroll ${action}ed successfully`,
      payroll
    });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};

// -------------------- Get Payroll by Employee and Period --------------------
exports.getPayrollByEmployeeAndPeriod = async (req, res) => {
  try {
    const { employeeId, periodStart, periodEnd } = req.query;
    
    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({
        status: "fail",
        message: "Employee ID, periodStart and periodEnd are required"
      });
    }

    const payroll = await Payroll.findOne({
      employee: employeeId,
      periodStart: { $lte: new Date(periodEnd) },
      periodEnd: { $gte: new Date(periodStart) }
    }).populate('employee', 'firstName lastName employeeId department designation');

    if (!payroll) {
      return res.status(404).json({
        status: "fail",
        message: "No payroll found for this period"
      });
    }

    // Get attendance records for this payroll
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: {
        $gte: new Date(periodStart),
        $lte: new Date(periodEnd)
      }
    }).sort({ date: 1 });

    res.status(200).json({
      status: "success",
      data: {
        payroll,
        attendanceRecords
      }
    });
  } catch (error) {
    res.status(500).json({ status: "fail", message: error.message });
  }
};
// payrollController.js-এ
exports.createPayrollWithData = async (req, res) => {
  try {
    const {
      employee,
      periodStart,
      periodEnd,
      status = 'Pending',
      earnings,
      deductions,
      summary,
      attendance,
      netSalary,
      basicPay,
      monthlySalary,
      notes
    } = req.body;

    // Validate
    if (!employee || !periodStart || !periodEnd) {
      return res.status(400).json({ 
        status: "fail", 
        message: "Required fields missing" 
      });
    }

    const employeeData = await User.findById(employee);
    if (!employeeData) {
      return res.status(404).json({ 
        status: "fail", 
        message: "Employee not found" 
      });
    }

    // Check existing payroll
    const existing = await Payroll.findOne({
      employee,
      periodStart: { $lte: periodEnd },
      periodEnd: { $gte: periodStart }
    });

    if (existing) {
      return res.status(400).json({
        status: "fail",
        message: "Payroll already exists"
      });
    }

    // Create payroll with provided data
    const payroll = new Payroll({
      employee,
      periodStart,
      periodEnd,
      status,
      
      // Use provided data
      earnings: earnings || {
        basicPay: basicPay || 0,
        overtimeAmount: 0,
        bonus: 0,
        totalEarnings: basicPay || 0
      },
      
      deductions: deductions || {
        lateDeduction: 0,
        absentDeduction: 0,
        totalDeductions: 0
      },
      
      summary: summary || {
        grossEarnings: basicPay || 0,
        totalDeductions: 0,
        netPayable: netSalary || basicPay || 0,
        inWords: numberToWords(netSalary || basicPay || 0)
      },
      
      attendanceData: attendance || {
        totalWorkingDays: 23,
        presentDays: 23,
        attendancePercentage: 100
      },
      
      calculation: {
        calculationMethod: "Frontend Auto-calculation (23 days month)",
        dataSource: "frontend",
        calculatedBy: req.user?._id
      },
      
      metadata: {
        autoGenerated: false,
        frontendProvided: true,
        createdFrom: "frontend-ui"
      },
      
      notes: notes || "Created from frontend with auto calculation"
    });

    await payroll.save();

    res.status(201).json({
      status: "success",
      message: "Payroll created with frontend data",
      data: payroll
    });

  } catch (error) {
    console.error('Create payroll with data error:', error);
    res.status(500).json({ 
      status: "fail", 
      message: error.message 
    });
  }
};