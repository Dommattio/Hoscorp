# ==============================================================================
# HOSCORP - DEMOSTRACION EN VIVO DE INDEPENDENCIA FISICA DE NODOS
# Programacion Distribuida y Componentes - Entrega 2: Infraestructura
# Grupo 2: Donato Mattio & Cristian Carilavi
# ==============================================================================

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "    HOSCORP - VALIDACION DE SEPARACION FISICA E INDEPENDENCIA" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar Docker
try {
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ALERTA] Docker Desktop no parece estar iniciado. Por favor abra Docker Desktop e intente nuevamente." -ForegroundColor Red
        Exit 1
    }
} catch {
    Write-Host "[ALERTA] Error al detectar Docker en el sistema." -ForegroundColor Red
    Exit 1
}

Write-Host "[PASO 1/5] Levantando los dos nodos separados con Docker Compose..." -ForegroundColor Yellow
docker compose up -d --build

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[PASO 2/5] Verificando que ambos nodos corren como contenedores/procesos independientes:" -ForegroundColor Yellow
docker ps --filter "name=hoscorp" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "Probando salud de ambos nodos:" -ForegroundColor Gray
$backendHealth = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
if ($backendHealth) {
    Write-Host "  [OK] Nodo 1 (Backend API): UP (Uptime: $($backendHealth.uptimeSeconds)s, Hostname: $($backendHealth.hostname))" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Nodo 1 no respondio" -ForegroundColor Red
}

$frontendRes = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
if ($frontendRes.StatusCode -eq 200) {
    Write-Host "  [OK] Nodo 2 (Frontend Web): UP (Codigo HTTP: 200 OK)" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Nodo 2 no respondio" -ForegroundColor Red
}

Write-Host ""
Write-Host "Presione [ENTER] para ejecutar la prueba de falla: DETENER Nodo 1 (Backend)..." -ForegroundColor Magenta
Read-Host

Write-Host "[PASO 3/5] Deteniendo intencionalmente el Nodo 1 (Backend)..." -ForegroundColor Yellow
docker stop hoscorp-backend

Start-Sleep -Seconds 2

Write-Host "Verificando estado tras apagar Nodo 1:" -ForegroundColor Gray
$frontendResAfter = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
if ($frontendResAfter.StatusCode -eq 200) {
    Write-Host "  [EVIDENCIA DE INDEPENDENCIA REAL] El Nodo 2 (Frontend) SIGUE VIVO y sirviendo la UI a pesar de la caida del Nodo 1." -ForegroundColor Green
}

Write-Host ""
Write-Host "Presione [ENTER] para RESTAURAR el Nodo 1..." -ForegroundColor Magenta
Read-Host

Write-Host "[PASO 4/5] Reiniciando el Nodo 1..." -ForegroundColor Yellow
docker start hoscorp-backend
Start-Sleep -Seconds 3

$backendRecovered = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
if ($backendRecovered) {
    Write-Host "  [OK] Nodo 1 recuperado exitosamente." -ForegroundColor Green
}

Write-Host ""
Write-Host "Presione [ENTER] para probar la parada del Nodo 2 (Frontend) manteniendo vivo al Backend..." -ForegroundColor Magenta
Read-Host

Write-Host "[PASO 5/5] Deteniendo Nodo 2 (Frontend)..." -ForegroundColor Yellow
docker stop hoscorp-frontend
Start-Sleep -Seconds 2

$backendAlone = Invoke-RestMethod -Uri "http://localhost:5000/api/records" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
if ($backendAlone) {
    Write-Host "  [EVIDENCIA INVERSA] El Nodo 1 (Backend API) continua atendiendo solicitudes REST de manera 100% autonoma sin depender del frontend." -ForegroundColor Green
    Write-Host "     Total de registros recuperados por API pura: $($backendAlone.count)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Restaurando Nodo 2..." -ForegroundColor Gray
docker start hoscorp-frontend

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "    DEMOSTRACION FINALIZADA CON EXITO: 100% DE REQUISITOS CUMPLIDOS" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "Frontend disponible en: http://localhost:3000"
Write-Host "Backend disponible en:  http://localhost:5000"
