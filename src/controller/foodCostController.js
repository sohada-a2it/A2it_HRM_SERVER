const FoodCost = require('../models/foodCostModel');
const mongoose = require('mongoose');

/**
 * Get all food costs
 */
exports.getAllFoodCosts = async (req, res) => {
  try {
    const foodCosts = await FoodCost.find().sort({ date: -1 });
    res.json({
      success: true,
      count: foodCosts.length,
      data: foodCosts
    });
  } catch (error) {
    console.error('Error fetching food costs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Get single food cost by ID
 */
exports.getFoodCostById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid food cost ID format' 
      });
    }
    
    const foodCost = await FoodCost.findById(id);
    
    if (!foodCost) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food cost record not found' 
      });
    }
    
    res.json({
      success: true,
      data: foodCost
    });
  } catch (error) {
    console.error('Error fetching food cost:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Add new food cost (ONE ENTRY PER DAY)
 */
exports.createFoodCost = async (req, res) => {
  try {
    console.log('Received food cost data:', req.body);
    
    const { date, cost, note } = req.body;
    
    // Validation
    if (!date || !cost) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date and cost amount are required' 
      });
    }
    
    // Parse the date
    const foodDate = new Date(date);
    
    // Check if food cost already exists for this date
    const existingFoodCost = await FoodCost.findOne({
      date: {
        $gte: new Date(foodDate.setHours(0, 0, 0, 0)),
        $lt: new Date(foodDate.setHours(23, 59, 59, 999))
      }
    });
    
    if (existingFoodCost) {
      return res.status(400).json({
        success: false,
        message: `Food cost record for ${foodDate.toLocaleDateString()} already exists. Please edit the existing record instead.`,
        existingData: existingFoodCost
      });
    }
    
    const foodCost = new FoodCost({
      date: new Date(date),
      cost: parseFloat(cost),
      note: note || ''
    });
    
    await foodCost.save();
    
    console.log('Food cost saved:', foodCost);
    
    res.status(201).json({
      success: true,
      message: 'Food cost saved successfully',
      data: foodCost
    });
  } catch (error) {
    console.error('Error saving food cost:', error);
    
    // Handle duplicate key error (MongoDB unique constraint)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Food cost record for this date already exists. Please edit the existing record instead.`
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Update food cost
 */
exports.updateFoodCost = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid food cost ID format' 
      });
    }
    
    const { date, cost, note } = req.body;
    
    // Validation
    if (!date || !cost) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date and cost amount are required' 
      });
    }
    
    // Parse the date
    const foodDate = new Date(date);
    
    // Check if another food cost already exists for this date (excluding current record)
    const existingFoodCost = await FoodCost.findOne({
      _id: { $ne: id }, // Exclude current record
      date: {
        $gte: new Date(foodDate.setHours(0, 0, 0, 0)),
        $lt: new Date(foodDate.setHours(23, 59, 59, 999))
      }
    });
    
    if (existingFoodCost) {
      return res.status(400).json({
        success: false,
        message: `Another food cost record for ${foodDate.toLocaleDateString()} already exists. Please choose a different date.`
      });
    }
    
    const updateData = {
      date: new Date(date),
      cost: parseFloat(cost),
      note: note || '',
      updatedAt: Date.now()
    };
    
    const foodCost = await FoodCost.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!foodCost) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food cost record not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Food cost updated successfully',
      data: foodCost
    });
  } catch (error) {
    console.error('Error updating food cost:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update: Another food cost record for this date already exists.'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Delete food cost
 */
exports.deleteFoodCost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const foodCost = await FoodCost.findByIdAndDelete(id);
    
    if (!foodCost) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food cost record not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Food cost deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting food cost:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Get food costs by month
 */
exports.getFoodCostsByMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    
    const foodCosts = await FoodCost.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: 1 });
    
    const totalCost = foodCosts.reduce((sum, cost) => sum + cost.cost, 0);
    
    res.json({
      success: true,
      data: {
        month: `${year}-${String(month).padStart(2, '0')}`,
        monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        totalCost,
        averagePerDay: foodCosts.length > 0 ? totalCost / foodCosts.length : 0,
        records: foodCosts.length,
        foodCosts
      }
    });
  } catch (error) {
    console.error('Error fetching monthly food costs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Get food cost statistics
 */
exports.getFoodCostStats = async (req, res) => {
  try {
    const foodCosts = await FoodCost.find().sort({ date: 1 });
    
    const totalCost = foodCosts.reduce((sum, cost) => sum + cost.cost, 0);
    const totalDays = foodCosts.length;
    
    // Group by month
    const monthlyStats = {};
    foodCosts.forEach(cost => {
      const date = new Date(cost.date);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      if (!monthlyStats[monthYear]) {
        monthlyStats[monthYear] = {
          month: monthYear,
          monthName: monthName,
          totalCost: 0,
          days: 0,
          averagePerDay: 0
        };
      }
      
      monthlyStats[monthYear].totalCost += cost.cost;
      monthlyStats[monthYear].days += 1;
    });
    
    // Calculate averages
    Object.values(monthlyStats).forEach(stat => {
      stat.averagePerDay = stat.days > 0 ? stat.totalCost / stat.days : 0;
    });
    
    res.json({
      success: true,
      data: {
        totalCost,
        totalDays,
        averagePerDay: totalDays > 0 ? totalCost / totalDays : 0,
        monthlyStats: Object.values(monthlyStats).sort((a, b) => b.month.localeCompare(a.month))
      }
    });
  } catch (error) {
    console.error('Error in food cost stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

/**
 * Check if food cost exists for a specific date
 */
exports.checkDateExists = async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date query parameter is required' 
      });
    }
    
    const checkDate = new Date(date);
    if (isNaN(checkDate.getTime())) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid date format' 
      });
    }
    
    const startOfDay = new Date(checkDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(checkDate.setHours(23, 59, 59, 999));
    
    const existingFoodCost = await FoodCost.findOne({
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    if (existingFoodCost) {
      return res.json({
        success: true,
        exists: true,
        message: `Food cost record for ${checkDate.toLocaleDateString()} already exists`,
        data: existingFoodCost
      });
    }
    
    res.json({
      success: true,
      exists: false,
      message: 'No food cost record found for this date'
    });
  } catch (error) {
    console.error('Error checking date:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}; 