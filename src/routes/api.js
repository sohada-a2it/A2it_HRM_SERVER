
const express = require('express')
const router = express.Router() 
const userController = require("../controller/userController")
const authController = require("../controller/authController")
const payrollController = require('../controller/payrollController'); 
const attendanceController = require("../controller/attendanceController")  
const auditController = require('../controller/auditController');
const sessionController = require('../controller/sessionLogController'); 
const holidayController = require('../controller/holidayController');  
const leaveController = require('../controller/leaveController'); 
const salaryRuleController = require('../controller/salaryRuleController'); 
const OfficeSchedule = require('../controller/officeScheduleController');  
const profileController = require('../controller/profileController');  
const reportController = require('../controller/reportController');  
const OfficeRentController = require('../controller/officeController');  
const billController = require('../controller/utilityBillsController');  
const officeSupplyController = require('../controller/officeSupplyController');  
const foodCostController = require('../controller/foodCostController');  
const softwareSubscriptionController = require('../controller/softwareSubscriptionController');
const transportExpenseController = require('../controller/transportController');
const miscellaneousExpense = require('../controller/miscellaneousController');
const upload = require('../middleware/multer');  
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 
const SendEmailUtility = require('../utility/SendEmailUtility');
// =================== Login Routes ====================
// router.post("/admin/login", userController.adminLogin);  
// router.post("/users/userLogin", userController.userLogin);  
router.post("/unified-login", userController.unifiedLogin);  

// =================== Admin Control Routes ====================
router.post("/admin/create-user", protect, adminOnly, userController.createUser); 
router.get("/admin/getAdminProfile", protect, adminOnly, userController.getAdminProfile); 
router.post("/admin/updateAdminProfile", protect, adminOnly, userController.updateAdminProfile); 
router.get("/admin/getAll-user", protect, adminOnly, userController.getAllUsers); 
router.put("/admin/update-user/:id", protect, adminOnly, userController.adminUpdateUser); 
router.delete("/admin/user-delete/:id", protect, adminOnly, userController.deleteUser);   
router.get('/my-sessions', protect, userController.getAllSessions);
router.delete('/terminate-session/:id', protect, userController.terminateSession);
router.post('/logout-all', protect, userController.logoutAllSessions); 
// Admin get user by ID
router.get('/profile/:id', protect, adminOnly, userController.getUserById);

// Admin search users
router.get('/admin/users/search', protect, adminOnly, userController.searchUsers);

// Admin get user summary
router.get('/admin/users/:id/summary', protect, adminOnly, userController.getUserSummary);
// =================== OTP Routes ====================
router.post('/admin/request-otp', authController.AdminRequestOtp);
router.post('/admin/verify-otp', authController.AdminVerifyOtp);
router.post('/admin/reset-password', authController.AdminResetPassword);
router.get('/admin/cleanup-otps', authController.CleanupExpiredOtps);

// Admin only routes
router.get('/all-sessions', protect, adminOnly, userController.getAllSessions);
router.get('/session/:id', protect, adminOnly, userController.getSessionById);
// =================== Employee Routes ====================  
router.get("/users/getProfile", protect,userController.getProfile); 
router.post("/users/updateProfile", protect, userController.updateProfile);
router.put("/users/updateProfile", protect, userController.updateProfile);     

// =================== ProfileImage Routes ==================== 
router.post(
  '/upload-profile-picture',
  protect,
  upload.single('profilePicture'),
  profileController.uploadProfilePicture
);

router.delete(
  '/remove-profile-picture',
  protect,
  profileController.removeProfilePicture
);

