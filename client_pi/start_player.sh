#!/bin/bash
export GNOME_KEYRING_CONTROL=1
export GNOME_KEYRING_PID=1
export SECRET_VAULT_PASSWORD=none

# Tuer swayidle ou tout processus de mise en veille automatique Wayland
pkill -f swayidle 2>/dev/null

# Désactiver la mise en veille X11 (DPMS, economiseur d'écran et écran noir)
xset s off 2>/dev/null
xset -dpms 2>/dev/null
xset s noblank 2>/dev/null
xset s 0 0 2>/dev/null

# Désactiver la mise en veille sous Wayland (Raspberry Pi OS Bookworm)
if command -v wlopm &> /dev/null; then
    wlopm --on '*' 2>/dev/null
fi

# Boucle d'arrière-plan de maintien d'éveil (Anti-Sleep Watchdog)
(
    while true; do
        sleep 45
        xset s off 2>/dev/null
        xset -dpms 2>/dev/null
        xset s noblank 2>/dev/null
        if command -v wlopm &> /dev/null; then
            wlopm --on '*' 2>/dev/null
        fi
    done
) &

# Masquer le curseur de la souris (géré proprement via unclutter)
unclutter -idle 0.5 -root &

# Nettoyage préventif du verrou de session Chromium
if [ -d /home/pi/chrome_profile ]; then
    find /home/pi/chrome_profile -name 'SingletonLock' -delete
fi

# Temporisation active : on attend que le serveur Node.js local réponde sur le port 8080
# avec une limite de sécurité de 30 secondes
for i in {1..30}; do
    if curl -s -o /dev/null http://127.0.0.1:8080/player; then
        break
    fi
    sleep 1
done

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