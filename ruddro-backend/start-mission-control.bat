@echo off
title Mission Control - Automated Startup

echo.
echo 🚀 Mission Control - Automated Startup
echo ======================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo [✓] Node.js found: %NODE_VERSION%
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] npm is not installed!
    echo Please install npm (usually comes with Node.js)
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo [✓] npm found: %NPM_VERSION%
)

REM Check if backend directory exists
if not exist "ruddro-backend" (
    echo [✗] Backend directory not found!
    echo Please run this script from the project root directory
    pause
    exit /b 1
)

cd ruddro-backend
echo [✓] Changed to backend directory

REM Check if package.json exists
if not exist "package.json" (
    echo [✗] package.json not found!
    echo Please ensure you're in the correct directory
    pause
    exit /b 1
)

REM Install dependencies
echo [ℹ] Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo [✗] Failed to install dependencies
    pause
    exit /b 1
) else (
    echo [✓] Dependencies installed successfully
)

REM Check if simple-server.js exists
if not exist "simple-server.js" (
    echo [✗] simple-server.js not found!
    echo Please ensure you have created the simple-server.js file as instructed
    pause
    exit /b 1
)

REM Check if starlink app files exist
if not exist "..\ruddro-future\starlink\app.js" (
    echo [✗] Starlink app.js not found!
    echo Please ensure you have created the app.js file in ruddro-future\starlink\
    pause
    exit /b 1
)

if not exist "..\ruddro-future\starlink\style.css" (
    echo [✗] Starlink style.css not found!
    echo Please ensure you have created the style.css file in ruddro-future\starlink\
    pause
    exit /b 1
)

if not exist "..\ruddro-future\starlink\index.html" (
    echo [✗] Starlink index.html not found!
    echo Please ensure the index.html file exists in ruddro-future\starlink\
    pause
    exit /b 1
)

echo [✓] All required files found

REM Kill any existing processes on port 3001
echo [ℹ] Checking for existing processes on port 3001...
netstat -ano | findstr :3001 > nul
if %errorlevel% equ 0 (
    echo [⚠] Port 3001 is in use, you may need to close other applications
)

echo.
echo 🛰️  Mission Control will be available at:
echo    📡 Backend API: http://localhost:3001/api/health
echo    🚀 Starlink App: http://localhost:3001/starlink/
echo    📊 TLE Data: http://localhost:3001/api/tle
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start the backend server
echo [ℹ] Starting Mission Control Backend...
npm run simple
if %errorlevel% neq 0 (
    echo [✗] Failed to start server
    echo.
    echo Troubleshooting steps:
    echo 1. Check if port 3001 is available
    echo 2. Check Node.js version (requires 16+): node --version
    echo 3. Try manual start: node simple-server.js
    echo 4. Check the logs above for specific errors
    pause
    exit /b 1
) else (
    echo [✓] Server started successfully
)

pause
