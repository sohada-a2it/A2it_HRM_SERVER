const Payroll = require('../models/PayrollModel');
const User = require('../models/UsersModel');
const Attendance = require('../models/AttendanceModel');
const Leave = require('../models/LeaveModel');
const Holiday = require('../models/HolidayModel');
const OfficeSchedule = require('../models/OfficeScheduleModel');
const FoodCost = require('../models/foodCostModel'); 
const Meal = require('../models/mealModel');
const MealSubscription = require('../models/subscriptionMealModel');
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
// Helper function: Calculate food cost deduction
const calculateFoodCostDeduction = async (month, year) => {
  try {
    // মাসের প্রথম এবং শেষ তারিখ বের করুন
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // 1. মাসের সব Food Cost বিল পান
    const foodCosts = await FoodCost.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    });
    
    if (foodCosts.length === 0) {
      return {
        totalCost: 0,
        averagePerDay: 0,
        totalDays: 0,
        calculationNote: 'No food costs recorded for this month'
      };
    }
    
    // 2. মাসের মোট Food Cost বের করুন
    const totalCost = foodCosts.reduce((sum, cost) => sum + cost.cost, 0);
    const totalDays = foodCosts.length;
    const averagePerDay = totalCost / totalDays;
    
    // 3. Meal-এ অ্যাপ্রুভড onsite employees পান
    const mealApprovedEmployees = await User.find({
      role: 'employee',
      workLocationType: 'onsite',
      mealRequestStatus: 'approved',
      mealPreference: 'office'
    }).select('_id employeeId firstName lastName');
    
    const totalMealEmployees = mealApprovedEmployees.length;
    
    if (totalMealEmployees === 0) {
      return {
        totalCost: totalCost,
        averagePerDay: averagePerDay,
        totalDays: totalDays,
        calculationNote: 'No meal-approved employees found for this month',
        perEmployeeDeduction: 0,
        totalMealEmployees: 0
      };
    }
    
    // 4. প্রতি employee-এর deduction বের করুন
    const perEmployeeDeduction = Math.round(totalCost / totalMealEmployees);
    
    return {
      totalCost: totalCost,
      averagePerDay: averagePerDay,
      totalDays: totalDays,
      perEmployeeDeduction: perEmployeeDeduction,
      totalMealEmployees: totalMealEmployees,
      mealEmployees: mealApprovedEmployees.map(emp => ({
        id: emp._id,
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`
      })),
      calculationNote: `Food cost: ${totalCost} BDT ÷ ${totalMealEmployees} employees = ${perEmployeeDeduction} BDT per employee`
    };
    
  } catch (error) {
    console.error('Food cost calculation error:', error);
    throw error;
  }
};

// Get available food cost bills for dropdown
exports.getFoodCostBillsForPayroll = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    // Food cost bills for the selected month
    const foodCosts = await FoodCost.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: 1 });
    
    // Calculate total cost
    const totalCost = foodCosts.reduce((sum, cost) => sum + cost.cost, 0);
    
    // Get meal-approved employees
    const mealApprovedEmployees = await User.find({
      role: 'employee',
      workLocationType: 'onsite',
      mealRequestStatus: 'approved',
      mealPreference: 'office'
    }).select('employeeId firstName lastName department');
    
    const totalMealEmployees = mealApprovedEmployees.length;
    const perEmployeeDeduction = totalMealEmployees > 0 ? Math.round(totalCost / totalMealEmployees) : 0;
    
    res.status(200).json({
      success: true,
      data: {
        month: month,
        year: year,
        monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
        
        foodCosts: foodCosts.map(cost => ({
          id: cost._id,
          date: cost.date,
          cost: cost.cost,
          note: cost.note || ''
        })),
        
        summary: {
          totalCost: totalCost,
          totalDays: foodCosts.length,
          averagePerDay: foodCosts.length > 0 ? totalCost / foodCosts.length : 0,
          totalMealEmployees: totalMealEmployees,
          perEmployeeDeduction: perEmployeeDeduction,
          totalDeductionAmount: perEmployeeDeduction * totalMealEmployees
        },
        
        mealEmployees: mealApprovedEmployees.map(emp => ({
          id: emp._id,
          employeeId: emp.employeeId,
          name: `${emp.firstName} ${emp.lastName}`,
          department: emp.department
        })),
        
        calculation: {
          formula: 'Total Food Cost ÷ Number of Meal-Approved Employees',
          example: `${totalCost} BDT ÷ ${totalMealEmployees} employees = ${perEmployeeDeduction} BDT each`
        }
      }
    });
    
  } catch (error) {
    console.error('Get food cost bills error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
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
// controllers/payrollController.js - এই function-এ updates করুন

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
      notes = '',
      // Meal System - নতুন fields
      dailyMealRate = 0 // শুধু daily meal এর জন্য
    } = req.body;
    
    // ============ 1. VALIDATION ============
    if (!employeeId || !month || !year || !monthlySalary) {
      return res.status(400).json({
        status: 'fail',
        message: 'Employee ID, month, year, and monthly salary are required'
      });
    }
    
    // Check if payroll exists
    const existingPayroll = await Payroll.findOne({
      employee: employeeId,
      month: parseInt(month),
      year: parseInt(year),
      isDeleted: false
    });
    
    if (existingPayroll) {
      return res.status(400).json({
        status: 'fail',
        message: 'Payroll already exists for this employee and month'
      });
    }
    
    // Get employee
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found'
      });
    }
    
    // ============ 2. AUTO LOAD MEAL DATA ============
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const currentMonth = `${year}-${String(month).padStart(2, '0')}`;
    
    // A. Check Monthly Subscription (Auto)
    const subscription = await MealSubscription.findOne({
      user: employeeId,
      isDeleted: false,
      'monthlyApprovals.month': currentMonth,
      'monthlyApprovals.status': 'approved'
    });
    
    const hasSubscription = !!subscription;
    
    // B. Count Daily Meals (Auto)
    const dailyMeals = await Meal.find({
      user: employeeId,
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['approved', 'served'] },
      isDeleted: false
    });
    
    const dailyMealDays = dailyMeals.length;
    const hasDailyMeals = dailyMealDays > 0;
    
    // C. AUTO: Calculate Total Monthly Food Cost
    const monthlyFoodCosts = await FoodCost.find({
      date: { $gte: startDate, $lte: endDate }
    });
    
    const totalMonthlyFoodCost = monthlyFoodCosts.reduce((sum, cost) => sum + cost.cost, 0);
    const foodCostDays = monthlyFoodCosts.length;
    const averageDailyCost = foodCostDays > 0 ? totalMonthlyFoodCost / foodCostDays : 0;
    
    // D. AUTO: Count Active Subscribers
    const activeSubscribers = await MealSubscription.countDocuments({
      status: 'active',
      isDeleted: false,
      isPaused: false,
      'monthlyApprovals.month': currentMonth,
      'monthlyApprovals.status': 'approved'
    });
    
    // ============ 3. AUTO MEAL DEDUCTION CALCULATION ============
    let mealDeduction = {
      type: 'none',
      amount: 0,
      calculationNote: 'No meal deduction',
      details: {}
    };
    
    // Case 1: Monthly Subscription (AUTO CALCULATION)
    if (hasSubscription) {
      const deductionPerEmployee = activeSubscribers > 0 ? 
        Math.round(totalMonthlyFoodCost / activeSubscribers) : 0;
      
      mealDeduction = {
        type: 'monthly_subscription',
        amount: deductionPerEmployee,
        calculationNote: `Food Cost: ${totalMonthlyFoodCost} BDT ÷ ${activeSubscribers} subscribers = ${deductionPerEmployee} BDT`,
        details: {
          totalMonthlyFoodCost,
          foodCostDays,
          averageDailyCost,
          activeSubscribers,
          calculation: `${totalMonthlyFoodCost} ÷ ${activeSubscribers}`
        }
      };
    }
    // Case 2: Daily Meal (SEMI-AUTO)
    else if (hasDailyMeals && dailyMealRate > 0) {
      const totalAmount = dailyMealDays * parseFloat(dailyMealRate);
      
      mealDeduction = {
        type: 'daily_meal',
        amount: totalAmount,
        calculationNote: `${dailyMealDays} days × ${dailyMealRate} BDT = ${totalAmount} BDT`,
        details: {
          mealDays: dailyMealDays,
          dailyRate: dailyMealRate,
          calculation: `${dailyMealDays} × ${dailyMealRate}`
        }
      };
    }
    
    // ============ 4. REGULAR PAYROLL CALCULATION ============
    const calculation = await calculatePayroll(
      employeeId,
      parseInt(monthlySalary),
      parseInt(month),
      parseInt(year),
      { overtime, bonus, allowance }
    );
    
    // ============ 5. ONSITE BENEFITS CALCULATION ============
    let onsiteBenefitsDetails = {
      serviceCharge: 0,
      teaAllowance: 0,
      totalAllowance: 0,
      totalDeduction: 0,
      presentDays: 0,
      netEffect: 0,
      calculationNote: 'Not an onsite employee'
    };
    
    if (employee.workLocationType === 'onsite' && employee.role === 'employee') {
      const presentDays = calculation.attendance.presentDays || 0;
      const halfDays = calculation.attendance.halfDays || 0;
      
      const includeHalfDays = employee.onsiteBenefits?.includeHalfDays !== false;
      const serviceCharge = employee.onsiteBenefits?.serviceCharge || 500;
      const teaAllowanceRate = employee.onsiteBenefits?.dailyAllowanceRate || 10;
      
      const eligibleDays = presentDays + (includeHalfDays ? Math.ceil(halfDays / 2) : 0);
      const teaAllowance = eligibleDays * teaAllowanceRate;
      const serviceChargeDeduction = serviceCharge;
      const netOnsiteEffect = teaAllowance - serviceChargeDeduction;
      
      onsiteBenefitsDetails = {
        serviceCharge: serviceChargeDeduction,
        teaAllowance: teaAllowance,
        totalAllowance: teaAllowance,
        totalDeduction: serviceChargeDeduction,
        presentDays: eligibleDays,
        netEffect: netOnsiteEffect,
        calculationNote: `Onsite Benefits: Service Charge ${serviceChargeDeduction} BDT + Tea Allowance ${eligibleDays} days × ${teaAllowanceRate} BDT = ${teaAllowance} BDT (Net: ${netOnsiteEffect} BDT)`,
        details: {
          serviceCharge: serviceChargeDeduction,
          teaAllowanceRate: teaAllowanceRate,
          eligibleDays: eligibleDays,
          includeHalfDays: includeHalfDays
        },
        breakdown: {
          teaAllowance: `${eligibleDays} days × ${teaAllowanceRate} BDT = ${teaAllowance} BDT`,
          serviceCharge: `Fixed ${serviceChargeDeduction} BDT`,
          calculation: `Service Charge ${serviceChargeDeduction} - Tea Allowance ${teaAllowance}  = Net ${netOnsiteEffect} BDT`
        }
      };
      
      // Add tea allowance to total allowance
      calculation.calculations.allowance = (calculation.calculations.allowance || 0) + teaAllowance;
      
      // Add service charge to total deductions
      calculation.calculations.deductions.actualTotal += serviceChargeDeduction;
      calculation.calculations.deductions.calculatedTotal += serviceChargeDeduction;
      
      calculation.calculations.deductions.breakdown.serviceCharge = {
        amount: serviceChargeDeduction,
        percentage: calculation.calculations.deductions.calculatedTotal > 0 
          ? (serviceChargeDeduction / calculation.calculations.deductions.calculatedTotal * 100) 
          : 0,
        description: 'Onsite Service Charge'
      };
      
      calculation.calculations.deductions.breakdown.teaAllowance = {
        amount: -teaAllowance,
        percentage: 0,
        description: 'Onsite Tea Allowance (Added to earnings)'
      };
    }
    
    // ============ 6. FINAL CALCULATION ============
    const totalEarnings = calculation.calculations.basicPay + 
                         calculation.calculations.overtime.amount + 
                         calculation.calculations.bonus + 
                         calculation.calculations.allowance;
    
    const totalDeductions = calculation.calculations.deductions.actualTotal + 
                           mealDeduction.amount;
    
    const netPayable = Math.max(0, totalEarnings - totalDeductions);
    
    if (netPayable <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Net payable amount is 0 or negative. Cannot create payroll.',
        data: {
          originalCalculation: calculation,
          onsiteBenefits: onsiteBenefitsDetails,
          totals: {
            earnings: totalEarnings,
            deductions: totalDeductions,
            netPayable: netPayable
          }
        },
        warning: 'Deductions equal or exceed earnings. Salary would be 0 or negative.'
      });
    }
    
    // ============ 7. CREATE PAYROLL DOCUMENT ============
    const payroll = new Payroll({
      employee: employeeId,
      employeeName: calculation.employeeDetails.name || employee.fullName,
      employeeId: calculation.employeeDetails.employeeId || employee.employeeId,
      department: calculation.employeeDetails.department || employee.department,
      designation: calculation.employeeDetails.designation || employee.designation,
      
      periodStart: calculation.period.startDate,
      periodEnd: calculation.period.endDate,
      month: parseInt(month),
      year: parseInt(year),
      
      status: 'Pending',
      
      // ============ AUTO MEAL SYSTEM DATA ============
      mealSystemData: {
        subscriptionStatus: hasSubscription,
        dailyMealDays: dailyMealDays,
        hasDailyMeals: hasDailyMeals,
        totalMonthlyFoodCost: totalMonthlyFoodCost,
        foodCostDays: foodCostDays,
        averageDailyCost: averageDailyCost,
        activeSubscribers: activeSubscribers,
        mealDeduction: mealDeduction
      },
      
      // ============ ONSITE BENEFITS DETAILS ============
      onsiteBenefitsDetails: onsiteBenefitsDetails,
      
      // ============ FOOD COST DETAILS ============
      foodCostDetails: {
        included: mealDeduction.type === 'monthly_subscription',
        totalMealCost: totalMonthlyFoodCost,
        fixedDeduction: mealDeduction.amount,
        totalFoodDeduction: mealDeduction.amount,
        mealDays: foodCostDays,
        calculationDate: new Date(),
        selectedBills: monthlyFoodCosts.map(bill => ({
          id: bill._id,
          date: bill.date,
          cost: bill.cost,
          note: bill.note
        })),
        calculationNote: mealDeduction.calculationNote
      },

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
          description: calculation.calculations.allowance > 0 ? 
            (onsiteBenefitsDetails.teaAllowance > 0 ? 
              `Manual: ${allowance} + Onsite Tea Allowance: ${onsiteBenefitsDetails.teaAllowance}` : 
              'Manual allowance') : 
            ''
        },
        
        houseRent: 0,
        medical: 0,
        conveyance: 0,
        incentives: 0,
        otherAllowances: onsiteBenefitsDetails.teaAllowance,
        onsiteTeaAllowance: onsiteBenefitsDetails.teaAllowance,
        total: totalEarnings
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
        serviceCharge: onsiteBenefitsDetails.serviceCharge,
        otherDeductions: onsiteBenefitsDetails.serviceCharge,
        foodCostDeduction: mealDeduction.amount, // Updated to use mealDeduction.amount
      
        deductionRules: {
          lateRule: "3 days late = 1 day salary deduction",
          absentRule: "1 day absent = 1 day salary deduction",
          leaveRule: "1 day leave = 1 day salary deduction",
          halfDayRule: "1 half day = 0.5 day salary deduction",
          holidayRule: "Holidays are not deducted",
          weeklyOffRule: "Weekly offs are not deducted",
          capRule: "Total deductions cannot exceed monthly salary",
          netPayableRule: "Net payable minimum 0",
          serviceChargeRule: "Fixed 500 BDT service charge for onsite employees",
          teaAllowanceRule: "10 BDT tea allowance per present day for onsite employees",
          // নতুন Rule যোগ করা হয়েছে
          mealDeductionRule: mealDeduction.type === 'monthly_subscription' ? 
            `Food cost (${totalMonthlyFoodCost} BDT) ÷ ${activeSubscribers} active subscribers` :
            mealDeduction.type === 'daily_meal' ?
            `Daily meals: ${dailyMealDays} days × ${dailyMealRate} BDT` :
            'No meal deduction'
        },
        
        total: totalDeductions,
        calculatedTotal: calculation.calculations.deductions.calculatedTotal,
        isCapped: calculation.calculations.deductions.isCapped,
        cappedAmount: calculation.calculations.deductions.cappedAmount,
        deductionBreakdown: calculation.calculations.deductions.breakdown
      },
      
      summary: {
        grossEarnings: totalEarnings,
        totalDeductions: totalDeductions,
        netPayable: netPayable,
        payableDays: calculation.attendance.presentDays,
        deductionCapApplied: calculation.calculations.deductions.isCapped,
        rulesApplied: calculation.calculations.totals.ruleApplied,
        onsiteBenefitsApplied: employee.workLocationType === 'onsite',
        onsiteBenefitsDetails: onsiteBenefitsDetails,
        
        // নতুন ফিল্ড যোগ করুন
        onsiteBreakdown: {
          teaAllowance: onsiteBenefitsDetails.teaAllowance,
          serviceCharge: onsiteBenefitsDetails.serviceCharge,
          netOnsiteEffect: onsiteBenefitsDetails.netEffect,
          foodCostIncluded: mealDeduction.type === 'monthly_subscription',
          foodCostDeduction: mealDeduction.amount,
          netPayable: netPayable
        },
        
        // Meal System Summary
        mealSystemSummary: {
          type: mealDeduction.type,
          deduction: mealDeduction.amount,
          calculation: mealDeduction.calculationNote,
          details: {
            monthlyFoodCost: totalMonthlyFoodCost,
            activeSubscribers: activeSubscribers,
            dailyMealDays: dailyMealDays,
            dailyMealRate: dailyMealRate
          }
        }
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
        deductionNote: calculation.notes?.deductionNote || '',
        onsiteBenefitsNote: onsiteBenefitsDetails.calculationNote,
        // নতুন Note যোগ করা হয়েছে
        mealDeductionNote: mealDeduction.calculationNote
      },
      
      manualInputs: {
        overtime: parseInt(overtime),
        overtimeHours: 0,
        bonus: parseInt(bonus),
        allowance: parseInt(allowance),
        dailyMealRate: parseFloat(dailyMealRate) || 0, // নতুন field যোগ করা হয়েছে
        enteredBy: req.user._id,
        enteredAt: new Date()
      },
      
      calculation: {
        method: 'auto_backend',
        calculatedDate: new Date(),
        calculatedBy: req.user._id,
        dataSources: [
          'attendance', 
          'leaves', 
          'holidays', 
          'office_schedule', 
          'manual_input',
          'meal_system', // নতুন data source
          'food_cost_system' // নতুন data source
        ],
        calculationNotes: 'Auto-calculated with 23 days fixed basis + Deduction Cap + Onsite Benefits + Meal System'
      },
      
      metadata: {
        isAutoGenerated: true,
        hasManualInputs: overtime > 0 || bonus > 0 || allowance > 0 || dailyMealRate > 0,
        deductionRulesApplied: true,
        deductionCapApplied: calculation.calculations.deductions.isCapped,
        attendanceBased: true,
        fixed23Days: true,
        version: '4.0', // Updated version
        safetyRules: ['Deduction cap = monthly salary', 'Net payable minimum 0'],
        onsiteBenefitsIncluded: employee.workLocationType === 'onsite',
        workLocationType: employee.workLocationType,
        mealSystemIncluded: true, // নতুন flag
        foodCostIncluded: mealDeduction.type === 'monthly_subscription',
        foodCostBillsCount: monthlyFoodCosts.length,
        activeSubscribersCount: activeSubscribers,
        mealType: mealDeduction.type
      },
      
      notes: (notes || `Payroll for ${new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long' })} ${year}`) + 
        (mealDeduction.type !== 'none' ? ` | Meal Deduction: ${mealDeduction.amount} BDT (${mealDeduction.type})` : '') +
        (employee.workLocationType === 'onsite' ? ` | Onsite: ${onsiteBenefitsDetails.netEffect} BDT net` : ''),
      
      createdBy: req.user._id
    });
    
    await payroll.save();
    
    // Update employee's last calculated date for onsite benefits
    if (employee.workLocationType === 'onsite') {
      employee.onsiteBenefits.lastCalculated = new Date();
      await employee.save();
    }
    
    const response = {
      status: 'success',
      message: 'Payroll created successfully with auto meal system',
      data: {
        payrollId: payroll._id,
        employee: payroll.employeeName,
        netPayable: payroll.summary.netPayable,
        
        // Meal System Details
        mealSystem: {
          status: hasSubscription ? 'Monthly Subscription' : 
                 hasDailyMeals ? 'Daily Meals' : 'No Meals',
          deduction: mealDeduction.amount,
          calculation: mealDeduction.calculationNote,
          autoCalculated: {
            monthlyFoodCost: totalMonthlyFoodCost,
            activeSubscribers: activeSubscribers,
            dailyMealDays: dailyMealDays
          }
        },
        
        foodCostDetails: {
          totalMealCost: totalMonthlyFoodCost,
          deductionPerEmployee: mealDeduction.amount,
          calculation: `${totalMonthlyFoodCost} ÷ ${activeSubscribers} = ${mealDeduction.amount}`
        },
        
        onsiteBenefits: {
          serviceCharge: onsiteBenefitsDetails.serviceCharge,
          teaAllowance: onsiteBenefitsDetails.teaAllowance,
          calculation: onsiteBenefitsDetails.calculationNote,
          netEffect: onsiteBenefitsDetails.netEffect
        },
        
        breakdown: {
          earnings: totalEarnings,
          deductions: {
            attendance: calculation.calculations.deductions.actualTotal,
            meal: mealDeduction.amount,
            onsite: onsiteBenefitsDetails.serviceCharge,
            total: totalDeductions
          },
          netPayable: netPayable
        }
      },
      warnings: []
    };
    
    // Add warnings if needed
    if (calculation.calculations.deductions.isCapped) {
      response.warnings.push('Deductions capped at monthly salary');
      response.warnings.push(`Excess deduction not applied: ${formatCurrency(calculation.calculations.deductions.cappedAmount)}`);
    }
    
    if (employee.workLocationType === 'onsite') {
      response.warnings.push(`Onsite benefits applied: ${onsiteBenefitsDetails.teaAllowance} BDT allowance - ${onsiteBenefitsDetails.serviceCharge} BDT deduction = ${onsiteBenefitsDetails.netEffect} BDT net effect`);
    }
    
    if (mealDeduction.type === 'monthly_subscription') {
      response.warnings.push(`Meal deduction: ${totalMonthlyFoodCost} BDT ÷ ${activeSubscribers} subscribers = ${mealDeduction.amount} BDT`);
    } else if (mealDeduction.type === 'daily_meal') {
      response.warnings.push(`Daily meal deduction: ${dailyMealDays} days × ${dailyMealRate} BDT = ${mealDeduction.amount} BDT`);
    }
    
    res.status(201).json(response);
    
  } catch (error) {
    console.error('Create payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// Helper function to format currency
// const formatCurrency = (amount) => {
//   return new Intl.NumberFormat('en-BD', {
//     style: 'currency',
//     currency: 'BDT',
//     minimumFractionDigits: 2
//   }).format(amount);
// };

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
        // Calculate food cost deduction for all employees
    let foodCostDeductionMap = {};
    
    if (includeFoodCost && foodCostBillIds && foodCostBillIds.length > 0) {
      const foodCostData = await calculateFoodCostDeduction(month, year);
      
      if (foodCostData.perEmployeeDeduction > 0) {
        // Create a map of employee ID to food cost deduction
        foodCostData.mealEmployees.forEach(emp => {
          foodCostDeductionMap[emp.id] = foodCostData.perEmployeeDeduction;
        });
      }
    }
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

// 14. Employee Accept Payroll
exports.employeeAcceptPayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user._id; // Current logged in employee
    
    // Find payroll
    const payroll = await Payroll.findById(id);
    
    if (!payroll || payroll.isDeleted) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    // Check if payroll belongs to this employee
    if (payroll.employee.toString() !== employeeId.toString()) {
      return res.status(403).json({
        status: 'fail',
        message: 'You can only accept your own payroll'
      });
    }
    
    // Check if already paid or accepted
    if (payroll.status === 'Paid') {
      return res.status(400).json({
        status: 'fail',
        message: 'Payroll is already paid'
      });
    }
    
    // Update status to "Paid" and add employee acceptance info
    payroll.status = 'Paid';
    payroll.employeeAccepted = {
      accepted: true,
      acceptedAt: new Date(),
      acceptedBy: employeeId
    };
    
    // Update payment info
    payroll.payment = {
      paymentDate: new Date(),
      paymentMethod: 'Employee Accepted',
      transactionId: `EMP_ACCEPT_${Date.now()}`,
      bankAccount: 'Employee Acceptance',
      paidBy: employeeId,
      paymentNotes: 'Accepted by employee through portal'
    };
    
    // Add metadata
    payroll.metadata.employeeAccepted = true;
    
    await payroll.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Payroll accepted successfully. Status updated to "Paid".',
      data: {
        payrollId: payroll._id,
        status: payroll.status,
        acceptedAt: payroll.employeeAccepted.acceptedAt,
        netPayable: payroll.summary.netPayable
      }
    });
    
  } catch (error) {
    console.error('Employee accept payroll error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};

// 15. Check Employee Acceptance Status
exports.checkEmployeeAcceptance = async (req, res) => {
  try {
    const { id } = req.params;
    
    const payroll = await Payroll.findById(id).select('employeeAccepted status payment employee');
    
    if (!payroll) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        employeeAccepted: payroll.employeeAccepted || { accepted: false },
        status: payroll.status,
        paymentDate: payroll.payment?.paymentDate,
        employeeId: payroll.employee
      }
    });
    
  } catch (error) {
    console.error('Check employee acceptance error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message
    });
  }
};
exports.calculateOnsiteBenefitsForPayroll = async (employeeId, month, year, attendanceData) => {
  try {
    const employee = await User.findById(employeeId);
    
    // Check if employee is onsite
    if (employee.workLocationType !== 'onsite') {
      return {
        deduction: 0,
        allowance: 0,
        presentDays: 0,
        netEffect: 0,
        calculationNote: 'Not an onsite employee'
      };
    }
    
    const presentDays = attendanceData.presentDays || 0;
    const halfDays = attendanceData.halfDays || 0;
    
    // Calculate eligible days
    const includeHalfDays = employee.onsiteBenefits?.includeHalfDays !== false;
    const eligibleDays = presentDays + (includeHalfDays ? Math.ceil(halfDays / 2) : 0);
    
    // Get rates from employee data
    const fixedDeduction = employee.onsiteBenefits?.fixedDeduction || 500;
    const dailyRate = employee.onsiteBenefits?.dailyAllowanceRate || 10;
    
    // Calculate benefits
    const allowance = eligibleDays * dailyRate;
    const deduction = fixedDeduction;
    const netEffect = allowance - deduction;
    
    return {
      deduction: deduction,
      allowance: allowance,
      presentDays: eligibleDays,
      netEffect: netEffect,
      calculationNote: `Onsite Benefits: ${eligibleDays} days × ${dailyRate} BDT = ${allowance} - ${deduction} deduction = ${netEffect} BDT`
    };
  } catch (error) {
    console.error('Error calculating onsite benefits:', error);
    return {
      deduction: 0,
      allowance: 0,
      presentDays: 0,
      netEffect: 0,
      calculationNote: 'Error in calculation'
    };
  }
}; 
// controllers/payrollController.js

