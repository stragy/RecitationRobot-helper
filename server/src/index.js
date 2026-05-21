require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const contentRoutes = require('./routes/content');
const sessionRoutes = require('./routes/session');
const teacherRoutes = require('./routes/teacher');
const reviewRoutes = require('./routes/review');

// 导入中间件
const { errorHandler } = require('./middleware/error');
const { requestLogger } = require('./middleware/logger');

// 导入数据库
const { initDatabase } = require('./db/database');

const app = express();
const server = http.createServer(app);

// 初始化数据库
initDatabase();

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
  console.log('WebSocket client connected');
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleWebSocketMessage(ws, message);
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
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
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                              ║
║   🎓 爱背诵 - 智能背诵助手后端服务已启动                      ║
║                                                              ║
║   服务地址: http://localhost:${PORT}                           ║
║   API文档:  http://localhost:${PORT}/api/health               ║
║   环境:     ${process.env.NODE_ENV || 'development'}                                    ║
║                                                              ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, wss };
