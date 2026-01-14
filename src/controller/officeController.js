const OfficeRent = require('../models/officeRentModel');
const mongoose = require('mongoose'); 
exports.getAllOfficeRents = async (req, res) => {
  try {
    const rents = await OfficeRent.find().sort({ date: -1 });
    res.json({
      success: true,
      count: rents.length,
      data: rents
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.getOfficeRentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate MongoDB ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid office rent ID format' 
      });
    }
    
    const rent = await OfficeRent.findById(id);
    
    if (!rent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Office rent record not found' 
      });
    }
    
    res.json({
      success: true,
      data: rent
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.createOfficeRent = async (req, res) => {
  try {
    console.log('Received office rent data:', req.body);
    
    const { date, rent, paymentMethod, note } = req.body;
    
    // Validation
    if (!date || !rent) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date and rent amount are required' 
      });
    }
    
    const officeRent = new OfficeRent({
      date: new Date(date),
      rent: parseFloat(rent),
      paymentMethod: paymentMethod || 'cash',
      note: note || ''
    });
    
    await officeRent.save();
    
    console.log('Office rent saved:', officeRent);
    
    res.status(201).json({
      success: true,
      message: 'Office rent saved successfully',
      data: officeRent
    });
  } catch (error) {
    console.error('Error saving office rent:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.updateOfficeRent = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate MongoDB ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid office rent ID format' 
      });
    }
    
    const { date, rent, paymentMethod, note } = req.body;
    
    // Validation
    if (!date || !rent) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date and rent amount are required' 
      });
    }
    
    const updateData = {
      date: new Date(date),
      rent: parseFloat(rent),
      paymentMethod: paymentMethod || 'cash',
      note: note || '',
      updatedAt: Date.now()
    };
    
    const officeRent = await OfficeRent.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!officeRent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Office rent record not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Office rent updated successfully',
      data: officeRent
    });
  } catch (error) {
    console.error('Error updating office rent:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.deleteOfficeRent = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate MongoDB ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid office rent ID format' 
      });
    }
    
    const officeRent = await OfficeRent.findByIdAndDelete(id);
    
    if (!officeRent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Office rent record not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Office rent deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.getOfficeRentsByMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const rents = await OfficeRent.find({
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: -1 });
    
    // Calculate total rent for the month
    const totalRent = rents.reduce((sum, rent) => sum + rent.rent, 0);
    
    res.json({
      success: true,
      count: rents.length,
      totalRent,
      data: rents
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.getOfficeRentStats = async (req, res) => {
  try {
    const stats = await OfficeRent.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$rent' },
          totalRecords: { $sum: 1 },
          averageRent: { $avg: '$rent' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: stats[0] || { totalAmount: 0, totalRecords: 0, averageRent: 0 }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.getYearlySummary = async (req, res) => {
  try {
    const { year } = req.params;
    
    const summary = await OfficeRent.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`)
          }
        }
      },
      {
        $group: {
          _id: { $month: '$date' },
          totalRent: { $sum: '$rent' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);
    
    res.json({
      success: true,
      year,
      data: summary
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};