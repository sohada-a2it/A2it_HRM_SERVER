const SalaryRule = require('../models/SalaryRuleModel');
const mongoose = require('mongoose');

// Default static rules data (with correct field names)
const DEFAULT_RULES = [
  {
    ruleCode: "LATE_DEDUCTION_001",
    title: "Late Attendance Policy",
    description: "3 days late = 1 day salary deduction",
    ruleType: "late_deduction",
    calculation: "3 days late = 1 day salary deduction",
    deductionAmount: 1,
    conditions: {
      threshold: 3,
      deductionType: "daily_salary",
      applicableTo: ["all_employees"],
      effectiveFrom: new Date()
    },
    isActive: true,
    isSystemDefault: true,
    date: new Date()
  },
  {
    ruleCode: "ADJUSTMENT_001",
    title: "Adjustment Policy",
    description: "1 day adjustment = 1 day salary deduction",
    ruleType: "adjustment_deduction",
    calculation: "1 day adjustment = 1 day salary deduction",
    deductionAmount: 1,
    conditions: {
      threshold: 1,
      deductionType: "daily_salary",
      applicableTo: ["all_employees"],
      effectiveFrom: new Date()
    },
    isActive: true,
    isSystemDefault: true,
    date: new Date()
  }
];

// Helper: Create default rules
const createDefaultRules = async (adminUserId) => {
  try {
    // Check if default rules already exist
    const existingRules = await SalaryRule.find({ isSystemDefault: true });
    
    if (existingRules.length === 0) {
      const rulesWithAdmin = DEFAULT_RULES.map(rule => ({
        ...rule,
        createdBy: adminUserId || new mongoose.Types.ObjectId()
      }));
      
      await SalaryRule.insertMany(rulesWithAdmin);
      console.log("✅ Default salary rules created");
    }
  } catch (error) {
    console.error("❌ Error creating default rules:", error.message);
  }
};

