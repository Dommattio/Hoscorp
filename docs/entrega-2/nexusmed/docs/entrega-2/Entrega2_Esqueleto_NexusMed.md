---
title: "Entrega 2: Esqueleto distribuido"
subtitle: "Programación Distribuida y Componentes · Proyecto Final — NexusMed"
---

# Datos generales

| | |
|---|---|
| **Grupo N°** | 4 |
| **Integrantes** | Donato Mattio y Cristian Carivali |
| **Proyecto** | NexusMed — Plataforma distribuida de gestión e integración de historias clínicas (HosCorp) |
| **Repositorio** | (completar URL) |
| **Tag / Release de esta entrega** | v2-esqueleto-distribuido (pendiente de creación) |
| **Fecha de entrega** | (completar) |

# Checklist de la entrega

| Requisito de la entrega | Cumple | Justificación breve / evidencia |
|---|---|---|
| Hay al menos dos nodos separados funcionando (contenedores o procesos distintos). | ☒ Sí ☐ No | 11 contenedores definidos en `docker-compose.yml`: gateway Nginx, 4 servicios FastAPI (operativo, historias clínicas, pagos, hospital simulado), Redis y 3 instancias PostgreSQL. Cada servicio es un proceso propio con su `/health` y se comunican por HTTP (p. ej. historias clínicas consulta al operativo y al hospital simulado). Verificación: `./tests/smoke.sh` y `docker compose ps`. |
| La separación es real: cada nodo puede iniciarse/detenerse de forma independiente. | ☒ Sí ☐ No | `docker compose stop svc-operativo` deja operativo caído mientras pagos, historias y hospital siguen respondiendo; historias detecta la caída (`/dependencias` → `down`) y deniega el acceso médico con HTTP 503 (falla cerrada). Al hacer `start`, el acceso vuelve a 200. Lo mismo con `pg-pagos`: solo pagos pasa a `degraded`. Comandos y salida esperada en el README, sección «Demostración de independencia». |
| Se identificó el modelo de ejecución elegido (cliente-servidor / P2P / microservicios). | ☒ Sí ☐ No | **Microservicios**, con un API Gateway como único punto de entrada y una base de datos por responsabilidad (operativa, clínica, pagos). Tabla de nodos en el README. |
| El modelo de ejecución elegido está justificado en función del caso de uso. | ☒ Sí ☐ No | (1) El cobro no debe acceder a datos clínicos: nodo, red y base propios lo hacen verificable. (2) Las importaciones externas son lentas y falibles: se aíslan de las consultas del paciente. (3) Cada responsabilidad se detiene, despliega y escala por separado. (4) P2P no aplica: hay autoridad central de identidad, permisos y auditoría. (5) Un monolito cliente-servidor no permitiría demostrar aislamiento ni fallas parciales. Costo asumido: mayor complejidad operativa; sin alta disponibilidad al correr en un solo equipo. |
| El README explica cómo levantar el entorno localmente (paso a paso). | ☒ Sí ☐ No | `README.md` en la raíz: requisitos (solo Docker Compose v2), 4 pasos (clonar, `docker compose up -d --build`, `docker compose ps`, prueba de humo), cómo apagar, estructura del repo y qué queda fuera de alcance. |

# Evidencia adicional

| Evidencia | Estado |
|---|---|
| Código del esqueleto | Carpeta `services/`, `infrastructure/gateway/`, `docker-compose.yml` |
| README | `README.md` |
| Prueba de humo | `tests/smoke.sh` |
| Capturas de `docker compose ps` y del `smoke.sh` | **Pendiente: tomarlas en la máquina del grupo** |
| Tag `v2-esqueleto-distribuido` | Pendiente de creación |

# Aislamiento de redes (resumen)

- `net-servicios`: gateway, operativo, historias clínicas, hospital simulado y Redis.
- `net-pagos`: gateway y pagos. Pagos no pertenece a `net-servicios`, por lo que no alcanza a historias clínicas, operativo ni Redis.
- `net-db-*` (internas): cada base solo es accesible por su servicio.
- Solo el Gateway publica un puerto al host (8080).

# Actualización respecto de entregas anteriores

El esqueleto implementa las decisiones de la Entrega 1: base PostgreSQL propia para pagos, Gateway Nginx, API hospitalaria simulada y conector de integración dentro del servicio clínico. Quedan para entregas siguientes: JWT y roles, modelos y migraciones, Celery, frontends React y lógica de pagos.
