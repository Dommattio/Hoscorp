# ==============================================================================
# HOSCORP - ENTREGA 3: DEMOSTRACION DE CONCURRENCIA (OCC)
# Script de prueba automatizada: Dos escrituras simultaneas sobre el mismo recurso
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HOSCORP: PRUEBA DE CONCURRENCIA DISTRIBUIDA (OPTIMISTIC LOCKING)    " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$BACKEND_URL = "http://localhost:5000"
$NOTIF_URL = "http://localhost:5001"
$RECORD_ID = "rec-1001"

# 1. Verificar conectividad del Backend
Write-Host "`n[PASO 1] Verificando salud del Backend Clinico ($BACKEND_URL/health)..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BACKEND_URL/health" -Method Get -TimeoutSec 3
    Write-Host "[OK] Backend operativo. Uptime: $($health.uptimeSeconds)s | RabbitMQ Conectado: $($health.rabbitmq.connected)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] No se pudo conectar al Backend en $BACKEND_URL. Verifica que Docker o el servicio local este corriendo." -ForegroundColor Red
    exit 1
}

# 2. Resetear registros al estado inicial
Write-Host "`n[PASO 2] Restableciendo datos al estado semilla inicial..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$BACKEND_URL/api/records/reset" -Method Post | Out-Null
    Write-Host "[OK] Datos restablecidos." -ForegroundColor Green
} catch {
    Write-Host "[AVISO] No se pudo invocar reset, continuando con estado actual." -ForegroundColor DarkGray
}

# 3. Obtener el registro objetivo y su version base actual
Write-Host "`n[PASO 3] Consultando registro clinico objetivo: $RECORD_ID..." -ForegroundColor Yellow
$recordResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/records/$RECORD_ID" -Method Get
$record = $recordResponse.data
$baseVersion = $record.version

Write-Host "  Paciente: $($record.paciente)" -ForegroundColor White
Write-Host "  Diagnostico actual: $($record.diagnostico)" -ForegroundColor White
Write-Host "  Version base leida (V): $baseVersion" -ForegroundColor Cyan

# 4. Disparar dos peticiones simultaneas con la MISMA version base
Write-Host "`n[PASO 4] DISPARANDO 2 ESCRITURAS SIMULTANEAS CONCURRENTES SOBRE $RECORD_ID (Version: $baseVersion)..." -ForegroundColor Yellow
Write-Host "  - Hilo A: Dra. Gomez intenta actualizar diagnostico enviando version $baseVersion" -ForegroundColor Gray
Write-Host "  - Hilo B: Dr. Ramirez intenta actualizar diagnostico enviando version $baseVersion" -ForegroundColor Gray

# Se utiliza el endpoint de simulacion atomica concurrente del backend para precision en milisegundos
try {
    $simResult = Invoke-RestMethod -Uri "$BACKEND_URL/api/records/$RECORD_ID/simulate-concurrency" -Method Post -TimeoutSec 5

    Write-Host "`n======================================================================" -ForegroundColor Cyan
    Write-Host "  RESULTADO DE LA EJECUCION CONCURRENTE" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Cyan

    $t1 = $simResult.results.thread1
    $t2 = $simResult.results.thread2

    if ($t1.status -eq 200) {
        Write-Host "[HILO 1] Codigo HTTP 200 OK (EXITO)" -ForegroundColor Green
        Write-Host "         Accion: $($t1.message)" -ForegroundColor Green
        Write-Host "         Nueva Version incrementada en BD: $($t1.data.version)" -ForegroundColor Green
    } else {
        Write-Host "[HILO 1] Codigo HTTP 409 Conflict (RECHAZADO)" -ForegroundColor Red
        Write-Host "         Detalle: $($t1.error)" -ForegroundColor Red
    }

    if ($t2.status -eq 200) {
        Write-Host "[HILO 2] Codigo HTTP 200 OK (EXITO)" -ForegroundColor Green
        Write-Host "         Accion: $($t2.message)" -ForegroundColor Green
        Write-Host "         Nueva Version incrementada en BD: $($t2.data.version)" -ForegroundColor Green
    } else {
        Write-Host "[HILO 2] Codigo HTTP 409 Conflict (RECHAZADO)" -ForegroundColor Red
        Write-Host "         Detalle: $($t2.error)" -ForegroundColor Red
        Write-Host "         Version provista: $($t2.details.versionSent) vs Version en BD: $($t2.details.currentVersionInDb)" -ForegroundColor Yellow
    }

    Write-Host "`n----------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "VEREDICTO DE LA PRUEBA:" -ForegroundColor White
    Write-Host "  - Exitos: $($simResult.concurrencyResolutionSummary.successCount)" -ForegroundColor Green
    Write-Host "  - Conflictos prevenidos: $($simResult.concurrencyResolutionSummary.conflictCount)" -ForegroundColor Yellow
    Write-Host "  - Anomalia Lost Update evitada: $($simResult.concurrencyResolutionSummary.lostUpdatePrevented)" -ForegroundColor Green
    Write-Host "  - Conclusion: $($simResult.concurrencyResolutionSummary.explanation)" -ForegroundColor White
    Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

} catch {
    Write-Host "[ERROR] Fallo en la simulacion concurrente: $_" -ForegroundColor Red
}

# 5. Verificar recepcion asincrona de eventos en el Notification Service (RabbitMQ)
Write-Host "`n[PASO 5] Verificando captura del evento de conflicto en RabbitMQ ($NOTIF_URL)..." -ForegroundColor Yellow
Start-Sleep -Seconds 1
try {
    $auditResponse = Invoke-RestMethod -Uri "$NOTIF_URL/api/audit-logs" -Method Get -TimeoutSec 3
    $conflictLogs = $auditResponse.logs | Where-Object { $_.routingKey -like "*conflict*" }
    if ($conflictLogs) {
        Write-Host "[OK] Evento de conflicto capturado por RabbitMQ y procesado por el worker asincrono:" -ForegroundColor Green
        foreach ($log in $conflictLogs) {
            Write-Host "     Evento: $($log.routingKey) | Hora: $($log.consumedAt)" -ForegroundColor Cyan
            Write-Host "     Accion: $($log.simulatedAction)" -ForegroundColor Gray
        }
    } else {
        Write-Host "[INFO] No se registraron eventos de conflicto en la bitacora de notificaciones." -ForegroundColor Gray
    }
} catch {
    Write-Host "[AVISO] No se pudo consultar el servicio de notificaciones en $NOTIF_URL (posible ejecucion sin servicio auxiliar)." -ForegroundColor DarkGray
}

Write-Host "`nPrueba de concurrencia finalizada exitosamente." -ForegroundColor Cyan
