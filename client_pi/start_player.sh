#!/bin/bash
export GNOME_KEYRING_CONTROL=1
export GNOME_KEYRING_PID=1
export SECRET_VAULT_PASSWORD=none

# Masquer le curseur de la souris (géré proprement via unclutter)
unclutter -idle 0.5 -root &

# Nettoyage préventif du verrou de session Chromium
if [ -d /home/pi/chrome_profile ]; then
    find /home/pi/chrome_profile -name 'SingletonLock' -delete
fi

# Temporisation pour s'assurer que le moteur de synchronisation 
# et le serveur Node.js local ont bien démarré et levé le port 8080
sleep 5

# Récupération automatique du binaire Chromium packagé par l'OS
CHROMIUM_BIN=$(command -v chromium-browser || command -v chromium)

# Lancement de Chromium en mode Kiosk épuré et performant
$CHROMIUM_BIN \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  --use-mock-keychain \
  --user-data-dir='/home/pi/chrome_profile' \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-restart-bubble \
  --disable-dev-shm-usage \
  --js-flags='--max-old-space-size=512' \
  'http://127.0.0.1:8080/player'