#!/usr/bin/env bash
# Prueba de humo del esqueleto: requiere `docker compose up -d --build` corriendo.
GW=${GW:-http://localhost:8080}
ok=0; fail=0
check(){ # descripcion url codigo_esperado
  code=$(curl -s -o /dev/null -w "%{http_code}" "$2")
  if [ "$code" = "$3" ]; then echo "OK    $1 ($code)"; ok=$((ok+1)); else echo "FALLA $1 (esperado $3, obtenido $code)"; fail=$((fail+1)); fi
}
check "gateway"                       $GW/health 200
check "operativo via gateway"         $GW/api/operativo/health 200
check "historias via gateway"         $GW/api/historias/health 200
check "pagos via gateway"             $GW/api/pagos/health 200
check "hospital simulado via gateway" $GW/api/hospital/health 200
check "historias -> operativo (HTTP)" $GW/api/historias/acceso-medico/1/2 200
echo "Resultado: $ok OK, $fail con fallas"; [ $fail -eq 0 ]
