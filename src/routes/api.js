
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

// =================== Login Routes ====================
router.post("/admin/login", userController.adminLogin);  
router.post("/users/userLogin", userController.userLogin);  

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
router.post('/send-welcome-email', protect, adminOnly, async (req, res) => {
  try {
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

    // Email content তৈরি করুন
    const emailContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px dashed #667eea; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Attendance System!</h1>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>Your account has been successfully created in our Attendance Management System.</p>
            
            <div class="credentials">
              <h3>Your Login Credentials:</h3>
              <p><strong>Email:</strong> ${userEmail}</p>
              <p><strong>Password:</strong> ${password}</p>
              <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
            </div>
            
            <h3>Account Details:</h3>
            <ul>
              <li><strong>Role:</strong> ${role}</li>
              <li><strong>Department:</strong> ${department}</li>
              <li><strong>Joining Date:</strong> ${joiningDate}</li>
              <li><strong>Salary:</strong> ৳${salary}/month</li>
            </ul>
            
            <p><strong>Important Security Note:</strong></p>
            <ul>
              <li>Keep your password confidential</li>
              <li>Login and change your password immediately</li>
              <li>Do not share your credentials with anyone</li>
            </ul>
            
            <p>If you have any questions, please contact your system administrator.</p>
            
            <p>Best regards,<br>
            Attendance System Team</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Email পাঠানোর লজিক (Nodemailer বা অন্য service ব্যবহার করুন)
    const transporter = nodemailer.createTransport({
      service: 'gmail', // অথবা আপনার SMTP settings
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject || 'Welcome to Attendance System - Your Account Credentials',
      html: emailContent
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      status: 'success',
      message: 'Welcome email sent successfully',
      data: { to: to }
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    res.status(500).json({
      status: 'error',
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