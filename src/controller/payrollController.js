const Payroll = require('../models/PayrollModel');
const User = require('../models/UsersModel');
const Attendance = require('../models/AttendanceModel');
const Leave = require('../models/LeaveModel');
const Holiday = require('../models/HolidayModel');
const OfficeSchedule = require('../models/OfficeScheduleModel');
const foodCost = require('../models/foodCostModel'); 

// ========== HELPER FUNCTIONS ==========
// Helper function for currency formatting
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0).replace('BDT', '৳');
};
// Calculate working days - হলিডে এবং অফডে অটো লোড হবে, কিন্তু ২৩ দিন হিসাবেই গণ্য হবে
const calculateWorkingDays = async (employeeId, month, year) => {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // সর্বদা ২৩ দিন কাজের দিন ধরে নেওয়া হবে
    const fixedWorkingDays = 23;
    
    // 1. অফিস সিডিউল থেকে সাপ্তাহিক অফডে লোড করুন (শুধু তথ্যের জন্য)
    const schedule = await OfficeSchedule.findOne({ isActive: true });
    const weeklyOffDays = schedule?.weeklyOffDays || ['Friday', 'Saturday'];
    
    // 2. মাসের সব হলিডে লোড করুন (শুধু তথ্যের জন্য)
    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: endDate },
      isActive: true
    });
    
    const holidayDates = holidays.map(h => h.date.toDateString());
    const holidayNames = holidays.map(h => h.name);
    
    // 3. এপ্রুভড লিভস লোড করুন
    const leaves = await Leave.find({
      employee: employeeId,
      status: 'Approved',
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    });
    
    // ভ্যারিয়েবল ইনিশিয়ালাইজ
    let actualPresentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    
    // প্রতিটি দিনের জন্য চেক (মাসের শুরু থেকে শেষ পর্যন্ত)
    // শুধুমাত্র leave, absent, late, half-day এর জন্য
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = d.toDateString();
      
      // ওয়িকলি অফডে স্কিপ করবেনা (শুধু তথ্যের জন্য)
      // হলিডে স্কিপ করবেনা (শুধু তথ্যের জন্য)
      
      // Check if on leave (এই তারিখে employee leave এ আছে কিনা)
      const isOnLeave = leaves.some(leave => {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        return d >= leaveStart && d <= leaveEnd;
      });
      
      if (isOnLeave) {
        leaveDays++;
      } else {
        // Check attendance (শুধু absent/late/half day এর জন্য)
        const attendance = await Attendance.findOne({
          employee: employeeId,
          date: {
            $gte: new Date(d.setHours(0, 0, 0, 0)),
            $lte: new Date(d.setHours(23, 59, 59, 999))
          }
        });
        
        if (attendance) {
          switch (attendance.status) {
            case 'Present':
              // Present হলে কোন ডিডাকশন নেই
              break;
            case 'Late':
              lateDays++;
              break;
            case 'Absent':
              absentDays++;
              break;
            case 'Half Day':
              halfDays += 0.5;
              break;
            default:
              // অন্য status থাকলে কিছুই করবেনা
              break;
          }
        } else {
          // Attendance না থাকলে absent ধরা হবে
          absentDays++;
        }
      }
    }
    
    // Present Days = 23 - (leaveDays + absentDays + halfDays)
    // Note: lateDays শুধু ডিডাকশনের জন্য, present days কমাবেনা
    const payableDays = Math.max(0, fixedWorkingDays - (leaveDays + absentDays + halfDays));
    
    // সাপ্তাহিক অফডে সংখ্যা গণনা (শুধু তথ্যের জন্য)
    let weeklyOffCount = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      if (weeklyOffDays.includes(dayName)) {
        weeklyOffCount++;
      }
    }
    
    return {
      totalWorkingDays: fixedWorkingDays, // সর্বদা 23
      presentDays: payableDays, // প্রকৃত কর্মদিবস
      absentDays: absentDays,
      leaveDays: leaveDays,
      lateDays: lateDays,
      halfDays: halfDays,
      holidays: holidayDates.length, // শুধু তথ্যের জন্য
      holidayList: holidayNames, // শুধু তথ্যের জন্য
      weeklyOffs: weeklyOffCount, // শুধু তথ্যের জন্য
      weeklyOffList: weeklyOffDays, // শুধু তথ্যের জন্য
      calculationNote: "Holidays and weekly offs are not deducted. Only leaves, absents, and half-days are deducted from 23 days."
    };
    
  } catch (error) {
    console.error('Error calculating working days:', error);
    return {
      totalWorkingDays: 23,
      presentDays: 23,
      absentDays: 0,
      leaveDays: 0,
      lateDays: 0,
      halfDays: 0,
      holidays: 0,
      weeklyOffs: 0,
      calculationNote: "Using default calculation due to error"
    };
  }
};

