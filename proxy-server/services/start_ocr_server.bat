@echo off
REM DeepSeek-OCR Server Startup Script
REM This script starts the local DeepSeek-OCR FastAPI server

echo ========================================
echo   DeepSeek-OCR Server Startup
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

echo Checking Python dependencies...
echo.

REM Install dependencies if needed
pip show torch >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing dependencies...
    pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

echo Starting DeepSeek-OCR server...
echo Model path: C:\Ling Luo\softwares\Web2PG\model\deepseek-ai\DeepSeek-OCR
echo Server URL: http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the FastAPI server
python deepseek_ocr_server.py

pause
