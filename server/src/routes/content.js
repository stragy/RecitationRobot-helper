const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { queryOne, query, run } = require('../db/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { initPresetContents } = require('../seed');

// 种子数据已由 index.js 统一初始化，此处不再重复初始化

// 获取内容列表
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const { type, difficulty, limit = 20, offset = 0 } = req.query;
  
  let sql = 'SELECT * FROM contents WHERE 1=1';
  const params = [];
  
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  
  if (difficulty) {
    sql += ' AND difficulty_level = ?';
    params.push(parseInt(difficulty));
  }
  
  sql += ' ORDER BY difficulty_level ASC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const contents = query(sql, params);
  
  res.json({
    success: true,
    data: contents
  });
}));

// 获取单个内容详情
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const content = queryOne('SELECT * FROM contents WHERE id = ?', [req.params.id]);
  
  if (!content) {
    return res.status(404).json({
      success: false,
      error: '内容不存在'
    });
  }
  
  // 如果用户已登录，获取该内容的掌握状态
  let mastery = null;
  if (req.user) {
    mastery = queryOne(
      'SELECT * FROM user_content_mastery WHERE user_id = ? AND content_id = ?',
      [req.user.id, req.params.id]
    );
  }
  
  res.json({
    success: true,
    data: {
      ...content,
      mastery: mastery || null
    }
  });
}));

// 获取推荐内容
router.get('/recommended/list', authMiddleware, asyncHandler(async (req, res) => {
  // 获取用户画像
  const profile = queryOne(
    'SELECT * FROM user_profiles WHERE user_id = ?',
    [req.user.id]
  );
  
  // 获取用户已学习的内容
  const learned = query(
    'SELECT content_id FROM user_content_mastery WHERE user_id = ?',
    [req.user.id]
  );
  const learnedIds = learned.map(l => l.content_id);
  
  // 获取待学习的内容
  let sql = 'SELECT * FROM contents';
  const params = [];
  
  if (learnedIds.length > 0) {
    sql += ` WHERE id NOT IN (${learnedIds.map(() => '?').join(',')})`;
    params.push(...learnedIds);
  }
  
  sql += ' ORDER BY difficulty_level ASC LIMIT 10';
  
  const recommended = query(sql, params);
  
  // 获取需要复习的内容
  const today = new Date().toISOString().split('T')[0];
  const toReview = query(
    `SELECT c.*, m.next_review_date, m.mastery_level 
     FROM contents c 
     JOIN user_content_mastery m ON c.id = m.content_id 
     WHERE m.user_id = ? AND m.next_review_date <= ? AND m.status != 'mastered'
     ORDER BY m.next_review_date ASC
     LIMIT 5`,
    [req.user.id, today]
  );
  
  res.json({
    success: true,
    data: {
      recommended,
      toReview
    }
  });
}));

// 创建自定义内容
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const { title, original_text, type = 'custom', translation, author } = req.body;
  
  if (!title || !original_text) {
    return res.status(400).json({
      success: false,
      error: '标题和内容不能为空'
    });
  }
  
  const id = uuidv4();
  
  run(
    `INSERT INTO contents (id, title, author, type, original_text, translation, difficulty_level) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title, author || '用户创建', type, original_text, translation, 5]
  );
  
  const content = queryOne('SELECT * FROM contents WHERE id = ?', [id]);
  
  res.status(201).json({
    success: true,
    data: content
  });
}));

// 搜索内容
router.get('/search/query', optionalAuth, asyncHandler(async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({
      success: false,
      error: '请输入搜索关键词'
    });
  }
  
  const contents = query(
    `SELECT * FROM contents 
     WHERE title LIKE ? OR author LIKE ? OR original_text LIKE ?
     LIMIT 20`,
    [`%${q}%`, `%${q}%`, `%${q}%`]
  );
  
  res.json({
    success: true,
    data: contents
  });
}));

module.exports = router;
