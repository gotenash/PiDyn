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

const SERVER_URL = (process.env.PIDYN_SERVER_URL && process.env.PIDYN_SERVER_URL !== "undefined") ? process.env.PIDYN_SERVER_URL : 'http://localhost:3000';
const API_KEY = (process.env.PIDYN_API_KEY && process.env.PIDYN_API_KEY !== "undefined") ? process.env.PIDYN_API_KEY : 'ma_cle_secrete_123';
const DEVICE_ID = (process.env.PIDYN_DEVICE_ID && process.env.PIDYN_DEVICE_ID !== "undefined") ? process.env.PIDYN_DEVICE_ID : 'default-pi-device';

const LOCAL_MEDIA_DIR = path.join(__dirname, 'media');
const LOCAL_MANIFEST = path.join(__dirname, 'playlist.json');

let activeAlerts = []; // Stockage local des alertes actives

console.log(`--- Démarrage PiDyn Sync (Node ${process.version}) ---`);
console.log(`📡 Serveur cible : ${SERVER_URL}`);
console.log(`🆔 ID Afficheur  : ${DEVICE_ID}`);

if (!DEVICE_ID || DEVICE_ID === 'default-pi-device' || DEVICE_ID === 'undefined') {
    console.warn('⚠️  Attention : DEVICE_ID n\'est pas configuré ou utilise la valeur par défaut.');
    console.warn('    Vérifiez votre fichier setup.txt ou vos variables d\'environnement.');
}

// Initialisation du fichier manifest pour que le player sache qu'il est en attente
async function ensureInitialManifest() {
    const exists = await fs.pathExists(LOCAL_MANIFEST);
    if (!exists) {
        const initialData = {
            id: 'waiting',
            deviceId: DEVICE_ID,
            serverUrl: SERVER_URL,
            items: [],
            status: 'waiting_approval',
            disableClientLogs: false, // Default value
            disableDebugLogs: false,  // Default value
            splashScreenUrl: '/img/splashscreen.png' // Default splash screen
        };
        await fs.writeJson(LOCAL_MANIFEST, initialData);
        console.log("📄 Manifest de sécurité créé.");
    }
}
ensureInitialManifest();

if (SERVER_URL.includes('localhost')) {
    console.warn('⚠️  Attention : Le client pointe sur "localhost".');
    console.warn('    Si votre serveur est sur une autre machine, modifiez PIDYN_SERVER_URL.');
}

const socket = io(SERVER_URL, {
    auth: { token: API_KEY },
    query: { deviceId: DEVICE_ID },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000
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
        // Trixie/Bookworm utilisent NetworkManager (nmcli) par défaut
        const { stdout: nmcliSsid } = await execPromise("nmcli -t -f active,ssid dev wifi | grep '^yes' | cut -d: -f2 || echo ''");
        const { stdout: nmcliSignal } = await execPromise("nmcli -t -f active,signal dev wifi | grep '^yes' | cut -d: -f2 || echo ''");

        let ssid = nmcliSsid.trim();
        let signal = nmcliSignal.trim() ? nmcliSignal.trim() + "%" : "";

        // Fallback sur les anciens outils (wireless-tools) si nmcli ne renvoie rien
        if (!ssid) ssid = (await execPromise("iwgetid -r || echo ''")).stdout.trim();
        if (!signal) signal = (await execPromise("iwconfig 2>&1 | grep 'Link Quality' | head -n 1 | awk '{print $2}' | cut -d'=' -f2 || echo ''")).stdout.trim();

        if (ssid) info.ssid = ssid;
        if (signal) info.signal = signal;
    } catch (e) { /* Pas de WiFi ou interface wlan0 absente */ }

    return info;
}

