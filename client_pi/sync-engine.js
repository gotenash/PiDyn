const { io } = require('socket.io-client');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');

const SERVER_URL = process.env.PIDYN_SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.PIDYN_API_KEY || 'ma_cle_secrete_123';
const DEVICE_ID = process.env.PIDYN_DEVICE_ID || 'default-pi-device';

const LOCAL_MEDIA_DIR = path.join(__dirname, 'media');
const LOCAL_MANIFEST = path.join(__dirname, 'playlist.json');

console.log(` Serveur : ${SERVER_URL}`);
console.log(`🆔 Device ID : ${DEVICE_ID}`);

if (SERVER_URL.includes('localhost')) {
    console.warn('⚠️  Attention : Le client pointe sur "localhost".');
    console.warn('    Si votre serveur est sur une autre machine, modifiez PIDYN_SERVER_URL.');
}

const socket = io(SERVER_URL, {
    auth: { token: API_KEY },
    query: { deviceId: DEVICE_ID },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000,
    reconnectionDelayMax: 30000,
    timeout: 10000
});

async function syncPlaylist(playlistData) {
    if (!playlistData || !playlistData.items) {
        return console.warn('⚠️ Playlist reçue vide ou invalide.');
    }
    console.log('🔄 Synchronisation en cours...');
    await fs.ensureDir(LOCAL_MEDIA_DIR);

    // Fonction utilitaire pour télécharger un média
    const downloadMedia = async (url) => {
        if (!url) return null;
        const fileName = path.basename(url);
        const localPath = path.join(LOCAL_MEDIA_DIR, fileName);
        if (!(await fs.pathExists(localPath))) {
            try {
                console.log(`📥 Téléchargement : ${fileName}`);
                const response = await axios({
                    url: `${SERVER_URL}${url}`,
                    headers: { 'X-API-KEY': API_KEY },
                    responseType: 'stream'
                });
                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
            } catch (error) {
                console.error(`❌ Échec du téléchargement de ${fileName}:`, error.message);
                return url; // Retourne l'URL distante en cas d'échec pour tenter une lecture directe
            }
        }
        return `./media/${fileName}`;
    };

    // Synchro du fond d'écran global
    if (playlistData.backgroundUrl) {
        playlistData.localBackgroundUrl = await downloadMedia(playlistData.backgroundUrl);
    }

    // Synchro des items
    for (const item of playlistData.items) {
        if (item.backgroundUrl) item.localBackgroundUrl = await downloadMedia(item.backgroundUrl);
        
        // On synchronise les médias de chaque zone
        if (item.zones) {
            for (const zone of item.zones) {
                if (zone.url) zone.localUrl = await downloadMedia(zone.url);
            }
        }
    }

    // On écrit le fichier que le HTML va lire
    await fs.writeJson(LOCAL_MANIFEST, playlistData);
    console.log('✅ Playlist locale à jour.');
}

socket.on('connect', () => console.log(`Connecté au CMS en tant que ${DEVICE_ID}`));
socket.on('connect_error', (err) => console.error(`❌ Erreur de connexion au CMS :`, err.message));
socket.on('disconnect', () => console.log('🔌 Déconnecté du serveur.'));
socket.on('playlist-updated', syncPlaylist); // Le serveur enverra la playlist complète

// Écouter les commandes de contrôle de l'écran
socket.on('screen-command', (data) => {
    const state = data.action === 'on' ? 'on' : 'off';
    console.log(`📺 Commande écran reçue : force ${state}`);
    // On force l'export de DISPLAY pour que xset sache quel écran piloter
    exec(`export DISPLAY=:0 && xset dpms force ${state}`, (error) => {
        if (error) console.error(`❌ Erreur lors de l'exécution de xset : ${error.message}`);
    });
});

// Gestion des erreurs globales pour éviter le crash du service
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Rejet de promesse non géré :', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Exception non capturée :', err);
});
