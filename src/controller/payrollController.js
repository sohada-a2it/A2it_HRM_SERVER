const Payroll = require('../models/PayrollModel');  
const User = require('../models/UsersModel');
const Attendance = require('../models/AttendanceModel');
const Leave = require('../models/LeaveModel');
const SalaryRule = require('../models/SalaryRuleModel');

// -------------------- Calculate Salary Automatically --------------------
const calculateSalary = async (employeeId, periodStart, periodEnd) => {
  try {
    // Fetch employee
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    // Get salary rules from database
    const salaryRule = await SalaryRule.findOne().sort({ createdAt: -1 });
    if (!salaryRule) {
      throw new Error('Salary rules not configured');
    }

    const rules = salaryRule.rules;
    const workingDaysPerMonth = salaryRule.workingDaysPerMonth || 26;
    const perDaySalaryCalculation = salaryRule.perDaySalaryCalculation || true;

    // Get employee's annual salary from user model
    const annualSalary = employee.salary || 0;
    const monthlyBasic = annualSalary / 12;

    // Calculate attendance for the period
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: { $gte: periodStart, $lte: periodEnd },
      status: 'Present'
    });
    
    const presentDays = attendanceRecords.length;
    const attendancePercentage = (presentDays / workingDaysPerMonth) * 100;

    // Calculate leave days for the period
    const leaveRecords = await Leave.find({
      employee: employeeId,
      status: 'Approved',
      startDate: { $lte: periodEnd },
      endDate: { $gte: periodStart }
    });

    let leaveDays = 0;
    leaveRecords.forEach(leave => {
      const start = new Date(Math.max(new Date(leave.startDate), new Date(periodStart)));
      const end = new Date(Math.min(new Date(leave.endDate), new Date(periodEnd)));
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      leaveDays += diffDays;
    });

    // Calculate basic pay based on attendance
    let calculatedBasic = monthlyBasic;
    if (perDaySalaryCalculation) {
      calculatedBasic = (monthlyBasic / workingDaysPerMonth) * presentDays;
    }

    // Calculate all components based on rules
    const calculations = {};
    
    // Calculate each component from rules
    if (rules.components && Array.isArray(rules.components)) {
      rules.components.forEach(component => {
        if (component.type === 'percentage') {
          calculations[component.name] = (calculatedBasic * component.value) / 100;
        } else if (component.type === 'fixed') {
          calculations[component.name] = component.value;
        } else if (component.type === 'formula') {
          // You can add custom formula logic here
          calculations[component.name] = eval(component.formula.replace(/basic/g, calculatedBasic));
        }
      });
    }

    // Calculate net payable
    let totalAddition = 0;
    let totalDeduction = 0;
    
    if (rules.additions && Array.isArray(rules.additions)) {
      rules.additions.forEach(addition => {
        if (addition.type === 'percentage') {
          totalAddition += (calculatedBasic * addition.value) / 100;
        } else if (addition.type === 'fixed') {
          totalAddition += addition.value;
        }
      });
    }
    
    if (rules.deductions && Array.isArray(rules.deductions)) {
      rules.deductions.forEach(deduction => {
        if (deduction.type === 'percentage') {
          totalDeduction += (calculatedBasic * deduction.value) / 100;
        } else if (deduction.type === 'fixed') {
          totalDeduction += deduction.value;
        }
      });
    }

    const netPayable = calculatedBasic + totalAddition - totalDeduction;

    return {
      basicPay: calculatedBasic,
      presentDays,
      totalWorkingDays: workingDaysPerMonth,
      attendancePercentage,
      leaveDays,
      totalAddition,
      totalDeduction,
      netPayable,
      components: calculations,
      rulesApplied: {
        salaryRuleId: salaryRule._id,
        ruleName: salaryRule.ruleName,
        calculationMethod: perDaySalaryCalculation ? 'Per Day' : 'Monthly Fixed'
      },
      calculatedDate: new Date()
    };
  } catch (error) {
    console.error('Salary calculation error:', error);
    return null;
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

    // Employee details fetch
    const employeeData = await User.findById(employee);
    if (!employeeData) {
      return res.status(404).json({ 
        status: "fail", 
        message: "Employee not found" 
      });
    }

    // Auto calculate salary based on attendance and leaves
    const salaryCalculation = await calculateSalary(employee, periodStart, periodEnd);
    if (!salaryCalculation) {
      return res.status(500).json({ 
        status: "fail", 
        message: "Failed to calculate salary" 
      });
    }

    // Build full name from firstName + lastName
    const employeeName = `${employeeData.firstName || ''} ${employeeData.lastName || ''}`.trim();

    // Check if payroll already exists for this period
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

    // Create payroll
    const payroll = new Payroll({
      employee,
      name: employeeName,
      periodStart,
      periodEnd,
      basicPay: salaryCalculation.basicPay,
      presentDays: salaryCalculation.presentDays,
      totalWorkingDays: salaryCalculation.totalWorkingDays,
      attendancePercentage: salaryCalculation.attendancePercentage,
      leaveDays: salaryCalculation.leaveDays,
      totalAddition: salaryCalculation.totalAddition,
      totalDeduction: salaryCalculation.totalDeduction,
      netPayable: salaryCalculation.netPayable,
      status: status,
      calculationDetails: salaryCalculation.components,
      rulesApplied: salaryCalculation.rulesApplied,
      calculatedDate: salaryCalculation.calculatedDate,
      autoGenerated: true
    });

    await payroll.save();

    res.status(201).json({
      status: "success",
      message: "Payroll created successfully",
      data: payroll
    });

  } catch (error) {
    res.status(500).json({ 
      status: "fail", 
      message: error.message 
    });
  }
};

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
      .populate('employee', 'firstName lastName email employeeId role salary department');
    
    if (!payroll) {
      return res.status(404).json({ status: "fail", message: "Payroll not found" });
    }
    
    res.status(200).json({ status: "success", payroll });
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

// -------------------- Generate Payroll for All Employees (5th of Month) --------------------
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
        // Calculate salary
        const salaryCalculation = await calculateSalary(employee._id, periodStart, periodEnd);
        
        if (!salaryCalculation) {
          errors.push(`Failed to calculate salary for ${employee.employeeId}`);
          continue;
        }

        // Check if payroll already exists
        const existingPayroll = await Payroll.findOne({
          employee: employee._id,
          periodStart: periodStart,
          periodEnd: periodEnd
        });

        if (existingPayroll) {
          continue; // Skip if already exists
        }

        // Create payroll
        const employeeName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
        
        const payroll = new Payroll({
          employee: employee._id,
          name: employeeName,
          periodStart,
          periodEnd,
          basicPay: salaryCalculation.basicPay,
          presentDays: salaryCalculation.presentDays,
          totalWorkingDays: salaryCalculation.totalWorkingDays,
          attendancePercentage: salaryCalculation.attendancePercentage,
          leaveDays: salaryCalculation.leaveDays,
          totalAddition: salaryCalculation.totalAddition,
          totalDeduction: salaryCalculation.totalDeduction,
          netPayable: salaryCalculation.netPayable,
          status: 'Pending', // Employee needs to accept
          calculationDetails: salaryCalculation.components,
          rulesApplied: salaryCalculation.rulesApplied,
          calculatedDate: salaryCalculation.calculatedDate,
          autoGenerated: true,
          generatedOn: new Date()
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