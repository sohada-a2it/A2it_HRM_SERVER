// controllers/mealController.js
const Meal = require('../models/mealModel');
const MealSubscription = require('../models/subscriptionMealModel');
const User = require('../models/UsersModel');
const AuditLog = require('../models/AuditModel');

// ============================
// HELPER FUNCTIONS
// ============================

// Helper: Check if user is admin
const isAdmin = (user) => {
  return user.role === 'admin' || user.role === 'superAdmin';
};

// Helper: Get current month in YYYY-MM format
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Helper: Format date to YYYY-MM-DD
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

// Helper: Calculate working days for a month
const calculateWorkingDaysForMonth = (month) => {
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  let workingDays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthNum - 1, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      workingDays++;
    }
  }
  
  return workingDays;
};

// ============================
// DAILY MEAL REQUESTS
// ============================

// Employee: Request daily meal
exports.requestDailyMeal = async (req, res) => {
  try {
    const { mealPreference, date, note } = req.body;
    
    if (!mealPreference || !['office', 'outside'].includes(mealPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid meal preference: office or outside'
      });
    }
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }
    
    const mealDate = new Date(date);
    
    // Check if user is onsite
    const user = await User.findById(req.user._id);
    if (user.workLocationType !== 'onsite') {
      return res.status(400).json({
        success: false,
        message: 'Only onsite users can request meals'
      });
    }
    
    // Check if already has meal for this date
    const existingMeal = await Meal.findOne({
      user: req.user._id,
      date: {
        $gte: new Date(mealDate.setHours(0, 0, 0, 0)),
        $lte: new Date(mealDate.setHours(23, 59, 59, 999))
      },
      isDeleted: false
    });
    
    if (existingMeal) {
      return res.status(400).json({
        success: false,
        message: `You already have a ${existingMeal.status} meal request for ${formatDate(new Date(date))}`
      });
    }
    
    // Check if user has active subscription for this month
    const month = getCurrentMonth();
    const subscription = await MealSubscription.findOne({
      user: req.user._id,
      status: 'active',
      isDeleted: false
    });
    
    if (subscription) {
      const isApproved = subscription.monthlyApprovals?.find(
        a => a.month === month && a.status === 'approved'
      );
      
      if (isApproved) {
        return res.status(400).json({
          success: false,
          message: 'You have an active subscription for this month. Daily requests are not needed.'
        });
      }
    }
    
    // Create daily meal
    const meal = new Meal({
      user: req.user._id,
      mealType: 'lunch',
      preference: mealPreference,
      date: new Date(date),
      status: 'pending',
      notes: note || '',
      paymentMethod: 'salary_deduction',
      createdBy: req.user._id
    });
    
    await meal.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Daily Meal Request Submitted",
      target: meal._id,
      details: {
        date: date,
        preference: mealPreference,
        employeeId: user.employeeId
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Daily meal request submitted successfully',
      data: meal
    });
    
  } catch (error) {
    console.error('Daily meal request error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Get my daily meals
exports.getMyDailyMeals = async (req, res) => {
  try {
    const { date, month, status, page = 1, limit = 20 } = req.query;
    
    let query = { user: req.user._id, isDeleted: false };
    
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0);
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Meal.countDocuments(query);
    
    const meals = await Meal.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('approvedBy', 'firstName lastName email');
    
    res.status(200).json({
      success: true,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / parseInt(limit))
      },
      meals: meals
    });
    
  } catch (error) {
    console.error('Get daily meals error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Cancel daily meal
exports.cancelDailyMeal = async (req, res) => {
  try {
    const { mealId, reason } = req.body;
    
    const meal = await Meal.findById(mealId);
    
    if (!meal) {
      return res.status(404).json({
        success: false,
        message: 'Meal not found'
      });
    }
    
    // Check permission
    if (meal.user.toString() !== req.user._id.toString() && !isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this meal'
      });
    }
    
    // Check if can be cancelled
    if (!meal.canCancel()) {
      return res.status(400).json({
        success: false,
        message: 'Meal cannot be cancelled. Cancellation deadline passed or already served.'
      });
    }
    
    meal.status = 'cancelled';
    meal.cancelledBy = req.user._id;
    meal.cancelledAt = new Date();
    meal.cancellationReason = reason || '';
    meal.notes = meal.notes ? `${meal.notes} | Cancelled: ${reason}` : `Cancelled: ${reason}`;
    
    await meal.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Daily Meal Cancelled",
      target: meal._id,
      details: {
        mealDate: meal.date,
        reason: reason,
        cancelledBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Meal cancelled successfully',
      data: meal
    });
    
  } catch (error) {
    console.error('Cancel daily meal error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// SUBSCRIPTION MANAGEMENT
// ============================

// Employee: Setup monthly subscription
exports.setupMonthlySubscription = async (req, res) => {
  try {
    const { preference, autoRenew = true } = req.body;
    
    if (!preference || !['office', 'outside'].includes(preference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid meal preference: office or outside'
      });
    }
    
    const user = await User.findById(req.user._id);
    
    // Check if user is onsite
    if (user.workLocationType !== 'onsite') {
      return res.status(400).json({
        success: false,
        message: 'Only onsite users can subscribe to meal service'
      });
    }
    
    // Check if already has subscription
    const existingSubscription = await MealSubscription.findOne({
      user: req.user._id,
      isDeleted: false
    });
    
    if (existingSubscription && existingSubscription.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'You already have an active meal subscription'
      });
    }
    
    // Create or update subscription
    let subscription;
    const currentMonth = getCurrentMonth();
    
    if (existingSubscription) {
      // Reactivate cancelled subscription
      subscription = existingSubscription;
      subscription.status = 'active';
      subscription.preference = preference;
      subscription.autoRenew = autoRenew;
      subscription.isPaused = false;
    } else {
      // Create new subscription
      subscription = new MealSubscription({
        user: req.user._id,
        userInfo: {
          employeeId: user.employeeId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          department: user.department || ''
        },
        preference: preference,
        status: 'active',
        autoRenew: autoRenew,
        startDate: new Date(),
        createdBy: req.user._id
      });
    }
    
    // Add current month approval request
    subscription.addMonthlyApproval(currentMonth, preference);
    
    await subscription.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Monthly Subscription Setup",
      target: subscription._id,
      details: {
        preference: preference,
        autoRenew: autoRenew,
        startMonth: currentMonth,
        employeeId: user.employeeId
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Monthly meal subscription activated successfully',
      data: {
        subscriptionId: subscription._id,
        status: 'active',
        preference: preference,
        autoRenew: autoRenew,
        startDate: subscription.startDate,
        currentMonthRequest: {
          month: currentMonth,
          status: 'pending'
        }
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

// Employee: Cancel subscription
exports.cancelSubscription = async (req, res) => {
  try {
    const { reason } = req.body;
    
    const subscription = await MealSubscription.findOne({
      user: req.user._id,
      status: 'active',
      isDeleted: false
    });
    
    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    subscription.cancelledAt = new Date();
    subscription.cancellationReason = reason || '';
    
    await subscription.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Subscription Cancelled",
      target: subscription._id,
      details: {
        reason: reason,
        employeeId: req.user.employeeId
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: 'Meal subscription cancelled successfully',
      data: {
        subscriptionId: subscription._id,
        status: 'cancelled',
        cancelledAt: subscription.cancelledAt
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

// Employee: Update subscription preference
exports.updateSubscriptionPreference = async (req, res) => {
  try {
    const { preference } = req.body;
    
    if (!preference || !['office', 'outside'].includes(preference)) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid meal preference: office or outside'
      });
    }
    
    const subscription = await MealSubscription.findOne({
      user: req.user._id,
      status: 'active',
      isDeleted: false
    });
    
    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    const oldPreference = subscription.preference;
    subscription.preference = preference;
    
    // Update current month's preference if not approved yet
    const currentMonth = getCurrentMonth();
    const currentApproval = subscription.monthlyApprovals.find(
      a => a.month === currentMonth
    );
    
    if (currentApproval && currentApproval.status !== 'approved') {
      currentApproval.preference = preference;
    }
    
    await subscription.save();
    
    res.status(200).json({
      success: true,
      message: 'Subscription preference updated successfully',
      data: {
        oldPreference: oldPreference,
        newPreference: preference,
        updatedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('Update preference error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Employee: Update auto-renew setting
exports.updateAutoRenew = async (req, res) => {
  try {
    const { autoRenew } = req.body;
    
    if (typeof autoRenew !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Auto-renew must be true or false'
      });
    }
    
    const subscription = await MealSubscription.findOne({
      user: req.user._id,
      isDeleted: false
    });
    
    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: 'No subscription found'
      });
    }
    
    subscription.autoRenew = autoRenew;
    await subscription.save();
    
    res.status(200).json({
      success: true,
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'} successfully`,
      data: {
        autoRenew: subscription.autoRenew
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

// Employee: Get my subscription details
exports.getMySubscription = async (req, res) => {
  try {
    const subscription = await MealSubscription.findOne({
      user: req.user._id,
      isDeleted: false
    }).populate('user', 'employeeId firstName lastName workLocationType');
    
    if (!subscription) {
      return res.status(200).json({
        success: true,
        hasSubscription: false,
        message: 'No active subscription found'
      });
    }
    
    const currentMonth = getCurrentMonth();
    const currentApproval = subscription.monthlyApprovals.find(
      a => a.month === currentMonth
    );
    
    // Get monthly stats
    const monthlyStats = [];
    for (const approval of subscription.monthlyApprovals.slice(-6)) {
      const mealCount = await Meal.countDocuments({
        user: req.user._id,
        date: {
          $gte: new Date(`${approval.month}-01`),
          $lte: new Date(new Date(`${approval.month}-01`).setMonth(new Date(`${approval.month}-01`).getMonth() + 1) - 1)
        },
        isDeleted: false,
        status: { $in: ['approved', 'served'] }
      });
      
      monthlyStats.push({
        month: approval.month,
        status: approval.status,
        preference: approval.preference,
        mealDays: approval.mealDays || 0,
        actualMeals: mealCount
      });
    }
    
    res.status(200).json({
      success: true,
      hasSubscription: true,
      data: {
        subscriptionId: subscription._id,
        status: subscription.status,
        preference: subscription.preference,
        autoRenew: subscription.autoRenew,
        startDate: subscription.startDate,
        isPaused: subscription.isPaused,
        
        // Current month
        currentMonth: currentMonth,
        currentStatus: currentApproval?.status || 'none',
        currentPreference: currentApproval?.preference || subscription.preference,
        
        // History
        monthlyApprovals: subscription.monthlyApprovals.slice(-12).reverse(),
        monthlyStats: monthlyStats
      }
    });
    
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// ADMIN FUNCTIONS
// ============================

// Admin: Get all subscriptions
exports.getAllSubscriptions = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { status, department, month, page = 1, limit = 20 } = req.query;
    
    let query = { isDeleted: false };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (department && department !== 'all') {
      query['userInfo.department'] = department;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await MealSubscription.countDocuments(query);
    
    const subscriptions = await MealSubscription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const currentMonth = month || getCurrentMonth();
    
    // Add current month approval status
    const enhancedSubscriptions = subscriptions.map(sub => {
      const currentApproval = sub.monthlyApprovals.find(
        a => a.month === currentMonth
      );
      
      return {
        ...sub.toObject(),
        currentMonthStatus: currentApproval?.status || 'none',
        currentMonthPreference: currentApproval?.preference || sub.preference
      };
    });
    
    res.status(200).json({
      success: true,
      currentMonth: currentMonth,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / parseInt(limit))
      },
      subscriptions: enhancedSubscriptions
    });
    
  } catch (error) {
    console.error('Get all subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Approve/Reject monthly subscription
exports.approveMonthlySubscription = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { subscriptionId, month, action, note } = req.body;
    
    if (!subscriptionId || !month || !action) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID, month and action are required'
      });
    }
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be "approve" or "reject"'
      });
    }
    
    const subscription = await MealSubscription.findById(subscriptionId);
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    // Approve for month
    const approved = subscription.approveForMonth(month, req.user._id, note);
    
    if (!approved) {
      return res.status(400).json({
        success: false,
        message: `No pending approval found for ${month}`
      });
    }
    
    // If approved, create daily meals
    if (action === 'approve') {
      const approval = subscription.monthlyApprovals.find(a => a.month === month);
      
      // Create daily meals for the month
      const createdCount = await Meal.createSubscriptionMeals(
        subscription.user,
        month,
        approval.preference,
        req.user._id
      );
      
      approval.mealDays = calculateWorkingDaysForMonth(month);
      
      // If auto-renew is ON, create next month request
      if (subscription.autoRenew) {
        const nextMonth = getNextMonth(month);
        subscription.addMonthlyApproval(nextMonth, subscription.preference);
      }
    }
    
    await subscription.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: `Monthly Subscription ${action === 'approve' ? 'Approved' : 'Rejected'}`,
      target: subscription._id,
      details: {
        month: month,
        action: action,
        employeeId: subscription.userInfo.employeeId,
        note: note,
        approvedBy: req.user.email
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(200).json({
      success: true,
      message: `Subscription ${action}ed successfully for ${month}`,
      data: {
        subscriptionId: subscription._id,
        employeeId: subscription.userInfo.employeeId,
        month: month,
        status: action === 'approve' ? 'approved' : 'rejected',
        approvedBy: req.user.email,
        approvedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('Approve subscription error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Get pending approvals for month
exports.getPendingApprovals = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { month } = req.query;
    const currentMonth = month || getCurrentMonth();
    
    const pendingSubscriptions = await MealSubscription.getPendingForMonth(currentMonth);
    
    // Get user details for each subscription
    const enhancedSubscriptions = await Promise.all(
      pendingSubscriptions.map(async (sub) => {
        const user = await User.findById(sub.user).select('employeeId firstName lastName department designation');
        return {
          subscriptionId: sub._id,
          employeeId: sub.userInfo.employeeId,
          name: `${sub.userInfo.firstName} ${sub.userInfo.lastName}`,
          department: sub.userInfo.department,
          preference: sub.preference,
          month: currentMonth,
          requestDate: sub.monthlyApprovals.find(a => a.month === currentMonth)?.requestDate
        };
      })
    );
    
    res.status(200).json({
      success: true,
      month: currentMonth,
      count: enhancedSubscriptions.length,
      subscriptions: enhancedSubscriptions
    });
    
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Get monthly report
exports.getMonthlyMealReport = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { month, department } = req.query;
    const reportMonth = month || getCurrentMonth();
    
    // Get approved subscriptions for the month
    const approvedSubscriptions = await MealSubscription.getApprovedForMonth(reportMonth);
    
    // Get all onsite users
    let userQuery = { 
      workLocationType: 'onsite',
      isDeleted: false
    };
    
    if (department && department !== 'all') {
      userQuery.department = department;
    }
    
    const onsiteUsers = await User.find(userQuery)
      .select('employeeId firstName lastName department designation');
    
    // Create report
    const report = [];
    
    for (const user of onsiteUsers) {
      // Check if user has approved subscription for the month
      const subscription = approvedSubscriptions.find(
        sub => sub.user.toString() === user._id.toString()
      );
      
      if (subscription) {
        const approval = subscription.monthlyApprovals.find(
          a => a.month === reportMonth
        );
        
        // Count actual meals served
        const startDate = new Date(`${reportMonth}-01`);
        const endDate = new Date(new Date(startDate).setMonth(startDate.getMonth() + 1) - 1);
        
        const mealCount = await Meal.countDocuments({
          user: user._id,
          date: { $gte: startDate, $lte: endDate },
          status: { $in: ['approved', 'served'] },
          isDeleted: false
        });
        
        report.push({
          employeeId: user.employeeId,
          name: `${user.firstName} ${user.lastName}`,
          department: user.department,
          designation: user.designation,
          subscription: 'active',
          month: reportMonth,
          status: approval?.status || 'approved',
          preference: approval?.preference || subscription.preference,
          approvedMeals: mealCount,
          estimatedDays: approval?.mealDays || calculateWorkingDaysForMonth(reportMonth),
          approvalDate: approval?.approvalDate
        });
      } else {
        // User doesn't have subscription
        report.push({
          employeeId: user.employeeId,
          name: `${user.firstName} ${user.lastName}`,
          department: user.department,
          designation: user.designation,
          subscription: 'none',
          month: reportMonth,
          status: 'none',
          preference: '-',
          approvedMeals: 0,
          estimatedDays: 0
        });
      }
    }
    
    // Statistics
    const stats = {
      totalEmployees: report.length,
      withSubscription: report.filter(r => r.subscription === 'active').length,
      approvedMeals: report.reduce((sum, r) => sum + r.approvedMeals, 0),
      totalEstimatedDays: report.reduce((sum, r) => sum + r.estimatedDays, 0),
      officePreference: report.filter(r => r.preference === 'office').length,
      outsidePreference: report.filter(r => r.preference === 'outside').length
    };
    
    res.status(200).json({
      success: true,
      month: reportMonth,
      stats: stats,
      report: report
    });
    
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Admin: Create subscription for user
exports.adminCreateSubscription = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    
    const { employeeId, preference, autoRenew = true, startDate } = req.body;
    
    if (!employeeId || !preference) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and preference are required'
      });
    }
    
    const user = await User.findOne({ employeeId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if user is onsite
    if (user.workLocationType !== 'onsite') {
      return res.status(400).json({
        success: false,
        message: 'Only onsite users can have meal subscriptions'
      });
    }
    
    // Check if already has subscription
    const existingSubscription = await MealSubscription.findOne({
      user: user._id,
      isDeleted: false
    });
    
    if (existingSubscription) {
      return res.status(400).json({
        success: false,
        message: 'User already has a meal subscription'
      });
    }
    
    // Create subscription
    const subscription = new MealSubscription({
      user: user._id,
      userInfo: {
        employeeId: user.employeeId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: user.department || ''
      },
      preference: preference,
      status: 'active',
      autoRenew: autoRenew,
      startDate: startDate ? new Date(startDate) : new Date(),
      createdBy: req.user._id
    });
    
    // Add current month approval (auto-approve if admin creates)
    const currentMonth = getCurrentMonth();
    subscription.addMonthlyApproval(currentMonth, preference);
    subscription.approveForMonth(currentMonth, req.user._id, 'Created by admin');
    
    await subscription.save();
    
    // Create daily meals for current month
    await Meal.createSubscriptionMeals(
      user._id,
      currentMonth,
      preference,
      req.user._id
    );
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Admin Created Subscription",
      target: subscription._id,
      details: {
        adminId: req.user._id,
        adminEmail: req.user.email,
        employeeId: user.employeeId,
        preference: preference,
        autoRenew: autoRenew,
        startDate: subscription.startDate
      },
      ip: req.ip,
      device: req.headers['user-agent']
    });
    
    res.status(201).json({
      success: true,
      message: `Meal subscription created for ${user.employeeId}`,
      data: {
        subscriptionId: subscription._id,
        employeeId: user.employeeId,
        name: `${user.firstName} ${user.lastName}`,
        preference: preference,
        status: 'active',
        autoRenew: autoRenew,
        startDate: subscription.startDate,
        createdBy: req.user.email
      }
    });
    
  } catch (error) {
    console.error('Admin create subscription error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ============================
// PAYROLL INTEGRATION
// ============================

// Export meal data for payroll
exports.exportMealDataForPayroll = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
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
    
    // Get all approved subscriptions for the month
    const approvedSubscriptions = await MealSubscription.getApprovedForMonth(month);
    
    const payrollData = [];
    
    for (const subscription of approvedSubscriptions) {
      const approval = subscription.monthlyApprovals.find(
        a => a.month === month
      );
      
      // Count actual served meals
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(new Date(startDate).setMonth(startDate.getMonth() + 1) - 1);
      
      const servedMeals = await Meal.countDocuments({
        user: subscription.user,
        date: { $gte: startDate, $lte: endDate },
        status: 'served',
        isDeleted: false
      });
      
      payrollData.push({
        employeeId: subscription.userInfo.employeeId,
        name: `${subscription.userInfo.firstName} ${subscription.userInfo.lastName}`,
        department: subscription.userInfo.department || '',
        month: month,
        preference: approval?.preference || subscription.preference,
        approvedDays: approval?.mealDays || calculateWorkingDaysForMonth(month),
        servedMeals: servedMeals,
        subscriptionId: subscription._id,
        approvalDate: approval?.approvalDate
      });
    }
    
    res.status(200).json({
      success: true,
      month: month,
      totalEmployees: payrollData.length,
      totalServedMeals: payrollData.reduce((sum, d) => sum + d.servedMeals, 0),
      data: payrollData
    });
    
  } catch (error) {
    console.error('Export for payroll error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update meal days from payroll
exports.updateMealDaysFromPayroll = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
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
    
    const subscription = await MealSubscription.findOne({
      'userInfo.employeeId': employeeId,
      isDeleted: false
    });
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    const approval = subscription.monthlyApprovals.find(
      a => a.month === month
    );
    
    if (!approval) {
      return res.status(404).json({
        success: false,
        message: `No approval found for ${month}`
      });
    }
    
    approval.mealDays = mealDays;
    await subscription.save();
    
    // Audit Log
    await AuditLog.create({
      userId: req.user._id,
      action: "Meal Days Updated from Payroll",
      target: subscription._id,
      details: {
        month: month,
        employeeId: employeeId,
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
        employeeId: employeeId,
        month: month,
        mealDays: mealDays,
        updatedAt: new Date()
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

// ============================
// DASHBOARD
// ============================

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const currentMonth = getCurrentMonth();
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    let stats = {};
    
    if (isAdmin(req.user)) {
      // Admin stats
      const totalSubscriptions = await MealSubscription.countDocuments({
        status: 'active',
        isDeleted: false
      });
      
      const pendingApprovals = await MealSubscription.countDocuments({
        status: 'active',
        'monthlyApprovals.month': currentMonth,
        'monthlyApprovals.status': 'pending',
        isDeleted: false
      });
      
      const todayMeals = await Meal.countDocuments({
        date: {
          $gte: new Date(today.setHours(0, 0, 0, 0)),
          $lte: new Date(today.setHours(23, 59, 59, 999))
        },
        isDeleted: false
      });
      
      const monthlyMeals = await Meal.countDocuments({
        date: { $gte: startOfMonth, $lte: endOfMonth },
        isDeleted: false
      });
      
      stats = {
        totalSubscriptions,
        pendingApprovals,
        todayMeals,
        monthlyMeals,
        currentMonth
      };
    } else {
      // Employee stats
      const subscription = await MealSubscription.findOne({
        user: req.user._id,
        isDeleted: false
      });
      
      const todayMeal = await Meal.findOne({
        user: req.user._id,
        date: {
          $gte: new Date(today.setHours(0, 0, 0, 0)),
          $lte: new Date(today.setHours(23, 59, 59, 999))
        },
        isDeleted: false
      });
      
      const monthlyMeals = await Meal.countDocuments({
        user: req.user._id,
        date: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $in: ['approved', 'served'] },
        isDeleted: false
      });
      
      stats = {
        hasSubscription: !!subscription,
        subscriptionStatus: subscription?.status || 'none',
        todayMeal: todayMeal ? {
          status: todayMeal.status,
          preference: todayMeal.preference
        } : null,
        monthlyMeals,
        currentMonth
      };
    }
    
    res.status(200).json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};