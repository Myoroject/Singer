@echo off
REM One-click setup and launch for Windows. Requires Node.js 22+ (https://nodejs.org).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Install it from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies, this takes a few minutes the first time...
  call npm ci || call npm install || (echo Install failed. & pause & exit /b 1)
)
if not exist node_modules\electron\dist (
  call node node_modules\electron\install.js
)
call npm start
