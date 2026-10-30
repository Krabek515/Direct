@echo off
title Direct
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\register-host.ps1"
echo.
pause
