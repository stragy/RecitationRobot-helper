// 配置环境变量（简化版，不使用 dotenv）
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');

// 导入工具
const { createLogger } = require('./utils/logger');
const { initDatabase } = require('./db/database');
const { initDatabase: initSeedData } = require('./seed');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const contentRoutes = require('./routes/content');
const sessionRoutes = require('./routes/session');
const teacherRoutes = require('./routes/teacher');
const reviewRoutes = require('./routes/review');
const asrRoutes = require('./routes/asr');

// 导入中间件
const { errorHandler } = require('./middleware/error');
const { requestLogger } = require('./middleware/logger');

// 创建日志器
const logger = createLogger('Server');

const app = express();
const server = http.createServer(app);

// 初始化数据库
try {
  initDatabase();
  // 初始化种子数据
  const db = require('./db/database');
  initSeedData(db);
  logger.info('数据库初始化完成');
} catch (error) {
  logger.error('数据库初始化失败', error);
  process.exit(1);
}

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: false // 开发环境禁用CSP
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 日志中间件
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(requestLogger);

// 静态文件服务 (前端)
app.use(express.static(path.join(__dirname, '../../public')));

// API路由
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/contents', contentRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/teacher', teacherRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/asr', asrRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// SPA回退路由
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// 错误处理
app.use(errorHandler);

// WebSocket服务器
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  logger.info('WebSocket client connected', { ip: req.socket.remoteAddress });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleWebSocketMessage(ws, message);
    } catch (err) {
      logger.error('WebSocket message error', err);
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });
  
  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'connected',
    message: '欢迎连接爱背诵服务'
  }));
});

// WebSocket消息处理
function handleWebSocketMessage(ws, message) {
  const { type, payload } = message;
  
  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    
    case 'recite':
      // 实时背诵处理
      handleRealtimeRecite(ws, payload);
      break;
    
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `未知消息类型: ${type}`
      }));
  }
}

// 实时背诵处理
async function handleRealtimeRecite(ws, payload) {
  const { sessionId, input } = payload;
  
  // 这里可以实现实时语音识别和评估
  ws.send(JSON.stringify({
    type: 'recite_feedback',
    sessionId,
    feedback: {
      status: 'processing',
      message: '正在评估...'
    }
  }));
}

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`
╔════════════════════════════════════════════════════════════╗
║                                                              ║
║   爱背诵 - 智能背诵助手后端服务已启动                      ║
║                                                              ║
║   服务地址: http://localhost:${PORT}                           ║
║   API文档:  http://localhost:${PORT}/api/health               ║
║   环境:     ${process.env.NODE_ENV || 'development'}                                    ║
║                                                              ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, wss };
