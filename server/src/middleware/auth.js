const jwt = require('jsonwebtoken');
const { AppError } = require('./error');

const JWT_SECRET = process.env.JWT_SECRET || 'ai-recite-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 生成token
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// 验证token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// 认证中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: '请先登录'
    });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'token无效或已过期'
    });
  }
  
  req.user = decoded;
  next();
}

// 可选认证中间件 (不强制登录)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

// 管理员权限检查
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: '需要管理员权限'
    });
  }
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  optionalAuth,
  adminOnly
};
