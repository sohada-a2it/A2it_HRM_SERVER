// middleware/AuthVerifyMiddleWare.js - FINAL CORRECT VERSION
const jwt = require("jsonwebtoken");
const User = require("../models/UsersModel");

exports.protect = async (req, res, next) => {
  console.log(`🔐 Protect Middleware: ${req.method} ${req.path}`);
  
  // Skip authentication for HEAD and OPTIONS requests
  if (req.method === 'HEAD' || req.method === 'OPTIONS') {
    console.log('✅ Skipping auth for HEAD/OPTIONS request');
    return next();
  }
  
  // Skip authentication for public routes
  const publicRoutes = [
    '/api/v1/test',
    '/api/v1/test-head',
    '/api/v1/unified-login',
    '/api/v1/admin/request-otp',
    '/api/v1/admin/verify-otp',
    '/api/v1/health'
  ];
  
  if (publicRoutes.includes(req.path)) {
    console.log('✅ Public route, skipping auth');
    return next();
  }
  
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      
      // Clean token
      token = token.replace(/\s+/g, '');
      
      console.log('🔐 Token cleaned, length:', token.length);
      
      // Check JWT format
      if (token.split('.').length !== 3) {
        console.log('❌ Invalid JWT format');
        return res.status(401).json({ message: "Invalid token format" });
      }
      
      const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev_123';
      const decoded = jwt.verify(token, secret);
      console.log('✅ Token verified for user:', decoded.id);
      
      req.user = await User.findById(decoded.id).select("-password");
      
      if (!req.user) {
        console.log('❌ User not found in database');
        return res.status(401).json({ message: "User not found" });
      }
      
      console.log('✅ User authenticated:', req.user.email);
      next();
      
    } catch (error) {
      console.log('❌ Token verification failed:', error.name);
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Token expired" });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: "Invalid token" });
      }
      
      return res.status(401).json({ message: "Unauthorized" });
    }
  } else {
    console.log('❌ No Bearer token in headers');
    return res.status(401).json({ message: "No token found" });
  }
};

exports.adminOnly = (req, res, next) => {
  console.log('👑 Admin check for:', req.user?.email);
  
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin only access" });
  }
  
  console.log('✅ Admin access granted');
  next();
};