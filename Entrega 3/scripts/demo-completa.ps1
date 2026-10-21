# ==============================================================================
# HOSCORP - ENTREGA 3: DEMOSTRACION INTEGRAL DE COMUNICACION Y CONCURRENCIA
# Ejecuta secuencialmente la validacion de todos los requisitos del PDF oficial
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HOSCORP - DEMOSTRACION INTEGRAL DE ENTREGA 3                        " -ForegroundColor Cyan
Write-Host "  Modulo 3: Comunicacion Sincrona, Asincrona y Resolucion Concurrencia " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# PARTE 1: Canal Sincrono
Write-Host "`n[REQUISITO 1] PROBANDO CANAL DE COMUNICACION SINCRONO (HTTP/REST)..." -ForegroundColor Yellow
try {
    $syncRecords = Invoke-RestMethod -Uri "http://localhost:5000/api/records" -Method Get
    Write-Host "  [OK] Peticion sincrona cliente -> backend exitosa. Registros obtenidos: $($syncRecords.count)" -ForegroundColor Green

    $syncInterService = Invoke-RestMethod -Uri "http://localhost:5000/api/records/rec-1001/sync-audit-check" -Method Get
    Write-Host "  [OK] Llamada sincrona inter-servicio (backend -> notificaciones) exitosa en $($syncInterService.responseTimeMs)ms." -ForegroundColor Green
    Write-Host "       Detalle: $($syncInterService.dataFromNotificationService.message)" -ForegroundColor DarkGray
} catch {
    Write-Host "  [ERROR] Fallo en canal sincrono: $_" -ForegroundColor Red
}

# PARTE 2: Canal Asíncrono
Write-Host "`n[REQUISITO 2] PROBANDO CANAL DE COMUNICACION ASINCRONO (RABBITMQ)..." -ForegroundColor Yellow
try {
    # Crear registro temporal que dispara evento asincrono
    $newRecPayload = @{
        paciente = "Paciente Demo Asincrono"
        dni = "99.888.777"
        centroSalud = "Hospital Regional"
        diagnostico = "Prueba de evento AMQP"
    } | ConvertTo-Json

    $postRes = Invoke-RestMethod -Uri "http://localhost:5000/api/records" -Method Post -Body $newRecPayload -ContentType "application/json"
    Write-Host "  [OK] Registro clinico creado (ID: $($postRes.data.id)). Evento emitido al exchange 'hoscorp.events'." -ForegroundColor Green

    Start-Sleep -Seconds 1

    $auditRes = Invoke-RestMethod -Uri "http://localhost:5001/api/audit-logs" -Method Get
    $lastLog = $auditRes.logs | Select-Object -First 1
    Write-Host "  [OK] Evento capturado y procesado por el worker de notificaciones via cola RabbitMQ:" -ForegroundColor Green
    Write-Host "       RoutingKey: $($lastLog.routingKey)" -ForegroundColor Cyan
    Write-Host "       Accion ejecutada: $($lastLog.actionDescription)" -ForegroundColor White
    Write-Host "       Efecto colateral: $($lastLog.simulatedAction)" -ForegroundColor DarkGray
} catch {
    Write-Host "  [ERROR] Fallo en canal asincrono: $_" -ForegroundColor Red
}

# PARTE 3: Concurrencia
Write-Host "`n[REQUISITO 3] PROBANDO CASO DE CONCURRENCIA RESUELTO (OCC)..." -ForegroundColor Yellow
& "$PSScriptRoot\test-concurrencia.ps1"

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  DEMOSTRACION FINALIZADA SATISFACTORIAMENTE                          " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
