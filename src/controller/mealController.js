// controllers/mealController.js
const User = require('../models/UsersModel');
const AuditLog = require('../models/AuditModel'); 

// ============================
// HELPER FUNCTIONS
// ============================

// Helper: Get current month in YYYY-MM format
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Helper: Calculate next month
const getNextMonth = (month = null) => {
  const date = month ? new Date(`${month}-01`) : new Date();
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// Helper: Format date to YYYY-MM-DD
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

// Helper: Calculate working days for a month (for display only)
const calculateWorkingDaysForMonth = (month) => {
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  let workingDays = 0;
  
  // Simple calculation: Monday-Friday as working days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthNum - 1, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday = 1, Friday = 5
      workingDays++;
    }
  }
  
  return workingDays;
};
// ============================
// HELPER FUNCTIONS
// ============================

// Helper: Check if user is admin
const isAdmin = (user) => {
  return user.role === 'admin' || user.role === 'superAdmin';
};

// Helper: Validate month format
const isValidMonth = (month) => {
  return /^\d{4}-\d{2}$/.test(month);
};

// ============================
// SINGLE REQUEST SYSTEM
// ============================

// Employee: Request meal
exports.requestMeal = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    
    if (!employee.mealEligibility) {
      return res.status(400).json({
        success: false,
        message: 'You are not eligible for meal benefits.'
      });
    }
    
    const { mealPreference, note, month } = req.body;
    
    if (!mealPreference || !['office', 'outside', 'none'].includes(mealPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid meal preference'
      });
    }
    
    // If employee has active subscription, they can still make single requests
    // but we'll mark it as subscription request
    const requestMonth = month || getCurrentMonth();
    
    // Check if already requested for this month
    const existingRequest = employee.monthlyMealRequests?.find(
      req => req.month === requestMonth
    );
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingRequest.status} meal request for ${requestMonth}`
      });
    }
    
    // Determine request type
    const requestType = employee.mealSubscription === 'active' ? 'subscription' : 'single';
    
    // Add monthly request
    employee.monthlyMealRequests.push({
      month: requestMonth,
      status: 'requested',
      preference: mealPreference,
      requestDate: new Date(),
      note: note || '',
      mealDays: 0,
      requestType: requestType,
      requestedBy: req.user._id
    });
    
    // Update single request fields for backward compatibility
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
        month: requestMonth,
        employeeId: employee.employeeId,
        requestType: requestType,
        requestedBy: 'self'
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: `Meal request submitted for ${requestMonth}`,
      data: {
        mealPreference: mealPreference,
        status: 'requested',
        month: requestMonth,
        requestDate: new Date(),
        requestType: requestType
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

// ============================
// ADMIN CREATE MEAL FOR USER
// ============================

// Admin: Create meal request for any user
exports.adminCreateMealForUser = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { employeeId, month, mealPreference, note, status = 'approved' } = req.body;
    
    if (!employeeId || !month || !mealPreference) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, month and meal preference are required'
      });
    }
    
    if (!isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month format. Use YYYY-MM'
      });
    }
    
    if (!['office', 'outside'].includes(mealPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid meal preference'
      });
    }
    
    const employee = await User.findOne({ employeeId });
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if employee is onsite
    if (!employee.mealEligibility) {
      return res.status(400).json({
        success: false,
        message: 'Employee is not eligible for meal benefits'
      });
    }
    
    // Check if already exists
    const existingRequest = employee.monthlyMealRequests?.find(
      req => req.month === month
    );
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `Meal request already exists for ${month} (Status: ${existingRequest.status})`
      });
    }
    
    // Create meal request
    employee.monthlyMealRequests.push({
      month: month,
      status: status,
      preference: mealPreference,
      requestDate: new Date(),
      approvalDate: status === 'approved' ? new Date() : null,
      approvedBy: status === 'approved' ? req.user._id : null,
      note: note || `Created by admin: ${req.user.email}`,
      mealDays: 0,
      requestType: 'admin_created',
      requestedBy: req.user._id,
      isAdminCreated: true
    });
    
    // Update employee's meal preference if not set
    if (!employee.mealPreference) {
      employee.mealPreference = mealPreference;
    }
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Admin Created Meal Request",
      target: employee._id,
      details: {
        adminId: req.user._id,
        adminEmail: req.user.email,
        employeeId: employee.employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        month: month,
        preference: mealPreference,
        status: status,
        note: note
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(201).json({
      success: true,
      message: `Meal request created for ${employee.employeeId} (${month})`,
      data: {
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        month: month,
        preference: mealPreference,
        status: status,
        createdBy: req.user.email,
        createdDate: new Date()
      }
    });
    
  } catch (error) {
    console.error('Admin create meal error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// DELETE MEAL REQUESTS
// ============================

// Employee: Delete own meal request
exports.deleteMyMealRequest = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    const { month, requestId } = req.body;
    
    if (!month && !requestId) {
      return res.status(400).json({
        success: false,
        message: 'Month or request ID is required'
      });
    }
    
    let requestToDelete;
    
    if (requestId) {
      // Delete by request ID
      requestToDelete = employee.monthlyMealRequests.id(requestId);
    } else {
      // Delete by month
      requestToDelete = employee.monthlyMealRequests.find(
        req => req.month === month
      );
    }
    
    if (!requestToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Meal request not found'
      });
    }
    
    // Check if request can be deleted
    if (requestToDelete.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved meal request. Please contact admin.'
      });
    }
    
    // Check if it's admin created (employee can't delete admin created)
    if (requestToDelete.isAdminCreated && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin-created meal request'
      });
    }
    
    // Store details before deletion
    const deletedRequest = {
      month: requestToDelete.month,
      preference: requestToDelete.preference,
      status: requestToDelete.status,
      requestDate: requestToDelete.requestDate
    };
    
    // Remove the request
    requestToDelete.remove();
    
    // If this was the only request for current month, update single request status
    const currentMonth = getCurrentMonth();
    if (requestToDelete.month === currentMonth) {
      const hasOtherCurrentMonthReq = employee.monthlyMealRequests.some(
        req => req.month === currentMonth
      );
      
      if (!hasOtherCurrentMonthReq) {
        employee.mealRequestStatus = 'none';
        employee.mealPreference = null;
      }
    }
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Meal Request Deleted",
      target: employee._id,
      details: {
        deletedBy: 'self',
        employeeId: employee.employeeId,
        deletedRequest: deletedRequest,
        reason: req.body.reason || 'No reason provided'
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Meal request deleted successfully',
      data: {
        deletedRequest: deletedRequest,
        deletedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('Delete meal request error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Delete any meal request
exports.adminDeleteMealRequest = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { employeeId, month, requestId, reason } = req.body;
    
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }
    
    const employee = await User.findOne({ employeeId });
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    let requestToDelete;
    
    if (requestId) {
      // Delete by request ID
      requestToDelete = employee.monthlyMealRequests.id(requestId);
    } else if (month) {
      // Delete by month
      requestToDelete = employee.monthlyMealRequests.find(
        req => req.month === month
      );
    } else {
      return res.status(400).json({
        success: false,
        message: 'Month or request ID is required'
      });
    }
    
    if (!requestToDelete) {
      return res.status(404).json({
        success: false,
        message: 'Meal request not found'
      });
    }
    
    // Store details before deletion
    const deletedRequest = {
      month: requestToDelete.month,
      preference: requestToDelete.preference,
      status: requestToDelete.status,
      requestDate: requestToDelete.requestDate,
      approvalDate: requestToDelete.approvalDate,
      requestedBy: requestToDelete.requestedBy
    };
    
    // Remove the request
    requestToDelete.remove();
    
    // Update employee's status if needed
    const currentMonth = getCurrentMonth();
    if (requestToDelete.month === currentMonth) {
      const hasOtherCurrentMonthReq = employee.monthlyMealRequests.some(
        req => req.month === currentMonth
      );
      
      if (!hasOtherCurrentMonthReq) {
        employee.mealRequestStatus = 'none';
      }
    }
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Admin Deleted Meal Request",
      target: employee._id,
      details: {
        adminId: req.user._id,
        adminEmail: req.user.email,
        employeeId: employee.employeeId,
        deletedRequest: deletedRequest,
        reason: reason || 'Admin deleted'
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Meal request deleted by admin',
      data: {
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        deletedRequest: deletedRequest,
        deletedBy: req.user.email,
        deletedAt: new Date(),
        reason: reason
      }
    });
    
  } catch (error) {
    console.error('Admin delete meal error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// VIEW ALL REQUESTS (ADMIN)
// ============================

// Admin: Get all meal requests with filters
exports.getAllMealRequests = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { 
      type = 'all', 
      status, 
      department, 
      month, 
      startDate, 
      endDate,
      employeeId,
      page = 1,
      limit = 20
    } = req.query;
    
    const currentMonth = month || getCurrentMonth();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {
      workLocationType: 'onsite',
      $or: [
        { role: 'employee' },
        { role: 'admin' },
        { role: 'moderator' }
      ]
    };
    
    if (department && department !== 'all') {
      query.department = department;
    }
    
    if (employeeId) {
      query.employeeId = { $regex: employeeId, $options: 'i' };
    }
    
    // Get total count
    const totalEmployees = await User.countDocuments(query);
    
    // Get employees with pagination
    const employees = await User.find(query)
      .select('employeeId firstName lastName email department designation role mealPreference mealRequestStatus mealRequestDate mealApprovedDate mealNote mealSubscription mealAutoRenew mealSubscriptionStartDate monthlyMealRequests')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Process all meal requests (not just current month)
    let allRequests = [];
    
    employees.forEach(emp => {
      // Get single request if exists
      if (emp.mealRequestStatus !== 'none') {
        allRequests.push({
          _id: emp._id,
          employeeId: emp.employeeId,
          name: `${emp.firstName} ${emp.lastName}`,
          email: emp.email,
          department: emp.department,
          designation: emp.designation,
          requestType: 'single',
          month: currentMonth,
          status: emp.mealRequestStatus,
          preference: emp.mealPreference,
          requestDate: emp.mealRequestDate,
          approvalDate: emp.mealApprovedDate,
          note: emp.mealNote || '',
          subscription: emp.mealSubscription,
          isAdminCreated: false
        });
      }
      
      // Get all monthly requests
      if (emp.monthlyMealRequests && emp.monthlyMealRequests.length > 0) {
        emp.monthlyMealRequests.forEach(req => {
          allRequests.push({
            _id: emp._id,
            employeeId: emp.employeeId,
            name: `${emp.firstName} ${emp.lastName}`,
            email: emp.email,
            department: emp.department,
            designation: emp.designation,
            requestType: 'monthly',
            requestId: req._id,
            month: req.month,
            status: req.status,
            preference: req.preference,
            requestDate: req.requestDate,
            approvalDate: req.approvalDate,
            approvedBy: req.approvedBy,
            note: req.note || '',
            mealDays: req.mealDays || 0,
            subscription: emp.mealSubscription,
            requestTypeDetail: req.requestType,
            isAdminCreated: req.isAdminCreated || false,
            canDelete: true // Admin can delete any
          });
        });
      }
    });
    
    // Apply filters
    let filteredRequests = allRequests;
    
    // Filter by type
    if (type !== 'all') {
      filteredRequests = filteredRequests.filter(req => req.requestType === type);
    }
    
    // Filter by status
    if (status && status !== 'all') {
      filteredRequests = filteredRequests.filter(req => req.status === status);
    }
    
    // Filter by month
    if (month && month !== 'all') {
      filteredRequests = filteredRequests.filter(req => req.month === month);
    }
    
    // Filter by date range
    if (startDate && endDate) {
      filteredRequests = filteredRequests.filter(req => {
        const reqDate = req.requestDate;
        return reqDate >= new Date(startDate) && reqDate <= new Date(endDate);
      });
    }
    
    // Sort by request date (newest first)
    filteredRequests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));
    
    // Pagination for filtered results
    const totalFiltered = filteredRequests.length;
    const paginatedRequests = filteredRequests.slice(skip, skip + parseInt(limit));
    
    // Statistics
    const stats = {
      totalEmployees: totalEmployees,
      totalRequests: allRequests.length,
      filteredRequests: totalFiltered,
      singleRequests: allRequests.filter(r => r.requestType === 'single').length,
      monthlyRequests: allRequests.filter(r => r.requestType === 'monthly').length,
      requested: allRequests.filter(r => r.status === 'requested').length,
      approved: allRequests.filter(r => r.status === 'approved').length,
      rejected: allRequests.filter(r => r.status === 'rejected').length,
      cancelled: allRequests.filter(r => r.status === 'cancelled').length,
      adminCreated: allRequests.filter(r => r.isAdminCreated).length
    };
    
    res.status(200).json({
      success: true,
      stats: stats,
      currentMonth: currentMonth,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalFiltered,
        pages: Math.ceil(totalFiltered / parseInt(limit))
      },
      requests: paginatedRequests
    });
    
  } catch (error) {
    console.error('Get all meal requests error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// EMPLOYEE: VIEW OWN REQUESTS
// ============================

// Employee: Get all my meal requests
exports.getMyAllMealRequests = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id)
      .select('employeeId firstName lastName mealEligibility monthlyMealRequests mealSubscription mealAutoRenew');
    
    if (!employee.mealEligibility) {
      return res.status(200).json({
        success: true,
        eligible: false,
        message: 'Not eligible for meal benefits',
        requests: []
      });
    }
    
    const { status, month, startDate, endDate } = req.query;
    
    // Get all monthly requests
    let myRequests = employee.monthlyMealRequests || [];
    
    // Apply filters
    if (status && status !== 'all') {
      myRequests = myRequests.filter(req => req.status === status);
    }
    
    if (month && month !== 'all') {
      myRequests = myRequests.filter(req => req.month === month);
    }
    
    if (startDate && endDate) {
      myRequests = myRequests.filter(req => {
        const reqDate = req.requestDate;
        return reqDate >= new Date(startDate) && reqDate <= new Date(endDate);
      });
    }
    
    // Sort by month (newest first)
    myRequests.sort((a, b) => b.month.localeCompare(a.month));
    
    // Format response
    const formattedRequests = myRequests.map(req => ({
      requestId: req._id,
      month: req.month,
      status: req.status,
      preference: req.preference,
      requestDate: req.requestDate,
      approvalDate: req.approvalDate,
      note: req.note || '',
      mealDays: req.mealDays || 0,
      requestType: req.requestType || 'monthly',
      isAdminCreated: req.isAdminCreated || false,
      canDelete: req.status !== 'approved' && !req.isAdminCreated
    }));
    
    // Statistics for employee
    const myStats = {
      totalRequests: employee.monthlyMealRequests?.length || 0,
      approved: employee.monthlyMealRequests?.filter(r => r.status === 'approved').length || 0,
      requested: employee.monthlyMealRequests?.filter(r => r.status === 'requested').length || 0,
      rejected: employee.monthlyMealRequests?.filter(r => r.status === 'rejected').length || 0,
      subscription: employee.mealSubscription,
      autoRenew: employee.mealAutoRenew
    };
    
    res.status(200).json({
      success: true,
      eligible: true,
      stats: myStats,
      requests: formattedRequests
    });
    
  } catch (error) {
    console.error('Get my meal requests error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// ADMIN UPDATE MEAL REQUEST
// ============================

// Admin: Update any meal request
exports.adminUpdateMealRequest = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { employeeId, month, requestId, updates } = req.body;
    
    if (!employeeId || !updates) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and updates are required'
      });
    }
    
    const employee = await User.findOne({ employeeId });
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    let mealRequest;
    
    if (requestId) {
      // Find by request ID
      mealRequest = employee.monthlyMealRequests.id(requestId);
    } else if (month) {
      // Find by month
      mealRequest = employee.monthlyMealRequests.find(req => req.month === month);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Month or request ID is required'
      });
    }
    
    if (!mealRequest) {
      return res.status(404).json({
        success: false,
        message: 'Meal request not found'
      });
    }
    
    // Store old values
    const oldValues = {
      status: mealRequest.status,
      preference: mealRequest.preference,
      note: mealRequest.note
    };
    
    // Apply updates
    if (updates.status && ['requested', 'approved', 'rejected', 'cancelled'].includes(updates.status)) {
      mealRequest.status = updates.status;
      if (updates.status === 'approved') {
        mealRequest.approvalDate = new Date();
        mealRequest.approvedBy = req.user._id;
      }
    }
    
    if (updates.preference && ['office', 'outside'].includes(updates.preference)) {
      mealRequest.preference = updates.preference;
    }
    
    if (updates.note !== undefined) {
      mealRequest.note = updates.note;
    }
    
    if (updates.mealDays !== undefined) {
      mealRequest.mealDays = updates.mealDays;
    }
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Admin Updated Meal Request",
      target: employee._id,
      details: {
        adminId: req.user._id,
        adminEmail: req.user.email,
        employeeId: employee.employeeId,
        month: mealRequest.month,
        oldValues: oldValues,
        newValues: {
          status: mealRequest.status,
          preference: mealRequest.preference,
          note: mealRequest.note,
          mealDays: mealRequest.mealDays
        }
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Meal request updated successfully',
      data: {
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        month: mealRequest.month,
        updatedValues: {
          status: mealRequest.status,
          preference: mealRequest.preference,
          note: mealRequest.note,
          mealDays: mealRequest.mealDays
        },
        updatedBy: req.user.email,
        updatedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('Admin update meal error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
// ============================
// SINGLE REQUEST SYSTEM
// ============================

// Controller-এ পরিবর্তন করুন:
exports.requestMeal = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    
    // Check if employee is onsite
    if (!employee.mealEligibility) {
      return res.status(400).json({
        success: false,
        message: 'You are not eligible for meal benefits. Only onsite users can request meals.'
      });
    }
    
    const { mealPreference, note, month } = req.body; // month add করুন
    
    if (!mealPreference || !['office', 'outside','none'].includes(mealPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select meal preference: "office", "outside", or "none"'
      });
    }
    
    // Check if user has active subscription
    if (employee.mealSubscription === 'active') {
      return res.status(400).json({
        success: false,
        message: 'You have an active subscription. Please manage your meal requests from subscription section.'
      });
    }
    
    // Use provided month or current month
    const requestMonth = month || getCurrentMonth();
    
    // Check if already has a request for this month
    const existingMonthlyReq = employee.monthlyMealRequests?.find(
      req => req.month === requestMonth
    );
    
    if (existingMonthlyReq) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingMonthlyReq.status} meal request for ${requestMonth}`
      });
    }
    
    // Add as monthly request (not as single request)
    employee.monthlyMealRequests.push({
      month: requestMonth,
      status: 'requested',
      preference: mealPreference,
      requestDate: new Date(),
      note: note || '',
      mealDays: 0,
      requestType: 'single' // Mark as single request
    });
    
    // Also update single request fields for backward compatibility
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
        month: requestMonth,
        employeeId: employee.employeeId,
        requestType: 'single'
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: `Meal request submitted successfully for ${requestMonth} (Preference: ${mealPreference})`,
      data: {
        mealPreference: mealPreference,
        status: 'requested',
        month: requestMonth,
        requestDate: new Date(),
        requestType: 'single'
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

// ============================
// MONTHLY SUBSCRIPTION SYSTEM
// ============================

// Employee: Setup monthly subscription
exports.setupMonthlySubscription = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    const { mealPreference, autoRenew = true } = req.body;
    
    // Check if employee is onsite
    if (!employee.mealEligibility) {
      return res.status(400).json({
        success: false,
        message: 'You are not eligible for meal benefits. Only onsite users can request meals.'
      });
    }
    
    // Validate preference
    if (!mealPreference || !['office', 'outside'].includes(mealPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid meal preference: "office" or "outside"'
      });
    }
    
    // Check if already has active subscription
    if (employee.mealSubscription === 'active') {
      return res.status(400).json({
        success: false,
        message: 'You already have an active meal subscription'
      });
    }
    
    // Setup subscription
    const currentMonth = getCurrentMonth();
    
    employee.mealSubscription = 'active';
    employee.mealAutoRenew = autoRenew;
    employee.mealSubscriptionStartDate = new Date();
    employee.mealPreference = mealPreference;
    
    // Create first month request
    employee.monthlyMealRequests.push({
      month: currentMonth,
      status: 'requested',
      preference: mealPreference,
      requestDate: new Date(),
      note: 'Initial subscription setup',
      mealDays: 0 // Will be updated by payroll system
    });
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Monthly Subscription Setup",
      target: employee._id,
      details: {
        mealPreference: mealPreference,
        autoRenew: autoRenew,
        startMonth: currentMonth,
        employeeId: employee.employeeId,
        subscriptionType: 'monthly'
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Monthly meal subscription activated successfully',
      data: {
        subscription: 'active',
        autoRenew: autoRenew,
        mealPreference: mealPreference,
        startMonth: currentMonth,
        startDate: employee.mealSubscriptionStartDate
      }
    });
    
  } catch (error) {
    console.error('Subscription setup error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Cancel monthly subscription
exports.cancelMonthlySubscription = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    const { reason } = req.body;
    
    if (employee.mealSubscription !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    // Save cancellation details
    employee.mealSubscription = 'cancelled';
    employee.mealAutoRenew = false; // Auto-renew off
    employee.mealSubscriptionEndDate = new Date();
    employee.mealCancellationReason = reason || '';
    employee.mealCancelledBy = 'employee';
    employee.mealCancelledAt = new Date();
    
    // Cancel future month requests
    const currentMonth = getCurrentMonth();
    
    employee.monthlyMealRequests.forEach(request => {
      if (request.month > currentMonth && request.status !== 'approved') {
        request.status = 'cancelled';
        request.note = request.note ? `${request.note} | Subscription cancelled` : 'Subscription cancelled';
      }
    });
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Monthly Subscription Cancelled",
      target: employee._id,
      details: {
        employeeId: employee.employeeId,
        reason: reason || 'No reason provided',
        cancelledBy: 'employee',
        endDate: employee.mealSubscriptionEndDate
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Meal subscription cancelled successfully. Auto-renew disabled.',
      data: {
        subscription: 'cancelled',
        autoRenew: false,
        endDate: employee.mealSubscriptionEndDate,
        cancelledAt: employee.mealCancelledAt
      }
    });
    
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Request meal for specific month (Manual)
exports.requestMealForMonth = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    const { month, mealPreference, note } = req.body;
    
    // Check if employee is onsite
    if (!employee.mealEligibility) {
      return res.status(400).json({
        success: false,
        message: 'You are not eligible for meal benefits.'
      });
    }
    
    // Validate month format (YYYY-MM)
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide month in YYYY-MM format'
      });
    }
    
    if (!mealPreference || !['office', 'outside'].includes(mealPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid meal preference'
      });
    }
    
    // Check if already requested for this month
    const existingRequest = employee.monthlyMealRequests.find(
      req => req.month === month
    );
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `Meal already ${existingRequest.status} for ${month}`
      });
    }
    
    // Add monthly request
    employee.monthlyMealRequests.push({
      month: month,
      status: 'requested',
      preference: mealPreference,
      requestDate: new Date(),
      note: note || '',
      mealDays: 0 // Will be updated by payroll system
    });
    
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Monthly Meal Request Submitted",
      target: employee._id,
      details: {
        month: month,
        preference: mealPreference,
        note: note,
        employeeId: employee.employeeId
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: `Meal request submitted for ${month}`,
      data: {
        month: month,
        preference: mealPreference,
        status: 'requested',
        requestDate: new Date()
      }
    });
    
  } catch (error) {
    console.error('Monthly meal request error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// ADMIN FUNCTIONS
// ============================

// Admin: Get all meal requests (Both single and monthly)
exports.getAllMealRequests = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { type = 'all', status, department, month } = req.query;
    
    // UPDATE HERE: সব onsite users (employee, admin, moderator)
    let query = {
      workLocationType: 'onsite',
      $or: [
        { role: 'employee' },
        { role: 'admin' },
        { role: 'moderator' }
      ]
    };
    
    if (department && department !== 'all') {
      query.department = department;
    }
    
    const employees = await User.find(query)
      .select('employeeId firstName lastName email department designation role mealPreference mealRequestStatus mealRequestDate mealApprovedDate mealNote mealSubscription mealAutoRenew mealSubscriptionStartDate monthlyMealRequests')
      .sort({ mealRequestDate: -1 });
    
    let filteredEmployees = [];
    const currentMonth = month || getCurrentMonth();
    
    // Filter based on request type
    if (type === 'single') {
      filteredEmployees = employees.filter(emp => 
        emp.mealRequestStatus !== 'none'
      );
    } else if (type === 'monthly') {
      filteredEmployees = employees.filter(emp => 
        emp.monthlyMealRequests && emp.monthlyMealRequests.length > 0
      );
    } else {
      filteredEmployees = employees.filter(emp => 
        emp.mealRequestStatus !== 'none' || 
        (emp.monthlyMealRequests && emp.monthlyMealRequests.length > 0)
      );
    }
    
    // Further filter by status if provided
    if (status && status !== 'all') {
      if (type === 'single' || type === 'all') {
        filteredEmployees = filteredEmployees.filter(emp => 
          emp.mealRequestStatus === status
        );
      }
    }
    
    // Format response
    const formattedEmployees = filteredEmployees.map(emp => {
      const monthlyRequest = emp.monthlyMealRequests?.find(
        req => req.month === currentMonth
      );
      
      return {
        _id: emp._id,
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email,
        department: emp.department,
        designation: emp.designation,
        
        // Single request data
        singlePreference: emp.mealPreference,
        singleStatus: emp.mealRequestStatus,
        singleRequestDate: emp.mealRequestDate,
        singleApprovedDate: emp.mealApprovedDate,
        note: emp.mealNote || '',
        
        // Monthly subscription data
        subscription: emp.mealSubscription,
        autoRenew: emp.mealAutoRenew,
        subscriptionStart: emp.mealSubscriptionStartDate,
        subscriptionEnd: emp.mealSubscriptionEndDate,
        
        // Current month data
        currentMonth: currentMonth,
        monthlyStatus: monthlyRequest?.status || 'none',
        monthlyPreference: monthlyRequest?.preference || emp.mealPreference,
        monthlyRequestsCount: emp.monthlyMealRequests?.length || 0,
        
        // Combined status (for display)
        displayStatus: monthlyRequest?.status || emp.mealRequestStatus,
        displayPreference: monthlyRequest?.preference || emp.mealPreference
      };
    });
    
    // Statistics (cost removed)
    const stats = {
      totalEmployees: employees.length,
      totalRequests: filteredEmployees.length,
      singleRequests: employees.filter(e => e.mealRequestStatus !== 'none').length,
      monthlySubscribers: employees.filter(e => e.mealSubscription === 'active').length,
      requested: employees.filter(e => e.mealRequestStatus === 'requested').length,
      approved: employees.filter(e => e.mealRequestStatus === 'approved').length,
      rejected: employees.filter(e => e.mealRequestStatus === 'rejected').length
    };
    
    res.status(200).json({
      success: true,
      stats: stats,
      currentMonth: currentMonth,
      employees: formattedEmployees
    });
    
  } catch (error) {
    console.error('Get meal requests error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Approve/Reject meal request (Both single and monthly)
exports.updateMealRequest = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { action, note, month, requestType = 'monthly' } = req.body; // Default 'monthly' করুন
    
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
    
    // 🎯 IMPORTANT: Check what type of request exists
    const currentMonth = month || getCurrentMonth();
    const monthlyRequest = employee.monthlyMealRequests.find(
      req => req.month === currentMonth
    );
    
    // Determine request type automatically
    let actualRequestType = requestType;
    
    if (requestType === 'single' && employee.mealRequestStatus === 'none' && monthlyRequest) {
      // User has monthly request but admin selected single type
      actualRequestType = 'monthly';
    }
    
    if (actualRequestType === 'single') {
      // Handle single request
      if (employee.mealRequestStatus !== 'requested') {
        return res.status(400).json({
          success: false,
          message: `Single meal request not found or already ${employee.mealRequestStatus}`
        });
      }
      
      // ... rest of single request code
      
    } else if (actualRequestType === 'monthly') {
      // Handle monthly request
      if (!month) {
        return res.status(400).json({
          success: false,
          message: 'Month is required for monthly requests'
        });
      }
      
      const monthlyRequest = employee.monthlyMealRequests.find(
        req => req.month === month
      );
      
      if (!monthlyRequest) {
        return res.status(404).json({
          success: false,
          message: `No meal request found for ${month}`
        });
      }
      
      if (monthlyRequest.status !== 'requested') {
        return res.status(400).json({
          success: false,
          message: `Meal request for ${month} is already ${monthlyRequest.status}`
        });
      }
      
      const oldStatus = monthlyRequest.status;
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update monthly request
      monthlyRequest.status = newStatus;
      monthlyRequest.approvalDate = new Date();
      monthlyRequest.approvedBy = req.user._id;
      monthlyRequest.note = note || monthlyRequest.note || '';
      
      // If auto-renew is ON and approved, create next month request
      if (action === 'approve' && employee.mealAutoRenew) {
        const nextMonth = getNextMonth(month);
        const existingNextMonth = employee.monthlyMealRequests.find(
          req => req.month === nextMonth
        );
        
        if (!existingNextMonth) {
          employee.monthlyMealRequests.push({
            month: nextMonth,
            status: 'requested',
            preference: employee.mealPreference,
            requestDate: new Date(),
            note: 'Auto-generated from previous month approval',
            mealDays: 0
          });
        }
      }
      
      await employee.save();
      
      // Audit Log
      await AuditLog.create({
        userId: req.user._id,
        action: `Monthly Meal Request ${action === 'approve' ? 'Approved' : 'Rejected'}`,
        target: employee._id,
        details: {
          employeeId: employee.employeeId,
          month: month,
          oldStatus: oldStatus,
          newStatus: newStatus,
          preference: monthlyRequest.preference,
          note: note,
          actionBy: req.user.email,
          autoRenew: employee.mealAutoRenew
        },
        ip: req.ip,
        device: req.headers['user-agent']
      });
      
      res.status(200).json({
        success: true,
        message: `Monthly meal request for ${month} ${action}ed successfully`,
        data: {
          employeeId: employee.employeeId,
          name: `${employee.firstName} ${employee.lastName}`,
          month: month,
          preference: monthlyRequest.preference,
          status: newStatus,
          approvedDate: monthlyRequest.approvalDate,
          approvedBy: req.user.email,
          autoRenew: employee.mealAutoRenew,
          requestType: 'monthly'
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid request type. Use "single" or "monthly"'
      });
    }
    
  } catch (error) {
    console.error('Update meal request error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Get my meal status (Combined)
exports.getMyMealStatus = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id)
      .select('employeeId firstName lastName mealEligibility mealPreference mealRequestStatus mealRequestDate mealApprovedDate mealNote mealSubscription mealAutoRenew mealSubscriptionStartDate mealSubscriptionEndDate monthlyMealRequests');
    
    // Check eligibility (onsite or not)
    if (!employee.mealEligibility) {
      return res.status(200).json({
        success: true,
        eligible: false,
        message: 'You are not eligible for meal benefits. Only onsite users can request meals.'
      });
    }
    
    const currentMonth = getCurrentMonth();
    const currentMonthRequest = employee.monthlyMealRequests?.find(
      req => req.month === currentMonth
    );
    
    // Check if has any active meal option
    const hasSingleRequest = employee.mealRequestStatus !== 'none';
    const hasMonthlySubscription = employee.mealSubscription === 'active';
    const hasCurrentMonthRequest = currentMonthRequest?.status === 'approved';
    
    const activeMealStatus = hasCurrentMonthRequest || 
                            (hasSingleRequest && employee.mealRequestStatus === 'approved') ||
                            hasMonthlySubscription;
    
    res.status(200).json({
      success: true,
      eligible: true,
      hasActiveMeal: activeMealStatus,
      data: {
        // Basic info
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        
        // Single request data
        singlePreference: employee.mealPreference,
        singleStatus: employee.mealRequestStatus,
        singleRequestDate: employee.mealRequestDate,
        singleApprovedDate: employee.mealApprovedDate,
        singleNote: employee.mealNote || '',
        
        // Monthly subscription data
        subscription: employee.mealSubscription,
        autoRenew: employee.mealAutoRenew,
        subscriptionStart: employee.mealSubscriptionStartDate,
        subscriptionEnd: employee.mealSubscriptionEndDate,
        
        // Current month data
        currentMonth: currentMonth,
        monthlyStatus: currentMonthRequest?.status || 'none',
        monthlyPreference: currentMonthRequest?.preference || employee.mealPreference,
        monthlyRequestDate: currentMonthRequest?.requestDate,
        monthlyApprovalDate: currentMonthRequest?.approvalDate,
        monthlyNote: currentMonthRequest?.note || '',
        monthlyMealDays: currentMonthRequest?.mealDays || 0,
        
        // Display preference (monthly overrides single)
        displayPreference: currentMonthRequest?.preference || employee.mealPreference,
        displayStatus: currentMonthRequest?.status || employee.mealRequestStatus,
        
        // Monthly history (last 6 months)
        monthlyHistory: employee.monthlyMealRequests
          ?.sort((a, b) => b.month.localeCompare(a.month))
          .slice(0, 6)
          .map(req => ({
            month: req.month,
            status: req.status,
            preference: req.preference,
            requestDate: req.requestDate,
            approvalDate: req.approvalDate,
            note: req.note,
            mealDays: req.mealDays || 0
          })) || []
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

// Admin: Get monthly meal report (Cost calculation removed)
exports.getMonthlyMealReport = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { month, department } = req.query;
    const reportMonth = month || getCurrentMonth();
    
    // UPDATE HERE: সব onsite users
    const query = { 
      workLocationType: 'onsite',
      $or: [
        { role: 'employee' },
        { role: 'admin' },
        { role: 'moderator' }
      ]
    };
    
    if (department && department !== 'all') {
      query.department = department;
    }
    
    const employees = await User.find(query)
      .select('employeeId firstName lastName role department mealSubscription mealAutoRenew monthlyMealRequests');
    
    let report = [];
    
    employees.forEach(emp => {
      const monthlyReq = emp.monthlyMealRequests?.find(
        req => req.month === reportMonth
      );
      
      // Calculate working days for display only
      let mealDays = 0;
      
      if (monthlyReq?.status === 'approved') {
        mealDays = calculateWorkingDaysForMonth(reportMonth);
      }
      
      report.push({
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`,
        department: emp.department,
        subscription: emp.mealSubscription,
        autoRenew: emp.mealAutoRenew,
        month: reportMonth,
        status: monthlyReq?.status || 'none',
        preference: monthlyReq?.preference || '-',
        requestDate: monthlyReq?.requestDate || null,
        approvalDate: monthlyReq?.approvalDate || null,
        mealDays: mealDays, // For display only, actual days from payroll
        // Cost field removed - will be calculated in payroll system
      });
    });
    
    // Statistics (cost removed)
    const stats = {
      totalEmployees: report.length,
      totalApproved: report.filter(r => r.status === 'approved').length,
      totalRequested: report.filter(r => r.status === 'requested').length,
      totalRejected: report.filter(r => r.status === 'rejected').length,
      totalNone: report.filter(r => r.status === 'none').length,
      officePreference: report.filter(r => r.preference === 'office').length,
      outsidePreference: report.filter(r => r.preference === 'outside').length,
      activeSubscriptions: report.filter(r => r.subscription === 'active').length
    };
    
    res.status(200).json({
      success: true,
      month: reportMonth,
      stats: stats,
      report: report
    });
    
  } catch (error) {
    console.error('Monthly meal report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Update auto-renew setting
exports.updateAutoRenew = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    const { autoRenew } = req.body;
    
    if (employee.mealSubscription !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    employee.mealAutoRenew = autoRenew;
    await employee.save();
    
    res.status(200).json({
      success: true,
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'} successfully`,
      data: {
        autoRenew: employee.mealAutoRenew
      }
    });
    
  } catch (error) {
    console.error('Update auto-renew error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// PAYROLL DATA EXPORT FUNCTION
// ============================

// Export meal data for payroll calculation
exports.exportMealDataForPayroll = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'Month is required'
      });
    }

    // UPDATE HERE: সব onsite users
    const employees = await User.find({
      workLocationType: 'onsite',
      $or: [
        { role: 'employee' },
        { role: 'admin' },
        { role: 'moderator' }
      ]
    }).select('employeeId firstName lastName role department monthlyMealRequests');

    const payrollData = employees.map(emp => {
      const monthlyReq = emp.monthlyMealRequests?.find(
        req => req.month === month
      );

      return {
        employeeId: emp.employeeId,
        name: `${emp.firstName} ${emp.lastName}`,
        department: emp.department,
        hasMealRequest: monthlyReq?.status === 'approved',
        mealPreference: monthlyReq?.preference || null,
        mealStatus: monthlyReq?.status || 'none',
        approvalDate: monthlyReq?.approvalDate,
        currentMealDays: monthlyReq?.mealDays || 0,
        // Payroll system will calculate actual days and cost
      };
    });

    res.status(200).json({
      success: true,
      month: month,
      totalEmployees: payrollData.length,
      approvedMeals: payrollData.filter(d => d.mealStatus === 'approved').length,
      data: payrollData
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update meal days from payroll system
exports.updateMealDaysFromPayroll = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin' && req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { month, employeeId, mealDays } = req.body;
    
    if (!month || !employeeId || mealDays === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Month, employeeId and mealDays are required'
      });
    }
    
    const employee = await User.findOne({ employeeId });
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Find and update the monthly request
    const monthlyRequest = employee.monthlyMealRequests.find(
      req => req.month === month
    );
    
    if (!monthlyRequest) {
      return res.status(404).json({
        success: false,
        message: `No meal request found for ${month}`
      });
    }
    
    monthlyRequest.mealDays = mealDays;
    await employee.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Meal Days Updated from Payroll",
      target: employee._id,
      details: {
        employeeId: employee.employeeId,
        month: month,
        mealDays: mealDays,
        updatedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Meal days updated successfully',
      data: {
        employeeId: employee.employeeId,
        month: month,
        mealDays: mealDays
      }
    });
    
  } catch (error) {
    console.error('Update meal days error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};