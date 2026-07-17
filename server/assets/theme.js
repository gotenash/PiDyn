document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialiser le thème depuis localStorage ou la préférence système
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }

    // 2. Injecter le bouton de toggle dans le header s'il existe
    const header = document.querySelector('header');
    if (header) {
        // Éviter l'injection multiple
        if (!document.getElementById('theme-toggle')) {
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'theme-toggle-container';
            toggleContainer.style.display = 'flex';
            toggleContainer.style.alignItems = 'center';
            toggleContainer.style.marginLeft = 'auto';
            toggleContainer.style.marginRight = '15px';

            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'theme-toggle';
            toggleBtn.className = 'theme-toggle-btn';
            toggleBtn.type = 'button';
            
            // Icône initiale selon le thème actif
            updateToggleLabel(toggleBtn, savedTheme);

            toggleBtn.addEventListener('click', () => {
                const isLight = document.body.classList.toggle('light-theme');
                const newTheme = isLight ? 'light' : 'dark';
                localStorage.setItem('theme', newTheme);
                updateToggleLabel(toggleBtn, newTheme);
                window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: newTheme } }));
            });

            toggleContainer.appendChild(toggleBtn);
            
            // Insérer avant le bouton de déconnexion si présent, sinon à la fin
            const logoutBtn = header.querySelector('button[onclick*="logout"]');
            if (logoutBtn) {
                header.insertBefore(toggleContainer, logoutBtn);
            } else {
                header.appendChild(toggleContainer);
            }
        }
    }
});

function updateToggleLabel(btn, theme) {
    if (theme === 'light') {
        btn.innerHTML = '🌙 Mode Sombre';
    } else {
        btn.innerHTML = '☀️ Mode Clair';
    }
}
