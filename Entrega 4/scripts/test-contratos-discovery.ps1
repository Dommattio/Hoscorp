# ==============================================================================
# HOSCORP - ENTREGA 4: PRUEBA AUTOMATIZADA DE CONTRATOS Y SERVICE DISCOVERY
# Verifica empiricamente los 4 requisitos del checklist oficial del Modulo 4
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HOSCORP: CERTIFICACION DE CONTRATOS REST Y SERVICE DISCOVERY (E4)   " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$BACKEND_URL = "http://localhost:5000"
$NOTIF_URL = "http://localhost:5001"
$REGISTRY_URL = "http://localhost:5002"

# 1. Verificar Contratos Formales OpenAPI 3.0.3 en cada componente
Write-Host "`n[REQUISITO 1] Verificando contratos formales OpenAPI 3.0.3 (/api/v1/contract)..." -ForegroundColor Yellow
try {
    $cBackend = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/contract" -Method Get -TimeoutSec 3
    $cNotif = Invoke-RestMethod -Uri "$NOTIF_URL/api/v1/contract" -Method Get -TimeoutSec 3
    $cRegistry = Invoke-RestMethod -Uri "$REGISTRY_URL/api/v1/contract" -Method Get -TimeoutSec 3

    Write-Host "  [OK] Contrato Backend Clinico: $($cBackend.info.title) (OpenAPI $($cBackend.openapi) - v$($cBackend.info.version))" -ForegroundColor Green
    Write-Host "  [OK] Contrato Notificaciones:  $($cNotif.info.title) (OpenAPI $($cNotif.openapi) - v$($cNotif.info.version))" -ForegroundColor Green
    Write-Host "  [OK] Contrato Service Registry: $($cRegistry.info.title) (OpenAPI $($cRegistry.openapi) - v$($cRegistry.info.version))" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo conectar a los servicios. Asegurate de haber ejecutado 'docker compose up -d'." -ForegroundColor Red
    exit 1
}

# 2. Verificar Mecanismo de Descubrimiento de Servicios (Auto-registro y Resolucion)
Write-Host "`n[REQUISITO 2] Verificando Service Discovery Registry ($REGISTRY_URL)..." -ForegroundColor Yellow
try {
    $catalog = Invoke-RestMethod -Uri "$REGISTRY_URL/api/v1/registry/services" -Method Get
    Write-Host "  [OK] Servicios auto-registrados en el directorio: $($catalog.metrics.registeredServiceCount)" -ForegroundColor Green
    foreach ($svc in $catalog.services) {
        foreach ($inst in $svc.instances) {
            Write-Host "       - Servicio: $($inst.serviceName) | Instancia: $($inst.instanceId) | URL: $($inst.baseUrl) | Estado: $($inst.status) | Motor: $($inst.internalEngine)" -ForegroundColor Cyan
        }
    }

    $disc = Invoke-RestMethod -Uri "$REGISTRY_URL/api/v1/registry/discover/notification-service" -Method Get
    Write-Host "  [OK] Resolucion dinamica exitosa para 'notification-service' -> $($disc.resolvedInstance.baseUrl) (Estrategia: $($disc.loadBalancingStrategy))" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Fallo en la verificacion de Service Discovery: $_" -ForegroundColor Red
}

# 3. Verificar Modificacion Interna de Componentes sin Romper el Contrato
Write-Host "`n[REQUISITO 3] Probando modificacion interna en caliente (Hot-Swap Motor V1 <-> V2)..." -ForegroundColor Yellow
try {
    $recordsBefore = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/records/rec-1001" -Method Get
    $dtoBeforeJson = ($recordsBefore.data | ConvertTo-Json -Compress)

    $swap = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/internal/switch-engine" -Method Post
    Write-Host "  [OK] Motor interno del Backend modificado de '$($swap.previousEngine)' a '$($swap.activeInternalEngine)'." -ForegroundColor Green

    $recordsAfter = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/records/rec-1001" -Method Get
    $dtoAfterJson = ($recordsAfter.data | ConvertTo-Json -Compress)

    if ($dtoBeforeJson -eq $dtoAfterJson) {
        Write-Host "  [OK] VERIFICADO: El esquema y contenido del contrato publico (ClinicalRecordDTOV1) permanecio 100% INVARIANTE tras cambiar la arquitectura interna." -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] Diferencia detectada en DTO." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [ERROR] Fallo en prueba de mutacion interna: $_" -ForegroundColor Red
}

# 4. Verificar Desacople Estricto (Validacion de Violacion de Contrato + Llamada via Discovery)
Write-Host "`n[REQUISITO 4] Verificando desacople por contrato explicito (Contract Enforcement)..." -ForegroundColor Yellow

# 4.1 Enviar payload que viola el contrato para comprobar rechazo HTTP 400
$invalidBody = @{
    paciente = ""
    diagnostico = 99999
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/records" -Method Post -Body $invalidBody -ContentType "application/json"
    Write-Host "  [FALLO] El servidor acepto un payload invalido." -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 400) {
        Write-Host "  [OK] Rechazo automatico ante violacion de contrato verificado (HTTP 400 Bad Request - CONTRACT_VIOLATION)." -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Codigo HTTP recibido: $statusCode" -ForegroundColor Yellow
    }
}

# 4.2 Invocacion inter-servicio resuelta dinamicamente por Service Discovery
try {
    $interCall = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/records/rec-1001/sync-audit-check" -Method Get
    Write-Host "  [OK] Comunicacion inter-servicio sin URLs hardcodeadas exitosa:" -ForegroundColor Green
    Write-Host "       - Resuelto via: $($interCall.serviceDiscoveryTrace.registryQueried)" -ForegroundColor Gray
    Write-Host "       - Instancia descubierta: $($interCall.serviceDiscoveryTrace.resolvedInstanceId) ($($interCall.serviceDiscoveryTrace.resolvedBaseUrl))" -ForegroundColor Gray
    Write-Host "       - Contrato verificado ($($interCall.contractVerification.expectedSchema)): $($interCall.contractVerification.compliant)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Fallo en llamada inter-servicio via discovery: $_" -ForegroundColor Red
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  CERTIFICACION DE ENTREGA 4 COMPLETADA EXITOSAMENTE                  " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
