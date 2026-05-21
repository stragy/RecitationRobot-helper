#!/bin/bash

# 爱背诵 - 启动脚本

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   📚 爱背诵 - 智能背诵助手                                  ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未检测到Node.js，请先安装Node.js"
    echo "   下载地址: https://nodejs.org/"
    exit 1
fi

# 进入服务器目录
cd "$(dirname "$0")/server" || exit 1

# 检查npm依赖
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
fi

# 启动服务器
echo "🚀 正在启动服务器..."
echo "   服务地址: http://localhost:3000"
echo ""

# 打开浏览器
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000" &> /dev/null &
elif command -v open &> /dev/null; then
    open "http://localhost:3000" &> /dev/null &
fi

# 启动服务
npm start
