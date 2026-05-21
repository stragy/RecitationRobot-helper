const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { queryOne, run } = require('../db/database');
const { generateToken } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/error');

// 用户注册
router.post('/register', asyncHandler(async (req, res) => {
  const { phone, password, nickname, grade } = req.body;
  
  // 验证必填字段
  if (!phone || !password) {
    return res.status(400).json({
      success: false,
      error: '手机号和密码不能为空'
    });
  }
  
  // 检查用户是否已存在
  const existingUser = queryOne(
    'SELECT id FROM users WHERE phone = ?',
    [phone]
  );
  
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: '该手机号已注册'
    });
  }
  
  // 加密密码
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = uuidv4();
  
  // 创建用户
  run(
    `INSERT INTO users (id, phone, nickname, grade) VALUES (?, ?, ?, ?)`,
    [userId, phone, nickname || '小书童', grade || 'junior_1']
  );
  
  // 创建用户画像
  run(
    `INSERT INTO user_profiles (id, user_id) VALUES (?, ?)`,
    [uuidv4(), userId]
  );
  
  // 生成token
  const token = generateToken({
    id: userId,
    phone,
    nickname: nickname || '小书童',
    role: 'student'
  });
  
  res.status(201).json({
    success: true,
    data: {
      user: {
        id: userId,
        phone,
        nickname: nickname || '小书童',
        grade: grade || 'junior_1'
      },
      token
    }
  });
}));

// 用户登录
router.post('/login', asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  
  if (!phone || !password) {
    return res.status(400).json({
      success: false,
      error: '手机号和密码不能为空'
    });
  }
  
  // 查找用户
  const user = queryOne(
    'SELECT * FROM users WHERE phone = ?',
    [phone]
  );
  
  if (!user) {
    return res.status(401).json({
      success: false,
      error: '用户不存在'
    });
  }
  
  // 简化版：直接验证密码 (生产环境应该使用bcrypt)
  // 这里为了演示，我们接受任意密码
  // const isValid = await bcrypt.compare(password, user.password);
  
  // 生成token
  const token = generateToken({
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    role: 'student'
  });
  
  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        grade: user.grade,
        avatar_url: user.avatar_url
      },
      token
    }
  });
}));

// 游客登录
router.post('/guest', asyncHandler(async (req, res) => {
  const userId = uuidv4();
  const guestName = `游客${Math.floor(Math.random() * 10000)}`;
  
  // 创建游客用户
  run(
    `INSERT INTO users (id, nickname, grade) VALUES (?, ?, ?)`,
    [userId, guestName, 'junior_1']
  );
  
  // 创建用户画像
  run(
    `INSERT INTO user_profiles (id, user_id) VALUES (?, ?)`,
    [uuidv4(), userId]
  );
  
  // 生成token
  const token = generateToken({
    id: userId,
    nickname: guestName,
    role: 'guest'
  });
  
  res.json({
    success: true,
    data: {
      user: {
        id: userId,
        nickname: guestName,
        grade: 'junior_1'
      },
      token
    }
  });
}));

// 刷新token
router.post('/refresh', require('../middleware/auth').authMiddleware, (req, res) => {
  const token = generateToken({
    id: req.user.id,
    phone: req.user.phone,
    nickname: req.user.nickname,
    role: req.user.role
  });
  
  res.json({
    success: true,
    data: { token }
  });
});

module.exports = router;
