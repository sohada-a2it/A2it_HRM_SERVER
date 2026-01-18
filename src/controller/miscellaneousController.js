const ExtraExpense = require('../models/miscellaneousModel');
const mongoose = require('mongoose');

// Get all extra expenses
exports.getExtraExpenses = async (req, res) => {
  try {
    const expenses = await ExtraExpense.find().sort({ date: -1 });
    res.json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    console.error('Error fetching extra expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Add extra expenses (multiple)
exports.addExtraExpenses = async (req, res) => {
  try {
    console.log('Received extra expenses data:', req.body);
    
    const expensesData = req.body;
    
    // Validate input is an array
    if (!Array.isArray(expensesData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Expected an array of extra expenses' 
      });
    }
    
    // Process each expense
    const savedExpenses = [];
    const errors = [];
    
    for (const expenseData of expensesData) {
      const { expenseName, amount, date, paymentMethod, note } = expenseData;
      
      // Skip if required fields are empty
      if (!expenseName || !amount || !date) {
        errors.push({
          expenseName: expenseName || 'Unknown',
          message: 'Expense name, amount, and date are required'
        });
        continue;
      }
      
      try {
        const expense = new ExtraExpense({
          expenseName,
          amount: parseFloat(amount),
          date: new Date(date),
          paymentMethod: paymentMethod || 'Cash',
          note: note || ''
        });
        
        await expense.save();
        savedExpenses.push(expense);
        console.log(`Saved extra expense: ${expenseName}`);
        
      } catch (error) {
        console.error(`Error saving extra expense "${expenseName}":`, error);
        errors.push({
          expenseName: expenseName,
          message: `Error saving "${expenseName}": ${error.message}`
        });
      }
    }
    
    console.log(`Saved ${savedExpenses.length} extra expenses, ${errors.length} errors`);
    
    res.status(201).json({
      success: true,
      message: `Saved ${savedExpenses.length} extra expense(s) successfully`,
      data: savedExpenses,
      warnings: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error saving extra expenses:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Update single extra expense
exports.updateExtraExpense = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Updating extra expense with ID: ${id}`, req.body);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid extra expense ID format' 
      });
    }
    
    const { expenseName, amount, date, paymentMethod, note } = req.body;
    
    // Validation
    if (!expenseName || !date || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Expense name, date, and amount are required' 
      });
    }
    
    const updateData = {
      expenseName,
      amount: parseFloat(amount),
      date: new Date(date),
      paymentMethod: paymentMethod || 'Cash',
      note: note || '',
      updatedAt: Date.now()
    };
    
    const expense = await ExtraExpense.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!expense) {
      return res.status(404).json({ 
        success: false, 
        message: 'Extra expense not found' 
      });
    }
    
    console.log(`Successfully updated extra expense: ${expense.expenseName}`);
    
    res.json({
      success: true,
      message: 'Extra expense updated successfully',
      data: expense
    });
  } catch (error) {
    console.error('Error updating extra expense:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Delete single extra expense
exports.deleteExtraExpense = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Deleting extra expense with ID: ${id}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid extra expense ID format' 
      });
    }
    
    const expense = await ExtraExpense.findByIdAndDelete(id);
    
    if (!expense) {
      return res.status(404).json({ 
        success: false, 
        message: 'Extra expense not found' 
      });
    }
    
    console.log(`Successfully deleted extra expense: ${expense.expenseName}`);
    
    res.json({
      success: true,
      message: 'Extra expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting extra expense:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get statistics for extra expenses
exports.getExtraExpenseStats = async (req, res) => {
  try {
    const expenses = await ExtraExpense.find();
    
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const totalExpenses = expenses.length;
    
    // Group by expense type
    const expenseStats = {};
    expenses.forEach(expense => {
      const expenseType = expense.expenseName;
      expenseStats[expenseType] = (expenseStats[expenseType] || 0) + expense.amount;
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
      
      monthlyStats[monthYear].total += expense.amount;
      monthlyStats[monthYear].count += 1;
    });
    
    // Group by payment method
    const paymentStats = {};
    expenses.forEach(expense => {
      const method = expense.paymentMethod;
      paymentStats[method] = (paymentStats[method] || 0) + expense.amount;
    });
    
    res.json({
      success: true,
      data: {
        totalAmount,
        totalExpenses,
        avgPerExpense: totalExpenses > 0 ? totalAmount / totalExpenses : 0,
        expenseStats,
        paymentStats,
        monthlyStats: Object.values(monthlyStats).sort((a, b) => b.month.localeCompare(a.month))
      }
    });
  } catch (error) {
    console.error('Error in extra expense stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 