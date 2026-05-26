/**
 * 日志工具
 * 提供统一的日志记录功能，支持不同级别的输出和格式化
 */

const fs = require('fs');
const path = require('path');

// 日志级别
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// 当前日志级别（可为每个模块设置不同的级别）
const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
let currentLevel = LOG_LEVELS[DEFAULT_LOG_LEVEL] || LOG_LEVELS.INFO;

// 是否为开发环境
const isDev = process.env.NODE_ENV !== 'production';

// 日志文件路径
const logDir = path.join(__dirname, '../../logs');
let logFile = null;
let logStream = null;

/**
 * 初始化日志文件
 */
function initLogFile() {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const date = new Date().toISOString().split('T')[0];
    logFile = path.join(logDir, `${date}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
  } catch (error) {
    console.error('无法初始化日志文件:', error.message);
  }
}

/**
 * 设置日志级别
 * @param {string} level - 日志级别
 */
function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    currentLevel = LOG_LEVELS[level];
  }
}

/**
 * 获取时间戳
 * @returns {string}
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 获取调用栈信息
 * @returns {string}
 */
function getCallerInfo() {
  const stack = new Error().stack;
  if (!stack) return '';
  
  const lines = stack.split('\n');
  // 跳过前3行（Error, getCallerInfo, log方法）
  const callerLine = lines[3] || '';
  const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
  
  if (match) {
    const funcName = match[1] || '<anonymous>';
    const fileName = path.basename(match[2] || '');
    const lineNum = match[3] || '';
    return `[${fileName}:${lineNum}] ${funcName}`;
  }
  
  return '';
}

/**
 * 格式化日志消息
 * @param {string} level - 日志级别
 * @param {string|Error} message - 消息或错误对象
 * @param {Object} data - 附加数据
 * @returns {string}
 */
function formatLog(level, message, data) {
  const timestamp = getTimestamp();
  const caller = isDev ? getCallerInfo() : '';
  
  let logText = `[${timestamp}] [${level}]`;
  
  if (caller) {
    logText += ` ${caller}`;
  }
  
  if (message instanceof Error) {
    logText += `\n  Message: ${message.message}`;
    if (isDev && message.stack) {
      logText += `\n  Stack: ${message.stack}`;
    }
  } else {
    logText += ` ${message}`;
  }
  
  if (data) {
    try {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      if (dataStr.length > 500) {
        logText += `\n  Data: ${dataStr.substring(0, 500)}... (truncated)`;
      } else {
        logText += `\n  Data: ${dataStr}`;
      }
    } catch (error) {
      logText += `\n  Data: [Unserializable]`;
    }
  }
  
  return logText;
}

/**
 * 写入日志到文件
 * @param {string} logText - 日志文本
 */
function writeToFile(logText) {
  if (logStream) {
    logStream.write(logText + '\n');
  }
}

/**
 * 记录调试日志
 * @param {string} message - 消息
 * @param {Object} data - 附加数据
 */
function debug(message, data) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    const logText = formatLog('DEBUG', message, data);
    if (isDev) {
      console.debug(logText);
    }
    writeToFile(logText);
  }
}

/**
 * 记录信息日志
 * @param {string} message - 消息
 * @param {Object} data - 附加数据
 */
function info(message, data) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    const logText = formatLog('INFO', message, data);
    console.log(logText);
    writeToFile(logText);
  }
}

/**
 * 记录警告日志
 * @param {string} message - 消息
 * @param {Object} data - 附加数据
 */
function warn(message, data) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    const logText = formatLog('WARN', message, data);
    console.warn(logText);
    writeToFile(logText);
  }
}

/**
 * 记录错误日志
 * @param {string|Error} error - 错误消息或对象
 * @param {Object} data - 附加数据
 */
function error(error, data) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    const logText = formatLog('ERROR', error, data);
    console.error(logText);
    writeToFile(logText);
  }
}

/**
 * 创建带模块前缀的日志器
 * @param {string} moduleName - 模块名称
 * @returns {Object} 日志对象
 */
function createLogger(moduleName) {
  const prefix = `[${moduleName}]`;
  
  return {
    debug: (msg, data) => debug(`${prefix} ${msg}`, data),
    info: (msg, data) => info(`${prefix} ${msg}`, data),
    warn: (msg, data) => warn(`${prefix} ${msg}`, data),
    error: (msg, data) => error(`${prefix} ${msg}`, data)
  };
}

/**
 * 记录HTTP请求日志
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {number} duration - 请求处理时间（毫秒）
 */
function logRequest(req, res, duration) {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') || 'unknown'
  };
  
  const level = res.statusCode >= 400 ? 'WARN' : 'INFO';
  if (res.statusCode >= 500) {
    logData.body = req.body;
  }
  
  const logText = formatLog(level, `${logData.method} ${logData.url} ${logData.status} ${logData.duration}`, logData);
  writeToFile(logText);
  
  if (res.statusCode >= 400) {
    console.warn(logText);
  }
}

/**
 * 关闭日志流
 */
function close() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

// 初始化
initLogFile();

// 进程退出时关闭日志
process.on('exit', close);
process.on('SIGINT', () => {
  close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  close();
  process.exit(0);
});

module.exports = {
  LOG_LEVELS,
  setLogLevel,
  debug,
  info,
  warn,
  error,
  createLogger,
  logRequest,
  close
};