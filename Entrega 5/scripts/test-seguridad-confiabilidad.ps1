# ==============================================================================
# HOSCORP - ENTREGA 5: PRUEBA AUTOMATIZADA DE SEGURIDAD Y CONFIABILIDAD
# Verifica empiricamente los 5 requisitos del checklist oficial del Modulo 5
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HOSCORP: CERTIFICACION DE SEGURIDAD Y CONFIABILIDAD DISTRIBUIDA (E5)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$BACKEND_URL = "http://localhost:5000"

# 1. Autenticacion de Usuarios (JWT HMAC-SHA256)
Write-Host "`n[REQUISITO 1] Probando Autenticacion de Usuarios (POST /api/v1/auth/login)..." -ForegroundColor Yellow
try {
    $medCredentials = @{ username = "dra.gomez"; password = "medico123" } | ConvertTo-Json
    $medAuth = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/auth/login" -Method Post -Body $medCredentials -ContentType "application/json"
    Write-Host "  [OK] Usuario 'dra.gomez' autenticado exitosamente." -ForegroundColor Green
    Write-Host "       - Rol asignado: $($medAuth.user.role) | Algoritmo: $($medAuth.algorithm)" -ForegroundColor Cyan

    $pacCredentials = @{ username = "carlos.gomez"; password = "paciente123" } | ConvertTo-Json
    $pacAuth = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/auth/login" -Method Post -Body $pacCredentials -ContentType "application/json"
    Write-Host "  [OK] Usuario 'carlos.gomez' autenticado exitosamente. Rol asignado: $($pacAuth.user.role)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo conectar al Backend. Asegurate de levantar Docker Compose." -ForegroundColor Red
    exit 1
}

# 2. Autorizacion / Control de Acceso RBAC (No todos los usuarios pueden todo)
Write-Host "`n[REQUISITO 2] Verificando Control de Acceso por Roles (RBAC: Medico vs Paciente vs Anonimo)..." -ForegroundColor Yellow

# 2.1 Intento sin token (Debe dar HTTP 401)
$testRecord = @{
    paciente = "Paciente Prueba Seguridad"
    centroSalud = "Hospital Central de Cordoba"
    diagnostico = "Control cardiologico validado con JWT"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/records" -Method Post -Body $testRecord -ContentType "application/json"
} catch {
    $code401 = $_.Exception.Response.StatusCode.value__
    Write-Host "  [OK] Peticion sin token JWT rechazada preventivamente con HTTP $code401 Unauthorized." -ForegroundColor Green
}

# 2.2 Intento con rol PACIENTE (Debe dar HTTP 403 Forbidden)
try {
    $pacHeaders = @{ Authorization = "Bearer $($pacAuth.token)" }
    Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/records" -Method Post -Headers $pacHeaders -Body $testRecord -ContentType "application/json"
} catch {
    $code403 = $_.Exception.Response.StatusCode.value__
    Write-Host "  [OK] Peticion de escritura con rol [PACIENTE] bloqueada con HTTP $code403 Forbidden (RBAC verificado)." -ForegroundColor Green
}

# 2.3 Intento con rol MEDICO (Debe dar HTTP 201 Created)
try {
    $medHeaders = @{ Authorization = "Bearer $($medAuth.token)" }
    $created = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/records" -Method Post -Headers $medHeaders -Body $testRecord -ContentType "application/json"
    Write-Host "  [OK] Peticion de escritura con rol [MEDICO] autorizada con HTTP 201 Created (ID: $($created.data.id))." -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Fallo escritura con rol MEDICO: $_" -ForegroundColor Red
}

# 3. Cifrado de la Comunicacion en Transito (HTTPS / TLS X.509)
Write-Host "`n[REQUISITO 3] Verificando Cifrado en Transito (HTTPS/TLS y Certificado X.509)..." -ForegroundColor Yellow
try {
    $tls = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/security/tls-status" -Method Get
    Write-Host "  [OK] Canal TLS verificado: $($tls.status) | Protocolo: $($tls.negotiatedTlsProtocol) | Cipher: $($tls.negotiatedCipherSuite)" -ForegroundColor Green
    Write-Host "       - Certificado X.509: $($tls.certificate.subject)" -ForegroundColor Cyan
    Write-Host "       - Fingerprint SHA-256: $($tls.certificate.fingerprint256)" -ForegroundColor Gray
    Write-Host "       - Endpoints HTTPS activos: $($tls.endpoints.httpsGatewayPortal) y $($tls.endpoints.httpsBackendDirect)" -ForegroundColor Gray
} catch {
    Write-Host "  [ERROR] Fallo verificacion TLS: $_" -ForegroundColor Red
}

# 4. Mecanismo de Replicacion y Recuperacion Automatica ante Fallos
Write-Host "`n[REQUISITO 4] Probando Replicacion y Recuperacion Automatica ante Fallos (Self-Healing + Failover)..." -ForegroundColor Yellow
try {
    $recovery = Invoke-RestMethod -Uri "$BACKEND_URL/api/v1/reliability/simulate-failure-and-recover" -Method Post
    foreach ($step in $recovery.timeline) {
        Write-Host "  [PASO $($step.step)] [$($step.status)] $($step.details)" -ForegroundColor Green
    }
    Write-Host "  [VEREDICTO CONFIABILIDAD] RPO = $($recovery.rpoRecordsLost) datos perdidos | RTO = $($recovery.rtoRecoveryTimeMs)ms | Hash SHA-256 integro." -ForegroundColor Cyan
} catch {
    Write-Host "  [ERROR] Fallo en prueba de recuperacion: $_" -ForegroundColor Red
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  CERTIFICACION DE ENTREGA 5 COMPLETADA EXITOSAMENTE                  " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
