# Iniciar el entorno completo de Entrega 5 con Docker Compose
Write-Host "Iniciando contenedores de Hoscorp Entrega 5 (Seguridad JWT/RBAC/TLS y Confiabilidad)..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "`nVerificando contenedores levantados:" -ForegroundColor Yellow
docker ps --filter "name=hoscorp"

Write-Host "`n[Portal Web HTTPS/TLS]:    https://localhost:3443" -ForegroundColor Green
Write-Host "[Portal Web HTTP]:         http://localhost:3000" -ForegroundColor Green
Write-Host "[Backend HTTPS Directo]:   https://localhost:5443/api/v1/security/tls-status" -ForegroundColor Green
Write-Host "[Service Registry API]:    http://localhost:5002/api/v1/registry/services" -ForegroundColor Green
Write-Host "[RabbitMQ Dashboard]:      http://localhost:15672 (guest/guest)" -ForegroundColor Green
