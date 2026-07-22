#!/bin/bash
# Lancement du serveur OmniSign

echo "============================================================"
# Color formatting helper if stdout is a tty
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
else
    GREEN=''
    BLUE=''
    NC=''
fi

echo -e "${GREEN}               SERVEUR OMNISIGN ACTIF${NC}"
echo "============================================================"
echo ""
echo -e "   - Interface web  : ${BLUE}http://localhost:3000${NC}"
echo "   - Gardez ce terminal ouvert pendant l'utilisation du serveur."
echo ""
echo "------------------------------------------------------------"
echo ""

# Aller au dossier du serveur
cd "$(dirname "$0")/server" || exit 1

# Ouvrir le navigateur uniquement si une interface graphique (DISPLAY) est détectée
if [ -n "$DISPLAY" ] && command -v xdg-open &>/dev/null; then
    (sleep 2 && xdg-open "http://localhost:3000" >/dev/null 2>&1 &) &
fi

# Lancer le serveur Node.js
node server.js
