# Iniciar infraestructura completa en Docker
Write-Host "Levantando infraestructura de Hoscorp (Entrega 2)..." -ForegroundColor Cyan
docker compose up -d --build
Write-Host "Entorno iniciado con éxito." -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Yellow
Start-Process "http://localhost:3000"
