@echo off
title Assistant d'Installation - Client Windows OmniSign
color 0A
cls

echo ============================================================
echo      ASSISTANT D'INSTALLATION DU CLIENT WINDOWS OMNISIGN
echo ============================================================
echo.
echo  Ce script va configurer cet ordinateur pour se connecter
echo  a votre serveur de diffusion OmniSign et afficher le player.
echo.
echo ------------------------------------------------------------
echo  Etape 1/4 : Configuration du Serveur OmniSign
echo ------------------------------------------------------------
echo.
echo  Le serveur OmniSign est-il sur votre reseau local (ex: IP 192.168.x.x)
echo  ou sur un nom de domaine distant (ex: http://mon-serveur.com:3000) ?
echo.
echo  [1] Serveur local (Renseigner une adresse IP locale)
echo  [2] Serveur distant / Nom de domaine (Renseigner une URL complete)
echo.
set /p TYPE_SERVEUR="Votre choix (1 ou 2, defaut: 1) : "
if "%TYPE_SERVEUR%"=="" set TYPE_SERVEUR=1

if "%TYPE_SERVEUR%"=="2" goto server_distant
if "%TYPE_SERVEUR%"=="1" goto server_local
goto server_local

:server_distant
echo.
set /p SERVER_URL="Entrez l'URL complete du serveur (ex: http://omnisign.local:3000) : "
goto end_server_config

:server_local
echo.
set /p IP_SERVEUR="Entrez l'adresse IP du serveur local (ex: 192.168.1.50) : "
set /p PORT_SERVEUR="Entrez le port du serveur (defaut: 3000) : "
if "%PORT_SERVEUR%"=="" set PORT_SERVEUR=3000
set SERVER_URL=http://%IP_SERVEUR%:%PORT_SERVEUR%
goto end_server_config

:end_server_config

if "%SERVER_URL%"=="" set SERVER_URL=http://localhost:3000

echo.
echo [OK] Serveur configure : %SERVER_URL%
echo.

echo ------------------------------------------------------------
echo  Etape 2/4 : Cle API & Identifiant de l'Ecran (Device ID)
echo ------------------------------------------------------------
echo.
set /p API_KEY="Entrez la cle API de l'ecran (generee sur le serveur) : "
if "%API_KEY%"=="" set API_KEY=ma_cle_secrete_123

echo.
for /f "tokens=*" %%h in ('hostname') do set DEFAULT_DEV_ID=ecran-%%h
set /p DEVICE_ID="Entrez l'identifiant de cet ecran (defaut: %DEFAULT_DEV_ID%) : "
if "%DEVICE_ID%"=="" set DEVICE_ID=%DEFAULT_DEV_ID%

echo.
echo [OK] Cle API enregistree.
echo [OK] ID Ecran   : %DEVICE_ID%
echo.

:: Sauvegarde dans setup.txt et mise a jour de omnisign-start.bat
(
  echo SERVER_URL=%SERVER_URL%
  echo API_KEY=%API_KEY%
  echo DEVICE_ID=%DEVICE_ID%
) > "%~dp0setup.txt"

(
  echo @echo off
  echo :: Les parametres sont configures dans setup.txt et lus par le moteur JS.
  echo.
  echo :: Desactivation de la mise en veille de l'ecran sous Windows
  echo powercfg /change monitor-timeout-ac 0 ^>nul 2^>^&1
  echo powercfg /change standby-timeout-ac 0 ^>nul 2^>^&1
  echo.
  echo cd /d "%%~dp0"
  echo start /b node sync-engine.js
  echo ping 127.0.0.1 -n 4 ^>nul
  echo.
  echo set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
  echo if not exist %%CHROME_PATH%% (
  echo     if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  echo         set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  echo     ) else (
  echo         set CHROME_PATH=chrome
  echo     )
  echo )
  echo start "" %%CHROME_PATH%% --kiosk --no-first-run --user-data-dir="%%TEMP%%\omnisign_chrome_profile" --disable-cache --autoplay-policy=no-user-gesture-required "http://localhost:8080/player.html"
  echo exit
) > "%~dp0omnisign-start.bat"

echo ------------------------------------------------------------
echo  Etape 3/4 : Installation des dependances Node.js
echo ------------------------------------------------------------
echo.
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERREUR] Node.js n'est pas installe.
    echo Ouverture de la page de telechargement de Node.js...
    start https://nodejs.org/
    echo Veuillez installer Node.js puis relancer cet assistant.
    pause
    exit /b
)

cd /d "%~dp0"
call npm install
if %errorlevel% neq 0 (
    echo [ATTENTION] Remarque sur npm install, suite de la configuration...
)

echo.
echo [OK] Dependances installees.
echo.

echo ------------------------------------------------------------
echo  Etape 4/4 : Demarrage automatique avec Windows
echo ------------------------------------------------------------
echo.
set /p AUTOSTART="Voulez-vous lancer OmniSign au demarrage de Windows ? (O/N, defaut: O) : "
if "%AUTOSTART%"=="" set AUTOSTART=O

if /i "%AUTOSTART%"=="O" (
    powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([System.Environment]::GetFolderPath('Startup') + '\OmniSign Client.lnk');$s.TargetPath='%~dp0omnisign-start.bat';$s.WorkingDirectory='%~dp0';$s.Save()" >nul 2>nul
    echo [OK] Raccourci ajoute au dossier Demarrage de Windows !
)

echo.
echo ============================================================
echo        INSTALLATION DU CLIENT WINDOWS TERMINÉE !
echo ============================================================
echo.
set /p START_NOW="Voulez-vous lancer le client d'affichage maintenant ? (O/N) : "
if /i "%START_NOW%"=="O" (
    start "" "%~dp0omnisign-start.bat"
) else (
    echo.
    echo Installation terminee avec succes.
    pause
)