// Main payroll calculation function 
const calculatePayroll = async (employeeId, monthlySalary, month, year, manualInputs = {}) => {
  try {
    // 1. Get employee details
    const employee = await User.findById(employeeId)
      .select('firstName lastName employeeId department designation email phone');
    
    if (!employee) {
      throw new Error('Employee not found');
    }
    
    // 2. Calculate working days (শুধু ডিডাকশনের জন্য)
    const workDays = await calculateWorkingDays(employeeId, month, year);
    
    // 3. Calculate rates - 23 days basis (শুধু ডিডাকশনের জন্য)
    const dailyRate = Math.round(monthlySalary / 23);
    const hourlyRate = Math.round(dailyRate / 8);
    const overtimeRate = Math.round(hourlyRate * 1.5);
    
    // 4. Basic pay = Monthly salary (উপস্থিতির ভিত্তিতে না)
    const basicPay = monthlySalary;
    
    // 5. Calculate deductions
    // Late deduction: প্রতি 3 বার লেট = 1 দিনের বেতন কাটা
    let lateDeduction = 0;
    let lateDeductionDays = 0;
    let lateDeductionFormula = '';
    
    if (workDays.lateDays >= 3) {
      lateDeductionDays = Math.floor(workDays.lateDays / 3);
      lateDeduction = lateDeductionDays * dailyRate;
      lateDeductionFormula = `${workDays.lateDays} lates ÷ 3 = ${lateDeductionDays} day(s) deduction`;
    } else {
      lateDeductionFormula = 'Less than 3 lates - no deduction';
    }
    
    const absentDeduction = workDays.absentDays * dailyRate;
    const leaveDeduction = workDays.leaveDays * dailyRate;
    const halfDayDeduction = Math.round(workDays.halfDays * dailyRate);
    
    // OPTION A: Total deductions cannot exceed monthly salary
    const calculatedDeductions = lateDeduction + absentDeduction + leaveDeduction + halfDayDeduction;
    const totalDeductions = Math.min(calculatedDeductions, monthlySalary);
    
    // Calculate deduction percentages
    const deductionBreakdown = {
      late: { amount: lateDeduction, percentage: calculatedDeductions > 0 ? (lateDeduction / calculatedDeductions * 100) : 0 },
      absent: { amount: absentDeduction, percentage: calculatedDeductions > 0 ? (absentDeduction / calculatedDeductions * 100) : 0 },
      leave: { amount: leaveDeduction, percentage: calculatedDeductions > 0 ? (leaveDeduction / calculatedDeductions * 100) : 0 },
      halfDay: { amount: halfDayDeduction, percentage: calculatedDeductions > 0 ? (halfDayDeduction / calculatedDeductions * 100) : 0 }
    };
    
    // Check if deductions were capped
    const deductionsCapped = calculatedDeductions > monthlySalary;
    const cappedAmount = calculatedDeductions - monthlySalary;
    
    // 6. Process manual inputs
    const manualOvertime = manualInputs.overtime || 0;
    const manualBonus = manualInputs.bonus || 0;
    const manualAllowance = manualInputs.allowance || 0;
    
    // 7. Calculate totals
    const totalOvertime = manualOvertime;
    const totalBonus = manualBonus;
    const totalAllowance = manualAllowance;
    
    const totalEarnings = basicPay + totalOvertime + totalBonus + totalAllowance;
    
    // OPTION A: Net payable minimum 0
    const netPayable = Math.max(0, totalEarnings - totalDeductions);
    
    // 8. Prepare result
    return {
      employeeDetails: {
        id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation,
        email: employee.email,
        phone: employee.phone
      },
      period: {
        month,
        year,
        startDate: new Date(year, month - 1, 1),
        endDate: new Date(year, month, 0),
        fixedWorkingDays: 23,
        calculationBasis: 'Basic pay = Monthly salary (fixed), deductions based on attendance'
      },
      rates: {
        monthlySalary,
        dailyRate, // শুধু ডিডাকশনের জন্য
        hourlyRate,
        overtimeRate,
        calculationBasis: 'Daily rate for deduction only (Monthly salary ÷ 23 days)'
      },
      attendance: workDays,
      calculations: {
        basicPay,
        basicPayFormula: `Basic pay = Monthly salary (fixed, not prorated)`,
        overtime: {
          amount: totalOvertime,
          isManual: true,
          note: 'Overtime is manual input only'
        },
        bonus: totalBonus,
        allowance: totalAllowance,
        deductions: {
          late: {
            amount: lateDeduction,
            days: lateDeductionDays,
            totalLateDays: workDays.lateDays,
            formula: lateDeductionFormula
          },
          absent: {
            amount: absentDeduction,
            days: workDays.absentDays,
            formula: `Absent Days (${workDays.absentDays}) × Daily Rate (${dailyRate})`
          },
          leave: {
            amount: leaveDeduction,
            days: workDays.leaveDays,
            formula: `Leave Days (${workDays.leaveDays}) × Daily Rate (${dailyRate})`
          },
          halfDay: {
            amount: halfDayDeduction,
            days: workDays.halfDays,
            formula: `Half Days (${workDays.halfDays}) × Daily Rate (${dailyRate})`
          },
          calculatedTotal: calculatedDeductions, // Before capping
          actualTotal: totalDeductions, // After capping
          isCapped: deductionsCapped,
          cappedAmount: deductionsCapped ? cappedAmount : 0,
          breakdown: deductionBreakdown,
          capRule: 'Total deductions cannot exceed monthly salary'
        },
        totals: {
          earnings: totalEarnings,
          deductions: totalDeductions,
          netPayable: netPayable,
          ruleApplied: 'Basic pay = Monthly salary, deductions based on attendance'
        }
      },
      manualInputs: {
        overtime: manualOvertime,
        bonus: manualBonus,
        allowance: manualAllowance
      },
      notes: {
        holidayNote: `${workDays.holidays} holidays in month (not deducted)`,
        weeklyOffNote: `${workDays.weeklyOffs} weekly off days in month (not deducted)`,
        calculationNote: 'Basic pay equals monthly salary. Only deductions based on attendance.',
        deductionNote: deductionsCapped 
          ? `Note: Deductions capped at monthly salary (${formatCurrency(monthlySalary)}). Excess: ${formatCurrency(cappedAmount)} not deducted.`
          : ''
      }
    };
    
  } catch (error) {
    console.error('Payroll calculation error:', error);
    throw error;
  }
};

