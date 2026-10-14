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

rem ---------- 0) --check: diagnose only, change nothing, then exit ----------
rem Why this mode exists: when the site does not come up, the launcher used to
rem give one generic answer - "npm install failed" or a blank window - and the
rem actual cause was somewhere else entirely (a port still held by an earlier
rem run, an .env whose SITE_URL pointed at another origin, a Node too old for
rem node:sqlite). This branch answers exactly one question: "what is wrong?"
rem It installs nothing, starts nothing, and never edits .env.
rem   StartSite.bat --check      diagnose and exit (0 = clean, 1 = problems)
if /i "%~1"=="--check" goto :diagnose
if /i "%~1"=="-check" goto :diagnose
if /i "%~1"=="--diag" goto :diagnose
if /i "%~1"=="-d" goto :diagnose
goto :start_site

:diagnose
echo.
echo ==================================================
echo    DIAGNOSTICS  -  nothing is installed, started or changed
echo ==================================================
set "PROBLEMS=0"
set "BE_PORT=3000"
set "NEXT_PORT=3001"

rem --- 1) Node: present, and new enough for node:sqlite ---------------------
rem Version parsing lives in a subroutine on purpose: `set` and `%VAR%` inside
rem the SAME parenthesised block would read the empty pre-block value (cmd
rem expands a whole block before running it), so the comparison would silently
rem pass on every version.
call :nodecheck

where npm >nul 2>&1
if errorlevel 1 (
    echo [FAIL] npm is not on PATH - the launcher cannot install or build anything.
    set "PROBLEMS=1"
) else (
    echo [ OK ] npm found
)

rem --- 2) .env files: present or missing -----------------------------------
rem Missing is not a failure: the launcher creates both from .env.example. But
rem an .env that EXISTS with a wrong origin is a failure - that is the case
rem nobody notices until the payment returns to the wrong server.
if exist "%HERE%backend\.env" (
    echo [ OK ] backend\.env exists
) else (
    echo [INFO] backend\.env is missing - the launcher will create it with local values
)
if exist "%HERE%next-frontend\.env" (
    echo [ OK ] next-frontend\.env exists
) else (
    echo [INFO] next-frontend\.env is missing - the launcher will copy .env.example
)

rem --- 3) SITE_URL vs NEXT_PUBLIC_SITE_URL ---------------------------------
rem Both name the same thing - the public origin - and both build URLs a
rem customer is sent to: canonical tags and the payment return address on the
rem Express side, and canonical/JSON-LD/sitemap on the Next side. If they
rem disagree, the shop advertises two different origins for the same page.
set "BE_SITE="
set "NEXT_SITE="
set "NEXT_API="
if exist "%HERE%backend\.env" for /f "usebackq tokens=1,* delims==" %%a in ("%HERE%backend\.env") do if /i "%%a"=="SITE_URL" set "BE_SITE=%%b"
if exist "%HERE%next-frontend\.env" for /f "usebackq tokens=1,* delims==" %%a in ("%HERE%next-frontend\.env") do (
    if /i "%%a"=="NEXT_PUBLIC_SITE_URL" set "NEXT_SITE=%%b"
    if /i "%%a"=="API_ORIGIN" set "NEXT_API=%%b"
)
set "BE_SITE=%BE_SITE: =%"
set "NEXT_SITE=%NEXT_SITE: =%"
set "NEXT_API=%NEXT_API: =%"
if not defined BE_SITE (
    echo [INFO] SITE_URL is not set in backend\.env - the storefront origin cannot be compared
) else if not defined NEXT_SITE (
    echo [INFO] NEXT_PUBLIC_SITE_URL is not set in next-frontend\.env - nothing to compare with SITE_URL=%BE_SITE%
) else if /i "%BE_SITE%"=="%NEXT_SITE%" (
    echo [ OK ] SITE_URL and NEXT_PUBLIC_SITE_URL agree: %BE_SITE%
) else (
    echo [FAIL] SITE_URL and NEXT_PUBLIC_SITE_URL disagree:
    echo          backend\.env            SITE_URL=%BE_SITE%
    echo          next-frontend\.env      NEXT_PUBLIC_SITE_URL=%NEXT_SITE%
    echo        Set both to the origin customers actually use - the payment return
    echo        address and the canonical tags are built from each one.
    set "PROBLEMS=1"
)
if defined BE_SITE if defined NEXT_API if /i "%NEXT_API%"=="%BE_SITE%" (
    echo [FAIL] next-frontend\.env API_ORIGIN=%NEXT_API% is the same origin as the site itself.
    echo        Express is a different server here ^(backend on :3000^); pointing the
    echo        storefront at its own origin turns every server-side fetch into a loop.
    set "PROBLEMS=1"
)

rem --- 4) Ports: who is holding them, by name ------------------------------
call :portcheck %BE_PORT% backend
call :portcheck %NEXT_PORT% storefront

echo.
if "%PROBLEMS%"=="0" (
    echo [OK] Nothing is blocking the launcher - run StartSite.bat to start the site.
    echo.
    pause
    exit /b 0
)
echo [FAIL] %PROBLEMS% problem^(s^) found - see the [FAIL] lines above.
echo.
pause
exit /b 1

:nodecheck
set "NODE_RAW="
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_RAW=%%v"
if not defined NODE_RAW (
    echo [FAIL] Node.js is not on PATH - "node -v" answered nothing.
    echo        Install Node 22.5 or newer and reopen this window.
    set "PROBLEMS=1"
    goto :eof
)
set "NODE_VER=%NODE_RAW:v=%"
set "NODE_MAJ=0"
set "NODE_MIN=0"
for /f "tokens=1,2 delims=." %%a in ("%NODE_VER%") do set "NODE_MAJ=%%a"
for /f "tokens=1,2 delims=." %%a in ("%NODE_VER%") do set "NODE_MIN=%%b"
if "%NODE_MAJ%"=="" set "NODE_MAJ=0"
if "%NODE_MIN%"=="" set "NODE_MIN=0"
if %NODE_MAJ% LSS 22 goto :node_old
if %NODE_MAJ% EQU 22 if %NODE_MIN% LSS 5 goto :node_old
echo [ OK ] Node %NODE_VER% ^(^>=22.5, which backend\package.json requires^)
goto :eof

:node_old
echo [FAIL] Node %NODE_VER% is too old - the backend needs ^>=22.5 ^(node:sqlite^).
echo        Install a newer Node and reopen this window.
set "PROBLEMS=1"
goto :eof

:portcheck
rem %1 = port, %2 = what usually listens there
set "OWNER="
rem netstat, not PowerShell, on purpose: `powershell -Command "(…)"` with the
rem quotes in place evaluates the text as a *string* and prints it back, so the
rem capture came out empty - and a silently empty result reports a busy port as
rem free, which is worse than saying nothing. `netstat -ano` is pure cmd, and
rem the fifth column of a LISTENING row is the owning PID.
set "OWNER_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%1 .*LISTENING"') do if not defined OWNER_PID set "OWNER_PID=%%p"
set "OWNER_PORT=%1"
if defined OWNER_PID (
    echo [FAIL] Port %OWNER_PORT% is already in use by PID %OWNER_PID% - the %2 server cannot bind it.
    echo        An earlier StartSite window is the usual cause: close it, or stop that
    echo        PID ^("taskkill /PID %OWNER_PID%"^), then run this check again.
    set "PROBLEMS=1"
) else (
    echo [ OK ] Port %OWNER_PORT% is free ^(%2 server^)
)
goto :eof

:start_site

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
