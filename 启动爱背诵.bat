@echo off
chcp 65001 >nul
title 爱背诵 - 智能背诵助手

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║   📚 爱背诵 - 智能背诵助手                                  ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM 检查Node.js是否安装
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到Node.js，请先安装Node.js
    echo    下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查npm依赖
cd /d "%~dp0server"
if not exist "node_modules" (
    echo 📦 正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
)

REM 启动服务器
echo 🚀 正在启动服务器...
start "" "http://localhost:3000"
npm start

pause
