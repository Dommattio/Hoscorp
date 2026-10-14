# NexusMed — Esqueleto distribuido (Entrega 2)

Plataforma distribuida de gestión e integración de historias clínicas (Grupo 4 · HosCorp).
Esta entrega es un **esqueleto real**: cada servicio es un proceso/contenedor independiente con su propio
`/health`, y los servicios se comunican por HTTP. No hay lógica de negocio todavía (Entregas 3 en adelante).
Todos los datos son ficticios.

## Modelo de ejecución: microservicios

| Nodo (contenedor) | Rol | Puerto interno | Base propia |
|---|---|---|---|
| `gateway` (Nginx) | Punto único de entrada, enruta `/api/<servicio>/` | 80 → **8080** en el host | — |
| `svc-operativo` | Padrón, turnos, relación asistencial, identidad | 8001 | `pg-operativo` |
| `svc-historias-clinicas` | Registros clínicos, acceso, auditoría | 8002 | `pg-clinico` + `redis` |
| `svc-pagos` | Cobros simulados, aislado de lo clínico | 8003 | `pg-pagos` |
| `hospital-simulado` | API de una institución externa (datos ficticios, fallas inyectables) | 8004 | — |
| `redis` | Broker para las tareas asíncronas (Celery, Entrega 3+) | 6379 | — |
| `pg-operativo`, `pg-clinico`, `pg-pagos` | PostgreSQL 16, una por responsabilidad | 5432 | — |

**Por qué microservicios** (y no cliente-servidor monolítico ni P2P):
- El caso de uso tiene tres responsabilidades con requisitos distintos: lo administrativo, lo clínico y el cobro.
  El cobro **no debe** tocar datos clínicos; separarlo en su propio nodo, red y base lo garantiza de forma verificable.
- Las importaciones desde instituciones externas son lentas y pueden fallar; se aíslan del servicio que atiende
  consultas, así una caída externa no frena la lectura de historias.
- Cada servicio se puede detener, reiniciar y escalar por separado (se demuestra más abajo).
- P2P no aplica: hay autoridad central de identidad, permisos y auditoría, y un único repositorio clínico por paciente.
- Costo asumido: más complejidad operativa y comunicación por red. En esta etapa corre en una sola computadora,
  así que se demuestra comunicación distribuida pero **no alta disponibilidad**.

## Cómo levantar el entorno (paso a paso)

Requisitos: Docker Desktop (o Docker Engine) con Docker Compose v2. Nada más.

```bash
# 1. Clonar el repositorio y entrar
git clone <URL-del-repo> nexusmed && cd nexusmed

# 2. Construir y levantar los 11 contenedores
docker compose up -d --build

# 3. Verificar que todos estén "running"/"healthy"
docker compose ps

# 4. Prueba de humo (consulta cada nodo a través del gateway)
./tests/smoke.sh
# o a mano:
curl http://localhost:8080/api/operativo/health
curl http://localhost:8080/api/historias/health
curl http://localhost:8080/api/pagos/health
curl http://localhost:8080/api/hospital/health
curl http://localhost:8080/api/historias/dependencias
```

Swagger de cada servicio: agregar temporalmente `ports: ["8001:8001"]` al servicio y abrir `http://localhost:8001/docs`.

Apagar: `docker compose down` (conserva datos) · `docker compose down -v` (borra volúmenes).

## Demostración de independencia de los nodos

```bash
# Detener solo el servicio operativo: el resto sigue vivo
docker compose stop svc-operativo
curl http://localhost:8080/api/pagos/health              # 200: pagos no se entera
curl http://localhost:8080/api/historias/dependencias    # operativo: "down"
curl -i http://localhost:8080/api/historias/acceso-medico/1/2   # 503: falla cerrada

# Volver a iniciarlo
docker compose start svc-operativo
curl http://localhost:8080/api/historias/acceso-medico/1/2      # 200

# Caída de una base: solo afecta a su servicio
docker compose stop pg-pagos
curl http://localhost:8080/api/pagos/health              # "degraded", db: down
curl http://localhost:8080/api/historias/health          # sigue "ok"
docker compose start pg-pagos
```

## Aislamiento de redes

- `net-servicios`: gateway, operativo, historias, hospital simulado, redis.
- `net-pagos`: gateway y pagos. **Pagos no está en `net-servicios`**, por lo que no alcanza a historias clínicas, operativo ni Redis.
- `net-db-operativo`, `net-db-clinico`, `net-db-pagos` (`internal: true`): cada base solo es accesible por su servicio y sin salida a internet.
- Solo el Gateway publica un puerto al host (8080).

## Estructura del repositorio

```
├── docker-compose.yml
├── infrastructure/gateway/nginx.conf
├── services/{operativo,historias-clinicas,pagos,hospital-simulado}/   # app/, Dockerfile, requirements.txt
├── frontend/            # portales React (Entrega 4+)
├── contracts/           # OpenAPI versionado (Entrega 3)
├── tests/smoke.sh
└── docs/{entrega-0,entrega-1,entrega-2}/
```

## Qué NO está todavía (alcance de entregas siguientes)
Autenticación JWT y roles, modelos y migraciones de datos, importación asíncrona con Celery, frontends React,
lógica de pagos. Las credenciales de las bases (`nexus_dev`) son solo de desarrollo local.
