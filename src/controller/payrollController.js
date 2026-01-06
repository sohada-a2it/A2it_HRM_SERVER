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

// Fetch all attendance data with overtime, late minutes, etc.
const fetchAttendanceDetails = async (employeeId, periodStart, periodEnd) => {
  try {
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: { 
        $gte: new Date(periodStart), 
        $lte: new Date(periodEnd) 
      }
    }).sort({ date: 1 });

    // Initialize counters
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let totalOvertimeHours = 0;
    let totalLateMinutes = 0;

    attendanceRecords.forEach(record => {
      const status = record.status?.toLowerCase();
      
      switch(status) {
        case 'present':
        case 'clocked in':
          presentDays++;
          break;
        case 'absent':
          absentDays++;
          break;
        case 'late':
          lateDays++;
          presentDays++; // Late is still present
          if (record.lateMinutes) {
            totalLateMinutes += record.lateMinutes;
          }
          break;
        case 'half day':
        case 'halfday':
          halfDays++;
          presentDays += 0.5;
          break;
      }

      // Calculate overtime
      if (record.totalHours > 8) {
        totalOvertimeHours += (record.totalHours - 8);
      } else if (record.overtimeHours) {
        totalOvertimeHours += record.overtimeHours;
      }
    });

    // Fetch leave details
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
      lateMinutes: totalLateMinutes
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

// ==================== EXISTING FUNCTIONS (Modified) ====================