// Employee acceptance এর জন্য নতুন ফাংশন
const handleEmployeeAcceptance = async (payrollId, employeeId, userData) => {
  try {
    const payroll = await Payroll.findById(payrollId);
    if (!payroll) {
      throw new Error('Payroll not found');
    }
    
    // Verify ownership
    if (payroll.employee.toString() !== employeeId.toString()) {
      throw new Error('You can only accept your own payroll');
    }
    
    // Check if already accepted
    if (payroll.employeeAccepted?.accepted) {
      throw new Error('Payroll already accepted');
    }
    
    // Update payroll status and acceptance info
    payroll.status = 'Paid';
    payroll.employeeAccepted = {
      accepted: true,
      acceptedAt: new Date(),
      acceptedBy: employeeId,
      employeeName: userData.name || `${userData.firstName} ${userData.lastName}`,
      employeeId: userData.employeeId
    };
    
    // Add payment info
    payroll.payment = {
      paymentDate: new Date(),
      paymentMethod: 'Employee Accepted',
      transactionId: `EMP_ACCEPT_${Date.now()}_${employeeId}`,
      bankAccount: 'Employee Acceptance',
      paidBy: employeeId,
      paymentNotes: 'Payroll accepted by employee'
    };
    
    // Update metadata
    payroll.metadata.employeeAccepted = true;
    payroll.metadata.acceptedVia = 'employee_portal';
    payroll.metadata.acceptedAt = new Date();
    
    // Mark as modified and save
    payroll.markModified('employeeAccepted');
    payroll.markModified('payment');
    payroll.markModified('metadata');
    
    await payroll.save();
    
    return payroll;
  } catch (error) {
    console.error('Employee acceptance error:', error);
    throw error;
  }
};

