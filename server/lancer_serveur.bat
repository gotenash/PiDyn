@echo off
title Serveur PiDyn
echo Installation des dependances si necessaire...
call npm install
echo Demarrage du serveur sur http://localhost:3000
node server.js
pause