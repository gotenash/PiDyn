const knex = require('knex');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'pidyn.sqlite');
const MEDIA_DIR = path.join(__dirname, 'public', 'media');

async function seed() {
    console.log('🌱 Démarrage de la génération du jeu de données de démo...');

    const db = knex({
        client: 'sqlite3',
        connection: { filename: DB_PATH },
        useNullAsDefault: true
    });

    try {
        // 1. Nettoyage des anciennes données
        console.log('🧹 Nettoyage des tables existantes...');
        await db('schedules').del();
        await db('players').del();
        await db('groups').del();
        await db('sequences').del();
        await db('playlists').del();
        await db('media').del();
        await db('users').del();
        await db('sites').del();

        // 2. Génération des Sites
        console.log('🏢 Création des sites...');
        const sites = [
            { id: 'site_paris', name: 'Campus Paris', description: 'Siège social et campus principal de Paris' },
            { id: 'site_lyon', name: 'Campus Lyon', description: 'Bureau régional de Lyon' }
        ];
        await db('sites').insert(sites);

        // 3. Génération des Utilisateurs (Mot de passe par défaut : password)
        console.log('👥 Génération des utilisateurs...');
        const passwordHash = await bcrypt.hash('password', 10);
        const users = [
            { id: 1, username: 'admin', password: passwordHash, role: 'admin', email: 'admin@pidyn.com', siteId: null },
            { id: 2, username: 'jean_paris', password: passwordHash, role: 'editor', email: 'jean.paris@pidyn.com', siteId: 'site_paris' },
            { id: 3, username: 'sophie_paris', password: passwordHash, role: 'author', email: 'sophie.paris@pidyn.com', siteId: 'site_paris' },
            { id: 4, username: 'pierre_lyon', password: passwordHash, role: 'editor', email: 'pierre.lyon@pidyn.com', siteId: 'site_lyon' },
            { id: 5, username: 'marie_lyon', password: passwordHash, role: 'author', email: 'marie.lyon@pidyn.com', siteId: 'site_lyon' }
        ];
        await db('users').insert(users);

        // 4. Génération de faux fichiers médias (SVG légers)
        console.log('📁 Génération des fichiers médias...');
        await fs.ensureDir(MEDIA_DIR);

        const welcomeSvgPath = path.join(MEDIA_DIR, 'welcome_paris.svg');
        const welcomeSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="100%" height="100%">
            <rect width="1920" height="1080" fill="#2c3e50"/>
            <circle cx="960" cy="540" r="300" fill="#3498db" opacity="0.3"/>
            <text x="960" y="500" font-family="sans-serif" font-size="70" fill="#ffffff" text-anchor="middle" font-weight="bold">Bienvenue au Campus Paris</text>
            <text x="960" y="600" font-family="sans-serif" font-size="40" fill="#bdc3c7" text-anchor="middle">Démo PiDyn - Affichage Dynamique</text>
        </svg>`;
        await fs.writeFile(welcomeSvgPath, welcomeSvgContent);

        const lyonSvgPath = path.join(MEDIA_DIR, 'welcome_lyon.svg');
        const lyonSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="100%" height="100%">
            <rect width="1920" height="1080" fill="#1a252f"/>
            <rect x="200" y="200" width="1520" height="680" rx="20" fill="#27ae60" opacity="0.2"/>
            <text x="960" y="520" font-family="sans-serif" font-size="80" fill="#2ecc71" text-anchor="middle" font-weight="bold">Campus Lyon</text>
            <text x="960" y="620" font-family="sans-serif" font-size="45" fill="#ecf0f1" text-anchor="middle">Consignes de Sécurité &amp; Infos Régionales</text>
        </svg>`;
        await fs.writeFile(lyonSvgPath, lyonSvgContent);

        const media = [
            {
                id: 'm_welcome_paris',
                filename: 'welcome_paris.svg',
                url: '/media/welcome_paris.svg',
                type: 'image',
                uploadedBy: 'jean_paris',
                uploadDate: new Date().toISOString(),
                siteId: 'site_paris'
            },
            {
                id: 'm_welcome_lyon',
                filename: 'welcome_lyon.svg',
                url: '/media/welcome_lyon.svg',
                type: 'image',
                uploadedBy: 'marie_lyon',
                uploadDate: new Date().toISOString(),
                siteId: 'site_lyon'
            }
        ];
        await db('media').insert(media);

        // 5. Génération des Diaporamas (Playlists)
        console.log('🎞 Création des diaporamas...');
        
        const playlistParisItems = [
            { duration: 7000, backgroundColor: '#2c3e50', backgroundUrl: '/media/welcome_paris.svg', zones: [] },
            { duration: 5000, backgroundColor: '#34495e', backgroundUrl: '', zones: [
                { id: 'z1', type: 'text', x: 10, y: 10, w: 80, h: 20, content: 'Flash Infos Paris : Réunion générale à 14h.', fontSize: 30, color: '#ffffff' }
            ]}
        ];

        const playlistLyonItems = [
            { duration: 8000, backgroundColor: '#1a252f', backgroundUrl: '/media/welcome_lyon.svg', zones: [] }
        ];

        const playlists = [
            {
                id: 'pl_paris_welcome',
                name: 'Accueil Général Paris',
                items: JSON.stringify(playlistParisItems),
                backgroundColor: '#2c3e50',
                resolution: '16/9',
                status: 'approved',
                createdBy: 'jean_paris',
                updatedBy: 'jean_paris',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                siteId: 'site_paris'
            },
            {
                id: 'pl_paris_draft',
                name: 'Actualités RH (Brouillon)',
                items: JSON.stringify([]),
                backgroundColor: '#ffffff',
                resolution: '16/9',
                status: 'draft',
                createdBy: 'sophie_paris',
                updatedBy: 'sophie_paris',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                siteId: 'site_paris'
            },
            {
                id: 'pl_lyon_welcome',
                name: 'Accueil Lyon',
                items: JSON.stringify(playlistLyonItems),
                backgroundColor: '#1a252f',
                resolution: '16/9',
                status: 'approved',
                createdBy: 'pierre_lyon',
                updatedBy: 'pierre_lyon',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                siteId: 'site_lyon'
            }
        ];
        await db('playlists').insert(playlists);

        // 6. Génération des Groupes
        console.log('🖥 Création des groupes d\'écrans...');
        const groups = [
            { id: 'grp_paris', name: 'Écrans Accueil Paris', description: 'Tous les écrans du hall d\'accueil de Paris', siteId: 'site_paris' },
            { id: 'grp_lyon', name: 'Écrans Lyon', description: 'Écrans d\'affichage à Lyon', siteId: 'site_lyon' }
        ];
        await db('groups').insert(groups);

        // 7. Génération des Écrans (Players)
        console.log('🖥 Création des écrans...');
        const players = [
            {
                id: 'player_paris_1',
                name: 'Écran Hall Principal',
                ip: '192.168.1.50',
                lastSeen: new Date().toISOString(),
                currentPlaylistId: 'pl_paris_welcome',
                groupId: 'grp_paris',
                siteId: 'site_paris',
                status: 'approved'
            },
            {
                id: 'player_paris_2',
                name: 'Écran Cafétéria',
                ip: '192.168.1.51',
                lastSeen: new Date(Date.now() - 120000).toISOString(), // offline
                currentPlaylistId: 'pl_paris_welcome',
                groupId: 'grp_paris',
                siteId: 'site_paris',
                status: 'approved'
            },
            {
                id: 'player_lyon_1',
                name: 'Écran Accueil Lyon',
                ip: '192.168.2.30',
                lastSeen: new Date().toISOString(),
                currentPlaylistId: 'pl_lyon_welcome',
                groupId: 'grp_lyon',
                siteId: 'site_lyon',
                status: 'approved'
            }
        ];
        await db('players').insert(players);

        // 8. Génération des Séquences
        console.log('🔄 Création des séquences...');
        const sequences = [
            {
                id: 'seq_paris_loop',
                name: 'Boucle Standard Paris',
                playlistIds: JSON.stringify(['pl_paris_welcome', 'pl_paris_draft']),
                siteId: 'site_paris'
            }
        ];
        await db('sequences').insert(sequences);

        // 9. Génération des Planifications (Schedules)
        console.log('📅 Création des planifications...');
        const schedules = [
            {
                id: 'sch_paris_welcome',
                deviceId: 'player_paris_1',
                playlistId: 'pl_paris_welcome',
                sequenceId: null,
                startTime: '08:00',
                endTime: '19:00'
            }
        ];
        await db('schedules').insert(schedules);

        console.log('🎉 Jeu de données de démo créé avec succès !');
        console.log('---------------------------------------------------------');
        console.log('Comptes de test (Mot de passe: "password") :');
        console.log('- admin (Administrateur Global)');
        console.log('- jean_paris (Editeur - Campus Paris)');
        console.log('- sophie_paris (Auteur - Campus Paris)');
        console.log('- pierre_lyon (Editeur - Campus Lyon)');
        console.log('- marie_lyon (Auteur - Campus Lyon)');
        console.log('---------------------------------------------------------');

    } catch (error) {
        console.error('❌ Erreur lors de la génération :', error);
    } finally {
        await db.destroy();
    }
}

seed();
