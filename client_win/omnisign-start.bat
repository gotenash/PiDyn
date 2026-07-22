@echo off

:: Les paramètres sont configurés dans setup.txt et lus par le moteur JS.
:: (Vous pouvez définir les variables PIDYN_SERVER_URL, PIDYN_API_KEY ou PIDYN_DEVICE_ID ici pour les surcharger).

:: Désactivation définitive de la mise en veille de l'écran et du système sous Windows 10
powercfg /change monitor-timeout-ac 0 >nul 2>&1
powercfg /change monitor-timeout-dc 0 >nul 2>&1
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-dc 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-dc 0 >nul 2>&1

:: Déplacement dans le répertoire du script
cd /d "%~dp0"

:: Démarrage du moteur de synchronisation et du serveur web local autonome
start /b node sync-engine.js

:: Temporisation de 3 secondes pour l'initialisation du serveur local
ping 127.0.0.1 -n 4 >nul

:: Détection automatique du binaire Google Chrome (64-bit / 32-bit / PATH)
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% (
    if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
        set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    ) else (
        set CHROME_PATH=chrome
    )
)

:: Lancement de Google Chrome en mode Kiosk avec profil isolé et désactivation du cache
start "" %CHROME_PATH% --kiosk --no-first-run --user-data-dir="%TEMP%\omnisign_chrome_profile" --disable-cache --disk-cache-size=1 --media-cache-size=1 --edge-touch-filtering=disabled --autoplay-policy=no-user-gesture-required --ignore-gpu-blocklist --enable-gpu-rasterization --disable-gpu-driver-bug-workarounds --gpu-no-context-lost "http://localhost:8080/player.html"

exit