// Employee acceptance API endpoint আপডেট করুন
exports.employeeAcceptPayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user._id;
    
    // Get employee data
    const employee = await User.findById(employeeId).select('firstName lastName employeeId');
    if (!employee) {
      return res.status(404).json({
        status: 'fail',
        message: 'Employee not found'
      });
    }
    
    // Process acceptance
    const updatedPayroll = await handleEmployeeAcceptance(
      id, 
      employeeId, 
      {
        name: `${employee.firstName} ${employee.lastName}`,
        employeeId: employee.employeeId,
        firstName: employee.firstName,
        lastName: employee.lastName
      }
    );
    
    res.status(200).json({
      status: 'success',
      message: 'Payroll accepted successfully! Status updated to "Paid".',
      data: {
        payrollId: updatedPayroll._id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeId: employee.employeeId,
        month: updatedPayroll.month,
        year: updatedPayroll.year,
        monthName: getMonthName(updatedPayroll.month),
        netPayable: updatedPayroll.summary.netPayable,
        acceptedAt: updatedPayroll.employeeAccepted.acceptedAt,
        previousStatus: 'Pending',
        newStatus: 'Paid',
        acceptedBy: updatedPayroll.employeeAccepted.employeeName
      }
    });
    
  } catch (error) {
    console.error('Employee accept payroll error:', error);
    
    if (error.message.includes('only accept your own')) {
      return res.status(403).json({
        status: 'fail',
        message: error.message
      });
    }
    
    if (error.message.includes('already accepted')) {
      return res.status(400).json({
        status: 'fail',
        message: error.message
      });
    }
    
    res.status(500).json({
      status: 'fail',
      message: error.message || 'Failed to accept payroll'
    });
  }
};

