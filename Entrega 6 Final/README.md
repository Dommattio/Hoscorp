# Hoscorp — Entrega 6 Final: Integracion de los Modulos, Demo en Vivo y Escalabilidad
> **Cierre Integrador del Proyecto Final · Programacion Distribuida y Componentes**  
> **Grupo 2:** Donato Mattio & Cristian Carilavi  
> **Tag / Release:** `v6-final`  
> **Fecha:** 19/11/2026

[![Estado: Cierre Completo](https://img.shields.io/badge/Entrega%20Final-6%20Capas%20Integradas-success.svg)](#)
[![Infraestructura: 5 Nodos](https://img.shields.io/badge/1.%20Infraestructura-5%20Contenedores-blue.svg)](#)
[![Comunicacion: REST + RabbitMQ + OCC](https://img.shields.io/badge/2.%20Comunicaci%C3%B3n-REST%20%2B%20AMQP%20%2B%20OCC-orange.svg)](#)
[![Middleware: OpenAPI + Discovery](https://img.shields.io/badge/3.%20Middleware-OpenAPI%203.0%20%2B%20Discovery-purple.svg)](#)
[![Seguridad: JWT + RBAC + TLS 1.3](https://img.shields.io/badge/4.%20Seguridad-JWT%20%2B%20RBAC%20%2B%20TLS%201.3-green.svg)](#)
[![Escalabilidad: Cache L1 + Round-Robin](https://img.shields.io/badge/5.%20Escalabilidad-Cache--Aside%20%2B%20Scale--Out-teal.svg)](#)

---

## Descripcion y Objetivo del Cierre Integrador

Esta **Entrega 6 Final** consolida e integra en un unico entorno funcional las **seis capas arquitectonicas** construidas incrementalmente a lo largo del semestre para **Hoscorp** (Sistema Centralizado de Gestion Unificada de Historias Clinicas):

| Capa / Modulo | Implementacion en `Entrega 6 Final` | Evidencia Verificable en Vivo |
| :--- | :--- | :--- |
| **1. Arquitectura 4+1 (Modulo 1)** | Separacion del dominio clinico, auditoria, descubrimiento y puerta de enlace web bajo soberania del paciente. | Documentada en `/docs/entrega-1/` y reflejada en los 5 servicios. |
| **2. Infraestructura (Modulo 2)** | 5 contenedores Docker fisicamente aislados con `Dockerfile` propio, PID/namespaces separados y volumenes persistentes. | `docker ps --filter "name=hoscorp"` y `/health` en cada nodo. |
| **3. Comunicacion y Concurrencia (Modulo 3)** | Canal sincrono HTTP/REST, canal asincrono RabbitMQ (`hoscorp.events`) y Control de Concurrencia Optimista (`OCC` con rechazo `HTTP 409 Conflict`). | Panel OCC en UI y cola `hoscorp.notifications.queue`. |
| **4. Middleware y Contratos (Modulo 4)** | Contratos explicitos **OpenAPI 3.0.3**, patron **Adapter/DTO** con *Hot-Swap* de motor interno (`V1 Plano` <-> `V2 EHR SHA-256`) y **Service Registry (:5002)** sin URLs hardcodeadas. | `GET /api/v1/contract`, `contracts/*.yaml` y `GET /api/v1/registry/services`. |
| **5. Seguridad y Confiabilidad (Modulo 5)** | Autenticacion **JWT (`HMAC-SHA256`)**, autorizacion **RBAC** (`MEDICO`, `PACIENTE` bloqueado con `403`, `ADMIN_AUDITOR`), cifrado **HTTPS/TLS 1.3 X.509** (`:3443` y `:5443`) y **Replicacion en Espejo con Auto-Recuperacion (`RPO=0`)**. | `POST /api/v1/auth/login`, `https://localhost:3443` y `/api/v1/reliability/simulate-failure-and-recover`. |
| **6. Patrones y Escalabilidad (Modulo 6)** | **Cache-Aside L1** con invalidacion automatica en escritura (*Write-Invalidate*), **Circuit Breaker** y **Escalabilidad Horizontal Dinamica (*Scale-Out*)** con balanceo de carga **Round-Robin**. | `POST /api/v1/scalability/scale-cluster`, `/api/v1/scalability/metrics` y `/api/v1/demo/run-e2e-all-layers`. |

---

## Guia Rapida para la Demo en Vivo (Menos de 5 Minutos)

### Paso 1: Levantar las 6 Capas Integradas

Abre una terminal en la carpeta `Entrega 6 Final` y ejecuta:

```powershell
docker compose up -d --build
```

### Paso 2: Ejecutar el Script Maestro de Demo en Vivo de Punta a Punta

```powershell
.\scripts\demo-en-vivo-e2e.ps1
```
*(O en Node.js multiplataforma: `node .\scripts\demo-en-vivo-e2e.js`)*

Este script recorre automaticamente las 6 capas, prueba la auto-recuperacion ante corrupcion de disco (`RPO = 0`), escala horizontalmente el clúster a 4 instancias activas, verifica la distribucion *Round-Robin* y consulta el `Hit Ratio` de la Cache L1.

### Paso 3: Demostracion Visual en el Portal Web Cifrado

1. Abre [https://localhost:3443](https://localhost:3443) (HTTPS/TLS 1.3) o [http://localhost:3000](http://localhost:3000).
2. Haz clic en el boton **"Ejecutar Demo en Vivo de Punta a Punta (Las 6 Capas Integradas)"**.
3. Haz clic en **"Escalar Clúster Horizontalmente (4 Nodos + Balanceo Round-Robin)"** y observa en la tabla del Service Registry como las 4 instancias reciben trafico balanceado equitativamente.
4. Prueba el cambio de rol entre **`Dra. Gomez [MEDICO]`** y **`Carlos Gomez [PACIENTE - 403 en Escritura]`** y la simulacion de **Corrupcion y Auto-Recuperacion (`RPO = 0`)**.

---

## Documentacion Oficial de la Entrega Final

| Documento | Ubicacion | Descripcion |
| :--- | :--- | :--- |
| **Certificacion Imprimible (HTML/PDF)** | [`docs/certificacion-entrega-6-final.html`](docs/certificacion-entrega-6-final.html) | Hoja oficial de 2 paginas lista para imprimir o guardar como PDF (`Ctrl + P`). |
| **Checklist Oficial Completado** | [`docs/checklist-entrega6-final.md`](docs/checklist-entrega6-final.md) | Tabla oficial de cierre del proyecto con justificaciones y evidencias de las 6 capas. |

---

<p align="center">
  <b>Hoscorp</b> · Grupo 2 (Donato Mattio & Cristian Carilavi) · Programacion Distribuida y Componentes · 2026
</p>
