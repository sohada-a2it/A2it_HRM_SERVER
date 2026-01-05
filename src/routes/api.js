
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
router.get('/attendance/today-status', protect, attendanceController.getTodayStatus);
router.get('/attendance/my-records', protect, attendanceController.getAttendanceRecords);
router.get('/attendance/summary', protect, attendanceController.getUserSummary);
router.post('/attendance/clock-in', protect, attendanceController.clockIn);
router.post('/attendance/clock-out', protect, attendanceController.clockOut);
router.get('/attendance/:id', protect, attendanceController.getAttendanceById);
router.get('/attendance/date-range/records', protect, attendanceController.getAttendanceByDateRange);

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
router.put('/:id', protect, adminOnly, holidayController.updateHoliday);
router.delete('/:id', protect, adminOnly, holidayController.deleteHoliday);
router.post('/import', protect, adminOnly, holidayController.importHolidays);

  // ====================Payroll Routes(Admin Only) ==================== 
// Employee routes
router.get('/employee/:employeeId', protect, payrollController.getEmployeePayrolls);
router.post('/:id/action', protect, payrollController.employeeActionOnPayroll);

// Admin routes
router.get('/', protect, adminOnly, payrollController.getAllPayrolls);
router.get('/:id', protect, adminOnly, payrollController.getPayrollById);
router.post('/', protect, adminOnly, payrollController.createPayroll);
router.put('/:id/status', protect, adminOnly, payrollController.updatePayrollStatus);
router.delete('/:id', protect, adminOnly, payrollController.deletePayroll);
router.post('/generate/monthly', protect, adminOnly, payrollController.generateMonthlyPayroll);

// =================== SalaryRule Routes ====================
// All users can view active rules
router.get('/active', protect, salaryRuleController.getActiveSalaryRules);

// Admin routes
router.get('/', protect, adminOnly, salaryRuleController.getAllSalaryRules);
router.get('/:id', protect, adminOnly, salaryRuleController.getSalaryRuleById);
router.post('/', protect, adminOnly, salaryRuleController.createSalaryRule);
router.put('/:id', protect, adminOnly, salaryRuleController.updateSalaryRule);
router.delete('/:id', protect, adminOnly, salaryRuleController.deleteSalaryRule);
router.put('/:id/toggle-status', protect, adminOnly, salaryRuleController.toggleActiveStatus);

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


// =================== WeaklyOff Routes ====================
router.get("/getWeekly-off", protect, OfficeSchedule.getWeeklyOff);
router.put("/updateWeekly-off",protect, adminOnly, OfficeSchedule.updateWeeklyOff); 
router.put("/override", protect, adminOnly, OfficeSchedule.createOrUpdateOverride);

module.exports = router;  