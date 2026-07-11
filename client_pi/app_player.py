#!/usr/bin/env python3
import os
import sys

# 🔥 ON ACTIVE UNIQUEMENT LE FLAG AUTOPLAY (ON LAISSE LE GPU TRAVAILLER)
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = "--autoplay-policy=no-user-gesture-required"

from PyQt6.QtCore import QUrl, Qt
from PyQt6.QtWidgets import QApplication, QMainWindow
from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEngineSettings
from PyQt6.QtWebEngineWidgets import QWebEngineView

class PiDynPlayer(QMainWindow):
    def __init__(self):
        super().__init__()
        
        self.browser = QWebEngineView()
        
        # Paramètres graphiques et média
        settings = self.browser.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False)
        settings.setAttribute(QWebEngineSettings.WebAttribute.AllowRunningInsecureContent, True)
        
        # Accélération webgl et GPU
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        
        profile = self.browser.page().profile()
        profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.NoCache)
        
        self.browser.setUrl(QUrl("http://127.0.0.1:8080/player"))
        self.setCentralWidget(self.browser)
        
        self.showFullScreen()
        self.setCursor(Qt.CursorShape.BlankCursor)

if __name__ == "__main__":
    sys.argv.append("--autoplay-policy=no-user-gesture-required")
    # Suppression des flags de désactivation GPU ici
    
    app = QApplication(sys.argv)
    player = PiDynPlayer()
    sys.exit(app.exec())