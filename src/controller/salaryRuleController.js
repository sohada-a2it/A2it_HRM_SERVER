const SalaryRule = require('../models/SalaryRuleModel');

// Default static rules data
const DEFAULT_RULES = [
  {
    ruleCode: "LATE_DEDUCTION",
    title: "Late Attendance Policy",
    description: "3 days late = 1 day salary deduction",
    ruleType: "late_deduction",
    calculation: "3 days late = 1 day salary deduction",
    deductionAmount: 1, // 1 day's salary
    conditions: {
      lateDaysThreshold: 3,
      deductionType: "daily_salary",
      applicableTo: ["all_employees"],
      effectiveFrom: new Date()
    },
    isActive: true,
    isSystemDefault: true
  },
  {
    ruleCode: "ADSET_DEDUCTION",
    title: "Adset Adjustment Policy",
    description: "1 day adset = 1 day salary deduction",
    ruleType: "adjustment_deduction",
    calculation: "1 day adset = 1 day salary deduction",
    deductionAmount: 1, // 1 day's salary
    conditions: {
      adjustmentDaysThreshold: 1,
      deductionType: "daily_salary",
      applicableTo: ["all_employees"],
      effectiveFrom: new Date()
    },
    isActive: true,
    isSystemDefault: true
  }
];

// Helper: Create default rules
const createDefaultRules = async () => {
  try {
    // Check if default rules already exist
    const existingRules = await SalaryRule.find({ isSystemDefault: true });
    
    if (existingRules.length === 0) {
      await SalaryRule.insertMany(DEFAULT_RULES);
      console.log("Default salary rules created");
    }
  } catch (error) {
    console.error("Error creating default rules:", error);
  }
};

// ---------------- Get All Salary Rules ----------------
exports.getAllSalaryRules = async (req, res) => {
  try {
    // Ensure default rules exist
    await createDefaultRules();

    // Get all rules
    const rules = await SalaryRule.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({ 
      status: 'success', 
      count: rules.length,
      rules 
    });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: err.message });
  }
};

// ---------------- Get Active Salary Rules ----------------
exports.getActiveSalaryRules = async (req, res) => {
  try {
    // For employees, only show active rules
    const rules = await SalaryRule.find({ isActive: true })
      .select('title description ruleType calculation conditions isActive')
      .sort({ createdAt: -1 });
    
    res.status(200).json({ 
      status: 'success', 
      count: rules.length,
      rules 
    });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: err.message });
  }
};

// ---------------- Create Salary Rule ----------------
exports.createSalaryRule = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      ruleType, 
      calculation,
      deductionAmount,
      conditions,
      isActive 
    } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can create salary rules' 
      });
    }

    // Validate required fields
    if (!title || !description || !ruleType) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Title, description and rule type are required' 
      });
    }

    // Generate unique rule code
    const ruleCode = `RULE_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const rule = await SalaryRule.create({
      ruleCode,
      title,
      description,
      ruleType,
      calculation: calculation || `${deductionAmount || 1} day's salary deduction`,
      deductionAmount: deductionAmount || 1,
      conditions: conditions || {
        threshold: 1,
        deductionType: "daily_salary",
        applicableTo: ["all_employees"],
        effectiveFrom: new Date()
      },
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user._id,
      isSystemDefault: false
    });

    res.status(201).json({ 
      status: 'success', 
      message: 'Salary rule created successfully',
      rule 
    });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: err.message });
  }
};

// ---------------- Update Salary Rule ----------------
exports.updateSalaryRule = async (req, res) => {
  try {
    const rule = await SalaryRule.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Rule not found' 
      });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can update salary rules' 
      });
    }

    const { 
      title, 
      description, 
      ruleType, 
      calculation,
      deductionAmount,
      conditions,
      isActive 
    } = req.body;

    // Update fields
    if (title !== undefined) rule.title = title;
    if (description !== undefined) rule.description = description;
    if (ruleType !== undefined) rule.ruleType = ruleType;
    if (calculation !== undefined) rule.calculation = calculation;
    if (deductionAmount !== undefined) rule.deductionAmount = deductionAmount;
    if (conditions !== undefined) rule.conditions = conditions;
    if (isActive !== undefined) rule.isActive = isActive;

    rule.updatedAt = new Date();
    rule.updatedBy = req.user._id;

    await rule.save();
    
    res.status(200).json({ 
      status: 'success', 
      message: 'Salary rule updated successfully',
      rule 
    });

  } catch (err) {
    res.status(500).json({ status: 'fail', message: err.message });
  }
};

// ---------------- Delete Salary Rule ----------------
exports.deleteSalaryRule = async (req, res) => {
  try {
    const rule = await SalaryRule.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Rule not found' 
      });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        status: 'fail', 
        message: 'Only admin can delete salary rules' 
      });
    }

    // Prevent deletion of system default rules
    if (rule.isSystemDefault) {
      return res.status(400).json({ 
        status: 'fail', 
        message: 'Cannot delete system default rules' 
      });
    }

    await rule.deleteOne();
    
    res.status(200).json({ 
      status: 'success', 
      message: 'Salary rule deleted successfully' 
    });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: err.message });
  }
};

// ---------------- Get Salary Rule by ID ----------------
exports.getSalaryRuleById = async (req, res) => {
  try {
    const rule = await SalaryRule.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!rule) {
      return res.status(404).json({ 
        status: 'fail', 
        message: 'Rule not found' 
      });
    }

    res.status(200).json({ 
      status: 'success', 
      rule 
    });
  } catch (err) {
    res.status(500).json({ status: 'fail', message: err.message });
  }
};