// Get payroll details for employee - নতুন ফাংশন
exports.getEmployeePayrollDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user._id;
    
    // Find payroll
    const payroll = await Payroll.findById(id)
      .select('employee employeeName employeeId department designation month year status summary deductions earnings attendance salaryDetails periodStart periodEnd employeeAccepted payment metadata calculationNotes')
      .lean();
    
    if (!payroll) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payroll not found'
      });
    }
    
    // Verify ownership (employee can only see their own payroll)
    if (payroll.employee.toString() !== employeeId.toString() && req.user.role === 'employee') {
      return res.status(403).json({
        status: 'fail',
        message: 'You can only view your own payroll details'
      });
    }
    
    // Format the response for employee view
    const response = {
      status: 'success',
      data: {
        payrollId: payroll._id,
        employee: {
          name: payroll.employeeName,
          employeeId: payroll.employeeId,
          department: payroll.department,
          designation: payroll.designation
        },
        period: {
          month: payroll.month,
          year: payroll.year,
          monthName: getMonthName(payroll.month),
          startDate: payroll.periodStart,
          endDate: payroll.periodEnd,
          formattedPeriod: `${getMonthName(payroll.month)} ${payroll.year}`
        },
        salary: {
          monthly: payroll.salaryDetails?.monthlySalary || 0,
          daily: payroll.salaryDetails?.dailyRate || 0,
          hourly: payroll.salaryDetails?.hourlyRate || 0
        },
        attendance: {
          totalDays: payroll.attendance?.totalWorkingDays || 23,
          presentDays: payroll.attendance?.presentDays || 0,
          absentDays: payroll.attendance?.absentDays || 0,
          leaveDays: payroll.attendance?.leaveDays || 0,
          lateDays: payroll.attendance?.lateDays || 0,
          halfDays: payroll.attendance?.halfDays || 0,
          attendancePercentage: payroll.attendance?.attendancePercentage || 0
        },
        earnings: {
          basicPay: payroll.earnings?.basicPay || 0,
          overtime: payroll.earnings?.overtime?.amount || 0,
          bonus: payroll.earnings?.bonus?.amount || 0,
          allowance: payroll.earnings?.allowance?.amount || 0,
          total: payroll.summary?.grossEarnings || 0
        },
        deductions: {
          late: payroll.deductions?.lateDeduction || 0,
          absent: payroll.deductions?.absentDeduction || 0,
          leave: payroll.deductions?.leaveDeduction || 0,
          halfDay: payroll.deductions?.halfDayDeduction || 0,
          total: payroll.deductions?.total || 0
        },
        summary: {
          grossEarnings: payroll.summary?.grossEarnings || 0,
          totalDeductions: payroll.deductions?.total || 0,
          netPayable: payroll.summary?.netPayable || 0,
          netPayableInWords: payroll.summary?.inWords || ''
        },
        status: {
          current: payroll.status,
          employeeAccepted: payroll.employeeAccepted?.accepted || false,
          acceptedAt: payroll.employeeAccepted?.acceptedAt,
          payment: payroll.payment ? {
            date: payroll.payment.paymentDate,
            method: payroll.payment.paymentMethod,
            transactionId: payroll.payment.transactionId
          } : null
        },
        metadata: {
          calculationBasis: payroll.salaryDetails?.calculationBasis || '23 days fixed',
          fixed23Days: payroll.metadata?.fixed23Days || true,
          version: payroll.metadata?.version || '1.0',
          createdDate: payroll.createdAt,
          lastUpdated: payroll.updatedAt
        },
        notes: payroll.calculationNotes || {}
      }
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Get employee payroll details error:', error);
    res.status(500).json({
      status: 'fail',
      message: error.message || 'Failed to get payroll details'
    });
  }
};
module.exports = exports;