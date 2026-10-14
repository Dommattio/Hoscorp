# Detener infraestructura completa en Docker
Write-Host "Deteniendo contenedores de Hoscorp..." -ForegroundColor Yellow
docker compose down
Write-Host "Contenedores y redes detenidos correctamente." -ForegroundColor Green
