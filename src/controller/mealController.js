// controllers/mealController.js
const User = require('../models/UsersModel');
const FoodCost = require('../models/foodCostModel');
const AuditLog = require('../models/AuditModel');

// Employee: Request meal (Office/Outside)
exports.requestMeal = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    
    // Check if employee is eligible
    if (!employee.mealEligibility) {
      return res.status(400).json({
        success: false,
        message: 'You are not eligible for meal benefits. Only onsite employees can request meals.'
      });
    }
    
    const { mealPreference, note } = req.body;
    
    if (!mealPreference || !['office', 'outside'].includes(mealPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select meal preference: "office" or "outside"'
      });
    }
    
    // Update employee meal request
    employee.mealPreference = mealPreference;
    employee.mealRequestStatus = 'requested';
    employee.mealRequestDate = new Date();
    employee.mealNote = note || '';
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Meal Request Submitted",
      target: employee._id,
      details: {
        mealPreference: mealPreference,
        note: note,
        employeeId: employee.employeeId
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: `Meal request submitted successfully (Preference: ${mealPreference})`,
      data: {
        mealPreference: mealPreference,
        status: 'requested',
        requestDate: employee.mealRequestDate
      }
    });
    
  } catch (error) {
    console.error('Meal request error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Get all meal requests
exports.getAllMealRequests = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { status, department } = req.query;
    
    const query = {
      role: 'employee',
      workLocationType: 'onsite',
      mealRequestStatus: { $ne: 'none' }
    };
    
    if (status && status !== 'all') {
      query.mealRequestStatus = status;
    }
    
    if (department && department !== 'all') {
      query.department = department;
    }
    
    const employees = await User.find(query)
      .select('employeeId firstName lastName email department designation mealPreference mealRequestStatus mealRequestDate mealNote')
      .sort({ mealRequestDate: -1 });
    
    const stats = {
      total: employees.length,
      requested: employees.filter(e => e.mealRequestStatus === 'requested').length,
      approved: employees.filter(e => e.mealRequestStatus === 'approved').length,
      rejected: employees.filter(e => e.mealRequestStatus === 'rejected').length
    };
    
    res.status(200).json({
      success: true,
      stats: stats,
      employees: employees.map(emp => ({
        _id: emp._id,
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email,
        department: emp.department,
        designation: emp.designation,
        mealPreference: emp.mealPreference,
        status: emp.mealRequestStatus,
        requestDate: emp.mealRequestDate,
        note: emp.mealNote || ''
      }))
    });
    
  } catch (error) {
    console.error('Get meal requests error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Approve/Reject meal request
exports.updateMealRequest = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { action, note } = req.body; // action: 'approve' or 'reject'
    
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be "approve" or "reject"'
      });
    }
    
    const employee = await User.findById(employeeId);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if employee has requested meal
    if (employee.mealRequestStatus !== 'requested') {
      return res.status(400).json({
        success: false,
        message: `Employee has not requested meal or request is already ${employee.mealRequestStatus}`
      });
    }
    
    const oldStatus = employee.mealRequestStatus;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    
    employee.mealRequestStatus = newStatus;
    employee.mealApprovedDate = new Date();
    employee.mealApprovedBy = req.user._id;
    employee.mealNote = note || employee.mealNote || '';
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: `Meal Request ${action === 'approve' ? 'Approved' : 'Rejected'}`,
      target: employee._id,
      details: {
        employeeId: employee.employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        oldStatus: oldStatus,
        newStatus: newStatus,
        mealPreference: employee.mealPreference,
        note: note,
        actionBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: `Meal request ${action}ed successfully`,
      data: {
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        mealPreference: employee.mealPreference,
        status: employee.mealRequestStatus,
        approvedDate: employee.mealApprovedDate,
        approvedBy: req.user.email
      }
    });
    
  } catch (error) {
    console.error('Update meal request error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Get my meal status
exports.getMyMealStatus = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id)
      .select('mealEligibility mealPreference mealRequestStatus mealRequestDate mealApprovedDate mealNote');
    
    if (!employee.mealEligibility) {
      return res.status(200).json({
        success: true,
        eligible: false,
        message: 'You are not eligible for meal benefits'
      });
    }
    
    res.status(200).json({
      success: true,
      eligible: true,
      data: {
        mealPreference: employee.mealPreference,
        status: employee.mealRequestStatus,
        requestDate: employee.mealRequestDate,
        approvedDate: employee.mealApprovedDate,
        note: employee.mealNote || ''
      }
    });
    
  } catch (error) {
    console.error('Get meal status error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};