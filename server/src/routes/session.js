const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { queryOne, query, run } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

// 创建学习会话
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const { content_id, session_type = 'new_learning' } = req.body;
  
  // 获取内容信息
  let content = null;
  if (content_id) {
    content = queryOne('SELECT * FROM contents WHERE id = ?', [content_id]);
  }
  
  // 创建会话
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  
  run(
    `INSERT INTO study_sessions (id, user_id, content_id, session_type, start_time) 
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, req.user.id, content_id, session_type, now]
  );
  
  // 更新用户画像的学习次数
  run(
    `UPDATE user_profiles SET total_study_sessions = total_study_sessions + 1, updated_at = CURRENT_TIMESTAMP 
     WHERE user_id = ?`,
    [req.user.id]
  );
  
  // 如果有内容，更新掌握状态
  if (content_id) {
    const mastery = queryOne(
      'SELECT * FROM user_content_mastery WHERE user_id = ? AND content_id = ?',
      [req.user.id, content_id]
    );
    
    if (!mastery) {
      run(
        `INSERT INTO user_content_mastery (id, user_id, content_id, status, first_study_date) 
         VALUES (?, ?, ?, 'learning', ?)`,
        [uuidv4(), req.user.id, content_id, now.split('T')[0]]
      );
    } else {
      run(
        `UPDATE user_content_mastery SET status = 'learning', last_study_date = ?, study_count = study_count + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = ? AND content_id = ?`,
        [now.split('T')[0], req.user.id, content_id]
      );
    }
  }
  
  res.status(201).json({
    success: true,
    data: {
      session_id: sessionId,
      content: content ? {
        id: content.id,
        title: content.title,
        author: content.author,
        original_text: content.original_text,
        translation: content.translation,
        background: content.background
      } : null,
      start_time: now
    }
  });
}));

// 获取会话详情
router.get('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const session = queryOne(
    `SELECT s.*, c.title, c.author, c.original_text, c.translation 
     FROM study_sessions s 
     LEFT JOIN contents c ON s.content_id = c.id 
     WHERE s.id = ? AND s.user_id = ?`,
    [req.params.id, req.user.id]
  );
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: '会话不存在'
    });
  }
  
  // 获取尝试记录
  const attempts = query(
    'SELECT * FROM recitation_attempts WHERE session_id = ? ORDER BY attempt_time',
    [req.params.id]
  );
  
  res.json({
    success: true,
    data: {
      ...session,
      attempts
    }
  });
}));

// 提交背诵评估
router.post('/:id/recite', authMiddleware, asyncHandler(async (req, res) => {
  const { input_type, input_content, standard_text } = req.body;
  
  // 获取会话
  const session = queryOne(
    'SELECT * FROM study_sessions WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: '会话不存在'
    });
  }
  
  // 评估背诵结果
  const evaluation = evaluateRecitation(standard_text, input_content);
  
  // 保存尝试记录
  const attemptId = uuidv4();
  const now = new Date().toISOString();
  
  run(
    `INSERT INTO recitation_attempts (id, session_id, attempt_time, standard_text, user_input, similarity_score, is_correct, error_details) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [attemptId, req.params.id, now, standard_text, input_content, evaluation.similarity, evaluation.isCorrect ? 1 : 0, JSON.stringify(evaluation.errors)]
  );
  
  // 更新会话统计
  run(
    `UPDATE study_sessions SET 
     total_attempts = total_attempts + 1,
     correct_attempts = correct_attempts + ?
     WHERE id = ?`,
    [evaluation.isCorrect ? 1 : 0, req.params.id]
  );
  
  // 生成AI反馈
  const feedback = generateFeedback(evaluation);
  
  res.json({
    success: true,
    data: {
      attempt_id: attemptId,
      evaluation: {
        is_correct: evaluation.isCorrect,
        accuracy: Math.round(evaluation.similarity * 100),
        errors: evaluation.errors
      },
      feedback
    }
  });
}));

