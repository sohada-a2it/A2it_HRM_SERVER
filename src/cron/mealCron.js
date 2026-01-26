// utils/cronJobs.js
const cron = require('node-cron');
const User = require('../models/UsersModel');

// Run at 00:00 on 25th of every month (to create next month's request)
cron.schedule('0 0 25 * *', async () => {
  console.log('Running monthly meal auto-renewal...');
  
  try {
    const activeSubscribers = await User.find({
      mealSubscription: 'active',
      mealAutoRenew: true
    });
    
    for (const employee of activeSubscribers) {
      // Auto-create next month request
      const lastRequest = employee.monthlyMealRequests
        .sort((a, b) => new Date(b.month) - new Date(a.month))[0];
      
      if (lastRequest && lastRequest.status === 'approved') {
        const lastMonth = new Date(`${lastRequest.month}-01`);
        const nextMonth = new Date(lastMonth.setMonth(lastMonth.getMonth() + 1));
        const nextMonthString = nextMonth.toISOString().slice(0, 7);
        
        const existingRequest = employee.monthlyMealRequests.find(
          req => req.month === nextMonthString
        );
        
        if (!existingRequest) {
          employee.monthlyMealRequests.push({
            month: nextMonthString,
            status: 'requested',
            preference: employee.mealPreference,
            requestDate: new Date()
          });
          
          await employee.save();
          console.log(`Auto-created request for ${employee.employeeId} - ${nextMonthString}`);
        }
      }
    }
    
    console.log('Monthly meal auto-renewal completed.');
  } catch (error) {
    console.error('Cron job error:', error);
  }
});