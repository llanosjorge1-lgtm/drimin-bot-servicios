@echo off
title Drimin Services SpA - Asistente Virtual & Panel Local
chcp 65001 > nul
cls

echo =====================================================================
echo           DRIMIN SERVICES SpA - SERVICIOS JURÍDICOS 24/7
echo                  Panel de Control & Bot de WhatsApp
echo =====================================================================
echo.

:: Verificar si Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ ERROR: Node.js no está instalado en este equipo.
    echo.
    echo Por favor descargue e instale Node.js desde:
    echo 👉 https://nodejs.org/ (Versión LTS recomendada)
    echo.
    echo Una vez instalado, vuelva a ejecutar este archivo.
    echo.
    pause
    exit /b
)

:: Verificar si faltan dependencias
if not exist "node_modules\" (
    echo 📦 Instalando dependencias por primera vez...
    call npm install
    echo.
)

echo 🚀 Iniciando Servidor Drimin en http://localhost:3000 ...
echo 📱 WhatsApp, Calendario Outlook y Correos Ferozo activos.
echo.

:: Abrir navegador automáticamente tras 2 segundos en segundo plano
start "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

:: Ejecutar el servidor
node server.js

pause
