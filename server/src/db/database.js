const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'ai-recite.db');
const db = new Database(dbPath);

// 启用外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化数据库表
function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE,
      nickname TEXT,
      avatar_url TEXT,
      grade TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 用户画像表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      memory_type_preference TEXT,
      optimal_study_time TEXT,
      attention_span INTEGER DEFAULT 20,
      encouragement_style TEXT DEFAULT 'gentle',
      total_study_sessions INTEGER DEFAULT 0,
      total_content_mastered INTEGER DEFAULT 0,
      current_streak_days INTEGER DEFAULT 0,
      longest_streak_days INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 背诵内容表
  db.exec(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      dynasty TEXT,
      type TEXT NOT NULL,
      original_text TEXT NOT NULL,
      translation TEXT,
      annotation TEXT,
      background TEXT,
      difficulty_level INTEGER DEFAULT 5,
      tags TEXT,
      audio_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 学习会话表
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_id TEXT,
      session_type TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_seconds INTEGER,
      total_attempts INTEGER DEFAULT 0,
      correct_attempts INTEGER DEFAULT 0,
      final_score INTEGER,
      error_patterns TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (content_id) REFERENCES contents(id)
    )
  `);

  // 背诵尝试记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS recitation_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      attempt_time TEXT NOT NULL,
      standard_text TEXT NOT NULL,
      user_input TEXT,
      similarity_score REAL,
      is_correct INTEGER,
      error_details TEXT,
      ai_feedback TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE
    )
  `);

  // 用户内容掌握状态表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_content_mastery (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      status TEXT DEFAULT 'not_started',
      mastery_level INTEGER DEFAULT 0,
      first_study_date TEXT,
      last_study_date TEXT,
      study_count INTEGER DEFAULT 0,
      consecutive_correct INTEGER DEFAULT 0,
      next_review_date TEXT,
      review_interval_days INTEGER DEFAULT 1,
      ease_factor REAL DEFAULT 2.5,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (content_id) REFERENCES contents(id),
      UNIQUE(user_id, content_id)
    )
  `);

  // 记忆事件表
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_time TEXT NOT NULL,
      content_summary TEXT,
      related_content_ids TEXT,
      importance_score REAL DEFAULT 0.5,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON study_sessions(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_time ON study_sessions(start_time)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_attempts_session ON recitation_attempts(session_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mastery_user ON user_content_mastery(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mastery_review ON user_content_mastery(user_id, next_review_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_user ON memory_events(user_id)`);

  console.log('✅ 数据库初始化完成');
}

// 通用查询方法
function query(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

function queryOne(sql, params = []) {
  try {
    return db.prepare(sql).get(...params);
  } catch (err) {
    console.error('QueryOne error:', err);
    throw err;
  }
}

function run(sql, params = []) {
  try {
    const result = db.prepare(sql).run(...params);
    return result;
  } catch (err) {
    console.error('Run error:', err);
    throw err;
  }
}

function transaction(fn) {
  return db.transaction(fn)();
}

module.exports = {
  db,
  initDatabase,
  query,
  queryOne,
  run,
  transaction
};
