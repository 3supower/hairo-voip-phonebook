@echo off
setlocal

set PROJECT_DIR=D:\voip-phonebook

echo ===================================
echo VoIP Phonebook Server
echo Folder: %PROJECT_DIR%
echo ===================================

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
    echo [ERROR] Could not find %PROJECT_DIR%
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] node_modules not found, running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [INFO] Starting server (HTTP :3000, LDAP :3890)...
call npm start

echo.
echo [INFO] Server process exited.
pause