// ---------------- Get All Salary Rules ----------------
exports.getAllSalaryRules = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Authentication required'
      });
    }

    // Ensure default rules exist (pass admin user ID if available)
    await createDefaultRules(req.user._id);

    // Get all rules
    const rules = await SalaryRule.find()
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      status: 'success',
      count: rules.length,
      rules
    });
  } catch (err) {
    console.error("❌ Get all rules error:", err.message);
    res.status(500).json({
      status: 'fail',
      message: 'Server error while fetching salary rules',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ---------------- Get Active Salary Rules ----------------
exports.getActiveSalaryRules = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Authentication required'
      });
    }

    // For employees, only show active rules
    const rules = await SalaryRule.find({ isActive: true })
      .select('title description ruleType calculation deductionAmount conditions isActive ruleCode isSystemDefault')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      status: 'success',
      count: rules.length,
      rules
    });
  } catch (err) {
    console.error("❌ Get active rules error:", err.message);
    res.status(500).json({
      status: 'fail',
      message: 'Server error while fetching active salary rules',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
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
      isActive,
      date
    } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'fail',
        message: 'Only admin can create salary rules'
      });
    }

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Title is required'
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        status: 'fail',
        message: 'Description is required'
      });
    }

    if (!ruleType) {
      return res.status(400).json({
        status: 'fail',
        message: 'Rule type is required'
      });
    }

    // Validate deduction amount
    const parsedDeductionAmount = parseFloat(deductionAmount);
    if (isNaN(parsedDeductionAmount) || parsedDeductionAmount < 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Valid deduction amount is required'
      });
    }

    // Prepare conditions object
    const ruleConditions = {
      threshold: conditions?.threshold || 1,
      deductionType: conditions?.deductionType || 'daily_salary',
      applicableTo: Array.isArray(conditions?.applicableTo) && conditions.applicableTo.length > 0
        ? conditions.applicableTo
        : ['all_employees'],
      effectiveFrom: conditions?.effectiveFrom ? new Date(conditions.effectiveFrom) : new Date()
    };

    // Create the salary rule
    const rule = await SalaryRule.create({
      title: title.trim(),
      description: description.trim(),
      ruleType,
      calculation: calculation || `${parsedDeductionAmount} day's salary deduction`,
      deductionAmount: parsedDeductionAmount,
      conditions: ruleConditions,
      isActive: isActive !== undefined ? isActive : true,
      date: date ? new Date(date) : new Date(),
      createdBy: req.user._id,
      isSystemDefault: false
    });

    // Populate createdBy
    await rule.populate('createdBy', 'name email');

    res.status(201).json({
      status: 'success',
      message: 'Salary rule created successfully',
      rule
    });
  } catch (err) {
    console.error("❌ Create rule error:", err.message);
    
    // Handle duplicate rule code error
    if (err.code === 11000) {
      return res.status(400).json({
        status: 'fail',
        message: 'Rule with this code already exists'
      });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors: errors.length > 0 ? errors : [err.message]
      });
    }

    res.status(500).json({
      status: 'fail',
      message: 'Server error while creating salary rule',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ---------------- Update Salary Rule ----------------
exports.updateSalaryRule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid rule ID'
      });
    }

    const rule = await SalaryRule.findById(id);
    
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

    // Check if it's a system default rule (optional: can update but show warning)
    if (rule.isSystemDefault) {
      // You can decide whether to allow updates to system rules
      // For now, we allow but add a note
      console.log('⚠️ Updating system default rule:', rule.ruleCode);
    }

    const {
      title,
      description,
      ruleType,
      calculation,
      deductionAmount,
      conditions,
      isActive,
      date
    } = req.body;

    // Update fields if provided
    if (title !== undefined && title.trim()) rule.title = title.trim();
    if (description !== undefined && description.trim()) rule.description = description.trim();
    if (ruleType !== undefined) rule.ruleType = ruleType;
    if (calculation !== undefined) rule.calculation = calculation;
    if (deductionAmount !== undefined) {
      const parsedAmount = parseFloat(deductionAmount);
      if (!isNaN(parsedAmount) && parsedAmount >= 0) {
        rule.deductionAmount = parsedAmount;
      }
    }
    
    // Update conditions if provided
    if (conditions) {
      if (conditions.threshold !== undefined) {
        const parsedThreshold = parseFloat(conditions.threshold);
        if (!isNaN(parsedThreshold) && parsedThreshold >= 0) {
          rule.conditions.threshold = parsedThreshold;
        }
      }
      if (conditions.deductionType !== undefined) rule.conditions.deductionType = conditions.deductionType;
      if (conditions.applicableTo !== undefined && Array.isArray(conditions.applicableTo)) {
        rule.conditions.applicableTo = conditions.applicableTo;
      }
      if (conditions.effectiveFrom !== undefined) {
        rule.conditions.effectiveFrom = new Date(conditions.effectiveFrom);
      }
    }
    
    if (isActive !== undefined) rule.isActive = isActive;
    if (date !== undefined) rule.date = new Date(date);
    
    rule.updatedAt = new Date();
    rule.updatedBy = req.user._id;

    await rule.save();
    
    // Populate user fields
    await rule.populate('createdBy', 'name email');
    await rule.populate('updatedBy', 'name email');
    
    res.status(200).json({
      status: 'success',
      message: 'Salary rule updated successfully',
      rule
    });

  } catch (err) {
    console.error("❌ Update rule error:", err.message);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(el => el.message);
      return res.status(400).json({
        status: 'fail',
        message: 'Validation error',
        errors: errors.length > 0 ? errors : [err.message]
      });
    }

    res.status(500).json({
      status: 'fail',
      message: 'Server error while updating salary rule',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ---------------- Delete Salary Rule ----------------
exports.deleteSalaryRule = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid rule ID'
      });
    }

    const rule = await SalaryRule.findById(id);
    
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
    console.error("❌ Delete rule error:", err.message);
    res.status(500).json({
      status: 'fail',
      message: 'Server error while deleting salary rule',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ---------------- Get Salary Rule by ID ----------------
exports.getSalaryRuleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid rule ID'
      });
    }

    const rule = await SalaryRule.findById(id)
      .populate('createdBy', 'name email role')
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
    console.error("❌ Get rule by ID error:", err.message);
    res.status(500).json({
      status: 'fail',
      message: 'Server error while fetching salary rule',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ---------------- Get Salary Rules by Type ----------------
exports.getSalaryRulesByType = async (req, res) => {
  try {
    const { type } = req.params;
    
    // Validate rule type
    const validTypes = ['late_deduction', 'adjustment_deduction', 'bonus', 'allowance'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid rule type'
      });
    }

    const rules = await SalaryRule.find({ ruleType: type, isActive: true })
      .select('title description calculation deductionAmount conditions')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      status: 'success',
      count: rules.length,
      rules
    });
  } catch (err) {
    console.error("❌ Get rules by type error:", err.message);
    res.status(500).json({
      status: 'fail',
      message: 'Server error while fetching salary rules by type',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ---------------- Toggle Rule Status ----------------
exports.toggleRuleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid rule ID'
      });
    }

    const rule = await SalaryRule.findById(id);
    
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
        message: 'Only admin can toggle rule status'
      });
    }

    // Toggle isActive status
    rule.isActive = !rule.isActive;
    rule.updatedAt = new Date();
    rule.updatedBy = req.user._id;

    await rule.save();
    
    res.status(200).json({
      status: 'success',
      message: `Rule ${rule.isActive ? 'activated' : 'deactivated'} successfully`,
      rule: {
        _id: rule._id,
        title: rule.title,
        isActive: rule.isActive
      }
    });
  } catch (err) {
    console.error("❌ Toggle rule status error:", err.message);
    res.status(500).json({
      status: 'fail',
      message: 'Server error while toggling rule status',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};