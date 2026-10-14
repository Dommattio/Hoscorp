# Iniciar Nodo 1 localmente como proceso de Node.js independiente
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\..\backend"
Write-Host "Iniciando Nodo 1 (Backend API) localmente..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias de Node..." -ForegroundColor Yellow
    npm install
}

npm start
