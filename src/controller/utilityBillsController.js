const mongoose = require('mongoose');
const Bill = require('../models/utilitybillsModel');

// Get all bills
exports.getAllBills = async (req, res) => {
  try {
    const bills = await Bill.find().sort({ date: -1 });
    res.json({
      success: true,
      count: bills.length,
      data: bills
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get bill by ID
exports.getBillById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid bill ID format' 
      });
    }
    
    const bill = await Bill.findById(id);
    
    if (!bill) {
      return res.status(404).json({ 
        success: false, 
        message: 'Bill not found' 
      });
    }
    
    res.json({
      success: true,
      data: bill
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Add new bills (multiple)
exports.addBills = async (req, res) => {
  try {
    console.log('Received bills data:', req.body);
    
    const billsData = req.body;
    
    // Validate input is an array
    if (!Array.isArray(billsData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Expected an array of bills' 
      });
    }
    
    // Process each bill
    const savedBills = [];
    const errors = [];
    
    for (const billData of billsData) {
      const { name, amount, date, paymentMethod, isFixed, note } = billData;
      
      // Skip if amount is empty
      if (!amount || amount === '' || amount === '0') continue;
      
      // Parse the date
      const billDate = date ? new Date(date) : new Date();
      const month = billDate.getMonth() + 1;
      const year = billDate.getFullYear();
      
      try {
        // Check if bill already exists for this month-year
        const existingBill = await Bill.findOne({
          name: name,
          month: month,
          year: year
        });
        
        if (existingBill) {
          errors.push({
            name: name,
            month: month,
            year: year,
            message: `Bill "${name}" for ${billDate.toLocaleString('default', { month: 'long' })} ${year} already exists`
          });
          continue;
        }
        
        const bill = new Bill({
          name,
          amount: parseFloat(amount),
          date: billDate,
          month: month,
          year: year,
          paymentMethod: paymentMethod || 'bank_transfer',
          isFixed: isFixed || false,
          note: note || '',
          paymentStatus: 'paid'
        });
        
        await bill.save();
        savedBills.push(bill);
        
      } catch (error) {
        if (error.code === 11000) {
          errors.push({
            name: name,
            month: month,
            year: year,
            message: `Cannot save: ${name} for ${billDate.toLocaleString('default', { month: 'long' })} ${year} already exists`
          });
        } else {
          errors.push({
            name: name,
            message: `Error saving ${name}: ${error.message}`
          });
        }
      }
    }
    
    console.log(`Saved ${savedBills.length} bills, ${errors.length} errors`);
    
    if (savedBills.length === 0 && errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'No bills saved due to errors',
        errors: errors
      });
    }
    
    res.status(201).json({
      success: true,
      message: `Saved ${savedBills.length} bill(s) successfully`,
      data: savedBills,
      warnings: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error saving bills:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Update single bill
exports.updateBill = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid bill ID format' 
      });
    }
    
    const { name, amount, date, paymentMethod, note } = req.body;
    
    // Validation
    if (!name || !amount || !date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, amount, and date are required' 
      });
    }
    
    // Parse date to get month and year
    const billDate = new Date(date);
    const month = billDate.getMonth() + 1;
    const year = billDate.getFullYear();
    
    // Check if another bill with same name exists for this month-year
    const existingBill = await Bill.findOne({
      _id: { $ne: id },
      name: name,
      month: month,
      year: year
    });
    
    if (existingBill) {
      return res.status(400).json({
        success: false,
        message: `A bill with name "${name}" already exists for ${billDate.toLocaleString('default', { month: 'long' })} ${year}`
      });
    }
    
    const updateData = {
      name,
      amount: parseFloat(amount),
      date: billDate,
      month: month,
      year: year,
      paymentMethod: paymentMethod || 'bank_transfer',
      note: note || '',
      updatedAt: Date.now()
    };
    
    const bill = await Bill.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!bill) {
      return res.status(404).json({ 
        success: false, 
        message: 'Bill not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Bill updated successfully',
      data: bill
    });
  } catch (error) {
    console.error('Error updating bill:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate bill detected for this month'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Delete bill
exports.deleteBill = async (req, res) => {
  try {
    const { id } = req.params;
    
    const bill = await Bill.findByIdAndDelete(id);
    
    if (!bill) {
      return res.status(404).json({ 
        success: false, 
        message: 'Bill not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Bill deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get all unique bill types
exports.getBillTypes = async (req, res) => {
  try {
    const billTypes = await Bill.distinct('name');
    
    if (!billTypes || billTypes.length === 0) {
      return res.json({
        success: true,
        data: ["Electricity Bill", "Water Bill", "Internet Bill", "Gas Bill"]
      });
    }
    
    res.json({
      success: true,
      data: billTypes
    });
  } catch (error) {
    console.error('Error getting bill types:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get total statistics
exports.getStats = async (req, res) => {
  try {
    const bills = await Bill.find();
    
    const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);
    const totalBills = bills.length;
    
    res.json({
      success: true,
      data: {
        totalAmount: totalAmount || 0,
        totalBills: totalBills || 0,
        avgPerBill: totalBills > 0 ? totalAmount / totalBills : 0
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get bills grouped by month
exports.getBillsByMonth = async (req, res) => {
  try {
    const bills = await Bill.find().sort({ date: -1 });
    
    const groupedByMonth = {};
    
    bills.forEach(bill => {
      const monthYear = `${bill.year}-${String(bill.month).padStart(2, '0')}`;
      const monthName = new Date(bill.year, bill.month - 1).toLocaleString('default', { 
        month: 'long', 
        year: 'numeric' 
      });
      
      if (!groupedByMonth[monthYear]) {
        groupedByMonth[monthYear] = {
          month: monthYear,
          monthName: monthName,
          total: 0,
          bills: [],
          billTypes: {}
        };
      }
      
      groupedByMonth[monthYear].total += bill.amount;
      groupedByMonth[monthYear].bills.push(bill);
      
      if (!groupedByMonth[monthYear].billTypes[bill.name]) {
        groupedByMonth[monthYear].billTypes[bill.name] = 0;
      }
      groupedByMonth[monthYear].billTypes[bill.name] += bill.amount;
    });
    
    const result = Object.values(groupedByMonth).sort((a, b) => 
      b.month.localeCompare(a.month)
    );
    
    res.json({
      success: true,
      count: result.length,
      data: result
    });
  } catch (error) {
    console.error('Error getting bills by month:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Get bills by specific month-year
exports.getBillsByMonthYear = async (req, res) => {
  try {
    const { year, month } = req.params;
    
    const bills = await Bill.find({
      year: parseInt(year),
      month: parseInt(month)
    }).sort({ name: 1 });
    
    res.json({
      success: true,
      count: bills.length,
      data: bills,
      monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Update multiple bills for a month
exports.updateMonthBills = async (req, res) => {
  try {
    const { monthYear, bills } = req.body;
    
    if (!monthYear || !Array.isArray(bills)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Month-year and bills array are required' 
      });
    }
    
    const [year, month] = monthYear.split('-').map(Number);
    
    const existingBills = await Bill.find({
      month: month,
      year: year
    });
    
    const results = {
      updated: [],
      created: [],
      deleted: [],
      errors: []
    };
    
    // Process each bill in the update request
    for (const billData of bills) {
      const { name, amount, date, paymentMethod, note, _id } = billData;
      
      try {
        // Skip if amount is empty
        if (!amount || amount === '' || amount === '0') {
          results.errors.push({
            name,
            message: `Skipped "${name}" - amount is empty`
          });
          continue;
        }
        
        if (_id) {
          // Update existing bill
          const existingBill = existingBills.find(b => b._id.toString() === _id);
          
          if (!existingBill) {
            results.errors.push({
              name,
              message: `Bill with ID ${_id} not found`
            });
            continue;
          }
          
          const updateData = {
            name,
            amount: parseFloat(amount),
            date: date ? new Date(date) : new Date(),
            paymentMethod: paymentMethod || 'bank_transfer',
            note: note || '',
            updatedAt: Date.now()
          };
          
          const updatedBill = await Bill.findByIdAndUpdate(
            _id,
            updateData,
            { new: true, runValidators: true }
          );
          
          results.updated.push(updatedBill);
          
        } else {
          // Create new bill
          const billDate = date ? new Date(date) : new Date();
          const billMonth = billDate.getMonth() + 1;
          const billYear = billDate.getFullYear();
          
          // Check if bill already exists for this month
          const existingBill = await Bill.findOne({
            name: name,
            month: billMonth,
            year: billYear
          });
          
          if (existingBill) {
            results.errors.push({
              name,
              message: `Bill "${name}" already exists for ${billDate.toLocaleString('default', { month: 'long' })} ${billYear}`
            });
            continue;
          }
          
          const newBill = new Bill({
            name,
            amount: parseFloat(amount),
            date: billDate,
            month: billMonth,
            year: billYear,
            paymentMethod: paymentMethod || 'bank_transfer',
            note: note || '',
            isFixed: ["Electricity Bill", "Water Bill", "Internet Bill", "Gas Bill"].includes(name)
          });
          
          await newBill.save();
          results.created.push(newBill);
        }
        
      } catch (error) {
        results.errors.push({
          name: billData.name || 'Unknown',
          message: error.message
        });
      }
    }
    
    // Delete bills that were removed
    const billNamesInRequest = bills.map(b => b.name);
    
    for (const existingBill of existingBills) {
      if (!billNamesInRequest.includes(existingBill.name)) {
        await Bill.findByIdAndDelete(existingBill._id);
        results.deleted.push(existingBill);
      }
    }
    
    res.json({
      success: true,
      message: `Month ${monthYear} updated successfully`,
      data: {
        updated: results.updated.length,
        created: results.created.length,
        deleted: results.deleted.length,
        details: results
      }
    });
    
  } catch (error) {
    console.error('Error updating month:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Delete all bills for a specific month
exports.deleteMonthBills = async (req, res) => {
  try {
    const { year, month } = req.params;
    
    const result = await Bill.deleteMany({
      year: parseInt(year),
      month: parseInt(month)
    });
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} bills for ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`,
      data: result
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// Fix index
exports.fixIndex = async (req, res) => {
  try {
    const collection = mongoose.connection.collection('bills');
    await collection.dropIndex("name_1_month_1_year_1");
    res.json({ success: true, message: "Index removed successfully" });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
};

// Remove duplicate index
exports.removeDuplicateIndex = async (req, res) => {
  try {
    const collection = mongoose.connection.collection('bills');
    
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);
    
    try {
      await collection.dropIndex("name_1_month_1_year_1");
      console.log('✅ Duplicate index removed');
    } catch (error) {
      console.log('Index might not exist or already removed:', error.message);
    }
    
    res.json({ 
      success: true, 
      message: "Index cleanup attempted",
      indexes: indexes 
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
};