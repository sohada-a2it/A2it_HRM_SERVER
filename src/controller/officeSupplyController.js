const OfficeSupply = require('../models/officeSupplyModel');
const mongoose = require('mongoose');

// Get all office supplies
exports.getAllSupplies = async (req, res) => {
  try {
    const supplies = await OfficeSupply.find().sort({ date: -1 });
    res.json({
      success: true,
      count: supplies.length,
      data: supplies
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Add office supplies (multiple) 
exports.addSupplies = async (req, res) => {
  try {
    console.log('Received office supplies data:', req.body);
    
    const suppliesData = req.body;
    
    // Validate input is an array
    if (!Array.isArray(suppliesData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Expected an array of supplies' 
      });
    }
    
    // Process each supply
    const savedSupplies = [];
    const errors = [];
    
    for (const supplyData of suppliesData) {
      const { name, date, price, paymentMethod, note } = supplyData;
      
      // Skip if required fields are empty
      if (!name || !price || !date) {
        errors.push({
          name: name || 'Unknown',
          message: 'Name, date, and price are required'
        });
        continue;
      }
      
      try {
        const supply = new OfficeSupply({
          name,
          date: new Date(date),
          price: parseFloat(price),
          paymentMethod: paymentMethod || 'Cash',
          note: note || ''
        });
        
        await supply.save();
        savedSupplies.push(supply);
        console.log(`Saved supply: ${name} with note: ${note}`);
        
      } catch (error) {
        errors.push({
          name: name,
          message: `Error saving "${name}": ${error.message}`
        });
      }
    }
    
    console.log(`Saved ${savedSupplies.length} supplies, ${errors.length} errors`);
    
    res.status(201).json({
      success: true,
      message: `Saved ${savedSupplies.length} supply item(s) successfully`,
      data: savedSupplies,
      warnings: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error saving office supplies:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Delete a single office supply
exports.deleteSupply = async (req, res) => {
  try {
    const { id } = req.params;
    
    const supply = await OfficeSupply.findByIdAndDelete(id);
    
    if (!supply) {
      return res.status(404).json({ 
        success: false, 
        message: 'Supply item not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Supply item deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get statistics for office supplies
exports.getStats = async (req, res) => {
  try {
    const supplies = await OfficeSupply.find();
    
    const totalAmount = supplies.reduce((sum, supply) => sum + supply.price, 0);
    const totalItems = supplies.length;
    
    // Group by payment method
    const paymentStats = {};
    supplies.forEach(supply => {
      const method = supply.paymentMethod;
      paymentStats[method] = (paymentStats[method] || 0) + supply.price;
    });
    
    // Group by month
    const monthlyStats = {};
    supplies.forEach(supply => {
      const date = new Date(supply.date);
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
      
      monthlyStats[monthYear].total += supply.price;
      monthlyStats[monthYear].count += 1;
    });
    
    res.json({
      success: true,
      data: {
        totalAmount,
        totalItems,
        avgPerItem: totalItems > 0 ? totalAmount / totalItems : 0,
        paymentStats,
        monthlyStats: Object.values(monthlyStats).sort((a, b) => b.month.localeCompare(a.month))
      }
    });
  } catch (error) {
    console.error('Error in office supplies stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Update single office supply 
exports.updateSupply = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid supply ID format' 
      });
    }
    
    const { name, date, price, paymentMethod, note } = req.body;
    
    // Validation
    if (!name || !date || !price) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, date, and price are required' 
      });
    }
    
    const updateData = {
      name,
      date: new Date(date),
      price: parseFloat(price),
      paymentMethod: paymentMethod || 'Cash',
      note: note || '',
      updatedAt: Date.now()
    };
    
    const supply = await OfficeSupply.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!supply) {
      return res.status(404).json({ 
        success: false, 
        message: 'Supply item not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Supply item updated successfully',
      data: supply
    });
  } catch (error) {
    console.error('Error updating supply:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Migrate office supplies note field
exports.migrateNoteField = async (req, res) => {
  try {
    // Add note field to all existing office supplies
    const result = await OfficeSupply.updateMany(
      { note: { $exists: false } },
      {
        $set: {
          note: ''
        }
      }
    );
    
    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} office supplies with note field`,
      data: result
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};