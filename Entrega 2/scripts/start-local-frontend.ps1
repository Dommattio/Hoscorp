# Iniciar Nodo 2 localmente sirviendo el frontend
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\..\frontend\src"
Write-Host "Iniciando Nodo 2 (Frontend) localmente en puerto 3000..." -ForegroundColor Cyan

# Usa npx serve o python si está disponible
try {
    npx -y serve -p 3000 .
} catch {
    python -m http.server 3000
}
