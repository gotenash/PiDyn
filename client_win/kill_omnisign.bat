@echo off
title Arret de OmniSign Client
echo 🛑 Arret des processus OmniSign en cours...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im chrome.exe >nul 2>&1
echo       Termine !
timeout /t 2 >nul
