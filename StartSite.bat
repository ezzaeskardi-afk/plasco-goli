@echo off
title Polasco Goli - Local Site (closing this window stops both servers)
chcp 65001 >nul

rem Everything is resolved from this file's folder, so the repo can move anywhere.
set "HERE=%~dp0"
if not exist "%HERE%backend\server.js" (
    echo [ERROR] Could not find "%HERE%backend\server.js" - keep this file in the repo root.
    pause
    exit /b 1
)
if not exist "%HERE%next-frontend\package.json" (
    echo [ERROR] Could not find "%HERE%next-frontend\package.json" - keep this file in the repo root.
    pause
    exit /b 1
)

echo ==================================================
echo    Polasco Goli  -  http://localhost:3001
echo --------------------------------------------------
echo    Two servers start together - the layout the live
echo    checks expect (Express :3000, Next :3001):
echo      * backend    (Express)  http://localhost:3000
echo        API, product pictures, and the 301 bridge that
echo        sends the old .html addresses to clean paths
echo      * storefront (Next.js)  http://localhost:3001
echo        what customers see - the browser opens HERE
echo.
echo    Keep this window OPEN while using the site.
echo    Closing it stops BOTH servers.
echo ==================================================
echo.

rem ---------- 1) First run only: dependencies ----------
rem Sentinel for the backend is the main runtime dep (express). The old check
rem looked for node_modules\better-sqlite3, a leftover from a previous stack that
rem used the better-sqlite3 package - this project uses Node's built-in
rem node:sqlite, so that folder never existed and npm install ran on EVERY launch.
if not exist "%HERE%backend\node_modules\express" (
    echo [Setup] Installing backend dependencies - first run only, takes a minute...
    pushd "%HERE%backend"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed in backend - see the output above.
        popd
        pause
        exit /b 1
    )
    popd
    echo.
)
if not exist "%HERE%next-frontend\node_modules\next" (
    echo [Setup] Installing storefront dependencies - first run only, takes a few minutes...
    pushd "%HERE%next-frontend"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed in next-frontend - see the output above.
        popd
        pause
        exit /b 1
    )
    popd
    echo.
)

rem ---------- 2) Local .env files: created only when missing ----------
rem The storefront customers see is Next on :3001, so SITE_URL matches it (canonical,
rem sitemap and the payment return address are all built from it), and
rem CSRF_EXTRA_ORIGINS lets the browser's writes - whose Origin carries :3001 -
rem through Express. Without it, login and checkout answer 403.
rem SESSION_SECRET is deliberately absent: in local mode the server generates a
rem temporary one and says so. See backend\.env.example for the full list.
if not exist "%HERE%backend\.env" (
    echo [Setup] Creating backend\.env with local values - see .env.example for the rest.
    (
        echo # Created by StartSite.bat for local development. Not for production.
        echo SITE_URL=http://localhost:3001
        echo CSRF_EXTRA_ORIGINS=http://localhost:3001
        echo COOKIE_SECURE=false
        echo TRUST_PROXY=0
    ) > "%HERE%backend\.env"
)
if not exist "%HERE%next-frontend\.env" if exist "%HERE%next-frontend\.env.example" (
    echo [Setup] Creating next-frontend\.env from .env.example ^(localhost values^).
    copy /y "%HERE%next-frontend\.env.example" "%HERE%next-frontend\.env" >nul
)

rem ---------- 3) Backend first: the storefront prerenders pages from this API ----------
rem Port pinned to 3000: next-frontend\.env points API_ORIGIN here and the live
rem checks assume this layout; pinning also ignores a stray PORT in the machine's
rem environment. The backend's console output goes to a log file, not into this
rem window, so the two servers' logs never mix.
if not exist "%HERE%backend\logs" mkdir "%HERE%backend\logs" >nul 2>&1
set "PORT=3000"
echo [1/2] Starting the backend on :3000 ^(log: backend\logs\local-start.log^) ...
start /b /d "%HERE%backend" cmd /c "npm start > logs\local-start.log 2>&1"

rem Wait for :3000 (up to 60s). Not fatal: the storefront still starts, the build
rem merely renders fewer pages - so this warns instead of failing.
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3000); $c.Close(); exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1"
if errorlevel 1 echo [WARN] No answer on :3000 within 60s - see backend\logs\local-start.log

rem The storefront's own port comes from `next start -p 3001`, so this pinning
rem stops here.
set "PORT="

rem ---------- 4) Storefront: build once, then serve it in THIS window ----------
pushd "%HERE%next-frontend"
if not exist ".next\BUILD_ID" (
    echo [2/2] First build - takes a couple of minutes...
    call npm run build
    if errorlevel 1 (
        echo.
        echo [ERROR] The storefront build failed - see the output above.
        popd
        pause
        exit /b 1
    )
) else (
    echo [2/2] Using the existing build.
    echo       ^(Delete next-frontend\.next if you want a fresh build.^)
)

rem Opens the browser as soon as :3001 answers (waits up to 5 min). /b keeps it in
rem this console so nothing outlives the window.
start /b powershell -NoProfile -Command "for($i=0;$i -lt 300;$i++){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3001); $c.Close(); Start-Process 'http://localhost:3001'; break } catch { Start-Sleep -Seconds 1 } }"

call npm start
popd

echo.
echo [Storefront stopped - press any key to close this window]
echo [Closing this window also stops the backend on :3000.]
pause >nul
