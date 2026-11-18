# Iniciar el entorno completo de Entrega 4 con Docker Compose
Write-Host "Iniciando contenedores de Hoscorp Entrega 4 (Contratos y Service Discovery)..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "`nVerificando contenedores levantados:" -ForegroundColor Yellow
docker ps --filter "name=hoscorp"

Write-Host "`n[Portal Web & Laboratorio]: http://localhost:3000" -ForegroundColor Green
Write-Host "[Service Registry API]:     http://localhost:5002/api/v1/registry/services" -ForegroundColor Green
Write-Host "[Contrato Backend OpenAPI]: http://localhost:5000/api/v1/contract" -ForegroundColor Green
Write-Host "[Contrato Notif OpenAPI]:   http://localhost:5001/api/v1/contract" -ForegroundColor Green
Write-Host "[RabbitMQ Dashboard]:       http://localhost:15672 (guest/guest)" -ForegroundColor Green
