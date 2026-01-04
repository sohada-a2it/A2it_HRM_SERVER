const SalaryRule = require('../models/SalaryRuleModel');
const User = require('../models/UsersModel');

// CREATE Salary Rule
exports.createSalaryRule = async (req, res) => {
  try {
    console.log('Creating salary rule with data:', req.body);
    
    const {
      title,
      salaryType,
      rate,
      description,
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

    // Validation
    if (!title || !salaryType || rate === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Title, salaryType, and rate are required fields'
      });
    }

    // Convert rate to number
    const numericRate = parseFloat(rate);
    if (isNaN(numericRate)) {
      return res.status(400).json({
        success: false,
        message: 'Rate must be a valid number'
      });
    }

    // Create salary rule object
    const salaryRuleData = {
      title,
      salaryType,
      rate: numericRate,
      createdBy: req.user._id // Make sure user is authenticated
    };

    // Add optional fields if provided
    if (description) salaryRuleData.description = description;
    if (overtimeRate !== undefined) {
      salaryRuleData.overtimeRate = parseFloat(overtimeRate) || 0;
      salaryRuleData.overtimeEnabled = overtimeEnabled || false;
    }
    if (leaveRule) {
      salaryRuleData.leaveRule = {
        enabled: leaveRule.enabled || false,
        perDayDeduction: parseFloat(leaveRule.perDayDeduction) || 0,
        paidLeaves: parseInt(leaveRule.paidLeaves) || 0
      };
    }
    if (lateRule) {
      salaryRuleData.lateRule = {
        enabled: lateRule.enabled || false,
        lateDaysThreshold: parseInt(lateRule.lateDaysThreshold) || 3,
        equivalentLeaveDays: parseFloat(lateRule.equivalentLeaveDays) || 0.5
      };
    }
    if (bonusAmount !== undefined) {
      salaryRuleData.bonusAmount = parseFloat(bonusAmount) || 0;
      if (bonusConditions) salaryRuleData.bonusConditions = bonusConditions;
    }
    if (isActive !== undefined) salaryRuleData.isActive = isActive;
    if (department) salaryRuleData.department = department;
    if (applicableTo && Array.isArray(applicableTo)) {
      salaryRuleData.applicableTo = applicableTo;
    }

    console.log('Processed salary rule data:', salaryRuleData);

    // Create new salary rule
    const salaryRule = new SalaryRule(salaryRuleData);
    
    // Save to database
    const savedSalaryRule = await salaryRule.save();
    
    console.log('Salary rule saved successfully:', savedSalaryRule._id);

    // Populate createdBy field
    const populatedRule = await SalaryRule.findById(savedSalaryRule._id)
      .populate('createdBy', 'firstName lastName email')
      .populate('department', 'name')
      .populate('applicableTo', 'firstName lastName employeeId');

    res.status(201).json({
      success: true,
      message: 'Salary rule created successfully',
      data: populatedRule
    });

  } catch (error) {
    console.error('Error creating salary rule:', error);
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate title found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// GET ALL Salary Rules
exports.getAllSalaryRules = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
      isActive,
      salaryType
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (salaryType) {
      query.salaryType = salaryType;
    }

    // Pagination
    const currentPage = parseInt(page);
    const pageLimit = parseInt(limit);
    const skip = (currentPage - 1) * pageLimit;

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Get total count
    const total = await SalaryRule.countDocuments(query);

    // Get data
    const salaryRules = await SalaryRule.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('department', 'name')
      .populate('applicableTo', 'firstName lastName employeeId')
      .sort(sort)
      .skip(skip)
      .limit(pageLimit);

    res.status(200).json({
      success: true,
      data: salaryRules,
      pagination: {
        page: currentPage,
        limit: pageLimit,
        total,
        pages: Math.ceil(total / pageLimit)
      }
    });

  } catch (error) {
    console.error('Error fetching salary rules:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// GET SINGLE Salary Rule
exports.getSalaryRuleById = async (req, res) => {
  try {
    const salaryRule = await SalaryRule.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('department', 'name')
      .populate('applicableTo', 'firstName lastName employeeId department');

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
    console.error('Error fetching salary rule:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid salary rule ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// UPDATE Salary Rule
exports.updateSalaryRule = async (req, res) => {
  try {
    const {
      title,
      salaryType,
      rate,
      description,
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
    const salaryRule = await SalaryRule.findById(req.params.id);
    
    if (!salaryRule) {
      return res.status(404).json({
        success: false,
        message: 'Salary rule not found'
      });
    }

    // Update fields
    if (title) salaryRule.title = title;
    if (salaryType) salaryRule.salaryType = salaryType;
    if (rate !== undefined) salaryRule.rate = parseFloat(rate);
    if (description !== undefined) salaryRule.description = description;
    
    if (overtimeRate !== undefined) {
      salaryRule.overtimeRate = parseFloat(overtimeRate);
      if (overtimeEnabled !== undefined) {
        salaryRule.overtimeEnabled = overtimeEnabled;
      }
    }
    
    if (leaveRule) {
      salaryRule.leaveRule = {
        enabled: leaveRule.enabled || salaryRule.leaveRule.enabled,
        perDayDeduction: parseFloat(leaveRule.perDayDeduction) || salaryRule.leaveRule.perDayDeduction,
        paidLeaves: parseInt(leaveRule.paidLeaves) || salaryRule.leaveRule.paidLeaves
      };
    }
    
    if (lateRule) {
      salaryRule.lateRule = {
        enabled: lateRule.enabled || salaryRule.lateRule.enabled,
        lateDaysThreshold: parseInt(lateRule.lateDaysThreshold) || salaryRule.lateRule.lateDaysThreshold,
        equivalentLeaveDays: parseFloat(lateRule.equivalentLeaveDays) || salaryRule.lateRule.equivalentLeaveDays
      };
    }
    
    if (bonusAmount !== undefined) {
      salaryRule.bonusAmount = parseFloat(bonusAmount);
      if (bonusConditions !== undefined) {
        salaryRule.bonusConditions = bonusConditions;
      }
    }
    
    if (isActive !== undefined) salaryRule.isActive = isActive;
    if (department !== undefined) salaryRule.department = department;
    if (applicableTo !== undefined) salaryRule.applicableTo = applicableTo;

    // Save updated salary rule
    const updatedSalaryRule = await salaryRule.save();
    
    // Populate references
    const populatedRule = await SalaryRule.findById(updatedSalaryRule._id)
      .populate('createdBy', 'firstName lastName email')
      .populate('department', 'name')
      .populate('applicableTo', 'firstName lastName employeeId');

    res.status(200).json({
      success: true,
      message: 'Salary rule updated successfully',
      data: populatedRule
    });

  } catch (error) {
    console.error('Error updating salary rule:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// DELETE Salary Rule
exports.deleteSalaryRule = async (req, res) => {
  try {
    const salaryRule = await SalaryRule.findById(req.params.id);
    
    if (!salaryRule) {
      return res.status(404).json({
        success: false,
        message: 'Salary rule not found'
      });
    }

    // Check if any employee is using this salary rule
    const usersUsingRule = await User.countDocuments({ salaryRule: req.params.id });
    
    if (usersUsingRule > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete salary rule. ${usersUsingRule} employee(s) are using this rule.`
      });
    }

    // Delete salary rule
    await salaryRule.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Salary rule deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting salary rule:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// TOGGLE Active Status
exports.toggleActiveStatus = async (req, res) => {
  try {
    const salaryRule = await SalaryRule.findById(req.params.id);
    
    if (!salaryRule) {
      return res.status(404).json({
        success: false,
        message: 'Salary rule not found'
      });
    }

    // Toggle status
    salaryRule.isActive = !salaryRule.isActive;
    await salaryRule.save();

    res.status(200).json({
      success: true,
      message: `Salary rule ${salaryRule.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: salaryRule._id,
        isActive: salaryRule.isActive
      }
    });

  } catch (error) {
    console.error('Error toggling salary rule status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// GET ACTIVE Salary Rules
exports.getActiveSalaryRules = async (req, res) => {
  try {
    const salaryRules = await SalaryRule.find({ isActive: true })
      .select('title salaryType rate description')
      .sort({ title: 1 });

    res.status(200).json({
      success: true,
      data: salaryRules
    });

  } catch (error) {
    console.error('Error fetching active salary rules:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};