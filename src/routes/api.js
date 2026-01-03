
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
router.get('/today', protect, attendanceController.getTodayStatus);
router.get('/records', protect, attendanceController.getAttendanceRecords);
router.get('/summary', protect, attendanceController.getUserSummary);
router.post('/clock-in', protect, attendanceController.clockIn);
router.post('/clock-out', protect, attendanceController.clockOut);
router.get('/:id', protect, attendanceController.getAttendanceById);
router.get('/date-range', protect, attendanceController.getAttendanceByDateRange);

// Admin routes
router.get('/admin/records', protect, adminOnly, attendanceController.getAllAttendanceRecords);
router.get('/admin/summary', protect, adminOnly, attendanceController.getAllAttendanceSummary);
router.put('/admin/correct', protect, adminOnly, attendanceController.adminCorrectAttendance);
router.get('/admin/export', protect, adminOnly, attendanceController.exportAttendanceData);
router.get('/admin/summary/:userId', protect, adminOnly, attendanceController.getAllAttendanceSummary);
router.get('/admin/records/:userId', protect, adminOnly, attendanceController.getAllAttendanceRecords);
 
// ====================Payroll Routes(Admin Only) ==================== 
router.post('/admin/payroll', protect,adminOnly,payrollController.createPayroll); 
router.get('/admin/getAllpayroll',protect,adminOnly,payrollController.getAllPayrolls); 
router.get('/admin/payroll/:id',protect,adminOnly,payrollController.getPayrollById); 
router.put('/admin/updatePayroll/:id',protect,adminOnly,payrollController.updatePayroll); 
router.delete('/admin/deletepayroll/:id',protect,adminOnly,payrollController.deletePayroll);  

// ====================AuditLog Admin Routes ==================== 
router.get('/admin/getAllAudits', protect, adminOnly, auditController.getAllAuditLogs); 
router.get('/admin/getAllAudits/:userId', protect, adminOnly, auditController.getAuditLogsByUserId); 
router.delete('/admin/AuditDelete/:id', protect, adminOnly, auditController.deleteAuditLog); 
router.get('/admin/auditSearch', protect, adminOnly, auditController.searchAuditLogs); 
router.get('/admin/stats', protect, adminOnly, auditController.getAuditStats);  
router.get('/user/my-logs', protect, auditController.getMyAuditLogs);  

// ==================== SessionLog Routes==================== 
router.get('/my-sessions', protect, sessionController.getMySessions); 
router.get('/my-current-session', protect, sessionController.getMyCurrentSession);  
router.get('/mySessionState', protect, sessionController.getMyCurrentSession); 

// ==================== ADMIN ROUTES ==================== 
router.get('/admin/allSession', protect, adminOnly, sessionController.getAllSessions); 
router.get('/admin/Session/:id', protect, adminOnly, sessionController.getSessionById); 
router.get('/admin/statistics', protect, adminOnly, sessionController.getSessionAttendanceStats);  
router.delete('/admin/session/:id', protect, adminOnly, sessionController.deleteSessionById); 

// =====================Holiday Routes===================== 
router.get('/getAllHoliday', protect, holidayController.getHolidays); 
router.post('/addHoliday', protect, adminOnly, holidayController.addHoliday); 
router.put('/editHoliday/:id', protect, adminOnly, holidayController.updateHoliday); 
router.delete('/deleteHoliday/:id', protect, adminOnly, holidayController.deleteHoliday);  

// =================== Leave Routes ==================== 
// Employee routes
router.post('/request',protect, leaveController.requestLeave);
router.get('/my-leaves',protect, leaveController.getMyLeaves);
router.put('/my-leaves/:id',protect, leaveController.updateLeave);
router.delete('/leaves/:id',protect, leaveController.deleteLeave);

// Admin routes
router.get('/allLeave',protect,adminOnly, leaveController.getAllLeaves);
router.put('/approve/:id',protect,adminOnly, leaveController.approveLeave);
router.patch('/reject/:id',protect,adminOnly, leaveController.rejectLeave);

// Bulk operations (Admin)
router.post('/leaves/bulk-approve',protect,adminOnly, leaveController.bulkApproveLeaves);
router.post('/leaves/bulk-reject',protect,adminOnly, leaveController.bulkRejectLeaves);
router.delete('/leaves/bulk-delete',protect,adminOnly, leaveController.bulkDeleteLeaves);

// Common routes
router.get('/leaves/:id',protect, leaveController.getLeaveById);
router.get('/stats',protect, leaveController.getLeaveStats);
router.get('/balance',protect, leaveController.getLeaveBalance);
router.get('/export',protect, leaveController.exportLeaves);

// Utility routes
router.get('/users/departments',protect, leaveController.getDepartments);
router.get('/type-summary',protect, leaveController.getLeaveTypeSummary); 

// =================== SalaryRule Routes ====================
router.post('/createSalary', protect, adminOnly, salaryRuleController.createSalaryRule);
router.get('/getSalary', protect, salaryRuleController.getAllSalaryRules);
router.put('/updateSalary/:id', protect, adminOnly, salaryRuleController.updateSalaryRule);
router.delete('/deleteSalary/:id', protect, adminOnly, salaryRuleController.deleteSalaryRule);

// =================== WeaklyOff Routes ====================
router.get("/getWeekly-off", protect, OfficeSchedule.getWeeklyOff);
router.put("/updateWeekly-off",protect, adminOnly, OfficeSchedule.updateWeeklyOff); 
router.put("/override", protect, adminOnly, OfficeSchedule.createOrUpdateOverride);

module.exports = router;  