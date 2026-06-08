const { io } = require('socket.io-client');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

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

function getNetworkInfo() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // On cherche l'IPv4 qui n'est pas interne (localhost)
            if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
                return { ip: iface.address, mac: iface.mac };
            }
        }
    }
    return { ip: 'Inconnue', mac: 'Inconnue' };
}

async function syncPlaylist(playlistData) {
    if (!playlistData || !playlistData.items) {
        return console.warn('⚠️ Playlist reçue vide ou invalide.');
    }
    console.log('🔄 Synchronisation en cours...');
    await fs.ensureDir(LOCAL_MEDIA_DIR);

    // Identifier tous les fichiers uniques à traiter pour le calcul de progression
    const allUrls = [];
    if (playlistData.backgroundUrl) allUrls.push(playlistData.backgroundUrl);
    playlistData.items.forEach(item => {
        if (item.backgroundUrl) allUrls.push(item.backgroundUrl);
        if (item.zones) item.zones.forEach(z => { if (z.url) allUrls.push(z.url); });
    });
    const uniqueUrls = [...new Set(allUrls.filter(u => !!u))];
    let processedCount = 0;

    // Fonction utilitaire pour télécharger un média
    const downloadMedia = async (url) => {
        if (!url) return null;
        // Préserver la structure des dossiers (pour Sozi)
        const relativePath = url.replace('/media/', '');
        const localPath = path.join(LOCAL_MEDIA_DIR, relativePath);
        if (!(await fs.pathExists(localPath))) {
            try {
                console.log(`📥 Téléchargement : ${relativePath}`);
                await fs.ensureDir(path.dirname(localPath));
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
                console.error(`❌ Échec du téléchargement de ${relativePath}:`, error.message);
                return url; // Retourne l'URL distante en cas d'échec pour tenter une lecture directe
            }
        }
        processedCount++;
        socket.emit('player-status-update', { 
            downloading: true, 
            progress: Math.round((processedCount / uniqueUrls.length) * 100) 
        });
        return `./media/${relativePath}`;
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
    socket.emit('player-status-update', { downloading: false });
    console.log('✅ Playlist locale à jour.');
}

socket.on('connect', () => {
    console.log(`Connecté au CMS en tant que ${DEVICE_ID}`);
    // Envoyer les infos réseau au serveur
    const network = getNetworkInfo();
    socket.emit('player-info-update', network);
});
socket.on('connect_error', (err) => console.error(`❌ Erreur de connexion au CMS :`, err.message));
socket.on('disconnect', () => console.log('🔌 Déconnecté du serveur.'));

socket.on('playlist-updated', async (playlistData) => {
    await syncPlaylist(playlistData);

    // Si la playlist fait partie d'une séquence, on prépare le client à demander la suivante
    if (playlistData.sequenceContext) {
        const { sequenceId, currentPlaylistIndex, playlistIds } = playlistData.sequenceContext;
        // Pour l'instant, on ne fait rien de plus ici. Le client player.html devra gérer la fin de la playlist
        // et émettre 'request-next-playlist-in-sequence' via Socket.IO.
        // Cette logique sera implémentée dans player.html ou un script dédié à la lecture.
        console.log(`ℹ️ Playlist reçue fait partie de la séquence ${sequenceId}, index ${currentPlaylistIndex}/${playlistIds.length - 1}`);
    }
});

// Le client player.html devra émettre cet événement quand une playlist de séquence est terminée
// socket.emit('request-next-playlist-in-sequence', { deviceId: DEVICE_ID, sequenceId: '...', currentPlaylistIndex: ... });


// Écouter les commandes de contrôle de l'écran
socket.on('screen-command', (data) => {
    const state = data.action === 'on' ? 'on' : 'off';
    console.log(`📺 Commande écran reçue : force ${state}`);
    // On force l'export de DISPLAY pour que xset sache quel écran piloter
    exec(`export DISPLAY=:0 && xset dpms force ${state}`, (error) => {
        if (error) console.error(`❌ Erreur lors de l'exécution de xset : ${error.message}`);
    });
});

// Écouter les commandes de nettoyage du cache
socket.on('clear-local-cache', async () => {
    console.log(`🧹 Commande de nettoyage du cache reçue.`);
    try {
        await fs.emptyDir(LOCAL_MEDIA_DIR);
        if (await fs.pathExists(LOCAL_MANIFEST)) {
            await fs.remove(LOCAL_MANIFEST);
        }
        console.log('✅ Cache local nettoyé. En attente de la prochaine synchro...');
        // Le serveur renverra la playlist car le fichier local a disparu ou lors de la prochaine vérification
    } catch (error) {
        console.error(`❌ Erreur lors du nettoyage du cache : ${error.message}`);
    }
});

// Écouter les commandes de redémarrage du service
socket.on('restart-service', () => {
    console.log(`🔄 Commande de redémarrage du service reçue.`);
    exec('sudo systemctl restart pidyn-sync.service', (error, stdout, stderr) => {
        if (error) console.error(`❌ Erreur d'exécution : ${error.message}`);
    });
});

// Gestion des erreurs globales pour éviter le crash du service
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Rejet de promesse non géré :', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Exception non capturée :', err);
});
