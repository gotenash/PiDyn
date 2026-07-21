@echo off
title Serveur OmniSign - En cours d'execution
color 0B
cls

echo ============================================================
echo                SERVEUR OMNISIGN ACTIF
echo ============================================================
echo.
echo   - Interface web  : http://localhost:3000
echo   - Gardez cette fenetre ouverte pendant l'utilisation du serveur.
echo.
echo ------------------------------------------------------------
echo.

if exist "%~dp0server\server.js" (
    cd /d "%~dp0server"
) else (
    cd /d "%~dp0"
)

:: Ouvrir automatiquement le navigateur apres 2 secondes
powershell -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'" >nul 2>nul &

:: Demarrer le serveur Node.js
node server.js

pause
