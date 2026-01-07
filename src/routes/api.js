
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

// ====================Attendace Routes ====================  
// Employee routes
router.get('/today',protect, attendanceController.getTodayStatus);
router.get('/records',protect, attendanceController.getAttendanceRecords);
router.get('/summary', attendanceController.getUserSummary);
router.get('/attendance/:id',protect, attendanceController.getAttendanceById);
router.post('/clock-in',protect, attendanceController.clockIn);
router.post('/clock-out',protect, attendanceController.clockOut);
router.get('/export',protect, attendanceController.exportAttendanceData);
router.get('/range',protect, attendanceController.getAttendanceByDateRange);

// Admin routes
router.get('/admin/records', adminOnly, attendanceController.getAllAttendanceRecords);
router.get('/admin/summary', adminOnly, attendanceController.getAllAttendanceSummary);
router.put('/admin/correct', adminOnly, attendanceController.adminCorrectAttendance);

// Admin routes
router.get('/admin/attendance/all', protect, adminOnly, attendanceController.getAllAttendanceRecords);
router.get('/admin/attendance/summary', protect, adminOnly, attendanceController.getAllAttendanceSummary);
router.put('/admin/attendance/correct/:id', protect, adminOnly, attendanceController.adminCorrectAttendance);
router.get('/admin/attendance/export', protect, adminOnly, attendanceController.exportAttendanceData);

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