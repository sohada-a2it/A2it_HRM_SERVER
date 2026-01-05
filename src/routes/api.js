
const express = require('express')
const router = express.Router()
const adminController = require("../controller/adminController")  
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
const upload = require('../middleware/multer');  
const { protect, adminOnly } = require("../middleware/AuthVerifyMiddleWare"); 

// =================== Login Routes ====================
router.post("/admin/login", adminController.adminLogin);  
router.post("/users/userLogin", userController.userLogin);  

// =================== Admin Control Routes ====================
router.post("/admin/create-user", protect, adminOnly, adminController.createUser); 
router.get("/admin/getAdminProfile", protect, adminOnly, adminController.getAdminProfile); 
router.post("/admin/updateAdminProfile", protect, adminOnly, adminController.updateAdminProfile); 
router.get("/admin/getAll-user", protect, adminOnly, adminController.getAllUsers); 
router.put("/admin/update-user/:id", protect, adminOnly, adminController.adminUpdateUser); 
router.delete("/admin/user-delete/:id", protect, adminOnly, adminController.deleteUser); 
router.post('/admin/request-otp', protect, adminOnly, authController.AdminRequestOtp);
router.post('/admin/reset-password', protect, adminOnly, authController.AdminResetPassword );  

// =================== Employee Routes ====================  
router.get("/users/getProfile", protect,userController.getProfile); 
router.post("/users/updateProfile", protect,userController.updateProfile);     

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
router.get('/:id', protect, leaveController.getLeaveById);
router.put('/:id', protect, leaveController.updateLeave);
router.delete('/:id', protect, leaveController.deleteLeave);

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
router.get('/', protect, holidayController.getHolidays);
router.get('/stats', protect, holidayController.getHolidayStats);
router.get('/export', protect, holidayController.exportHolidays);

// Admin only routes
router.get('/:id', protect, adminOnly, holidayController.getHolidayById);
router.post('/', protect, adminOnly, holidayController.addHoliday);
router.put('/updateHoliday/:id', protect, adminOnly, holidayController.updateHoliday);
router.delete('/deleteHoliday/:id', protect, adminOnly, holidayController.deleteHoliday);
router.post('/import', protect, adminOnly, holidayController.importHolidays);

  // ====================Payroll Routes(Admin Only) ==================== 
// Employee routes
router.get('/employee/:employeeId', protect, payrollController.getEmployeePayrolls);
router.post('/:id/action', protect, payrollController.employeeActionOnPayroll);

// Admin routes - পরে রাখুন
router.get('/admin/all', protect, adminOnly, payrollController.getAllPayrolls);
router.get('/admin/:id', protect, adminOnly, payrollController.getPayrollById);
router.post('/admin', protect, adminOnly, payrollController.createPayroll);
router.put('/admin/:id/status', protect, adminOnly, payrollController.updatePayrollStatus);
router.delete('/admin/:id', protect, adminOnly, payrollController.deletePayroll);
router.post('/admin/generate/monthly', protect, adminOnly, payrollController.generateMonthlyPayroll);

// =================== SalaryRule Routes ====================
// All users can view active rules
router.get('/active', protect, salaryRuleController.getActiveSalaryRules);

// Admin routes
router.get('/getSalaryRule', protect, adminOnly, salaryRuleController.getAllSalaryRules);
router.get('/getSalaryRule/:id', protect, adminOnly, salaryRuleController.getSalaryRuleById);
router.post('/createSalaryRule/', protect, adminOnly, salaryRuleController.createSalaryRule);
router.put('/updateSalaryRule/:id', protect, adminOnly, salaryRuleController.updateSalaryRule);
router.delete('deleteSalaryRule/:id', protect, adminOnly, salaryRuleController.deleteSalaryRule);
router.put('/:id/toggle-status', protect, adminOnly, salaryRuleController.toggleActiveStatus);

// ====================AuditLog Admin Routes ==================== 
router.get('/admin/getAllAudits', protect, adminOnly, auditController.getAllAuditLogs); 
router.get('/admin/getAllAudits/:userId', protect, adminOnly, auditController.getAuditLogsByUserId); 
router.delete('/admin/AuditDelete/:id', protect, adminOnly, auditController.deleteAuditLog); 
router.get('/admin/auditSearch', protect, adminOnly, auditController.searchAuditLogs); 
router.get('/admin/stats', protect, adminOnly, auditController.getAuditStats);  
router.get('/user/my-logs', protect, auditController.getMyAuditLogs);  

// ==================== SessionLog Routes==================== 
// ==================== USER ROUTES ====================
router.get('/my-sessions', sessionController.getMySessions);
router.get('/my-current-session', sessionController.getMyCurrentSession);
router.get('/my-session-state', sessionController.getMyCurrentSession); // Same as above
router.get('/stats/attendance', sessionController.getSessionAttendanceStats);
router.get('/stats', sessionController.getSessionStatistics);
router.post('/clock-in', sessionController.clockIn);
router.post('/clock-out', sessionController.clockOut);

// ==================== ADMIN ROUTES ====================
router.get('/admin/all-sessions', adminOnly, sessionController.getAllSessions);
router.get('/admin/session/:id', adminOnly, sessionController.getSessionById);
router.get('/admin/statistics', adminOnly, sessionController.getAdminStatistics);
router.delete('/admin/session/:id', adminOnly, sessionController.deleteSessionById);

// ==================== ANALYTICS ROUTES ====================
router.get('/analytics/daily', adminOnly, sessionController.getDailyAnalytics);
router.get('/analytics/devices', adminOnly, sessionController.getDeviceAnalytics);
router.get('/analytics/trends', adminOnly, sessionController.getTrendAnalytics);

// ==================== EXPORT ROUTES ====================
router.get('/export', sessionController.exportMySessions);
router.get('/admin/export', adminOnly, sessionController.exportAllSessions);



// =================== WeaklyOff Routes ====================
router.get("/getWeekly-off", protect, OfficeSchedule.getWeeklyOff);
router.put("/updateWeekly-off",protect, adminOnly, OfficeSchedule.updateWeeklyOff); 
router.put("/override", protect, adminOnly, OfficeSchedule.createOrUpdateOverride);

module.exports = router;  