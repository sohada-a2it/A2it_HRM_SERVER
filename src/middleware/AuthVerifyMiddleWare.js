// middleware/AuthVerifyMiddleware.js - COMPLETE FIXED VERSION
const jwt = require("jsonwebtoken");
const User = require("../models/UsersModel");

/**
 * 🔐 Main Authentication Middleware
 * FIXED: Now allows HEAD/OPTIONS requests without authentication
 */
exports.protect = async (req, res, next) => {
  console.log('🛡️ Auth Middleware - Method:', req.method, '| Path:', req.path);
  
  // ============ CRITICAL FIX ============
  // ✅ ALLOW HEAD & OPTIONS REQUESTS WITHOUT AUTHENTICATION
  // These are used by browsers, load balancers, and APIs to:
  // 1. Check if route exists (HEAD)
  // 2. CORS preflight (OPTIONS)
  // 3. Health checks
  if (req.method === 'HEAD' || req.method === 'OPTIONS') {
    console.log('✅ Allowing', req.method, 'request to', req.path, 'without auth');
    return next(); // Skip authentication for these methods
  }
  // ======================================
  
  let token;

  // Check for Bearer token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Extract token from "Bearer <token>"
      token = req.headers.authorization.split(" ")[1];
      
      // ✅ CRITICAL CLEANING: Remove all whitespace (newlines, spaces, tabs)
      token = token.replace(/\s+/g, '');
      
      console.log('🔐 Token Details:');
      console.log('   Length:', token.length);
      console.log('   Is JWT format?', token.split('.').length === 3);
      
      // Validate JWT format (should have 3 parts separated by dots)
      if (token.split('.').length !== 3) {
        console.log('❌ Invalid JWT format');
        return res.status(401).json({ 
          success: false,
          message: "Invalid token format. Please login again." 
        });
      }
      
      // Get JWT secret
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('❌ JWT_SECRET is not set in environment variables');
        return res.status(500).json({ 
          success: false,
          message: "Server configuration error" 
        });
      }
      
      console.log('🔄 Verifying token...');
      
      // Verify the token
      const decoded = jwt.verify(token, secret);
      console.log('✅ Token verified!');
      console.log('   User ID:', decoded.id);
      console.log('   Email:', decoded.email);
      
      // Find user in database (excluding password)
      const user = await User.findById(decoded.id).select("-password");
      
      if (!user) {
        console.log('❌ User not found in database');
        return res.status(401).json({ 
          success: false,
          message: "User account not found. Please login again." 
        });
      }
      
      // Check if user is active
      if (!user.isActive) {
        console.log('❌ User account is inactive');
        return res.status(401).json({ 
          success: false,
          message: "Your account has been deactivated. Please contact admin." 
        });
      }
      
      // Attach user to request object
      req.user = user;
      console.log('✅ User authenticated:', user.email, '| Role:', user.role);
      
      next(); // Proceed to next middleware/route handler
      
    } catch (error) {
      console.log('❌ Token verification FAILED!');
      console.log('   Error:', error.name);
      console.log('   Message:', error.message);
      
      // Send specific error messages based on error type
      let errorMessage = "Authentication failed";
      let statusCode = 401;
      
      switch (error.name) {
        case 'TokenExpiredError':
          errorMessage = "Your session has expired. Please login again.";
          break;
        case 'JsonWebTokenError':
          errorMessage = "Invalid authentication token.";
          break;
        case 'SyntaxError':
          errorMessage = "Malformed authentication token.";
          break;
        case 'NotBeforeError':
          errorMessage = "Token not yet valid.";
          break;
        default:
          errorMessage = "Authentication error";
          statusCode = 500;
      }
      
      return res.status(statusCode).json({ 
        success: false,
        message: errorMessage 
      });
    }
  } else {
    // No token provided
    console.log('❌ No Bearer token provided for', req.method, req.path);
    console.log('   Headers present:', Object.keys(req.headers));
    
    return res.status(401).json({ 
      success: false,
      message: "Access denied. No authentication token provided." 
    });
  }
};

/**
 * 👑 Admin-only Middleware
 * Must be used AFTER protect middleware
 */
exports.adminOnly = (req, res, next) => {
  console.log('👑 Admin check for:', req.user?.email);
  
  // Check if user exists (should always exist if protect passed)
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      message: "User not authenticated" 
    });
  }
  
  // Check if user has admin role
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    console.log('❌ Admin access denied for:', req.user.email);
    return res.status(403).json({ 
      success: false,
      message: "Access denied. Admin privileges required." 
    });
  }
  
  console.log('✅ Admin access granted to:', req.user.email);
  next();
};

/**
 * 👥 Role-based Access Control Middleware
 * Usage: requireRole('admin', 'manager')
 */
exports.requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: "User not authenticated" 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      console.log('❌ Role access denied. Required:', roles, '| User role:', req.user.role);
      return res.status(403).json({ 
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}` 
      });
    }
    
    console.log('✅ Role access granted:', req.user.role);
    next();
  };
};

/**
 * 🌐 Public Routes Middleware (for documentation/testing)
 * Explicitly marks routes as public
 */
exports.publicRoute = (req, res, next) => {
  console.log('🌐 Public route accessed:', req.method, req.path);
  next();
};