// ========== CONTROLLER FUNCTIONS ==========

// 1. Calculate Payroll (Preview)
exports.calculatePayroll = async (req, res) => {
  try {
    const { employeeId, month, year, monthlySalary, ...manualInputs } = req.body;
    
    // Validation
    if (!employeeId || !month || !year || !monthlySalary) {
      return res.status(400).json({
        status: 'fail',
        message: 'Employee ID, month, year, and monthly salary are required'
      });
    }
    
    const calculation = await calculatePayroll(
      employeeId,
      parseInt(monthlySalary),
      parseInt(month),
      parseInt(year),
      manualInputs
    );
    
    res.status(200).json({
      status: 'success',
      message: 'Payroll calculated successfully',
      data: calculation
    });
    
  } catch (error) {
    console.error('Calculate payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 2. Create Payroll
exports.createPayroll = async (req, res) => {
  try {
    const {
      employeeId,
      month,
      year,
      monthlySalary,
      overtime = 0,
      bonus = 0,
      allowance = 0,
      notes = ''
    } = req.body;
    
    // Validation
    if (!employeeId || !month || !year || !monthlySalary) {
      return res.status(400).json({
        status: 'fail',
        message: 'Required fields missing'
      });
    }
    
    // Check if payroll exists
    const existingPayroll = await Payroll.findByEmployeeAndMonth(
      employeeId,
      parseInt(month),
      parseInt(year)
    );
    
    if (existingPayroll) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payroll already exists for this month'
      });
    }
    
    // Calculate payroll with OPTION A
    const calculation = await calculatePayroll(
      employeeId,
      parseInt(monthlySalary),
      parseInt(month),
      parseInt(year),
      { overtime, bonus, allowance }
    );
    
    // Check if net payable is 0
    if (calculation.calculations.totals.netPayable === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Net payable amount is 0. Cannot create payroll.',
        data: calculation,
        warning: 'Deductions equal or exceed earnings. Salary would be 0.'
      });
    }
    
    // Create payroll document
    const payroll = new Payroll({
      employee: employeeId,
      employeeName: calculation.employeeDetails.name,
      employeeId: calculation.employeeDetails.employeeId,
      department: calculation.employeeDetails.department,
      designation: calculation.employeeDetails.designation,
      
      periodStart: calculation.period.startDate,
      periodEnd: calculation.period.endDate,
      month: parseInt(month),
      year: parseInt(year),
      
      status: 'Pending',
      
      salaryDetails: {
        monthlySalary: calculation.rates.monthlySalary,
        dailyRate: calculation.rates.dailyRate,
        hourlyRate: calculation.rates.hourlyRate,
        overtimeRate: calculation.rates.overtimeRate,
        currency: 'BDT',
        calculationBasis: calculation.rates.calculationBasis,
        deductionCap: calculation.calculations.deductions.isCapped 
          ? `Capped at ${formatCurrency(calculation.rates.monthlySalary)}`
          : 'No cap applied'
      },
      
      attendance: {
        totalWorkingDays: calculation.attendance.totalWorkingDays,
        presentDays: calculation.attendance.presentDays,
        absentDays: calculation.attendance.absentDays,
        leaveDays: calculation.attendance.leaveDays,
        lateDays: calculation.attendance.lateDays,
        halfDays: calculation.attendance.halfDays,
        holidays: calculation.attendance.holidays,
        weeklyOffs: calculation.attendance.weeklyOffs,
        attendancePercentage: Math.round(
          (calculation.attendance.presentDays / calculation.attendance.totalWorkingDays) * 100
        )
      },
      
      earnings: {
        basicPay: calculation.calculations.basicPay,
        
        overtime: {
          amount: calculation.calculations.overtime.amount,
          hours: 0,
          rate: calculation.rates.overtimeRate,
          source: calculation.calculations.overtime.amount > 0 ? 'manual' : 'none',
          description: calculation.calculations.overtime.amount > 0 ? 'Manual overtime entry' : ''
        },
        
        bonus: {
          amount: calculation.calculations.bonus,
          type: calculation.calculations.bonus > 0 ? 'other' : 'none',
          description: calculation.calculations.bonus > 0 ? 'Manual bonus' : ''
        },
        
        allowance: {
          amount: calculation.calculations.allowance,
          type: calculation.calculations.allowance > 0 ? 'other' : 'none',
          description: calculation.calculations.allowance > 0 ? 'Manual allowance' : ''
        },
        
        houseRent: 0,
        medical: 0,
        conveyance: 0,
        incentives: 0,
        otherAllowances: 0,
        total: calculation.calculations.totals.earnings
      },
      
      deductions: {
        lateDeduction: calculation.calculations.deductions.late.amount,
        absentDeduction: calculation.calculations.deductions.absent.amount,
        leaveDeduction: calculation.calculations.deductions.leave.amount,
        halfDayDeduction: calculation.calculations.deductions.halfDay.amount,
        taxDeduction: 0,
        providentFund: 0,
        advanceSalary: 0,
        loanDeduction: 0,
        otherDeductions: 0,
        
        deductionRules: {
          lateRule: "3 days late = 1 day salary deduction",
          absentRule: "1 day absent = 1 day salary deduction",
          leaveRule: "1 day leave = 1 day salary deduction",
          halfDayRule: "1 half day = 0.5 day salary deduction",
          holidayRule: "Holidays are not deducted",
          weeklyOffRule: "Weekly offs are not deducted",
          capRule: "Total deductions cannot exceed monthly salary",
          netPayableRule: "Net payable minimum 0"
        },
        
        total: calculation.calculations.deductions.actualTotal,
        calculatedTotal: calculation.calculations.deductions.calculatedTotal,
        isCapped: calculation.calculations.deductions.isCapped,
        cappedAmount: calculation.calculations.deductions.cappedAmount,
        deductionBreakdown: calculation.calculations.deductions.breakdown
      },
      
      summary: {
      grossEarnings: calculation.calculations.totals.earnings,
      totalDeductions: calculation.calculations.totals.deductions,
      netPayable: calculation.calculations.totals.netPayable,
      payableDays: calculation.attendance.presentDays,
      deductionCapApplied: calculation.calculations.deductions.isCapped,
      rulesApplied: calculation.calculations.totals.ruleApplied
    },
      
      monthInfo: {
        totalHolidays: calculation.attendance.holidays || 0,
        totalWeeklyOffs: calculation.attendance.weeklyOffs || 0,
        holidayList: calculation.attendance.holidayList || [],
        weeklyOffDays: calculation.attendance.weeklyOffList || []
      },
      
      calculationNotes: {
        holidayNote: calculation.notes?.holidayNote || '',
        weeklyOffNote: calculation.notes?.weeklyOffNote || '',
        calculationNote: calculation.notes?.calculationNote || '23 days fixed calculation basis',
        deductionNote: calculation.notes?.deductionNote || ''
      },
      
      manualInputs: {
        overtime: parseInt(overtime),
        overtimeHours: 0,
        bonus: parseInt(bonus),
        allowance: parseInt(allowance),
        enteredBy: req.user._id,
        enteredAt: new Date()
      },
      
      calculation: {
        method: 'auto_backend',
        calculatedDate: new Date(),
        calculatedBy: req.user._id,
        dataSources: ['attendance', 'leaves', 'holidays', 'office_schedule', 'manual_input'],
        calculationNotes: 'Auto-calculated with 23 days fixed basis + Deduction Cap'
      },
      
      metadata: {
        isAutoGenerated: true,
        hasManualInputs: overtime > 0 || bonus > 0 || allowance > 0,
        deductionRulesApplied: true,
        deductionCapApplied: calculation.calculations.deductions.isCapped,
        attendanceBased: true,
        fixed23Days: true,
        version: '3.1', // Updated version for Option A
        safetyRules: ['Deduction cap = monthly salary', 'Net payable minimum 0']
      },
      
      createdBy: req.user._id,
      notes: notes || `Payroll for ${new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${year} (23 days fixed + Deduction Cap)`
    });
    
    await payroll.save();
    
    res.status(201).json({
      status: 'success',
      message: 'Payroll created successfully with safety rules',
      data: payroll,
      warnings: calculation.calculations.deductions.isCapped ? [
        'Deductions capped at monthly salary',
        `Excess deduction not applied: ${formatCurrency(calculation.calculations.deductions.cappedAmount)}`
      ] : []
    });
    
  } catch (error) {
    console.error('Create payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  } 
};

// 3. Get All Payrolls
exports.getAllPayrolls = async (req, res) => {
  try {
    const { month, year, status, department, page = 1, limit = 20 } = req.query;
    
    const query = { isDeleted: false };
    
    if (month && year) {
      query.month = parseInt(month);
      query.year = parseInt(year);
    }
    
    if (status && status !== 'All') {
      query.status = status;
    }
    
    if (department && department !== 'All') {
      query.department = department;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const payrolls = await Payroll.find(query)
      .populate('employee', 'firstName lastName email phone')
      .populate('createdBy', 'firstName lastName')
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Payroll.countDocuments(query);
    
    // Calculate summary
    const summary = await Payroll.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalNetPayable: { $sum: '$summary.netPayable' },
          totalDeductions: { $sum: '$deductions.total' },
          totalPayrolls: { $sum: 1 },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Paid'] }, '$summary.netPayable', 0]
            }
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Pending'] }, '$summary.netPayable', 0]
            }
          }
        }
      }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        payrolls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        summary: summary[0] || {
          totalNetPayable: 0,
          totalDeductions: 0,
          totalPayrolls: 0,
          paidAmount: 0,
          pendingAmount: 0
        }
      }
    });
    
  } catch (error) {
    console.error('Get all payrolls error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 4. Get Payroll by ID
exports.getPayrollById = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate('employee', 'firstName lastName email phone department designation')
      .populate('createdBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .populate('paidBy', 'firstName lastName');
    
    if (!payroll || payroll.isDeleted) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: payroll
    });
    
  } catch (error) {
    console.error('Get payroll by ID error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 5. Update Payroll Status
exports.updatePayrollStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentMethod, transactionId, bankAccount, notes } = req.body;
    
    const payroll = await Payroll.findById(id);
    
    if (!payroll || payroll.isDeleted) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    // Update status
    if (status) {
      payroll.status = status;
      
      if (status === 'Approved') {
        payroll.approvedBy = req.user._id;
        payroll.approvedAt = new Date();
      } else if (status === 'Rejected') {
        payroll.rejectedBy = req.user._id;
        payroll.rejectedAt = new Date();
        payroll.rejectionReason = notes || '';
      } else if (status === 'Paid') {
        payroll.payment = {
          paymentDate: new Date(),
          paymentMethod: paymentMethod || 'Bank Transfer',
          transactionId: transactionId || '',
          bankAccount: bankAccount || '',
          paidBy: req.user._id,
          paymentNotes: notes || ''
        };
      }
    }
    
    await payroll.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Payroll updated successfully',
      data: payroll
    });
    
  } catch (error) {
    console.error('Update payroll status error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 6. Delete Payroll (Hard Delete - Permanent)
exports.deletePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    // Permanent delete from database
    await Payroll.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      status: 'success',
      message: 'Payroll deleted permanently'
    });
    
  } catch (error) {
    console.error('Delete payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// payrollController.js-এ

// 7A. Get Employee Payrolls (Admin/HR দেখার জন্য)
exports.getEmployeePayrolls = async (req, res) => {
  try {
    const { userId } = req.params; // URL থেকে employeeId নিচ্ছে
    const { year } = req.query;
    
    // Check if user is admin/hr
    if (req.user.role !== 'admin' && req.user.role !== 'hr') {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to view other employee payrolls'
      });
    }
    
    // Build query
    const query = { 
      employee: userId 
    };
    
    if (year && !isNaN(year)) {
      query.year = parseInt(year);
    }
    
    // Get payrolls
    const payrolls = await Payroll.find(query)
      .populate('employee', 'firstName lastName email phone department designation')
      .populate('createdBy', 'firstName lastName')
      .sort({ year: -1, month: -1, createdAt: -1 });
    
    // Get employee details
    const employee = await User.findById(userId)
      .select('firstName lastName employeeId department designation');
    
    // Calculate summary
    const summary = {
      totalRecords: payrolls.length,
      totalNetPayable: payrolls.reduce((sum, p) => sum + (p.summary?.netPayable || 0), 0),
      totalEarnings: payrolls.reduce((sum, p) => sum + (p.summary?.grossEarnings || 0), 0),
      totalDeductions: payrolls.reduce((sum, p) => sum + (p.deductions?.total || 0), 0),
      byStatus: payrolls.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {}),
      byMonth: payrolls.map(p => ({
        month: p.month,
        monthName: new Date(p.year, p.month - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
        year: p.year,
        netPayable: p.summary?.netPayable || 0,
        status: p.status
      }))
    };
    
    res.status(200).json({
      status: 'success',
      data: {
        employee: employee ? {
          id: employee._id,
          name: `${employee.firstName} ${employee.lastName}`,
          employeeId: employee.employeeId,
          department: employee.department,
          designation: employee.designation
        } : null,
        payrolls,
        summary
      }
    });
    
  } catch (error) {
    console.error('Get employee payrolls error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 7B. Get My Payrolls (Employee নিজের দেখার জন্য)
exports.getMyPayrolls = async (req, res) => {
  try {
    const { year } = req.query;
    const employeeId = req.user._id; // Logged in user's ID
    
    // Build query - employee নিজের ID
    const query = { 
      employee: employeeId 
    };
    
    if (year && !isNaN(year)) {
      query.year = parseInt(year);
    }
    
    // Get payrolls - শুধু নিজের payroll
    const payrolls = await Payroll.find(query)
      .populate('employee', 'firstName lastName email phone department designation')
      .populate('createdBy', 'firstName lastName')
      .sort({ year: -1, month: -1, createdAt: -1 });
    
    // Calculate summary
    const summary = {
      totalRecords: payrolls.length,
      totalNetPayable: payrolls.reduce((sum, p) => sum + (p.summary?.netPayable || 0), 0),
      totalEarnings: payrolls.reduce((sum, p) => sum + (p.summary?.grossEarnings || 0), 0),
      totalDeductions: payrolls.reduce((sum, p) => sum + (p.deductions?.total || 0), 0),
      byStatus: payrolls.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {}),
      byMonth: payrolls.map(p => ({
        month: p.month,
        monthName: new Date(p.year, p.month - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
        year: p.year,
        netPayable: p.summary?.netPayable || 0,
        status: p.status
      }))
    };
    
    res.status(200).json({
      status: 'success',
      data: {
        employee: {
          id: req.user._id,
          name: `${req.user.firstName} ${req.user.lastName}`,
          employeeId: req.user.employeeId,
          department: req.user.department,
          designation: req.user.designation
        },
        payrolls,
        summary
      }
    });
    
  } catch (error) {
    console.error('Get my payrolls error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 8. Bulk Generate Payrolls
exports.bulkGeneratePayrolls = async (req, res) => {
  try {
    const { month, year, department } = req.body;
    
    if (!month || !year) {
      return res.status(400).json({
        status: 'fail',
        message: 'Month and year are required'
      });
    }
    
    // Get active employees
    const query = { 
      status: 'Active',
      role: { $nin: ['admin', 'superadmin'] },
      salary: { $gt: 0 }
    };
    
    if (department && department !== 'All') {
      query.department = department;
    }
    
    const employees = await User.find(query)
      .select('_id firstName lastName employeeId salary department designation');
    
    const results = [];
    const errors = [];
    
    // Generate payroll for each employee
    for (const employee of employees) {
      try {
        // Check if payroll exists
        const existing = await Payroll.findByEmployeeAndMonth(
          employee._id,
          parseInt(month),
          parseInt(year)
        );
        
        if (existing) {
          results.push({
            employeeId: employee._id,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            status: 'skipped',
            reason: 'Payroll already exists',
            payrollId: existing._id
          });
          continue;
        }
        
        // Calculate and create payroll
        const calculation = await calculatePayroll(
          employee._id,
          employee.salary || 30000,
          parseInt(month),
          parseInt(year),
          {} // Empty manual inputs
        );
        
        // Create payroll
        const payroll = new Payroll({
          employee: employee._id,
          employeeName: calculation.employeeDetails.name,
          employeeId: calculation.employeeDetails.employeeId,
          department: calculation.employeeDetails.department,
          designation: calculation.employeeDetails.designation,
          
          periodStart: calculation.period.startDate,
          periodEnd: calculation.period.endDate,
          month: parseInt(month),
          year: parseInt(year),
          
          status: 'Pending',
          
          salaryDetails: {
            monthlySalary: calculation.rates.monthlySalary,
            dailyRate: calculation.rates.dailyRate,
            hourlyRate: calculation.rates.hourlyRate,
            overtimeRate: calculation.rates.overtimeRate,
            currency: 'BDT',
            calculationBasis: calculation.rates.calculationBasis
          },
          
          attendance: {
            totalWorkingDays: calculation.attendance.totalWorkingDays,
            presentDays: calculation.attendance.presentDays,
            absentDays: calculation.attendance.absentDays,
            leaveDays: calculation.attendance.leaveDays,
            lateDays: calculation.attendance.lateDays,
            halfDays: calculation.attendance.halfDays,
            holidays: calculation.attendance.holidays,
            weeklyOffs: calculation.attendance.weeklyOffs,
            attendancePercentage: Math.round(
              (calculation.attendance.presentDays / calculation.attendance.totalWorkingDays) * 100
            )
          },
          
          earnings: {
            basicPay: calculation.calculations.basicPay,
            overtime: { 
              amount: 0,
              hours: 0, 
              rate: calculation.rates.overtimeRate, 
              source: 'none',
              description: '' 
            },
            bonus: { amount: 0, type: 'none', description: '' },
            allowance: { amount: 0, type: 'none', description: '' },
            houseRent: 0,
            medical: 0,
            conveyance: 0,
            incentives: 0,
            otherAllowances: 0,
            total: calculation.calculations.basicPay
          },
          
          deductions: {
            lateDeduction: calculation.calculations.deductions.late.amount,
            absentDeduction: calculation.calculations.deductions.absent.amount,
            leaveDeduction: calculation.calculations.deductions.leave.amount,
            halfDayDeduction: calculation.calculations.deductions.halfDay.amount,
            taxDeduction: 0,
            providentFund: 0,
            advanceSalary: 0,
            loanDeduction: 0,
            otherDeductions: 0,
            deductionRules: {
              lateRule: "3 days late = 1 day salary deduction",
              absentRule: "1 day absent = 1 day salary deduction",
              leaveRule: "1 day leave = 1 day salary deduction",
              halfDayRule: "1 half day = 0.5 day salary deduction",
              holidayRule: "Holidays are not deducted",
              weeklyOffRule: "Weekly offs are not deducted"
            },
            total: calculation.calculations.deductions.total
          },
          
          summary: {
            grossEarnings: calculation.calculations.basicPay,
            totalDeductions: calculation.calculations.deductions.total,
            netPayable: calculation.calculations.totals.netPayable,
            payableDays: calculation.attendance.presentDays
          },
          
          monthInfo: {
            totalHolidays: calculation.attendance.holidays || 0,
            totalWeeklyOffs: calculation.attendance.weeklyOffs || 0,
            holidayList: calculation.attendance.holidayList || [],
            weeklyOffDays: calculation.attendance.weeklyOffList || []
          },
          
          calculationNotes: {
            holidayNote: calculation.notes?.holidayNote || '',
            weeklyOffNote: calculation.notes?.weeklyOffNote || '',
            calculationNote: calculation.notes?.calculationNote || '23 days fixed calculation basis'
          },
          
          calculation: {
            method: 'auto_backend',
            calculatedDate: new Date(),
            calculatedBy: req.user._id,
            dataSources: ['attendance', 'leaves', 'holidays', 'office_schedule'],
            calculationNotes: 'Bulk generated payroll (23 days fixed basis)'
          },
          
          metadata: {
            isAutoGenerated: true,
            hasManualInputs: false,
            deductionRulesApplied: true,
            attendanceBased: true,
            fixed23Days: true,
            version: '3.0',
            batchId: `BULK_${month}_${year}_${Date.now()}`
          },
          
          createdBy: req.user._id,
          notes: `Bulk generated payroll for ${new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${year} (23 days fixed)`
        });
        
        await payroll.save();
        
        results.push({
          employeeId: employee._id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          status: 'created',
          payrollId: payroll._id,
          netPayable: payroll.summary.netPayable
        });
        
      } catch (error) {
        errors.push({
          employeeId: employee._id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          error: error.message
        });
      }
    }
    
    // Calculate summary
    const createdCount = results.filter(r => r.status === 'created').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const totalNetPayable = results
      .filter(r => r.status === 'created')
      .reduce((sum, r) => sum + (r.netPayable || 0), 0);
    
    res.status(200).json({
      status: 'success',
      message: `Bulk generation completed. Created: ${createdCount}, Skipped: ${skippedCount}, Failed: ${errors.length}`,
      data: {
        summary: {
          totalEmployees: employees.length,
          created: createdCount,
          skipped: skippedCount,
          failed: errors.length,
          totalNetPayable: totalNetPayable
        },
        results,
        errors: errors.length > 0 ? errors : undefined
      }
    });
    
  } catch (error) {
    console.error('Bulk generate error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 9. Get Payroll Statistics
exports.getPayrollStats = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        status: 'fail',
        message: 'Month and year are required'
      });
    }
    
    const stats = await Payroll.getPayrollStats(parseInt(month), parseInt(year));
    
    // Get department-wise breakdown
    const departmentStats = await Payroll.aggregate([
      {
        $match: {
          month: parseInt(month),
          year: parseInt(year),
          isDeleted: false
        }
      },
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 },
          totalNetPayable: { $sum: '$summary.netPayable' },
          totalEmployees: { $addToSet: '$employee' }
        }
      },
      {
        $project: {
          department: '$_id',
          count: 1,
          totalNetPayable: 1,
          employeeCount: { $size: '$totalEmployees' },
          averagePerEmployee: { $divide: ['$totalNetPayable', { $size: '$totalEmployees' }] }
        }
      },
      { $sort: { totalNetPayable: -1 } }
    ]);
    
    res.status(200).json({
      status: 'success',
      data: {
        ...stats,
        departmentStats,
        period: {
          month: parseInt(month),
          year: parseInt(year),
          monthName: new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('en-US', { month: 'long' })
        }
      }
    });
    
  } catch (error) {
    console.error('Get payroll stats error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 10. Export Payroll Data
exports.exportPayrolls = async (req, res) => {
  try {
    const { month, year, format = 'json' } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        status: 'fail',
        message: 'Month and year are required'
      });
    }
    
    const payrolls = await Payroll.find({
      month: parseInt(month),
      year: parseInt(year),
      isDeleted: false
    })
    .populate('employee', 'firstName lastName employeeId department designation')
    .sort({ department: 1, employeeName: 1 });
    
    if (format === 'csv') {
      // CSV export logic
      const csvData = payrolls.map(p => ({
        'Employee ID': p.employeeId,
        'Employee Name': p.employeeName,
        'Department': p.department,
        'Designation': p.designation,
        'Monthly Salary': p.salaryDetails.monthlySalary,
        'Daily Rate': p.salaryDetails.dailyRate,
        'Total Working Days': 23,
        'Present Days': p.attendance.presentDays,
        'Absent Days': p.attendance.absentDays,
        'Leave Days': p.attendance.leaveDays,
        'Late Days': p.attendance.lateDays,
        'Half Days': p.attendance.halfDays,
        'Basic Pay': p.earnings.basicPay,
        'Overtime (Manual)': p.earnings.overtime?.amount || 0,
        'Bonus': p.earnings.bonus?.amount || 0,
        'Allowance': p.earnings.allowance?.amount || 0,
        'Late Deduction': p.deductions.lateDeduction,
        'Absent Deduction': p.deductions.absentDeduction,
        'Leave Deduction': p.deductions.leaveDeduction,
        'Half Day Deduction': p.deductions.halfDayDeduction,
        'Gross Earnings': p.summary.grossEarnings,
        'Total Deductions': p.summary.totalDeductions,
        'Net Payable': p.summary.netPayable,
        'Status': p.status,
        'Payment Method': p.payment?.paymentMethod || 'Not Paid'
      }));
      
      // Convert to CSV string
      const csvString = [
        Object.keys(csvData[0]).join(','),
        ...csvData.map(row => Object.values(row).join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=payrolls_${month}_${year}.csv`);
      return res.send(csvString);
    }
    
    // JSON export (default)
    res.status(200).json({
      status: 'success',
      data: {
        period: {
          month: parseInt(month),
          year: parseInt(year),
          monthName: new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('en-US', { month: 'long' })
        },
        payrolls: payrolls.map(p => p.getPayrollSlipData()),
        summary: await Payroll.getPayrollStats(parseInt(month), parseInt(year))
      }
    });
    
  } catch (error) {
    console.error('Export payrolls error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 11. Update Manual Inputs
exports.updateManualInputs = async (req, res) => {
  try {
    const { id } = req.params;
    const { overtime, bonus, allowance, description } = req.body;
    
    const payroll = await Payroll.findById(id);
    
    if (!payroll || payroll.isDeleted) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    // Update manual inputs
    payroll.manualInputs = {
      overtime: parseInt(overtime) || 0,
      overtimeHours: 0,
      bonus: parseInt(bonus) || 0,
      allowance: parseInt(allowance) || 0,
      enteredBy: req.user._id,
      enteredAt: new Date()
    };
    
    // Update earnings
    payroll.earnings.overtime.amount = parseInt(overtime) || 0;
    payroll.earnings.overtime.hours = 0;
    payroll.earnings.overtime.source = parseInt(overtime) > 0 ? 'manual' : 'none';
    payroll.earnings.overtime.description = description || 'Manual overtime entry';
    
    payroll.earnings.bonus.amount = parseInt(bonus) || 0;
    payroll.earnings.bonus.type = parseInt(bonus) > 0 ? 'other' : 'none';
    payroll.earnings.bonus.description = parseInt(bonus) > 0 ? 'Updated manually' : '';
    
    payroll.earnings.allowance.amount = parseInt(allowance) || 0;
    payroll.earnings.allowance.type = parseInt(allowance) > 0 ? 'other' : 'none';
    payroll.earnings.allowance.description = parseInt(allowance) > 0 ? 'Updated manually' : '';
    
    // Recalculate totals
    await payroll.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Manual inputs updated successfully',
      data: payroll
    });
    
  } catch (error) {
    console.error('Update manual inputs error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 12. Get Payroll with Manual Overtime Only
exports.getPayrollWithManualOvertime = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const payrolls = await Payroll.find({
      month: parseInt(month),
      year: parseInt(year),
      isDeleted: false,
      'earnings.overtime.amount': { $gt: 0 },
      'earnings.overtime.source': 'manual'
    })
    .populate('employee', 'firstName lastName employeeId')
    .sort({ 'earnings.overtime.amount': -1 });
    
    res.status(200).json({
      status: 'success',
      data: {
        count: payrolls.length,
        totalOvertime: payrolls.reduce((sum, p) => sum + (p.earnings.overtime?.amount || 0), 0),
        payrolls
      }
    });
    
  } catch (error) {
    console.error('Get payroll with manual overtime error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 13. Recalculate Payroll (আপডেট লজিক)
exports.recalculatePayroll = async (req, res) => {
  try {
    const { id } = req.params;
    
    const payroll = await Payroll.findById(id);
    
    if (!payroll || payroll.isDeleted) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    // Get the original payroll data
    const employeeId = payroll.employee;
    const month = payroll.month;
    const year = payroll.year;
    const monthlySalary = payroll.salaryDetails.monthlySalary;
    const manualInputs = {
      overtime: payroll.manualInputs.overtime || 0,
      bonus: payroll.manualInputs.bonus || 0,
      allowance: payroll.manualInputs.allowance || 0
    };
    
    // Recalculate with new logic
    const calculation = await calculatePayroll(
      employeeId,
      monthlySalary,
      month,
      year,
      manualInputs
    );
    
    // Update payroll with new calculation
    payroll.attendance = {
      totalWorkingDays: calculation.attendance.totalWorkingDays,
      presentDays: calculation.attendance.presentDays,
      absentDays: calculation.attendance.absentDays,
      leaveDays: calculation.attendance.leaveDays,
      lateDays: calculation.attendance.lateDays,
      halfDays: calculation.attendance.halfDays,
      holidays: calculation.attendance.holidays,
      weeklyOffs: calculation.attendance.weeklyOffs,
      attendancePercentage: Math.round(
        (calculation.attendance.presentDays / calculation.attendance.totalWorkingDays) * 100
      )
    };
    
    payroll.earnings.basicPay = calculation.calculations.basicPay;
    payroll.deductions.lateDeduction = calculation.calculations.deductions.late.amount;
    payroll.deductions.absentDeduction = calculation.calculations.deductions.absent.amount;
    payroll.deductions.leaveDeduction = calculation.calculations.deductions.leave.amount;
    payroll.deductions.halfDayDeduction = calculation.calculations.deductions.halfDay.amount;
    
    payroll.monthInfo = {
      totalHolidays: calculation.attendance.holidays || 0,
      totalWeeklyOffs: calculation.attendance.weeklyOffs || 0,
      holidayList: calculation.attendance.holidayList || [],
      weeklyOffDays: calculation.attendance.weeklyOffList || []
    };
    
    payroll.calculationNotes = {
      holidayNote: calculation.notes?.holidayNote || '',
      weeklyOffNote: calculation.notes?.weeklyOffNote || '',
      calculationNote: calculation.notes?.calculationNote || '23 days fixed calculation basis'
    };
    
    payroll.metadata.fixed23Days = true;
    payroll.metadata.version = '3.0';
    
    payroll.calculation.calculatedDate = new Date();
    payroll.calculation.calculatedBy = req.user._id;
    payroll.calculation.calculationNotes = 'Recalculated with 23 days fixed basis';
    
    await payroll.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Payroll recalculated successfully with 23 days fixed basis',
      data: payroll
    });
    
  } catch (error) {
    console.error('Recalculate payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};