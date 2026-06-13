const { io } = require('socket.io-client');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const util = require('util');

const execPromise = util.promisify(exec);

// Ajout de l'horodatage aux logs du client
const originalLog = console.log;
console.log = (...args) => originalLog(`[${new Date().toLocaleString()}]`, ...args);

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

async function getNetworkInfo() {
    const interfaces = os.networkInterfaces();
    let info = { ip: 'Inconnue', mac: 'Inconnue', ssid: null, signal: null };
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // On cherche l'IPv4 qui n'est pas interne (localhost)
            if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
                info.ip = iface.address;
                info.mac = iface.mac;
            }
        }
    }

    try {
        // Récupération SSID et Qualité du signal via les outils wireless
        const { stdout: ssid } = await execPromise("iwgetid -r || echo ''");
        const { stdout: quality } = await execPromise("iwconfig 2>&1 | grep 'Link Quality' | head -n 1 | awk '{print $2}' | cut -d'=' -f2 || echo ''");
        if (ssid.trim()) info.ssid = ssid.trim();
        if (quality.trim()) info.signal = quality.trim();
    } catch (e) { /* Pas de WiFi ou interface wlan0 absente */ }

    return info;
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
    if (playlistData.splashScreenUrl) allUrls.push(playlistData.splashScreenUrl);
    playlistData.items.forEach(item => {
        if (item.backgroundUrl) allUrls.push(item.backgroundUrl);
        if (item.zones) item.zones.forEach(z => { 
            if (z.url) allUrls.push(z.url); 
            if (z.fontUrl) allUrls.push(z.fontUrl);
        });
    });
    const uniqueUrls = [...new Set(allUrls.filter(u => !!u))];
    let processedCount = 0;

    // Fonction utilitaire pour télécharger un média
    const downloadMedia = async (url) => {
        if (!url) return null;
        // Préserver la structure des dossiers (pour Sozi)
        let relativePath;
        if (url.startsWith('/media/')) {
            relativePath = url.substring('/media/'.length);
        } else if (url.startsWith('/img/')) {
            relativePath = 'img/' + url.substring('/img/'.length);
        } else {
            relativePath = path.basename(url); // Fallback for other URLs
        }
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
        return `./media/${relativePath.replace(/\\/g, '/')}`; // Ensure forward slashes for HTML src
    };

    // Synchro du fond d'écran global
    if (playlistData.backgroundUrl) {
        playlistData.localBackgroundUrl = await downloadMedia(playlistData.backgroundUrl);
    }

    // Synchro du splashscreen
    if (playlistData.splashScreenUrl) {
        playlistData.localSplashScreenUrl = await downloadMedia(playlistData.splashScreenUrl);
    }

    // Synchro des items
    for (const item of playlistData.items) {
        if (item.backgroundUrl) item.localBackgroundUrl = await downloadMedia(item.backgroundUrl);
        
        // On synchronise les médias de chaque zone
        if (item.zones) {
            for (const zone of item.zones) {
                if (zone.url) zone.localUrl = await downloadMedia(zone.url);
                if (zone.fontUrl) zone.localFontUrl = await downloadMedia(zone.fontUrl);
            }
        }
    }

    // --- FONCTION DE NETTOYAGE ---
    // Supprimer les fichiers locaux qui ne sont plus dans la playlist actuelle
    try {
        const allLocalFiles = await fs.readdir(LOCAL_MEDIA_DIR, { recursive: true });
        for (const file of allLocalFiles) {
            const fullPath = path.join(LOCAL_MEDIA_DIR, file);
            const stats = await fs.stat(fullPath);
            if (stats.isDirectory()) continue;

            // Transformer le chemin local en URL relative style serveur pour comparer
            const relativeUrl = '/media/' + path.relative(LOCAL_MEDIA_DIR, fullPath).split(path.sep).join('/');
            
            if (!uniqueUrls.includes(relativeUrl)) {
                console.log(`🗑️ Nettoyage : suppression du fichier inutilisé ${file}`);
                await fs.remove(fullPath);
            }
        }
    } catch (err) {
        console.error('⚠️ Erreur lors du nettoyage du cache :', err.message);
    }

    // Injection des paramètres de communication pour le player.html
    playlistData.deviceId = DEVICE_ID;
    playlistData.serverUrl = SERVER_URL;

    // On écrit le fichier que le HTML va lire
    await fs.writeJson(LOCAL_MANIFEST, playlistData);
    socket.emit('player-status-update', { downloading: false });
    console.log('✅ Playlist locale à jour.');
}

socket.on('connect', async () => {
    console.log(`Connecté au CMS en tant que ${DEVICE_ID}`);
    // Envoyer les infos réseau au serveur
    const network = await getNetworkInfo();
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

// Écouter les demandes de capture d'écran
socket.on('request-screenshot', () => {
    const screenshotPath = '/tmp/screenshot.jpg';
    console.log(`📸 Prise d'une capture d'écran...`);
    exec(`export DISPLAY=:0 && scrot ${screenshotPath}`, async (error) => {
        if (error) return console.error(`❌ Erreur scrot : ${error.message}`);
        const image = await fs.readFile(screenshotPath, { encoding: 'base64' });
        socket.emit('screenshot-taken', { deviceId: DEVICE_ID, image: `data:image/jpeg;base64,${image}` });
        await fs.remove(screenshotPath);
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
