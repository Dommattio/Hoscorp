# ==============================================================================
# HOSCORP - ENTREGA 6 FINAL: DEMO EN VIVO DE PUNTA A PUNTA (LAS 6 CAPAS)
# Script ensayado para la presentacion y defensa oral del proyecto
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HOSCORP: DEMO EN VIVO DE PUNTA A PUNTA - LAS 6 CAPAS INTEGRADAS     " -ForegroundColor Cyan
Write-Host "  Grupo 2: Donato Mattio & Cristian Carilavi | Release: v6-final      " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$BACKEND_URL = "http://localhost:5000"

Write-Host "`n[1] Ejecutando Orquestador Maestro de las 6 Capas ($BACKEND_URL/api/v1/demo/run-e2e-all-layers)..." -ForegroundColor Yellow
try {
    $e2e = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/demo/run-e2e-all-layers" -Method Post -TimeoutSec 5
    foreach ($layer in $e2e.layersReport) {
        Write-Host "  [$($layer.status)] $($layer.layerName)" -ForegroundColor Green
        Write-Host "      Evidencia: $($layer.evidence)" -ForegroundColor Gray
    }
    Write-Host "`n  [TIEMPO TOTAL E2E]: $($e2e.totalExecutionTimeMs) ms" -ForegroundColor Cyan
} catch {
    Write-Host "  [ERROR] Asegurate de levantar los contenedores con 'docker compose up -d'." -ForegroundColor Red
    exit 1
}

Write-Host "`n[2] Verificando Escalabilidad Horizontal y Balanceo Round-Robin (Capa 6)..." -ForegroundColor Yellow
try {
    $scaleBody = @{ targetReplicas = 4 } | ConvertTo-Json
    $scale = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/scalability/scale-cluster" -Method Post -Body $scaleBody -ContentType "application/json"
    Write-Host "  [OK] Clúster escalado horizontalmente a $($scale.activeInstancesCount) instancias activas." -ForegroundColor Green
    Write-Host "       Distribucion de rafaga Round-Robin ($($scale.burstRequestsSent) peticiones):" -ForegroundColor Cyan
    $scale.roundRobinDistribution.PSObject.Properties | ForEach-Object {
        Write-Host "       - Instancia $($_.Name): $($_.Value) peticiones atendidas" -ForegroundColor White
    }
} catch {
    Write-Host "  [ERROR] Fallo en prueba de escalabilidad: $_" -ForegroundColor Red
}

Write-Host "`n[3] Consultando Metricas de Cache-Aside L1 y Circuit Breaker..." -ForegroundColor Yellow
try {
    $metrics = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/scalability/metrics" -Method Get
    Write-Host "  [OK] Cache L1 Hits: $($metrics.cacheMetrics.cacheHits) | Hit Ratio: $($metrics.cacheMetrics.hitRatioPercent) | Invalidaciones: $($metrics.cacheMetrics.cacheInvalidations)" -ForegroundColor Green
    Write-Host "  [OK] Circuit Breaker Estado: $($metrics.circuitBreaker.state)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Fallo al consultar metricas: $_" -ForegroundColor Red
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  DEMO EN VIVO DE PUNTA A PUNTA COMPLETADA EXITOSAMENTE               " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
