const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { queryOne, query, run } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

// 获取用户资料
router.get('/profile', authMiddleware, asyncHandler(async (req, res) => {
  const user = queryOne(
    'SELECT id, phone, nickname, avatar_url, grade, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: '用户不存在'
    });
  }
  
  const profile = queryOne(
    'SELECT * FROM user_profiles WHERE user_id = ?',
    [req.user.id]
  );
  
  res.json({
    success: true,
    data: {
      user,
      profile: profile || {}
    }
  });
}));

// 更新用户资料
router.put('/profile', authMiddleware, asyncHandler(async (req, res) => {
  const { nickname, grade, avatar_url } = req.body;
  
  run(
    `UPDATE users SET nickname = ?, grade = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [nickname, grade, avatar_url, req.user.id]
  );
  
  res.json({
    success: true,
    message: '资料更新成功'
  });
}));

// 获取学习统计
router.get('/stats', authMiddleware, asyncHandler(async (req, res) => {
  // 获取总学习次数
  const totalSessions = queryOne(
    'SELECT COUNT(*) as count FROM study_sessions WHERE user_id = ?',
    [req.user.id]
  );
  
  // 获取今日学习次数
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = queryOne(
    `SELECT COUNT(*) as count FROM study_sessions WHERE user_id = ? AND date(start_time) = ?`,
    [req.user.id, today]
  );
  
  // 获取平均分
  const avgScore = queryOne(
    `SELECT AVG(final_score) as avg FROM study_sessions WHERE user_id = ? AND final_score IS NOT NULL`,
    [req.user.id]
  );
  
  // 获取掌握的内容数量
  const masteredCount = queryOne(
    `SELECT COUNT(*) as count FROM user_content_mastery WHERE user_id = ? AND status = 'mastered'`,
    [req.user.id]
  );
  
  // 获取用户画像
  const profile = queryOne(
    'SELECT current_streak_days, longest_streak_days FROM user_profiles WHERE user_id = ?',
    [req.user.id]
  );
  
  res.json({
    success: true,
    data: {
      totalSessions: totalSessions?.count || 0,
      todaySessions: todaySessions?.count || 0,
      avgScore: Math.round(avgScore?.avg || 0),
      masteredCount: masteredCount?.count || 0,
      streakDays: profile?.current_streak_days || 0,
      longestStreak: profile?.longest_streak_days || 0
    }
  });
}));

// 获取学习历史
router.get('/history', authMiddleware, asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  
  const sessions = query(
    `SELECT s.*, c.title, c.author 
     FROM study_sessions s 
     LEFT JOIN contents c ON s.content_id = c.id 
     WHERE s.user_id = ? 
     ORDER BY s.start_time DESC 
     LIMIT ? OFFSET ?`,
    [req.user.id, parseInt(limit), parseInt(offset)]
  );
  
  res.json({
    success: true,
    data: sessions
  });
}));

// 更新学习偏好
router.put('/preferences', authMiddleware, asyncHandler(async (req, res) => {
  const { 
    memory_type_preference, 
    optimal_study_time, 
    encouragement_style,
    attention_span 
  } = req.body;
  
  run(
    `UPDATE user_profiles SET 
     memory_type_preference = ?, 
     optimal_study_time = ?, 
     encouragement_style = ?,
     attention_span = ?,
     updated_at = CURRENT_TIMESTAMP 
     WHERE user_id = ?`,
    [memory_type_preference, optimal_study_time, encouragement_style, attention_span, req.user.id]
  );
  
  res.json({
    success: true,
    message: '偏好设置已更新'
  });
}));

// 获取内容掌握情况
router.get('/mastery', authMiddleware, asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  
  const masteryList = query(
    `SELECT m.*, c.title, c.author, c.type, c.original_text
     FROM user_content_mastery m
     LEFT JOIN contents c ON m.content_id = c.id
     WHERE m.user_id = ?
     ORDER BY m.updated_at DESC
     LIMIT ?`,
    [req.user.id, parseInt(limit)]
  );
  
  res.json({
    success: true,
    data: masteryList
  });
}));

module.exports = router;
