const SoftwareSubscription = require('../models/softwareSubscription');
const mongoose = require('mongoose');
 
exports.getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await SoftwareSubscription.find().sort({ date: -1 });
    
    res.json({
      success: true,
      count: subscriptions.length,
      data: subscriptions
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.createSubscriptions = async (req, res) => {
  try {
    console.log('Received subscriptions data:', req.body);
    
    const subscriptionsData = req.body;
    
    // Validate input is an array
    if (!Array.isArray(subscriptionsData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Expected an array of subscriptions' 
      });
    }
    
    // Process each subscription
    const savedSubscriptions = [];
    const errors = [];
    
    for (const subData of subscriptionsData) {
      const { softwareName, amount, date, paymentMethod, note, durationNumber, durationUnit } = subData;
      
      // Skip if required fields are empty
      if (!softwareName || !amount || !date) {
        errors.push({
          softwareName: softwareName || 'Unknown',
          message: 'Software name, amount, and date are required'
        });
        continue;
      }
      
      try {
        const subscription = new SoftwareSubscription({
          softwareName,
          amount: parseFloat(amount),
          date: new Date(date),
          paymentMethod: paymentMethod || 'Cash',
          note: note || '',
          durationNumber: durationNumber ? parseInt(durationNumber) : null,
          durationUnit: durationUnit || null
        });
        
        await subscription.save();
        savedSubscriptions.push(subscription);
        console.log(`Saved subscription: ${softwareName} with duration: ${durationNumber} ${durationUnit}`);
        
      } catch (error) {
        console.error(`Error saving subscription "${softwareName}":`, error);
        errors.push({
          softwareName: softwareName,
          message: `Error saving "${softwareName}": ${error.message}`
        });
      }
    }
    
    console.log(`Saved ${savedSubscriptions.length} subscriptions, ${errors.length} errors`);
    
    res.status(201).json({
      success: true,
      message: `Saved ${savedSubscriptions.length} subscription(s) successfully`,
      data: savedSubscriptions,
      warnings: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error saving subscriptions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Updating subscription with ID: ${id}`, req.body);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription ID format' 
      });
    }
    
    const { softwareName, amount, date, paymentMethod, note, durationNumber, durationUnit } = req.body;
    
    // Validation
    if (!softwareName || !date || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Software name, date, and amount are required' 
      });
    }
    
    const updateData = {
      softwareName,
      amount: parseFloat(amount),
      date: new Date(date),
      paymentMethod: paymentMethod || 'Cash',
      note: note || '',
      durationNumber: durationNumber ? parseInt(durationNumber) : null,
      durationUnit: durationUnit || null,
      updatedAt: Date.now()
    };
    
    const subscription = await SoftwareSubscription.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!subscription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Subscription not found' 
      });
    }
    
    console.log(`Successfully updated subscription: ${subscription.softwareName}`);
    
    res.json({
      success: true,
      message: 'Subscription updated successfully',
      data: subscription
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Deleting subscription with ID: ${id}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription ID format' 
      });
    }
    
    const subscription = await SoftwareSubscription.findByIdAndDelete(id);
    
    if (!subscription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Subscription not found' 
      });
    }
    
    console.log(`Successfully deleted subscription: ${subscription.softwareName}`);
    
    res.json({
      success: true,
      message: 'Subscription deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.getSubscriptionStats = async (req, res) => {
  try {
    const subscriptions = await SoftwareSubscription.find();
    
    const totalAmount = subscriptions.reduce((sum, sub) => sum + sub.amount, 0);
    const totalSubscriptions = subscriptions.length;
    
    // Group by software
    const softwareStats = {};
    subscriptions.forEach(sub => {
      const software = sub.softwareName;
      softwareStats[software] = (softwareStats[software] || 0) + sub.amount;
    });
    
    // Group by month
    const monthlyStats = {};
    subscriptions.forEach(sub => {
      const date = new Date(sub.date);
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
      
      monthlyStats[monthYear].total += sub.amount;
      monthlyStats[monthYear].count += 1;
    });
    
    res.json({
      success: true,
      data: {
        totalAmount,
        totalSubscriptions,
        avgPerSubscription: totalSubscriptions > 0 ? totalAmount / totalSubscriptions : 0,
        softwareStats,
        monthlyStats: Object.values(monthlyStats).sort((a, b) => b.month.localeCompare(a.month))
      }
    });
  } catch (error) {
    console.error('Error in subscription stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
 
exports.migrateDuration = async (req, res) => {
  try {
    // Add durationNumber and durationUnit fields to all existing subscriptions
    const result = await SoftwareSubscription.updateMany(
      {
        $or: [
          { durationNumber: { $exists: false } },
          { durationUnit: { $exists: false } }
        ]
      },
      {
        $set: {
          durationNumber: null,
          durationUnit: null
        }
      }
    );
    
    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} subscriptions with duration fields`,
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