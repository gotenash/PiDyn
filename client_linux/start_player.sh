#!/bin/bash
export GNOME_KEYRING_CONTROL=1
export GNOME_KEYRING_PID=1
export SECRET_VAULT_PASSWORD=none

# Masquer le curseur de la souris (géré proprement via unclutter)
unclutter -idle 0.5 -root &

# Déterminer le dossier profil Chrome de l'utilisateur actif
PROFILE_DIR="$HOME/pidyn_chrome_profile"

# Nettoyage préventif du verrou de session Chromium
if [ -d "$PROFILE_DIR" ]; then
    find "$PROFILE_DIR" -name 'SingletonLock' -delete 2>/dev/null
fi

# Temporisation active : on attend que le serveur Node.js local réponde sur le port 8080
# avec une limite de sécurité de 30 secondes
for i in {1..30}; do
    if curl -s -o /dev/null http://127.0.0.1:8080/player; then
        break
    fi
    sleep 1
done

# Récupération automatique du binaire Chromium / Chrome packagé par l'OS
CHROMIUM_BIN=$(command -v google-chrome || command -v chromium-browser || command -v chromium)

if [ -z "$CHROMIUM_BIN" ]; then
    echo "ERREUR : Aucun navigateur compatible (Google Chrome ou Chromium) n'a été trouvé."
    exit 1
fi

# Lancement de Chrome/Chromium en mode Kiosk épuré et performant
$CHROMIUM_BIN \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  --use-mock-keychain \
  --user-data-dir="$PROFILE_DIR" \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --disable-restart-bubble \
  --disable-dev-shm-usage \
  --js-flags='--max-old-space-size=512' \
  'http://127.0.0.1:8080/player'
