// utils/mealPayrollCalculator.js

const Meal = require('../models/mealModel');
const MealSubscription = require('../models/MealSubscriptionModel');
const FoodCost = require('../models/foodCostModel');
const User = require('../models/UsersModel');

/**
 * Calculate employee meal days for a month (Auto)
 */
exports.calculateEmployeeMealDays = async (employeeId, month, year) => {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const meals = await Meal.find({
      user: employeeId,
      date: {
        $gte: startDate,
        $lte: endDate
      },
      status: { $in: ['approved', 'served'] },
      isDeleted: false
    }).sort({ date: 1 });
    
    return {
      totalDays: meals.length,
      meals: meals.map(m => ({
        date: m.date,
        preference: m.preference,
        status: m.status,
        notes: m.notes
      })),
      hasMeals: meals.length > 0
    };
  } catch (error) {
    console.error('Error calculating meal days:', error);
    return { totalDays: 0, meals: [], hasMeals: false };
  }
};

/**
 * Check if employee has active monthly subscription
 */
exports.checkMonthlySubscription = async (employeeId, month, year) => {
  try {
    const currentMonth = `${year}-${String(month).padStart(2, '0')}`;
    
    const subscription = await MealSubscription.findOne({
      user: employeeId,
      isDeleted: false,
      'monthlyApprovals.month': currentMonth,
      'monthlyApprovals.status': 'approved'
    });
    
    if (!subscription) {
      return { hasSubscription: false };
    }
    
    const approval = subscription.monthlyApprovals.find(
      a => a.month === currentMonth
    );
    
    return {
      hasSubscription: true,
      subscriptionId: subscription._id,
      preference: subscription.preference,
      approvalStatus: approval?.status || 'pending',
      approvedDays: approval?.mealDays || 0,
      autoRenew: subscription.autoRenew
    };
  } catch (error) {
    console.error('Error checking subscription:', error);
    return { hasSubscription: false };
  }
};

/**
 * Calculate food cost deduction for monthly subscribers
 */
exports.calculateFoodCostDeduction = async (selectedFoodCostIds, month, year) => {
  try {
    if (!selectedFoodCostIds || selectedFoodCostIds.length === 0) {
      return {
        totalCost: 0,
        deductionPerEmployee: 0,
        totalActiveSubscribers: 0,
        calculationNote: 'No food cost bills selected'
      };
    }
    
    // Get selected food cost bills
    const foodCostBills = await FoodCost.find({
      _id: { $in: selectedFoodCostIds }
    });
    
    const totalFoodCost = foodCostBills.reduce((sum, bill) => sum + bill.cost, 0);
    
    // Get total active subscribers for the month
    const currentMonth = `${year}-${String(month).padStart(2, '0')}`;
    const totalActiveSubscribers = await MealSubscription.countDocuments({
      status: 'active',
      isDeleted: false,
      isPaused: false,
      'monthlyApprovals.month': currentMonth,
      'monthlyApprovals.status': 'approved'
    });
    
    const deductionPerEmployee = totalActiveSubscribers > 0 ? 
      Math.round(totalFoodCost / totalActiveSubscribers) : 0;
    
    return {
      totalCost: totalFoodCost,
      deductionPerEmployee: deductionPerEmployee,
      totalActiveSubscribers: totalActiveSubscribers,
      foodCostBills: foodCostBills.map(bill => ({
        id: bill._id,
        date: bill.date,
        cost: bill.cost,
        note: bill.note
      })),
      calculationNote: `Food Cost: ${totalFoodCost} BDT ÷ ${totalActiveSubscribers} active subscribers = ${deductionPerEmployee} BDT per employee`
    };
  } catch (error) {
    console.error('Error calculating food cost deduction:', error);
    throw error;
  }
};