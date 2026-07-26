@echo off
chcp 65001 >nul
title 408刷题应用

echo ======================================
echo        408 计算机考研刷题应用
echo ======================================
echo.

:: 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Python，请先安装Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 安装依赖
echo [1/3] 检查依赖...
pip install flask pdfplumber --quiet 2>nul

:: 检查题库是否已解析
if not exist "data\questions\os.json" (
    echo [2/3] 首次运行，解析题库PDF...
    python parse_pdf.py
) else (
    echo [2/3] 题库已就绪
)

:: 启动应用
echo [3/3] 启动应用服务...
echo.
echo ======================================
echo   应用已启动! 浏览器即将自动打开
echo   地址: http://127.0.0.1:5000
echo   按 Ctrl+C 停止服务
echo ======================================
echo.

:: 延迟打开浏览器
start "" "http://127.0.0.1:5000"

:: 启动Flask
python app.py

pause
