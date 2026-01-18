const TransportExpense = require('../models/transportModel');
const mongoose = require('mongoose'); 
exports.getTransportExpenses = async (req, res) => {
  try {
    const expenses = await TransportExpense.find().sort({ date: -1 });
    
    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    console.error('Error fetching transport expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while fetching transport expenses' 
    });
  }
}; 
exports.addTransportExpenses = async (req, res) => {
  try {
    console.log('Received transport expenses data:', req.body);
    
    const expensesData = req.body;
    
    // Validate input is an array
    if (!Array.isArray(expensesData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Expected an array of transport expenses' 
      });
    }
    
    // Process each expense
    const savedExpenses = [];
    const errors = [];
    
    for (const expenseData of expensesData) {
      const { transportName, cost, date, paymentMethod, note } = expenseData;
      
      // Skip if required fields are empty
      if (!transportName || !cost || !date) {
        errors.push({
          transportName: transportName || 'Unknown',
          message: 'Transport name, cost, and date are required'
        });
        continue;
      }
      
      try {
        const expense = new TransportExpense({
          transportName,
          cost: parseFloat(cost),
          date: new Date(date),
          paymentMethod: paymentMethod || 'Cash',
          note: note || ''
        });
        
        await expense.save();
        savedExpenses.push(expense);
        console.log(`Saved transport expense: ${transportName}`);
        
      } catch (error) {
        console.error(`Error saving transport expense "${transportName}":`, error);
        errors.push({
          transportName: transportName,
          message: `Error saving "${transportName}": ${error.message}`
        });
      }
    }
    
    console.log(`Saved ${savedExpenses.length} transport expenses, ${errors.length} errors`);
    
    let status = 201;
    let message = `Saved ${savedExpenses.length} transport expense(s) successfully`;
    
    // If all failed
    if (savedExpenses.length === 0 && errors.length > 0) {
      status = 400;
      message = 'Failed to save any transport expenses';
    }
    // If partial success
    else if (errors.length > 0) {
      status = 207; // Multi-status
      message = `Partially saved ${savedExpenses.length} transport expense(s)`;
    }
    
    res.status(status).json({
      success: savedExpenses.length > 0,
      message,
      data: savedExpenses,
      warnings: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error saving transport expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while saving transport expenses' 
    });
  }
}; 
exports.updateTransportExpense = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Updating transport expense with ID: ${id}`, req.body);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid transport expense ID format' 
      });
    }
    
    const { transportName, cost, date, paymentMethod, note } = req.body;
    
    // Validation
    if (!transportName || !date || !cost) {
      return res.status(400).json({ 
        success: false, 
        message: 'Transport name, date, and cost are required' 
      });
    }
    
    const updateData = {
      transportName,
      cost: parseFloat(cost),
      date: new Date(date),
      paymentMethod: paymentMethod || 'Cash',
      note: note || '',
      updatedAt: Date.now()
    };
    
    const expense = await TransportExpense.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!expense) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transport expense not found' 
      });
    }
    
    console.log(`Successfully updated transport expense: ${expense.transportName}`);
    
    res.status(200).json({
      success: true,
      message: 'Transport expense updated successfully',
      data: expense
    });
  } catch (error) {
    console.error('Error updating transport expense:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while updating transport expense' 
    });
  }
}; 
exports.deleteTransportExpense = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Deleting transport expense with ID: ${id}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid transport expense ID format' 
      });
    }
    
    const expense = await TransportExpense.findByIdAndDelete(id);
    
    if (!expense) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transport expense not found' 
      });
    }
    
    console.log(`Successfully deleted transport expense: ${expense.transportName}`);
    
    res.status(200).json({
      success: true,
      message: 'Transport expense deleted successfully',
      deletedId: id
    });
  } catch (error) {
    console.error('Error deleting transport expense:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while deleting transport expense' 
    });
  }
};
 
exports.getTransportExpenseStats = async (req, res) => {
  try {
    const expenses = await TransportExpense.find();
    
    const totalCost = expenses.reduce((sum, expense) => sum + expense.cost, 0);
    const totalExpenses = expenses.length;
    
    // Group by transport type
    const transportStats = {};
    expenses.forEach(expense => {
      const transport = expense.transportName;
      transportStats[transport] = (transportStats[transport] || 0) + expense.cost;
    });
    
    // Group by month
    const monthlyStats = {};
    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      if (!monthlyStats[monthYear]) {
        monthlyStats[monthYear] = {
          month: monthYear,
          monthName: monthName,
          total: 0,
          count: 0
        };
      }
      
      monthlyStats[monthYear].total += expense.cost;
      monthlyStats[monthYear].count += 1;
    });
    
    // Group by payment method
    const paymentStats = {};
    expenses.forEach(expense => {
      const method = expense.paymentMethod;
      paymentStats[method] = (paymentStats[method] || 0) + expense.cost;
    });
    
    // Get recent expenses (last 10)
    const recentExpenses = await TransportExpense.find()
      .sort({ date: -1 })
      .limit(10);
    
    // Calculate daily averages for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentExpensesData = await TransportExpense.find({
      date: { $gte: thirtyDaysAgo }
    });
    
    const dailyAverages = {};
    recentExpensesData.forEach(expense => {
      const dateStr = expense.date.toISOString().split('T')[0];
      if (!dailyAverages[dateStr]) {
        dailyAverages[dateStr] = {
          total: 0,
          count: 0
        };
      }
      dailyAverages[dateStr].total += expense.cost;
      dailyAverages[dateStr].count += 1;
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalCost,
        totalExpenses,
        avgPerExpense: totalExpenses > 0 ? totalCost / totalExpenses : 0,
        transportStats,
        paymentStats,
        monthlyStats: Object.values(monthlyStats).sort((a, b) => b.month.localeCompare(a.month)),
        recentExpenses,
        dailyAverages
      }
    });
  } catch (error) {
    console.error('Error in transport expense stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error while calculating transport expense statistics' 
    });
  }
};