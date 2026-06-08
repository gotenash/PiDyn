const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const API_KEY = 'ma_cle_secrete_123';
const DB_PATH = path.join(__dirname, 'db.json');
const MEDIA_DIR = path.join(__dirname, 'public/media');

// Configuration de Multer pour gérer l'upload de fichiers
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, MEDIA_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Données par défaut
const defaultData = {
    users: [
        { username: 'admin', password: '123456', role: 'admin' },
        { username: 'editeur', password: '123456', role: 'editor' },
        { username: 'auteur', password: '123456', role: 'author' }
    ],
    playlists: {
        'p1': { name: 'Promo Eté', items: [{ type: 'image', url: '/media/ete.jpg', duration: 5000 }] },
        'p2': { name: 'Infos Interne', items: [{ type: 'video', url: '/media/security.mp4', duration: 30000 }] }
    },
    players: {
        'pi-accueil-01': { name: 'Ecran Accueil', manualPlaylistId: 'p1', currentPlaylistId: 'p1', lastSeen: null, status: 'approved' }
    }
    , schedules: [] // Nouvelle section pour les planifications
};

// Chargement de la base de données au démarrage
let data;
// Fonction utilitaire pour sauvegarder les changements
const saveDb = () => fs.writeJsonSync(DB_PATH, data, { spaces: 2 });

if (!fs.existsSync(DB_PATH)) {
    data = defaultData;
    // Hacher les mots de passe par défaut au premier lancement
    data.users = data.users.map(u => ({ ...u, password: bcrypt.hashSync(u.password, saltRounds) }));
    fs.writeJsonSync(DB_PATH, data, { spaces: 2 });
} else {
    data = fs.readJsonSync(DB_PATH);
    // Migration : hacher automatiquement les mots de passe encore en clair
    let needsMigration = false;
    data.users = data.users.map(u => {
        if (!u.password.startsWith('$2b$')) { // Format typique des hachages bcrypt
            u.password = bcrypt.hashSync(u.password, saltRounds);
            needsMigration = true;
        }
        return u;
    });
    if (needsMigration) saveDb();
}
fs.ensureDirSync(MEDIA_DIR);

// Fonction pour vérifier et appliquer les planifications
const checkSchedules = () => {
    const now = new Date();
    for (const deviceId in data.players) {
        const player = data.players[deviceId];
        if (player.status !== 'approved') continue; // Ne planifier que pour les afficheurs approuvés

        let activeSchedule = null;
        for (const schedule of data.schedules) {
            if (schedule.deviceId === deviceId) {
                const start = new Date(schedule.startTime);
                const end = new Date(schedule.endTime);
                if (now >= start && now < end) {
                    activeSchedule = schedule;
                    break; // Une seule planification active à la fois par afficheur
                }
            }
        }

        // La planification active prend le dessus sur l'affectation manuelle
        let newPlaylistId = activeSchedule ? activeSchedule.playlistId : (player.manualPlaylistId || null);

        // Seulement mettre à jour si la playlist a changé
        if (player.currentPlaylistId !== newPlaylistId) {
            player.currentPlaylistId = newPlaylistId;
            const targetPlaylist = newPlaylistId && data.playlists[newPlaylistId] ? data.playlists[newPlaylistId] : null;
            if (targetPlaylist) {
                io.to(deviceId).emit('playlist-updated', targetPlaylist);
                console.log(`Player ${deviceId} switched to playlist: ${targetPlaylist.name} (Scheduled: ${!!activeSchedule})`);
            } else {
                io.to(deviceId).emit('playlist-updated', { name: 'No Playlist', items: [] }); // Envoyer une playlist vide
                console.log(`Player ${deviceId} has no active playlist.`);
            }
            saveDb(); // Sauvegarder le changement de currentPlaylistId
        }
    }
};

// Middleware de sécurité
const authMiddleware = (req, res, next) => {
    const key = req.headers['x-api-key'] || req.query.apiKey;
    const token = req.headers['x-access-token'];

    if (key === API_KEY) {
        req.user = { role: 'admin' }; // Les écrans (Pi) sont authentifiés via clef
        return next();
    }

    if (token) {
        const [username, role] = token.split(':');
        const user = data.users.find(u => u.username === username && u.role === role);
        if (user) {
            req.user = user;
            return next();
        }
    }
    res.status(403).send('Interdit');
};

