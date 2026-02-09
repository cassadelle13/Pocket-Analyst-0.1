@echo off
echo ========================================
echo  PocketAnalyst - Quick Start
echo ========================================
echo.

echo [1/2] Starting ClickHouse...
docker-compose up -d storage
if %errorlevel% neq 0 (
    echo ERROR: Failed to start ClickHouse
    pause
    exit /b 1
)

echo.
echo [2/2] Starting Dashboard...
cd dashboard
start cmd /k "npm run dev"

echo.
echo ========================================
echo  Services Started!
echo ========================================
echo.
echo  Dashboard: http://localhost:3000
echo  Chart Builder: http://localhost:3000/chart-builder
echo.
echo  Press any key to stop services...
pause > nul

echo.
echo Stopping services...
docker-compose down
echo Done!
