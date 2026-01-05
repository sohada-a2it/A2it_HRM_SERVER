const SalaryRule = require('../models/SalaryRuleModel');

// ✅ Create a new salary rule
exports.createSalaryRule = async (req, res) => {
  try {
    const {
      title,
      description,
      salaryType,
      rate,
      overtimeRate,
      overtimeEnabled,
      leaveRule,
      lateRule,
      bonusAmount,
      bonusConditions,
      isActive,
      department,
      applicableTo
    } = req.body;

    // Validate required fields
    if (!title || !salaryType || rate === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Title, salary type, and rate are required'
      });
    }

    // Create new salary rule
    const salaryRule = new SalaryRule({
      title,
      description: description || '',
      salaryType,
      rate: parseFloat(rate),
      overtimeRate: overtimeEnabled ? parseFloat(overtimeRate || 0) : 0,
      overtimeEnabled: overtimeEnabled || false,
      leaveRule: {
        enabled: leaveRule?.enabled || false,
        paidLeaves: leaveRule?.paidLeaves || 0,
        perDayDeduction: leaveRule?.perDayDeduction || 0
      },
      lateRule: {
        enabled: lateRule?.enabled || false,
        lateDaysThreshold: lateRule?.lateDaysThreshold || 3,
        equivalentLeaveDays: lateRule?.equivalentLeaveDays || 0.5
      },
      bonusAmount: parseFloat(bonusAmount || 0),
      bonusConditions: bonusConditions || '',
      isActive: isActive !== undefined ? isActive : true,
      department: department || null,
      applicableTo: Array.isArray(applicableTo) ? applicableTo : ['all_employees'],
      createdBy: req.user._id
    });

    await salaryRule.save();

    res.status(201).json({
      success: true,
      message: 'Salary rule created successfully',
      data: salaryRule
    });
  } catch (error) {
    console.error('Create salary rule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating salary rule',
      error: error.message
    });
  }
};

// ✅ Get all salary rules (Admin only)
exports.getAllSalaryRules = async (req, res) => {
  try {
    const salaryRules = await SalaryRule.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: salaryRules.length,
      data: salaryRules
    });
  } catch (error) {
    console.error('Get salary rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary rules',
      error: error.message
    });
  }
};

// ✅ Get active salary rules (For employees)
exports.getActiveSalaryRules = async (req, res) => {
  try {
    const salaryRules = await SalaryRule.find({ isActive: true })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: salaryRules.length,
      data: salaryRules
    });
  } catch (error) {
    console.error('Get active salary rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active salary rules',
      error: error.message
    });
  }
};

// ✅ Get salary rule by ID
exports.getSalaryRuleById = async (req, res) => {
  try {
    const salaryRule = await SalaryRule.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!salaryRule) {
      return res.status(404).json({
        success: false,
        message: 'Salary rule not found'
      });
    }

    res.status(200).json({
      success: true,
      data: salaryRule
    });
  } catch (error) {
    console.error('Get salary rule by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary rule',
      error: error.message
    });
  }
};

// ✅ Update salary rule
exports.updateSalaryRule = async (req, res) => {
  try {
    const {
      title,
      description,
      salaryType,
      rate,
      overtimeRate,
      overtimeEnabled,
      leaveRule,
      lateRule,
      bonusAmount,
      bonusConditions,
      isActive,
      department,
      applicableTo
    } = req.body;

    // Find salary rule
    let salaryRule = await SalaryRule.findById(req.params.id);
    
    if (!salaryRule) {
      return res.status(404).json({
        success: false,
        message: 'Salary rule not found'
      });
    }

    // Update fields
    salaryRule.title = title || salaryRule.title;
    salaryRule.description = description || salaryRule.description;
    salaryRule.salaryType = salaryType || salaryRule.salaryType;
    salaryRule.rate = rate !== undefined ? parseFloat(rate) : salaryRule.rate;
    salaryRule.overtimeEnabled = overtimeEnabled !== undefined ? overtimeEnabled : salaryRule.overtimeEnabled;
    salaryRule.overtimeRate = overtimeRate !== undefined ? parseFloat(overtimeRate) : salaryRule.overtimeRate;
    
    // Update nested objects
    if (leaveRule) {
      salaryRule.leaveRule.enabled = leaveRule.enabled !== undefined ? leaveRule.enabled : salaryRule.leaveRule.enabled;
      salaryRule.leaveRule.paidLeaves = leaveRule.paidLeaves !== undefined ? leaveRule.paidLeaves : salaryRule.leaveRule.paidLeaves;
      salaryRule.leaveRule.perDayDeduction = leaveRule.perDayDeduction !== undefined ? leaveRule.perDayDeduction : salaryRule.leaveRule.perDayDeduction;
    }
    
    if (lateRule) {
      salaryRule.lateRule.enabled = lateRule.enabled !== undefined ? lateRule.enabled : salaryRule.lateRule.enabled;
      salaryRule.lateRule.lateDaysThreshold = lateRule.lateDaysThreshold !== undefined ? lateRule.lateDaysThreshold : salaryRule.lateRule.lateDaysThreshold;
      salaryRule.lateRule.equivalentLeaveDays = lateRule.equivalentLeaveDays !== undefined ? lateRule.equivalentLeaveDays : salaryRule.lateRule.equivalentLeaveDays;
    }
    
    salaryRule.bonusAmount = bonusAmount !== undefined ? parseFloat(bonusAmount) : salaryRule.bonusAmount;
    salaryRule.bonusConditions = bonusConditions || salaryRule.bonusConditions;
    salaryRule.isActive = isActive !== undefined ? isActive : salaryRule.isActive;
    salaryRule.department = department || salaryRule.department;
    
    if (applicableTo) {
      salaryRule.applicableTo = Array.isArray(applicableTo) ? applicableTo : salaryRule.applicableTo;
    }

    await salaryRule.save();

    res.status(200).json({
      success: true,
      message: 'Salary rule updated successfully',
      data: salaryRule
    });
  } catch (error) {
    console.error('Update salary rule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating salary rule',
      error: error.message
    });
  }
};

// ✅ Delete salary rule
exports.deleteSalaryRule = async (req, res) => {
  try {
    const salaryRule = await SalaryRule.findById(req.params.id);
    
    if (!salaryRule) {
      return res.status(404).json({
        success: false,
        message: 'Salary rule not found'
      });
    }

    await salaryRule.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Salary rule deleted successfully'
    });
  } catch (error) {
    console.error('Delete salary rule error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting salary rule',
      error: error.message
    });
  }
};