# GitHub 上传指南

## 📋 准备工作

### 1. 注册 GitHub 账号
1. 访问 https://github.com
2. 点击 "Sign up"
3. 填写邮箱、密码、用户名
4. 验证邮箱

### 2. 下载 Git（如果没有）
- Windows: https://git-scm.com/download/win
- Mac: https://git-scm.com/download/mac
- 安装时一路点击 "Next" 即可

---

## 🚀 上传步骤（两种方式）

## 方式一：网页上传（最简单，推荐新手）

### Step 1: 创建新仓库
1. 登录 GitHub
2. 点击右上角 **+** 号 → **New repository**
3. 填写信息：
   - **Repository name**: `recitation-helper` （建议）
   - **Description**: 智能背诵助手 - 面向初中生的AI背诵工具
   - **Public**: ✅ 选中（免费公开仓库）
   - **Add a README file**: ❌ 不选（我们已有README）
4. 点击 **Create repository**

### Step 2: 上传文件
1. 在新仓库页面，点击 **uploading an existing file**
2. 点击 **choose your files**
3. 选择以下文件（从 `C:\Users\67266\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a0a6987d9590d6f0fe88fda\智能背诵助手\` 文件夹）：
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
   - `LICENSE`
   - `.gitignore`
4. 等待上传完成
5. 在 "Commit changes" 处填写：
   - **Commit message**: `Initial commit`
6. 点击 **Commit changes**

✅ **完成！** 你的代码已经在 GitHub 上了！

---

## 方式二：命令行上传（适合有Git基础的用户）

### Step 1: 打开命令行
- Windows: 按 `Win + R`，输入 `cmd`，回车
- Mac: 打开 "终端" 应用

### Step 2: 进入项目文件夹
```bash
cd "C:\Users\67266\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a0a6987d9590d6f0fe88fda\智能背诵助手"
```

### Step 3: 初始化Git仓库
```bash
git init
```

### Step 4: 添加所有文件
```bash
git add .
```

### Step 5: 提交更改
```bash
git commit -m "Initial commit"
```

### Step 6: 连接GitHub仓库
```bash
# 替换 你的用户名 为你的GitHub用户名
git remote add origin https://github.com/你的用户名/recitation-helper.git
```

### Step 7: 推送到GitHub
```bash
git branch -M main
git push -u origin main
```

### Step 8: 输入用户名和密码
- 会提示输入 GitHub 用户名
- 密码需要输入 **Personal Access Token**（不是登录密码）
- 如果没有Token，去GitHub设置 → Developer settings → Personal access tokens 生成

✅ **完成！**

---

## 🌐 部署到 Cloudflare Pages

### Step 1: 注册 Cloudflare
1. 访问 https://dash.cloudflare.com/sign-up
2. 用邮箱注册（可以用GitHub账号直接登录）

### Step 2: 创建 Pages 项目
1. 登录后，点击左侧 **Workers & Pages**
2. 点击 **Create application**
3. 选择 **Pages** 标签
4. 点击 **Connect to Git**

### Step 3: 授权 GitHub
1. 点击 **Connect GitHub**
2. 授权 Cloudflare 访问你的仓库
3. 选择刚才创建的 `recitation-helper` 仓库
4. 点击 **Begin setup**

### Step 4: 配置构建设置
- **Project name**: `recitation-helper` （自动生成）
- **Production branch**: `main`
- **Framework preset**: `None` （纯静态网站）
- **Build command**: 留空
- **Build output directory**: 留空

点击 **Save and Deploy**

### Step 5: 等待部署
- 等待 1-2 分钟
- 看到 "Your site was deployed" 表示成功！

### Step 6: 访问你的网站
- 点击链接，类似：`https://recitation-helper-xxx.pages.dev`
- 这就是你的免费域名！

✅ **网站已上线！**

---

## 🎉 完成后的样子

你的 GitHub 仓库会有：
```
recitation-helper/
├── index.html      ✅
├── styles.css      ✅
├── app.js          ✅
├── README.md       ✅
├── LICENSE         ✅
└── .gitignore      ✅
```

你的网站地址：
- `https://你的用户名.github.io/recitation-helper` （GitHub Pages）
- `https://recitation-helper-xxx.pages.dev` （Cloudflare Pages）

---

## 🔧 后续更新代码

### 网页方式
1. 进入 GitHub 仓库
2. 点击要修改的文件
3. 点击右上角的 **铅笔图标**（Edit）
4. 修改内容
5. 滚动到底部，填写 "Commit changes"
6. 点击 **Commit changes**
7. Cloudflare 会自动重新部署（约1分钟）

### 命令行方式
```bash
# 进入项目文件夹
cd "C:\Users\67266\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a0a6987d9590d6f0fe88fda\智能背诵助手"

# 修改文件后，执行以下命令：
git add .
git commit -m "更新说明"
git push origin main
```

---

## ❓ 常见问题

### Q1: 上传时提示 "Permission denied"
**解决**: 检查GitHub用户名和Token是否正确

### Q2: 网页显示 "404"
**解决**: 确保 `index.html` 在仓库根目录，且文件名正确

### Q3: Cloudflare 部署失败
**解决**: 检查构建设置，Build command 和 output directory 都留空

### Q4: 如何绑定自己的域名？
**解决**: 
1. 购买域名（推荐阿里云/腾讯云，¥20-60/年）
2. 在 Cloudflare Pages 项目设置中添加自定义域名
3. 按提示配置 DNS 解析

### Q5: 中国访问慢怎么办？
**解决**: 
- 使用 Cloudflare Pages（比 GitHub Pages 快）
- 或绑定国内备案域名

---

## 📞 需要帮助？

如果遇到问题：
1. 检查每一步是否按指南操作
2. 查看错误提示信息
3. 搜索错误关键词
4. 提交 GitHub Issue

---

**祝你发布成功！🎉**