// 结束会话
router.put('/:id/end', authMiddleware, asyncHandler(async (req, res) => {
  const now = new Date().toISOString();
  
  // 获取会话
  const session = queryOne(
    'SELECT * FROM study_sessions WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: '会话不存在'
    });
  }
  
  // 计算时长
  const startTime = new Date(session.start_time);
  const endTime = new Date(now);
  const durationSeconds = Math.floor((endTime - startTime) / 1000);
  
  // 获取所有尝试记录计算最终得分
  const attempts = query(
    'SELECT * FROM recitation_attempts WHERE session_id = ?',
    [req.params.id]
  );
  
  let finalScore = 0;
  if (attempts.length > 0) {
    const avgSimilarity = attempts.reduce((sum, a) => sum + (a.similarity_score || 0), 0) / attempts.length;
    const correctRate = attempts.filter(a => a.is_correct).length / attempts.length;
    finalScore = Math.round(avgSimilarity * 60 + correctRate * 40);
  }
  
  // 更新会话
  run(
    `UPDATE study_sessions SET end_time = ?, duration_seconds = ?, final_score = ? WHERE id = ?`,
    [now, durationSeconds, finalScore, req.params.id]
  );
  
  // 更新内容掌握状态
  if (session.content_id) {
    const newStatus = finalScore >= 90 ? 'mastered' : finalScore >= 60 ? 'reviewing' : 'learning';
    const nextReviewDate = calculateNextReviewDate(finalScore);
    
    run(
      `UPDATE user_content_mastery SET 
       status = ?,
       mastery_level = ?,
       next_review_date = ?,
       review_interval_days = ?,
       updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND content_id = ?`,
      [newStatus, finalScore, nextReviewDate.date, nextReviewDate.days, req.user.id, session.content_id]
    );
    
    // 如果掌握，更新用户画像
    if (newStatus === 'mastered') {
      run(
        `UPDATE user_profiles SET total_content_mastered = total_content_mastered + 1 WHERE user_id = ?`,
        [req.user.id]
      );
    }
  }
  
  res.json({
    success: true,
    data: {
      final_score: finalScore,
      duration_seconds: durationSeconds,
      total_attempts: attempts.length,
      correct_attempts: attempts.filter(a => a.is_correct).length
    }
  });
}));

// 背诵评估函数
function evaluateRecitation(standard, user_input) {
  if (!standard || !user_input) {
    return { similarity: 0, isCorrect: false, errors: [] };
  }
  
  // 预处理
  const cleanStandard = preprocessText(standard);
  const cleanInput = preprocessText(user_input);
  
  // 计算相似度
  const similarity = calculateSimilarity(cleanStandard, cleanInput);
  
  // 分析错误
  const errors = analyzeErrors(standard, user_input);
  
  // 判断是否正确 (相似度 >= 70%)
  const isCorrect = similarity >= 0.7;
  
  return { similarity, isCorrect, errors };
}

function preprocessText(text) {
  return text
    .replace(/[，。！？、；：""''（）【】\s]/g, '')
    .toLowerCase();
}

function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  // 编辑距离
  const matrix = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

function analyzeErrors(standard, user_input) {
  const errors = [];
  const standardChars = [...standard];
  const inputChars = [...user_input];
  
  // 简单的错误检测
  const maxLen = Math.max(standardChars.length, inputChars.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= standardChars.length) {
      errors.push({ type: 'addition', position: i, actual: inputChars[i] });
    } else if (i >= inputChars.length) {
      errors.push({ type: 'omission', position: i, expected: standardChars[i] });
    } else if (standardChars[i] !== inputChars[i]) {
      errors.push({ 
        type: 'substitution', 
        position: i, 
        expected: standardChars[i], 
        actual: inputChars[i] 
      });
    }
  }
  
  return errors.slice(0, 10); // 最多返回10个错误
}

function generateFeedback(evaluation) {
  if (evaluation.isCorrect) {
    const praises = ['太棒了！', '非常好！', '完美！', '真厉害！'];
    return {
      message: praises[Math.floor(Math.random() * praises.length)],
      tone: 'encouraging',
      next_action: 'continue'
    };
  } else {
    if (evaluation.similarity >= 0.5) {
      return {
        message: '很接近了，再试一次！',
        tone: 'encouraging',
        hint: '注意检查一下细节'
      };
    } else {
      return {
        message: '没关系，我们慢慢来',
        tone: 'gentle',
        hint: '可以先理解意思再记忆'
      };
    }
  }
}

function calculateNextReviewDate(score) {
  // 基于SM-2算法的简化版
  let days = 1;
  if (score >= 90) {
    days = 7;
  } else if (score >= 80) {
    days = 3;
  } else if (score >= 70) {
    days = 2;
  }
  
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + days);
  
  return {
    date: nextDate.toISOString().split('T')[0],
    days
  };
}

module.exports = router;