const checkRole = (roles) => (req, res, next) => {
    if (roles.includes(req.user.role)) return next();
    res.status(403).send('Accès refusé pour ce profil');
};

app.use(express.json());
app.use('/media', authMiddleware, express.static(MEDIA_DIR));

// Route par défaut pour servir l'interface d'administration
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Route pour l'éditeur de diaporama
app.get('/editor', (req, res) => {
    res.sendFile(path.join(__dirname, 'editor.html'));
});

// Route pour le lecteur (utilisée aussi pour la prévisualisation)
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'player.html'));
});

// Route pour la page de gestion des utilisateurs
app.get('/users', (req, res) => {
    res.sendFile(path.join(__dirname, 'users.html'));
});

// Route de login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        res.json({ token: `${user.username}:${user.role}`, role: user.role });
    } else {
        res.status(401).send('Identifiants incorrects');
    }
});

// API Admin : Lister les players et affecter des playlists
app.get('/api/admin/data', authMiddleware, checkRole(['admin', 'editor', 'author']), (req, res) => res.json(data));

app.get('/api/admin/media', authMiddleware, checkRole(['admin', 'editor', 'author']), (req, res) => {
    const files = fs.readdirSync(MEDIA_DIR);
    res.json(files);
});

// API Admin : Gestion des utilisateurs
app.get('/api/admin/users', authMiddleware, checkRole(['admin']), (req, res) => {
    res.json(data.users);
});

// API Admin : Gestion des agendas
app.get('/api/admin/schedules', authMiddleware, checkRole(['admin', 'editor']), (req, res) => {
    res.json(data.schedules);
});

app.post('/api/admin/schedules', authMiddleware, checkRole(['admin', 'editor']), (req, res) => {
    const { id, deviceId, playlistId, startTime, endTime } = req.body;
    if (!deviceId || !playlistId || !startTime || !endTime) {
        return res.status(400).send('Données manquantes pour la planification.');
    }

    const scheduleId = id || `sch_${Date.now()}`;
    const newSchedule = { id: scheduleId, deviceId, playlistId, startTime, endTime };

    const existingIndex = data.schedules.findIndex(s => s.id === scheduleId);
    if (existingIndex > -1) {
        data.schedules[existingIndex] = newSchedule;
    } else {
        data.schedules.push(newSchedule);
    }
    saveDb();
    checkSchedules(); // Ré-évaluer les planifications immédiatement
    res.json({ success: true, scheduleId });
});

app.delete('/api/admin/schedules/:id', authMiddleware, checkRole(['admin', 'editor']), (req, res) => {
    const { id } = req.params;
    const initialLength = data.schedules.length;
    data.schedules = data.schedules.filter(s => s.id !== id);
    if (data.schedules.length < initialLength) {
        saveDb();
        checkSchedules(); // Ré-évaluer les planifications immédiatement
        res.json({ success: true });
    } else {
        res.status(404).send('Planification non trouvée');
    }
});

app.post('/api/admin/users', authMiddleware, checkRole(['admin']), async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.status(400).send('Données manquantes');
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const idx = data.users.findIndex(u => u.username === username);
    if (idx > -1) data.users[idx] = { username, password: hashedPassword, role };
    else data.users.push({ username, password: hashedPassword, role });
    saveDb();
    res.json({ success: true });
});

app.delete('/api/admin/users/:username', authMiddleware, checkRole(['admin']), (req, res) => {
    const { username } = req.params;
    if (username === 'admin') return res.status(400).send('Impossible de supprimer le compte admin principal');
    data.users = data.users.filter(u => u.username !== username);
    saveDb();
    res.json({ success: true });
});

app.post('/api/admin/upload', authMiddleware, checkRole(['admin', 'editor', 'author']), upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('Aucun fichier uploadé.');
    res.json({ url: `/media/${req.file.filename}` });
});

// Route pour l'import PPTX (Structure suggérée)
app.post('/api/admin/import-pptx', authMiddleware, checkRole(['admin', 'editor']), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('Aucun fichier PPTX.');
    
    // Ici, on pourrait appeler une commande système (ex: LibreOffice) 
    // pour convertir chaque slide en JPG dans le dossier /media.
    // Puis générer une playlist automatiquement.
    
    const playlistId = `pptx_${Date.now()}`;
    data.playlists[playlistId] = {
        name: `Import: ${req.file.originalname}`,
        items: [] // Remplir avec les images générées
    };
    saveDb();
    res.json({ success: true, playlistId });
});