// routes/admin.js
router.post('/send-welcome-email', async (req, res) => {
    try {
        console.log('📧 Welcome email API called:', req.body);
        
        const {
            to,
            subject,
            userName,
            userEmail,
            password,
            role,
            department,
            joiningDate,
            salary,
            loginUrl
        } = req.body;

        // Validation
        if (!to || !userEmail || !password) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Create email text content
        const emailText = `
            Welcome to Attendance System!
            
            Hello ${userName},
            
            Your account has been successfully created.
            
            ======== LOGIN CREDENTIALS ========
            Email: ${userEmail}
            Password: ${password}
            Role: ${role}
            Department: ${department}
            
            ======== ACCOUNT DETAILS ========
            Joining Date: ${joiningDate}
            Monthly Salary: ৳${salary}
            
            ======== IMPORTANT ========
            1. Login URL: ${loginUrl}
            2. Change your password after first login
            3. Keep your credentials secure
            
            ======== CONTACT ========
            If you face any issues, contact system administrator.
            
            Best regards,
            A2IT HRM System
            admin@attendance-system.a2itltd.com
        `;

        // Create HTML content
        const emailHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                            color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { padding: 30px; background: #f9f9f9; }
                    .credentials { background: white; border: 2px dashed #667eea; 
                                padding: 20px; margin: 20px 0; border-radius: 8px; }
                    .button { display: inline-block; background: #667eea; 
                            color: white; padding: 12px 30px; text-decoration: none; 
                            border-radius: 5px; margin: 15px 0; }
                    .footer { text-align: center; padding: 20px; color: #666; 
                            font-size: 12px; border-top: 1px solid #eee; }
                    .info-item { margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 5px; }
                    .warning { background: #fff3cd; border-left: 4px solid #ffc107; 
                            padding: 10px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Attendance System! 🎉</h1>
                        <p>A2IT HRM Portal</p>
                    </div>
                    
                    <div class="content">
                        <h2>Hello ${userName},</h2>
                        <p>Your account has been successfully created in the A2IT Attendance System.</p>
                        
                        <div class="credentials">
                            <h3>🔐 Your Login Credentials</h3>
                            <div class="info-item">
                                <strong>📧 Email:</strong> ${userEmail}
                            </div>
                            <div class="info-item">
                                <strong>🔑 Password:</strong> <code style="background: #e9ecef; padding: 3px 8px; border-radius: 3px;">${password}</code>
                            </div>
                            <div class="info-item">
                                <strong>👤 Role:</strong> ${role}
                            </div>
                            <div class="info-item">
                                <strong>🏢 Department:</strong> ${department}
                            </div>
                        </div>
                        
                        <div class="warning">
                            <strong>⚠️ Security Notice:</strong><br>
                            For security reasons, please change your password immediately after first login.
                        </div>
                        
                        <a href="${loginUrl}" class="button">🚀 Login to System Now</a>
                        
                        <p><strong>🔗 Direct Login Link:</strong><br>
                        <a href="${loginUrl}">${loginUrl}</a></p>
                        
                        <hr>
                        
                        <h3>📋 Account Information</h3>
                        <div class="info-item">
                            <strong>📅 Joining Date:</strong> ${joiningDate}
                        </div>
                        <div class="info-item">
                            <strong>💰 Monthly Salary:</strong> ৳${salary}
                        </div>
                        <div class="info-item">
                            <strong>🏛️ Department:</strong> ${department}
                        </div>
                        
                        <div style="margin-top: 30px; padding: 15px; background: #e7f3ff; border-radius: 8px;">
                            <h4>📞 Need Help?</h4>
                            <p>If you encounter any issues, please contact:</p>
                            <p><strong>System Administrator</strong><br>
                            Email: admin@attendance-system.a2itltd.com</p>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p>This is an automated email from A2IT HRM System.</p>
                        <p>Please do not reply to this message.</p>
                        <p>© ${new Date().getFullYear()} A2IT Ltd. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // Send email using your existing utility
        await SendEmailUtility(to, subject || 'Welcome to A2IT HRM System', emailText);
        
        console.log('✅ Welcome email sent to:', to);
        
        return res.json({
            success: true,
            message: 'Welcome email sent successfully',
            email: to
        });

    } catch (error) {
        console.error('❌ Welcome email error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to send welcome email',
            error: error.message
        });
    }
});

// ===================== EMPLOYEE ROUTES (Require authentication) ===================== 
router.get('/today', protect, attendanceController.getTodayStatus); 
router.post('/clock-in', protect, attendanceController.clockIn); 
router.post('/clock-out', protect, attendanceController.clockOut); 
router.get('/records', protect, attendanceController.getAttendanceRecords); 
router.get('/records/:id', protect, attendanceController.getAttendanceById); 
router.get('/summary', protect, attendanceController.getUserSummary); 
router.get('/range', protect, attendanceController.getAttendanceByDateRange); 
router.get('/shift-timing', protect, attendanceController.getEmployeeShiftTiming); 
router.get('/employee-attendance', protect, attendanceController.getEmployeeAttendanceWithShift); 
router.get('/late-statistics', protect, attendanceController.getLateStatistics); 
router.get('/export', protect, attendanceController.exportAttendanceData);

// ===================== ADMIN ROUTES (Require admin privileges) ===================== 
router.get('/admin/all-records', protect, adminOnly, attendanceController.getAllAttendanceRecords); 
router.get('/admin/summary', protect, adminOnly, attendanceController.getAllAttendanceSummary); 
router.put('/admin/correct/:id', protect, adminOnly, attendanceController.adminCorrectAttendance); 
router.put('/admin/update-shift', protect, adminOnly, attendanceController.updateEmployeeShiftTiming); 
router.post('/admin/create-attendance', protect, adminOnly, attendanceController.createManualAttendance); 
router.post('/admin/bulk-attendance', protect, adminOnly, attendanceController.createBulkAttendance); 
router.post('/admin/trigger-auto-clockout', protect, adminOnly, attendanceController.triggerAutoClockOut); 
router.get('/admin/late-statistics', protect, adminOnly, attendanceController.getLateStatistics); 
router.get('/admin/employee-attendance', protect, adminOnly, attendanceController.getEmployeeAttendanceWithShift); 
router.get('/admin/employee-shift-timing', protect, adminOnly, attendanceController.getEmployeeShiftTiming); 
router.get('/admin/export', protect, adminOnly, attendanceController.exportAttendanceData);

// API Route to submit attendance
router.post('/attendance/check-in', async (req, res) => {
  try {
    const { employeeId, checkInTime } = req.body;
    
    const checkInDate = new Date(checkInTime);
    const hours = checkInDate.getHours();
    const minutes = checkInDate.getMinutes();
    
    // Define 9:30 AM cutoff
    const CUTOFF_HOUR = 9;
    const CUTOFF_MINUTE = 30;
    
    let status = 'Present';
    let isLate = false;
    let lateDayCount = 0;
    
    // Check if late
    if (hours > CUTOFF_HOUR || (hours === CUTOFF_HOUR && minutes > CUTOFF_MINUTE)) {
      status = 'Late';
      isLate = true;
      lateDayCount = 1;
      
      // Calculate how many minutes late
      const lateMinutes = ((hours - CUTOFF_HOUR) * 60) + (minutes - CUTOFF_MINUTE);
      console.log(`Employee ${employeeId} is ${lateMinutes} minutes late`);
    }
    
    const attendance = new Attendance({
      employee: employeeId,
      date: new Date().toISOString().split('T')[0],
      checkIn: checkInTime,
      status,
      isLate,
      lateMinutes: isLate ? lateMinutes : 0,
      lateDayCount
    });
    
    await attendance.save();
    
    res.status(201).json({
      success: true,
      message: `Attendance recorded: ${status}`,
      data: attendance
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// All routes require authentication 

// ================= Shift ROUTES ================= 
router.get('/admin/employee-shifts', protect, adminOnly, userController.getAllEmployeeShifts); 
router.post('/admin/assign-shift/:employeeId', protect, adminOnly, userController.assignShiftToEmployee); 
router.post('/admin/reset-shift/:employeeId', protect, adminOnly, userController.resetEmployeeShift); 
router.put('/admin/default-shift', protect, adminOnly, userController.updateDefaultShift); 
router.get('/admin/shift-history/:employeeId', protect, adminOnly, userController.getEmployeeShiftHistory); 
router.post('/admin/bulk-assign-shifts',protect, adminOnly, userController.bulkAssignShifts); 
router.get('/admin/shift-statistics', protect, adminOnly, userController.getShiftStatistics);  
router.get('/my-shift',protect, userController.getMyShift);


// =================== Leave Routes ====================  
router.get('/my-leaves', protect, leaveController.getMyLeaves);
router.get('/balance', protect, leaveController.getLeaveBalance);
router.get('/stats', protect, leaveController.getLeaveStats);
router.post('/request', protect, leaveController.requestLeave);
router.get('/getLeave/:id', protect, leaveController.getLeaveById);
router.put('/updateLeave/:id', protect, leaveController.updateLeave);
router.delete('/deleteLeave/:id', protect, leaveController.deleteLeave); 
router.get('/admin/all', protect, adminOnly, leaveController.getAllLeaves);
router.get('/admin/departments', protect, adminOnly, leaveController.getDepartments);
router.put('/admin/approve/:id', protect, adminOnly, leaveController.approveLeave);
router.put('/admin/reject/:id', protect, adminOnly, leaveController.rejectLeave);
router.post('/admin/bulk-approve', protect, adminOnly, leaveController.bulkApproveLeaves);
router.post('/admin/bulk-reject', protect, adminOnly, leaveController.bulkRejectLeaves);
router.post('/admin/bulk-delete', protect, adminOnly, leaveController.bulkDeleteLeaves);
router.get('/admin/export', protect, adminOnly, leaveController.exportLeaves);

// =====================Holiday Routes=====================  
router.get('/holiday', protect, holidayController.getHolidays);
router.get('/stats', protect, holidayController.getHolidayStats);
router.get('/export', protect, holidayController.exportHolidays); 
router.get('/getHoliday/:id', protect, adminOnly, holidayController.getHolidayById);
router.post('/addHoliday', protect, adminOnly, holidayController.addHoliday);
router.put('/updateHoliday/:id', protect, adminOnly, holidayController.updateHoliday);
router.delete('/deleteHoliday/:id', protect, adminOnly, holidayController.deleteHoliday);
router.post('/import', protect, adminOnly, holidayController.importHolidays);

  // ====================Payroll Routes(Admin Only) ====================  
router.post('/payroll/calculate', protect, adminOnly, payrollController.calculatePayroll); 
router.post('/payroll/create', protect, adminOnly, payrollController.createPayroll); 
router.get('/payroll/all', protect, adminOnly, payrollController.getAllPayrolls); 
router.get('/payroll/:id', protect, payrollController.getPayrollById); 
router.put('/update-payroll/:id/status', protect, adminOnly, payrollController.updatePayrollStatus); 
router.delete('/delete-payroll/:id', protect, adminOnly, payrollController.deletePayroll); 
router.get('/employee/:employeeId', protect, payrollController.getEmployeePayrolls); 
router.post('/payroll/bulk-generate', protect, adminOnly, payrollController.bulkGeneratePayrolls); 
router.get('/payroll/stats/monthly', protect, adminOnly, payrollController.getPayrollStats); 
router.get('/payroll/export/monthly', protect, adminOnly, payrollController.exportPayrolls); 
router.put('/payroll/:id/manual-inputs', protect, adminOnly, payrollController.updateManualInputs); 
router.get('/payroll/overtime/manual-only', protect, adminOnly, payrollController.getPayrollWithManualOvertime); 
router.post('/payroll/:id/recalculate', protect, adminOnly, payrollController.recalculatePayroll);  
router.get('/my-payrolls', protect, payrollController.getEmployeePayrolls); // For current logged in employee 


// =================== SalaryRule Routes ==================== 
router.get('/active', protect, salaryRuleController.getActiveSalaryRules); 
router.get('/getSalaryRule', protect, adminOnly, salaryRuleController.getAllSalaryRules);
router.get('/getSalaryRule/:id', protect, adminOnly, salaryRuleController.getSalaryRuleById);
router.post('/createSalaryRule', protect, adminOnly, salaryRuleController.createSalaryRule);
router.put('/updateSalaryRule/:id', protect, adminOnly, salaryRuleController.updateSalaryRule);
router.delete('/deleteSalaryRule/:id', protect, adminOnly, salaryRuleController.deleteSalaryRule); 

// ====================AuditLog Admin Routes ==================== 
router.get('/admin/getAllAudits', protect, adminOnly, auditController.getAllAuditLogs); 
router.get('/admin/getAllAudits/:userId', protect, adminOnly, auditController.getAuditLogsByUserId); 
router.delete('/admin/AuditDelete/:id', protect, adminOnly, auditController.deleteAuditLog); 
router.get('/admin/auditSearch', protect, adminOnly, auditController.searchAuditLogs); 
router.get('/admin/stats', protect, adminOnly, auditController.getAuditStats);  
router.get('/user/my-logs', protect, auditController.getMyAuditLogs);  

// ==================== SessionLog Routes====================  
router.get('/sessions/my-sessions', protect, sessionController.getMySessions);
router.get('/my-current-session', protect, sessionController.getMyCurrentSession);
router.get('/my-session-state', protect, sessionController.getMyCurrentSession);
router.get('/sessions/stats/attendance', protect, sessionController.getSessionAttendanceStats);
router.get('/stats', protect, sessionController.getSessionStatistics);
router.get(' /sessions/statistics', protect, sessionController.getMySessionStats);
router.post('/clock-in', protect, sessionController.clockIn);
router.post('/clock-out', protect, sessionController.clockOut);
router.get('/export', protect, sessionController.exportMySessions); 
router.get('/allSession', protect, adminOnly, sessionController.getAllSessions);
router.get('/admin/session/:id', protect, adminOnly, sessionController.getSessionById);
router.get('/admin/statistics', protect, adminOnly, sessionController.getAdminStatistics);
router.delete('/admin/session/:id', protect, adminOnly, sessionController.deleteSessionById);
router.get('/admin/export', protect, adminOnly, sessionController.exportAllSessions); 
router.get('/analytics/daily', protect, adminOnly, sessionController.getDailyAnalytics);
router.get('/analytics/devices', protect, adminOnly, sessionController.getDeviceAnalytics);
router.get('/analytics/trends', protect, adminOnly, sessionController.getTrendAnalytics); 
router.get('/export', sessionController.exportMySessions);
router.get('/admin/export', adminOnly, sessionController.exportAllSessions);


// =================== WeaklyOff Routes ==================== 
router.get('/weekly-off', protect, OfficeSchedule.getWeeklyOff); 
router.put('/updateWeekly-off', protect, adminOnly, OfficeSchedule.updateWeeklyOff);
router.put('/override', protect, adminOnly, OfficeSchedule.createOrUpdateOverride);
router.get('/override/history', protect, adminOnly, OfficeSchedule.getOverrideHistory);
router.delete('/overrideDelete/:id', protect, adminOnly, OfficeSchedule.deleteOverride);


// Reports routes 
router.get('/reports/employees', protect, adminOnly, reportController.getEmployeesForReport);
router.get('/reports/departments', protect, adminOnly, reportController.getDepartmentsForReport);
router.post('/reports/attendance', protect, adminOnly, reportController.exportAttendanceReport);
router.post('/reports/payroll', protect, adminOnly, reportController.exportPayrollReport);
router.post('/reports/employee-summary', protect, adminOnly, reportController.exportEmployeeSummaryReport);


// =================== Office Rent Routes ==================== 
router.get('/office-rents', protect, OfficeRentController.getAllOfficeRents); 
router.get('/monthly/:year/:month', protect, OfficeRentController.getOfficeRentsByMonth); 
router.get('/stats/total', protect, OfficeRentController.getOfficeRentStats); 
router.get('/stats/yearly/:year', protect, OfficeRentController.getYearlySummary); 
router.post('/createOffice-rents', protect, OfficeRentController.createOfficeRent); 
router.get('/office-rents/:id', protect, OfficeRentController.getOfficeRentById); 
router.put('/updateOffice-rents/:id', protect, OfficeRentController.updateOfficeRent); 
router.delete('/deleteOffice-rents/:id', protect, OfficeRentController.deleteOfficeRent);

// =================== Office Rent Routes ====================  
router.get('/bills', protect, billController.getAllBills);   
router.get('/bills/:id', protect, billController.getBillById); 
router.post('/newBills', protect, billController.addBills); 
router.put('/newBills/:id', protect, billController.updateBill); 
router.delete('/deleteBills/:id', protect, billController.deleteBill); 
router.get('/bills/types/all', protect, billController.getBillTypes); 
router.get('/bills/stats/summary', protect, billController.getStats); 
router.get('/bills/group/by-month', protect, billController.getBillsByMonth); 
router.get('/bills/month/:year/:month', protect, billController.getBillsByMonthYear); 
router.put('/bills/update/month-bulk', protect, billController.updateMonthBills); 
router.delete('/bills/month/:year/:month', protect, billController.deleteMonthBills); 
router.get('/db/fix-index', protect, billController.fixIndex);
router.get('/db/remove-duplicate-index', protect, billController.removeDuplicateIndex);

// =============== OFFICE SUPPLY ROUTES =============== 
router.get('/office-supplies',protect, officeSupplyController.getAllSupplies); 
router.post('/addOffice-supplies', protect, officeSupplyController.addSupplies); 
router.put('/office-supplies/:id', protect, officeSupplyController.updateSupply); 
router.delete('/office-supplies/:id', protect, officeSupplyController.deleteSupply); 
router.get('/office-supplies/stats', protect, officeSupplyController.getStats); 
router.post('/office-supplies/migrate-note', protect, officeSupplyController.migrateNoteField);


// =============== Food Cost ROUTES ===============  
router.get('/food-costs', protect, foodCostController.getAllFoodCosts); 
router.get('/food-costs/:id', protect, foodCostController.getFoodCostById); 
router.post('/add-food-costs/', protect, foodCostController.createFoodCost); 
router.put('/update-food-costs/:id', protect, foodCostController.updateFoodCost); 
router.delete('/delete-food-costs/:id', protect, foodCostController.deleteFoodCost); 
router.get('/food-costs/month/:year/:month',protect, foodCostController.getFoodCostsByMonth); 
router.get('/food-costs/stats', protect, foodCostController.getFoodCostStats); 
router.get('/food-costs/check-date', protect, foodCostController.checkDateExists); 

 
// =============== FSoftware Subscription ROUTES ===============   
router.get('/software-subscriptions',protect,adminOnly, softwareSubscriptionController.getAllSubscriptions); 
router.post('/add-software-subscriptions',protect,adminOnly, softwareSubscriptionController.createSubscriptions); 
router.put('/update-software-subscriptions/:id',protect, adminOnly, softwareSubscriptionController.updateSubscription); 
router.delete('/delete-software-subscriptions/:id',protect,adminOnly, softwareSubscriptionController.deleteSubscription); 
router.get('/software-subscriptions-stats',protect, adminOnly, softwareSubscriptionController.getSubscriptionStats); 
router.post('/software-subscription-migrate-duration',protect,adminOnly, softwareSubscriptionController.migrateDuration); 


// =============== Tranport Cost ROUTES ===============  
router.get('/transport-expenses',protect, transportExpenseController.getTransportExpenses); 
router.post('/create-transport-expenses',protect, transportExpenseController.addTransportExpenses); 
router.get('/transport-expenses/stats',protect, transportExpenseController.getTransportExpenseStats); 
router.put('/update-transport-expenses/:id',protect, transportExpenseController.updateTransportExpense); 
router.delete('/delete-transport-expenses/:id',protect, transportExpenseController.deleteTransportExpense);

// =============== Miscellaneous Cost ROUTES ===============  
router.get('/miscellaneous',protect, miscellaneousExpense.getExtraExpenses); 
router.post('/create-miscellaneous',protect, miscellaneousExpense.addExtraExpenses); 
router.put('/update-miscellaneous/:id',protect, miscellaneousExpense.updateExtraExpense); 
router.delete('/delete-miscellaneous/:id',protect, miscellaneousExpense.deleteExtraExpense); 
router.get('/miscellaneous/stats',protect, miscellaneousExpense.getExtraExpenseStats);

module.exports = router;  