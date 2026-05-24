// 请求日志中间件
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id || 'anonymous'
    };
    
    // 只记录API请求
    if (req.path.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] ${logData.method} ${logData.path} ${logData.status} ${logData.duration} - ${logData.userId}`);
    }
  });
  
  next();
}

module.exports = {
  requestLogger
};
