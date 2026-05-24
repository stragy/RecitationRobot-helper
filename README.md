# 爱背诵 - 智能背诵助手

基于 Hermes Agent 架构的智能背诵助手，通过长期记忆系统以智能老师的方式高效帮助学生完成中文、英文的背诵。

## 功能特性

- 🎤 **语音背诵**：支持语音识别和语音合成，实现自然对话式背诵
- 🤖 **AI教师**：小爱老师提供个性化指导和反馈
- 📚 **内容库**：内置经典古诗词，支持自定义内容
- 📊 **学习记录**：完整的学习历史和统计分析
- 🔄 **智能复习**：基于遗忘曲线的间隔重复复习提醒
- 💡 **多种模式**：跟读、填空、提示、完整背诵等多种模式

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 配置环境

复制 `.env.example` 为 `.env` 并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 OpenAI API Key（可选）：

```
OPENAI_API_KEY=your-openai-api-key
```

### 3. 启动服务

```bash
npm run dev
```

### 4. 访问应用

打开浏览器访问：http://localhost:3000

## 项目结构

```
recite/
├── server/                 # 后端服务
│   ├── src/
│   │   ├── index.js       # 入口文件
│   │   ├── db/            # 数据库
│   │   ├── routes/        # API路由
│   │   │   ├── auth.js    # 认证
│   │   │   ├── user.js    # 用户
│   │   │   ├── content.js # 内容
│   │   │   ├── session.js # 会话
│   │   │   ├── teacher.js # AI教师
│   │   │   └── review.js  # 复习
│   │   └── middleware/    # 中间件
│   ├── package.json
│   └── .env.example
├── public/                 # 前端文件
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── README.md
```

## API 接口

### 认证
- `POST /api/v1/auth/guest` - 游客登录
- `POST /api/v1/auth/login` - 用户登录
- `POST /api/v1/auth/register` - 用户注册

### 内容
- `GET /api/v1/contents` - 获取内容列表
- `GET /api/v1/contents/:id` - 获取内容详情
- `GET /api/v1/contents/recommended/list` - 获取推荐内容

### 学习
- `POST /api/v1/sessions` - 创建学习会话
- `POST /api/v1/sessions/:id/recite` - 提交背诵
- `PUT /api/v1/sessions/:id/end` - 结束会话

### AI教师
- `POST /api/v1/teacher/chat` - 对话
- `POST /api/v1/teacher/explain` - 讲解
- `POST /api/v1/teacher/hint` - 提示

### 复习
- `GET /api/v1/reviews/today` - 今日复习任务
- `GET /api/v1/reviews/schedule` - 复习计划

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite (better-sqlite3)
- **AI**：OpenAI API
- **前端**：原生 HTML/CSS/JS
- **语音**：Web Speech API

## 配置说明

### AI服务

支持 OpenAI API，也可以配置其他兼容接口：

```
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

国内用户可以使用智谱AI等兼容接口。

### 语音设置

在前端设置中可以调整：
- 语音速度 (0.5 - 1.5)
- 语音音量 (0 - 100%)
- 自动下一句

## 开发

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## 许可证

MIT
