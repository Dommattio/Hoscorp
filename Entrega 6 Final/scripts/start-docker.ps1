# Iniciar el entorno completo de Entrega 6 Final con Docker Compose
Write-Host "Iniciando contenedores de Hoscorp Entrega 6 Final (Las 6 Capas Integradas)..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "`nVerificando contenedores levantados:" -ForegroundColor Yellow
docker ps --filter "name=hoscorp"

Write-Host "`n[Portal Web HTTPS/TLS]:    https://localhost:3443" -ForegroundColor Green
Write-Host "[Portal Web HTTP]:         http://localhost:3000" -ForegroundColor Green
Write-Host "[Demo E2E 6 Capas]:        .\scripts\demo-en-vivo-e2e.ps1" -ForegroundColor Green