async function syncPlaylist(playlistData) {
    if (!playlistData || !playlistData.items) {
        return console.warn('⚠️ Playlist reçue vide ou invalide.');
    }
    console.log('🔄 Synchronisation en cours...');
    await fs.ensureDir(LOCAL_MEDIA_DIR, { mode: 0o755 });

    // Identifier tous les fichiers uniques à traiter pour le calcul de progression
    const allUrls = [];
    if (playlistData.backgroundUrl) allUrls.push(playlistData.backgroundUrl);
    if (playlistData.splashScreenUrl) allUrls.push(playlistData.splashScreenUrl);
    playlistData.items.forEach(item => {
        if (item.backgroundUrl) allUrls.push(item.backgroundUrl);
        // Ajout du média contenu dans le template vidéo pour le téléchargement et le nettoyage
        if (item.template === 'video_fullscreen' && item.data && item.data.videoUrl) {
            allUrls.push(item.data.videoUrl);
        }
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
        } else if (url.startsWith('/api/admin/qrcode')) {
            let textVal = 'default';
            try {
                const urlObj = new URL(url, 'http://localhost');
                textVal = urlObj.searchParams.get('text') || 'default';
            } catch (e) {}
            const cleanText = Buffer.from(textVal).toString('base64url').substring(0, 30);
            relativePath = `qrcodes/qr_${cleanText}.png`;
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
                await fs.chmod(localPath, 0o644);
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
        
        // Téléchargement de la vidéo du template si présent
        if (item.template === 'video_fullscreen' && item.data && item.data.videoUrl) {
            item.data.localVideoUrl = await downloadMedia(item.data.videoUrl);
        }
        
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

            // Transformer le chemin local en URL relative style serveur (gère /img/ et /media/)
            const relPath = path.relative(LOCAL_MEDIA_DIR, fullPath).split(path.sep).join('/');
            const relativeUrl = relPath.startsWith('img/') ? '/' + relPath : '/media/' + relPath;
            
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
    playlistData.apiKey = API_KEY;
    playlistData.activeAlerts = activeAlerts;

    // On écrit le fichier que le HTML va lire
    await fs.writeJson(LOCAL_MANIFEST, playlistData);
    await fs.chmod(LOCAL_MANIFEST, 0o644);
    socket.emit('player-status-update', { downloading: false });
    console.log('✅ Playlist locale à jour.');
}

socket.on('connect', async () => {
    console.log(`Connecté au CMS en tant que ${DEVICE_ID}`);
    // Envoyer les infos réseau au serveur
    const network = await getNetworkInfo();

    // --- DIAGNOSTIC TECHNIQUE ACCÉLÉRATION MATÉRIELLE ---
    try {
        const { stdout: gpuMem } = await execPromise("vcgencmd get_mem gpu || echo 'gpu=unknown'");
        const isV4L2Present = await fs.pathExists('/dev/video10'); // Périphérique standard du décodeur H264 sur Pi
        console.log(`[TECH] 🚀 Accélération Matérielle : ${isV4L2Present ? 'DISPONIBLE (V4L2)' : 'INACTIVE'} | ${gpuMem.trim()}`);
        network.gpu = isV4L2Present ? `Disponible (${gpuMem.trim().split('=')[1] || '?'})` : `Non détectée (${gpuMem.trim().split('=')[1] || '?'})`;
    } catch (e) {
        network.gpu = "Erreur vcgencmd";
    }

    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    console.log(`📊 Mémoire système : ${freeMem}MB libres / ${totalMem}MB au total`);
    socket.emit('player-info-update', network);
});

// --- GESTION DES ALERTES FLASH ---
socket.on('show-alert', async (alert) => {
    console.log(`🔔 Alerte reçue : [${alert.type}] ${alert.text}`);
    // Éviter les doublons
    if (!activeAlerts.find(a => a.id === alert.id)) {
        activeAlerts.push(alert);
        await updateManifestWithAlerts();
    }
});

socket.on('clear-alert', async (alertId) => {
    console.log(`🔕 Suppression de l'alerte ID: ${alertId}`);
    activeAlerts = activeAlerts.filter(a => a.id != alertId);
    await updateManifestWithAlerts();
});

async function updateManifestWithAlerts() {
    try {
        if (await fs.pathExists(LOCAL_MANIFEST)) {
            const manifest = await fs.readJson(LOCAL_MANIFEST);
            manifest.activeAlerts = activeAlerts;
            await fs.writeJson(LOCAL_MANIFEST, manifest);
            // Note: Le player.html doit être programmé pour surveiller les changements ou lire activeAlerts
        }
    } catch (err) {
        console.error("❌ Erreur maj manifest alertes:", err.message);
    }
}

// Surveillance périodique de la RAM (toutes les minutes)
setInterval(() => {
    const free = Math.round(os.freemem() / 1024 / 1024);
    if (free < 50) {
        console.warn(`⚠️ Alerte RAM basse : seulement ${free}MB restants !`);
    }
}, 60000);

socket.on('connect_error', (err) => console.error(`❌ Erreur de connexion au CMS (${SERVER_URL}) :`, err.message));
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
    const state = data.action === 'on' ? '1' : '0';
    console.log(`📺 Commande écran reçue : force ${state}`);
    
    // 1. Essayer via vcgencmd (pilotes framebuffer legacy)
    exec(`vcgencmd display_power ${state}`, (error) => {
        if (error) {
            console.warn(`⚠️ vcgencmd display_power a échoué (normal sur RPi 4/5 avec pilote KMS) : ${error.message}`);
        }
    });

    // 2. Essayer via xset (pour pilote KMS sous X11/Xorg)
    const xsetState = data.action === 'on' ? 'on' : 'off';
    exec(`export DISPLAY=:0 XAUTHORITY=/home/pi/.Xauthority && xset dpms force ${xsetState}`, (error) => {
        if (error) {
            console.error(`❌ Erreur lors de l'exécution de xset dpms : ${error.message}`);
        }
    });
});

// Écouter les demandes de capture d'écran
socket.on('request-screenshot', () => {
    const screenshotPath = '/tmp/screenshot.jpg';
    console.log(`📸 Prise d'une capture d'écran...`);
    exec(`export DISPLAY=:0 XAUTHORITY=/home/pi/.Xauthority && scrot ${screenshotPath}`, async (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Erreur scrot : ${error.message}`);
            if (stderr) console.error(`❌ scrot stderr: ${stderr}`);
            return;
        }
        if (stdout) console.log(`✅ scrot stdout: ${stdout}`);
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
