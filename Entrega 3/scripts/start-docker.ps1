# Iniciar el entorno completo de Entrega 3 con Docker Compose
Write-Host "Iniciando contenedores de Hoscorp Entrega 3..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "`nVerificando contenedores levantados:" -ForegroundColor Yellow
docker ps --filter "name=hoscorp"

Write-Host "`n[Portal Web]: http://localhost:3000" -ForegroundColor Green
Write-Host "[Backend API]: http://localhost:5000/health" -ForegroundColor Green
Write-Host "[Notification Service]: http://localhost:5001/health" -ForegroundColor Green
Write-Host "[RabbitMQ Dashboard]: http://localhost:15672 (guest/guest)" -ForegroundColor Green
