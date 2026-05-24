const express = require('express');
const router = express.Router();
const { queryOne, query, run } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

// 获取今日复习任务
router.get('/today', authMiddleware, asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  // 获取需要复习的内容
  const toReview = query(
    `SELECT c.*, m.mastery_level, m.next_review_date, m.review_interval_days, m.status
     FROM contents c 
     JOIN user_content_mastery m ON c.id = m.content_id 
     WHERE m.user_id = ? AND m.next_review_date <= ? AND m.status IN ('learning', 'reviewing')
     ORDER BY m.next_review_date ASC, m.mastery_level ASC
     LIMIT 10`,
    [req.user.id, today]
  );
  
  // 计算预计时长
  const estimatedMinutes = toReview.length * 3;
  
  res.json({
    success: true,
    data: {
      tasks: toReview,
      total: toReview.length,
      estimated_minutes: estimatedMinutes
    }
  });
}));

// 获取复习计划
router.get('/schedule', authMiddleware, asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  
  const today = new Date();
  const schedule = [];
  
  for (let i = 0; i < parseInt(days); i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const tasks = query(
      `SELECT c.id, c.title, c.author, m.mastery_level
       FROM contents c 
       JOIN user_content_mastery m ON c.id = m.content_id 
       WHERE m.user_id = ? AND m.next_review_date = ?`,
      [req.user.id, dateStr]
    );
    
    schedule.push({
      date: dateStr,
      tasks,
      count: tasks.length
    });
  }
  
  res.json({
    success: true,
    data: schedule
  });
}));

// 完成复习
router.post('/:id/complete', authMiddleware, asyncHandler(async (req, res) => {
  const { score } = req.body;
  
  // 获取掌握状态
  const mastery = queryOne(
    'SELECT * FROM user_content_mastery WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  
  if (!mastery) {
    return res.status(404).json({
      success: false,
      error: '记录不存在'
    });
  }
  
  // 计算下次复习时间
  const nextReview = calculateNextReview(score, mastery.review_interval_days, mastery.ease_factor);
  
  // 更新掌握状态
  const newStatus = score >= 90 ? 'mastered' : score >= 60 ? 'reviewing' : 'learning';
  
  run(
    `UPDATE user_content_mastery SET 
     status = ?,
     mastery_level = ?,
     consecutive_correct = consecutive_correct + ?,
     next_review_date = ?,
     review_interval_days = ?,
     ease_factor = ?,
     last_study_date = ?,
     updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      newStatus,
      score,
      score >= 70 ? 1 : 0,
      nextReview.date,
      nextReview.days,
      nextReview.easeFactor,
      new Date().toISOString().split('T')[0],
      req.params.id
    ]
  );
  
  // 记录记忆事件
  run(
    `INSERT INTO memory_events (id, user_id, event_type, event_time, content_summary, importance_score)
     VALUES (?, ?, 'review', ?, ?, ?)`,
    [
      require('uuid').v4(),
      req.user.id,
      new Date().toISOString(),
      `复习完成，得分${score}`,
      score / 100
    ]
  );
  
  res.json({
    success: true,
    data: {
      next_review_date: nextReview.date,
      review_interval_days: nextReview.days,
      status: newStatus
    }
  });
}));

// 获取错题本
router.get('/mistakes', authMiddleware, asyncHandler(async (req, res) => {
  // 获取错误的尝试记录
  const mistakes = query(
    `SELECT a.*, c.title, c.author, s.start_time as session_time
     FROM recitation_attempts a
     JOIN study_sessions s ON a.session_id = s.id
     LEFT JOIN contents c ON s.content_id = c.id
     WHERE s.user_id = ? AND a.is_correct = 0
     ORDER BY a.attempt_time DESC
     LIMIT 50`,
    [req.user.id]
  );
  
  // 按内容分组统计
  const groupedMistakes = {};
  mistakes.forEach(m => {
    const key = m.content_id || 'custom';
    if (!groupedMistakes[key]) {
      groupedMistakes[key] = {
        content_id: m.content_id,
        title: m.title || '自定义内容',
        author: m.author,
        mistakes: [],
        error_count: 0
      };
    }
    groupedMistakes[key].mistakes.push({
      standard_text: m.standard_text,
      user_input: m.user_input,
      error_details: m.error_details,
      time: m.attempt_time
    });
    groupedMistakes[key].error_count++;
  });
  
  res.json({
    success: true,
    data: Object.values(groupedMistakes).sort((a, b) => b.error_count - a.error_count)
  });
}));

// 计算下次复习时间 (SM-2算法简化版)
function calculateNextReview(score, currentInterval, currentEaseFactor) {
  let easeFactor = currentEaseFactor || 2.5;
  let interval = currentInterval || 1;
  
  // 调整简易度因子
  if (score >= 90) {
    easeFactor = Math.min(easeFactor + 0.1, 3.0);
  } else if (score < 70) {
    easeFactor = Math.max(easeFactor - 0.2, 1.3);
  }
  
  // 计算新间隔
  if (score >= 90) {
    interval = Math.round(interval * easeFactor);
  } else if (score >= 70) {
    interval = Math.max(1, Math.round(interval * 0.8));
  } else {
    interval = 1; // 重新开始
  }
  
  // 限制最大间隔
  interval = Math.min(interval, 180);
  
  // 计算下次复习日期
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  
  return {
    date: nextDate.toISOString().split('T')[0],
    days: interval,
    easeFactor: Math.round(easeFactor * 100) / 100
  };
}

module.exports = router;
