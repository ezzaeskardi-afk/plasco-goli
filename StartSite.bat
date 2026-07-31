@echo off
title Polasco Goli - Local Server (closing this window stops the server)
chcp 65001 >nul

cd /d "E:\claude\polasco-goli\backend"
if errorlevel 1 echo [ERROR] Could not find folder: E:\claude\polasco-goli\backend & if errorlevel 1 pause & if errorlevel 1 exit /b 1

echo ==================================================
echo    Polasco Goli  -  http://localhost:3000
echo --------------------------------------------------
echo    Starting server... browser opens automatically.
echo    Keep this window OPEN while using the site.
echo    Closing this window will STOP the server.
echo ==================================================
echo.

rem First run (or new dependency): install packages automatically
if not exist "node_modules\better-sqlite3" (
    echo [Setup] Installing dependencies - first run only, takes a minute...
    call npm install
    echo.
)

rem Opens the browser as soon as port 3000 starts answering (waits up to 5 min - first run installs packages)
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 300;$i++){ try{ $c=New-Object Net.Sockets.TcpClient('127.0.0.1',3000); $c.Close(); Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Seconds 1 } }"

call npm start

echo.
echo [Server stopped - press any key to close this window]
pause >nul