app.post('/api/admin/playlists', authMiddleware, checkRole(['admin', 'editor', 'author']), (req, res) => {
    const { id, name, items, backgroundUrl, backgroundColor, resolution } = req.body;
    // On génère un ID si c'est une nouvelle playlist
    const playlistId = id || `p_${Date.now()}`;
    data.playlists[playlistId] = { name, items, backgroundUrl, backgroundColor, resolution };
    saveDb();
    res.json({ success: true, playlistId });
});

app.delete('/api/admin/playlists/:id', authMiddleware, checkRole(['admin', 'editor', 'author']), (req, res) => {
    const { id } = req.params;
    if (data.playlists[id]) {
        delete data.playlists[id];
        // On retire l'assignation de ce diaporama pour tous les players
        for (let devId in data.players) {
            if (data.players[devId].manualPlaylistId === id) {
                data.players[devId].manualPlaylistId = null;
            }
            if (data.players[devId].currentPlaylistId === id) {
                data.players[devId].currentPlaylistId = null;
            }
        }
        saveDb();
        res.json({ success: true });
    } else {
        res.status(404).send('Diaporama non trouvé');
    }
});

app.post('/api/admin/players/approve/:deviceId', authMiddleware, checkRole(['admin']), (req, res) => {
    const { deviceId } = req.params;
    if (data.players[deviceId]) {
        data.players[deviceId].status = 'approved';
        saveDb();
        res.json({ success: true });
    } else {
        res.status(404).send('Player non trouvé');
    }
});

app.delete('/api/admin/players/:deviceId', authMiddleware, checkRole(['admin']), (req, res) => {
    const { deviceId } = req.params;
    if (data.players[deviceId]) {
        delete data.players[deviceId];
        saveDb();
        // Optionally, disconnect the socket if it's still connected
        io.sockets.sockets.forEach(socket => {
            if (socket.handshake.query.deviceId === deviceId) socket.disconnect(true);
        });
        res.json({ success: true });
    } else {
        res.status(404).send('Player non trouvé');
    }
});

app.post('/api/admin/players/screen', authMiddleware, checkRole(['admin', 'editor']), (req, res) => {
    const { deviceId, action } = req.body; // action: 'on' ou 'off'
    if (data.players[deviceId]) {
        // Envoyer la commande via Socket.IO au salon (room) du device
        io.to(deviceId).emit('screen-command', { action });
        console.log(`📡 Commande envoyée à ${deviceId} : Écran ${action}`);
        res.json({ success: true });
    } else {
        res.status(404).send('Player non trouvé');
    }
});

app.post('/api/admin/assign', authMiddleware, checkRole(['admin', 'editor']), (req, res) => {
    const { deviceId, playlistId } = req.body;
    if (data.players[deviceId]) {
        data.players[deviceId].manualPlaylistId = playlistId; // Stocker comme affectation manuelle
        saveDb(); // On sauvegarde sur le disque
        checkSchedules(); // Ré-évaluer les planifications pour voir si la manuelle ou la planifiée prend le dessus
        res.json({ success: true });
    } else {
        res.status(404).send('Player non trouvé');
    }
});

// Socket.io avec authentification et gestion de salon (Room)
io.use((socket, next) => {
    if (socket.handshake.auth.token === API_KEY) return next();
    next(new Error('Auth error'));
});

io.on('connection', (socket) => {
    const deviceId = socket.handshake.query.deviceId;
    console.log(`Player connecté : ${deviceId}`);
    
    socket.join(deviceId);
    
    // Enregistrement automatique du player s'il est nouveau
    if (!data.players[deviceId]) {
        data.players[deviceId] = { name: `Nouveau Pi (${deviceId})`, manualPlaylistId: null, currentPlaylistId: null, lastSeen: null, status: 'pending' }; // Marquer comme en attente
        saveDb();
    }
    data.players[deviceId].lastSeen = new Date();

    // Ré-évaluer les planifications pour ce player au démarrage
    checkSchedules();
});

// Exécuter checkSchedules toutes les minutes
setInterval(checkSchedules, 60 * 1000);
checkSchedules(); // Exécuter une fois au démarrage du serveur

// Gestionnaire d'erreurs global pour capturer les erreurs Multer ou système
app.use((err, req, res, next) => {
    console.error("Erreur serveur :", err.message);
    res.status(500).send(err.message);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CMS Sécurisé sur le port ${PORT}`));