// -------------------- Calculate Salary Automatically --------------------
const calculateSalary = async (employeeId, periodStart, periodEnd) => {
  try {
    // Fetch employee with salary rule
    const employee = await User.findById(employeeId)
      .populate('salaryRule');
    
    if (!employee) {
      throw new Error('Employee not found');
    }

    // Get salary rule
    let salaryRule;
    if (employee.salaryRule) {
      salaryRule = employee.salaryRule;
    } else {
      salaryRule = await SalaryRule.findOne({ isActive: true }).sort({ createdAt: -1 });
    }

    if (!salaryRule) {
      salaryRule = {
        _id: null,
        title: 'Default Salary Rule',
        rate: employee.salary || 30000,
        workingDaysPerMonth: 26,
        perDaySalaryCalculation: true,
        overtimeEnabled: false,
        overtimeRate: 0,
        leaveRule: { enabled: false, paidLeaves: 0, perDayDeduction: 0 },
        lateRule: { enabled: false, lateDaysThreshold: 3, equivalentLeaveDays: 0.5 },
        bonusAmount: 0,
        bonusConditions: '',
        components: [],
        isActive: true
      };
    }

    // Get working days from office schedule
    const periodInfo = await getWorkingDaysForPeriod(periodStart, periodEnd);
    const workingDaysPerMonth = periodInfo.workingDays;

    // Get attendance data
    const attendanceData = await fetchAttendanceDetails(employeeId, periodStart, periodEnd);

    // Calculate employee's monthly salary
    let monthlyBasic = 0;
    
    if (employee.salary > 0) {
      monthlyBasic = employee.salary;
    } else if (employee.rate > 0) {
      switch(employee.salaryType) {
        case 'hourly':
          monthlyBasic = employee.rate * 8 * workingDaysPerMonth;
          break;
        case 'daily':
          monthlyBasic = employee.rate * workingDaysPerMonth;
          break;
        case 'weekly':
          monthlyBasic = employee.rate * 4;
          break;
        case 'monthly':
          monthlyBasic = employee.rate;
          break;
        case 'project':
          monthlyBasic = employee.rate;
          break;
        default:
          monthlyBasic = employee.rate || 0;
      }
    } else {
      monthlyBasic = salaryRule.rate || 0;
    }

    // Calculate basic pay based on attendance
    let calculatedBasic = monthlyBasic;
    const perDaySalaryCalculation = salaryRule.perDaySalaryCalculation !== false;
    
    if (perDaySalaryCalculation && workingDaysPerMonth > 0) {
      const effectivePresentDays = attendanceData.presentDays + (attendanceData.halfDays * 0.5);
      calculatedBasic = (monthlyBasic / workingDaysPerMonth) * effectivePresentDays;
    }

    // Calculate attendance percentage
    const attendancePercentage = workingDaysPerMonth > 0 
      ? (attendanceData.presentDays / workingDaysPerMonth) * 100 
      : 0;

    // Calculate all components based on salary rule structure
    const components = {};
    let totalAddition = 0;
    let totalDeduction = 0;

    // Handle different salary rule structures
    if (salaryRule.components && Array.isArray(salaryRule.components)) {
      salaryRule.components.forEach(component => {
        let amount = 0;
        
        if (component.type === 'percentage') {
          amount = (calculatedBasic * component.value) / 100;
        } else if (component.type === 'fixed') {
          amount = component.value;
        } else if (component.type === 'attendance_based') {
          if (component.condition === 'attendance_above_95' && attendancePercentage >= 95) {
            amount = component.value;
          }
        }
        
        components[component.name] = amount;
        
        if (component.category === 'addition') {
          totalAddition += amount;
        } else if (component.category === 'deduction') {
          totalDeduction += amount;
        }
      });
    }

    // Calculate overtime if enabled
    let overtimeAmount = 0;
    if (salaryRule.overtimeEnabled && salaryRule.overtimeRate) {
      overtimeAmount = attendanceData.overtimeHours * salaryRule.overtimeRate;
      totalAddition += overtimeAmount;
      components['Overtime'] = overtimeAmount;
    }

    // Calculate leave deductions if enabled
    let leaveDeduction = 0;
    if (salaryRule.leaveRule && salaryRule.leaveRule.enabled) {
      const paidLeaves = salaryRule.leaveRule.paidLeaves || 0;
      const perDayDeduction = salaryRule.leaveRule.perDayDeduction || 0;
      
      if (attendanceData.leaveDays > paidLeaves) {
        const extraLeaves = attendanceData.leaveDays - paidLeaves;
        leaveDeduction = extraLeaves * perDayDeduction;
        totalDeduction += leaveDeduction;
        components['Leave Deduction'] = leaveDeduction;
      }
    }

    // Calculate late deductions if enabled
    let lateDeduction = 0;
    if (salaryRule.lateRule && salaryRule.lateRule.enabled) {
      const lateThreshold = salaryRule.lateRule.lateDaysThreshold || 3;
      const equivalentLeaveDays = salaryRule.lateRule.equivalentLeaveDays || 0.5;
      const perDaySalary = monthlyBasic / workingDaysPerMonth;
      
      if (attendanceData.lateDays > lateThreshold) {
        const extraLateDays = attendanceData.lateDays - lateThreshold;
        const equivalentLeaveCount = extraLateDays * equivalentLeaveDays;
        lateDeduction = equivalentLeaveCount * perDaySalary;
        totalDeduction += lateDeduction;
        components['Late Deduction'] = lateDeduction;
      }
    }

    // Add bonus if conditions met
    let bonusAmount = 0;
    if (salaryRule.bonusAmount && salaryRule.bonusConditions) {
      const conditions = salaryRule.bonusConditions.toLowerCase();
      let bonusEligible = true;
      
      if (conditions.includes('attendance_above_90') && attendancePercentage < 90) {
        bonusEligible = false;
      }
      if (conditions.includes('no_late') && attendanceData.lateDays > 0) {
        bonusEligible = false;
      }
      
      if (bonusEligible) {
        bonusAmount = salaryRule.bonusAmount;
        totalAddition += bonusAmount;
        components['Performance Bonus'] = bonusAmount;
      }
    }

    // Calculate tax deduction (10% if salary > 40000)
    let taxDeduction = 0;
    const grossSalary = calculatedBasic + totalAddition;
    if (grossSalary > 40000) {
      taxDeduction = grossSalary * 0.10;
      totalDeduction += taxDeduction;
      components['Tax Deduction'] = taxDeduction;
    }

    // Calculate net payable
    const netPayable = grossSalary - totalDeduction;

    return {
      basicPay: parseFloat(calculatedBasic.toFixed(2)),
      monthlyBasic: parseFloat(monthlyBasic.toFixed(2)),
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
      components,
      overtime: {
        enabled: salaryRule.overtimeEnabled,
        amount: parseFloat(overtimeAmount.toFixed(2)),
        rate: salaryRule.overtimeRate,
        hours: attendanceData.overtimeHours
      },
      leaveDeduction: parseFloat(leaveDeduction.toFixed(2)),
      lateDeduction: parseFloat(lateDeduction.toFixed(2)),
      bonusAmount: parseFloat(bonusAmount.toFixed(2)),
      rulesApplied: {
        salaryRuleId: salaryRule._id,
        ruleName: salaryRule.title || 'Default Rule',
        calculationMethod: perDaySalaryCalculation ? 'Per Day' : 'Monthly Fixed'
      },
      employeeDetails: {
        employeeId: employee.employeeId,
        name: employee.fullName || `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        designation: employee.designation
      },
      calculationPeriod: {
        start: periodStart,
        end: periodEnd,
        daysInPeriod: Math.ceil((new Date(periodEnd) - new Date(periodStart)) / (1000 * 60 * 60 * 24)) + 1
      },
      calculatedDate: new Date()
    };
  } catch (error) {
    console.error('Salary calculation error:', error);
    throw error;
  }
};

// -------------------- Create Payroll with Auto Calculation --------------------  
exports.createPayroll = async (req, res) => {
  try {
    const {
      employee,
      periodStart,
      periodEnd,
      status = 'Pending'
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

    // ✅ Use the enhanced calculateSalary function
    const salaryCalculation = await calculateSalary(employee, periodStart, periodEnd);

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

    // Create payroll with detailed data
    const payroll = new Payroll({
      employee,
      periodStart,
      periodEnd,
      
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
        leaveTypes: [] // Populate if needed
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
        otherAdditions: salaryCalculation.totalAddition - salaryCalculation.overtime.amount - salaryCalculation.bonusAmount,
        totalEarnings: salaryCalculation.basicPay + salaryCalculation.totalAddition
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
        otherDeductions: salaryCalculation.totalDeduction - salaryCalculation.lateDeduction - salaryCalculation.leaveDeduction,
        totalDeductions: salaryCalculation.totalDeduction
      },
      
      // Summary
      summary: {
        grossEarnings: salaryCalculation.basicPay + salaryCalculation.totalAddition,
        totalDeductions: salaryCalculation.totalDeduction,
        netPayable: salaryCalculation.netPayable,
        inWords: numberToWords(salaryCalculation.netPayable)
      },
      
      status: status,
      
      // Calculation Details
      calculation: {
        salaryRule: salaryCalculation.rulesApplied.salaryRuleId,
        ruleApplied: salaryCalculation.rulesApplied.ruleName,
        calculationMethod: salaryCalculation.rulesApplied.calculationMethod,
        dailyRate: salaryCalculation.monthlyBasic / salaryCalculation.totalWorkingDays,
        hourlyRate: (salaryCalculation.monthlyBasic / salaryCalculation.totalWorkingDays) / 8,
        overtimeRate: salaryCalculation.overtime.rate,
        calculationDate: salaryCalculation.calculatedDate,
        calculatedBy: req.user?._id
      },
      
      // Metadata
      metadata: {
        autoGenerated: false,
        generatedDate: new Date(),
        isLocked: false,
        version: 1
      },
      
      notes: `Created with auto calculation based on attendance data`
    });

    await payroll.save();

    res.status(201).json({
      status: "success",
      message: "Payroll created successfully with auto calculation",
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

// ==================== NEW AUTO CALCULATION FUNCTIONS ====================

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

    // Use existing calculateSalary function
    const salaryCalculation = await calculateSalary(employeeId, periodStart, periodEnd);

    res.status(200).json({
      status: 'success',
      message: 'Payroll calculated from attendance successfully',
      data: salaryCalculation
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

    // Get employee info
    const employee = await User.findById(employeeId)
      .select('firstName lastName employeeId');

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
        dailyRate: salaryCalculation.monthlyBasic / salaryCalculation.totalWorkingDays,
        hourlyRate: (salaryCalculation.monthlyBasic / salaryCalculation.totalWorkingDays) / 8,
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

// ==================== EXISTING FUNCTIONS (Keep as is) ====================

// -------------------- Get All Payrolls --------------------
exports.getAllPayrolls = async (req, res) => {
  try {
    const payrolls = await Payroll.find()
      .populate(
        'employee',
        'firstName lastName email employeeId role salary'
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
      .populate('employee', 'firstName lastName email employeeId role salary department')
      .populate('calculation.salaryRule');

    if (!payroll) {
      return res.status(404).json({ status: "fail", message: "Payroll not found" });
    }

    // Calculate attendance percentage if not present
    if (!payroll.attendanceData.attendancePercentage && payroll.attendanceData.totalWorkingDays > 0) {
      payroll.attendanceData.attendancePercentage = 
        (payroll.attendanceData.presentDays / payroll.attendanceData.totalWorkingDays) * 100;
    }

    res.status(200).json({ 
      status: "success", 
      payroll 
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