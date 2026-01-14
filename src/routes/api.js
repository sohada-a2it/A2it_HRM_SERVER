
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
const upload = require('../middleware/multer');  
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 
const SendEmailUtility = require('../utility/SendEmailUtility');
// =================== Login Routes ====================
router.post("/admin/login", userController.adminLogin);  
router.post("/users/userLogin", userController.userLogin);  
router.post("/unified-login", userController.userLogin);  

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

// ================= ADMIN ROUTES =================
// Get all employee shifts
router.get('/admin/employee-shifts', protect, adminOnly, userController.getAllEmployeeShifts);

// Assign shift to employee
router.post('/admin/assign-shift/:employeeId', protect, adminOnly, userController.assignShiftToEmployee);

// Reset employee shift to default
router.post('/admin/reset-shift/:employeeId', protect, adminOnly, userController.resetEmployeeShift);

// Update default shift timing
router.put('/admin/default-shift', protect, adminOnly, userController.updateDefaultShift);

// Get employee shift history
router.get('/admin/shift-history/:employeeId', protect, adminOnly, userController.getEmployeeShiftHistory);

// Bulk assign shifts
router.post('/admin/bulk-assign-shifts',protect, adminOnly, userController.bulkAssignShifts);

// Get shift statistics
router.get('/admin/shift-statistics', protect, adminOnly, userController.getShiftStatistics);

// ================= EMPLOYEE ROUTES =================
// Get my shift timing
router.get('/my-shift',protect, userController.getMyShift);
// =================== Leave Routes ==================== 
// Employee routes
router.get('/my-leaves', protect, leaveController.getMyLeaves);
router.get('/balance', protect, leaveController.getLeaveBalance);
router.get('/stats', protect, leaveController.getLeaveStats);
router.post('/request', protect, leaveController.requestLeave);
router.get('/getLeave/:id', protect, leaveController.getLeaveById);
router.put('/updateLeave/:id', protect, leaveController.updateLeave);
router.delete('/deleteLeave/:id', protect, leaveController.deleteLeave);

// Admin routes
router.get('/admin/all', protect, adminOnly, leaveController.getAllLeaves);
router.get('/admin/departments', protect, adminOnly, leaveController.getDepartments);
router.put('/admin/approve/:id', protect, adminOnly, leaveController.approveLeave);
router.put('/admin/reject/:id', protect, adminOnly, leaveController.rejectLeave);
router.post('/admin/bulk-approve', protect, adminOnly, leaveController.bulkApproveLeaves);
router.post('/admin/bulk-reject', protect, adminOnly, leaveController.bulkRejectLeaves);
router.post('/admin/bulk-delete', protect, adminOnly, leaveController.bulkDeleteLeaves);
router.get('/admin/export', protect, adminOnly, leaveController.exportLeaves);

// =====================Holiday Routes===================== 
// Public routes (both admin and employee can view)
router.get('/holiday', protect, holidayController.getHolidays);
router.get('/stats', protect, holidayController.getHolidayStats);
router.get('/export', protect, holidayController.exportHolidays);

// Admin only routes
router.get('/getHoliday/:id', protect, adminOnly, holidayController.getHolidayById);
router.post('/addHoliday', protect, adminOnly, holidayController.addHoliday);
router.put('/updateHoliday/:id', protect, adminOnly, holidayController.updateHoliday);
router.delete('/deleteHoliday/:id', protect, adminOnly, holidayController.deleteHoliday);
router.post('/import', protect, adminOnly, holidayController.importHolidays);

  // ====================Payroll Routes(Admin Only) ==================== 
router.get('/payrollAll', protect, adminOnly, payrollController.getAllPayrolls);
router.get('/payrollAll/:id', protect, payrollController.getPayrollById);
router.post('/payrollCreate', protect, adminOnly, payrollController.createPayroll);
router.put('/payrollUpdate/:id/status', protect, adminOnly, payrollController.updatePayrollStatus);
router.delete('/payrollDelete/:id', protect, adminOnly, payrollController.deletePayroll);
router.post('/generate/monthly', protect, adminOnly, payrollController.generateMonthlyPayroll);
router.get('/employee/:employeeId', protect, payrollController.getEmployeePayrolls);
router.post('/action/:id', protect, payrollController.employeeActionOnPayroll);

// New auto-calculation routes
router.post('/calculate', protect, adminOnly, payrollController.calculatePayrollFromAttendance);
router.post('/auto-generate', protect, adminOnly, payrollController.autoGeneratePayroll);
router.post('/bulk-auto-generate', protect, adminOnly, payrollController.bulkAutoGeneratePayroll);
// routes.js-এ
router.post('/payroll/create-with-data', protect, adminOnly, payrollController.createPayrollWithData);


// =================== SalaryRule Routes ====================
// All users can view active rules
router.get('/active', protect, salaryRuleController.getActiveSalaryRules);

// Admin routes
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
// ==================== USER ROUTES ====================
router.get('/sessions/my-sessions', protect, sessionController.getMySessions);
router.get('/my-current-session', protect, sessionController.getMyCurrentSession);
router.get('/my-session-state', protect, sessionController.getMyCurrentSession);
router.get('/sessions/stats/attendance', protect, sessionController.getSessionAttendanceStats);
router.get('/stats', protect, sessionController.getSessionStatistics);
router.get(' /sessions/statistics', protect, sessionController.getMySessionStats);
router.post('/clock-in', protect, sessionController.clockIn);
router.post('/clock-out', protect, sessionController.clockOut);
router.get('/export', protect, sessionController.exportMySessions);

// ==================== ADMIN ROUTES ====================
router.get('/allSession', protect, adminOnly, sessionController.getAllSessions);
router.get('/admin/session/:id', protect, adminOnly, sessionController.getSessionById);
router.get('/admin/statistics', protect, adminOnly, sessionController.getAdminStatistics);
router.delete('/admin/session/:id', protect, adminOnly, sessionController.deleteSessionById);
router.get('/admin/export', protect, adminOnly, sessionController.exportAllSessions);

// ==================== ANALYTICS ROUTES ====================
router.get('/analytics/daily', protect, adminOnly, sessionController.getDailyAnalytics);
router.get('/analytics/devices', protect, adminOnly, sessionController.getDeviceAnalytics);
router.get('/analytics/trends', protect, adminOnly, sessionController.getTrendAnalytics);
// ==================== EXPORT ROUTES ====================
router.get('/export', sessionController.exportMySessions);
router.get('/admin/export', adminOnly, sessionController.exportAllSessions);



// =================== WeaklyOff Routes ====================
// Public routes
router.get('/weekly-off', protect, OfficeSchedule.getWeeklyOff);

// Admin routes
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
module.exports = router;  