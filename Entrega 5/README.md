# Hoscorp — Entrega 5: Seguridad y Confiabilidad en Entornos Distribuidos
> **Modulo 5: Seguridad y confiabilidad en entornos distribuidos · Programacion Distribuida y Componentes**  
> **Grupo 2:** Donato Mattio & Cristian Carilavi  
> **Tag / Release:** `v1-seguridad`  
> **Fecha:** 19/11/2026

[![Estado: Completo](https://img.shields.io/badge/Entrega%205-Completa-success.svg)](#)
[![Auth: JWT HMAC-SHA256](https://img.shields.io/badge/Autenticaci%C3%B3n-JWT%20HS256-blue.svg)](#)
[![RBAC: 3 Roles](https://img.shields.io/badge/Autorizaci%C3%B3n-RBAC%20(403%20Forbidden)-purple.svg)](#)
[![TLS: X.509 RSA-2048](https://img.shields.io/badge/Cifrado%20en%20Tr%C3%A1nsito-HTTPS%20%2F%20TLS%201.3-green.svg)](#)
[![Confiabilidad: Self-Healing](https://img.shields.io/badge/Recuperaci%C3%B3n-Replica%20Mirror%20(RPO%3D0)-orange.svg)](#)

---

## Descripcion y Objetivo de la Entrega

El foco de esta quinta entrega es dotar a **Hoscorp** de mecanismos reales y demostrables de **seguridad y tolerancia a fallos**, evaluando que ocurre cuando el sistema es atacado o sufre una falla catastrofica:

1. **Autenticacion de Usuarios (`JWT HMAC-SHA256`):** Inicio de sesion en `POST /api/v1/auth/login` con validacion de contraseñas hasheadas (`SHA-256`) y emision de tokens firmados con expiracion temporal.
2. **Autorizacion y Control de Acceso Basado en Roles (`RBAC`):** Segregacion estricta entre los roles **`MEDICO`**, **`PACIENTE`** (restringido a Solo Lectura; bloqueado con **`HTTP 403 Forbidden`** al intentar crear o editar diagnosticos) y **`ADMIN_AUDITOR`**.
3. **Cifrado de la Comunicacion en Transito (`HTTPS / TLS 1.3`):** Certificados **X.509 v3 RSA-2048** integrados en `certs/hoscorp.crt` y `certs/hoscorp.key`. El Gateway Nginx expone HTTPS en el puerto `3443` y el tramo interno entre Nginx y el Backend Clinico viaja cifrado sobre TLS hacia `https://backend:5443`.
4. **Replicacion y Recuperacion Automatica ante Fallos (`Self-Healing Storage` + `Service Failover`):** Replicacion sincrona en espejo (`records.replica.json` con sello de integridad `SHA-256`) que restaura automaticamente el almacen primario ante corrupcion o borrado con **`RPO = 0`** y **`RTO < 50ms`**, sumado a la conmutacion automatica hacia la instancia replica (`notification-service-replica-02`) en el Service Registry.
5. **Informe Corto de Amenazas Consideradas (`STRIDE`):** Documentado en [`docs/informe-amenazas-y-recuperacion.md`](docs/informe-amenazas-y-recuperacion.md).

---

## Credenciales de Prueba para el Laboratorio de Seguridad (RBAC)

| Usuario (`username`) | Contraseña (`password`) | Rol Asignado | Permisos en el Sistema |
| :--- | :--- | :---: | :--- |
| `dra.gomez` | `medico123` | **`MEDICO`** | Lectura, creacion (`201 Created`) y actualizacion OCC (`200 OK`) de historias clinicas. |
| `carlos.gomez` | `paciente123` | **`PACIENTE`** | **Solo Lectura (`200 OK`)**. Recibe **`HTTP 403 Forbidden`** al intentar crear o modificar historias. |
| `admin.hoscorp` | `admin123` | **`ADMIN_AUDITOR`** | Administracion, auditoria, conmutacion de motores internos y pruebas de recuperacion. |
| *(Sin token JWT)* | - | **`ANONIMO`** | Recibe **`HTTP 401 Unauthorized`** en cualquier endpoint protegido. |

---

## Guia Paso a Paso para Levantar el Entorno

Abre una terminal en la carpeta `Entrega 5` y ejecuta:

```powershell
docker compose up -d --build
```

Verifica que los 5 contenedores esten en estado saludable:

```powershell
docker ps --filter "name=hoscorp"
```

### Accesos Principales:
* **Portal Web Cifrado (HTTPS / TLS 1.3):** [https://localhost:3443](https://localhost:3443) *(Aceptar certificado autofirmado X.509 en el navegador)*
* **Portal Web (HTTP con tramo interno TLS):** [http://localhost:3000](http://localhost:3000)
* **Backend Clinico HTTPS Directo:** [https://localhost:5443/api/v1/security/tls-status](https://localhost:5443/api/v1/security/tls-status)
* **Estado de Replicacion Primaria y Espejo:** [http://localhost:5000/api/v1/reliability/status](http://localhost:5000/api/v1/reliability/status)
* **Catalogo de Service Discovery (Primaria + Replica):** [http://localhost:5002/api/v1/registry/services](http://localhost:5002/api/v1/registry/services)

---

## Como Reproducir las Pruebas de Seguridad y Recuperacion ante Fallos

### Opcion A: Script Automatizado de Certificacion (PowerShell / Node.js)

Ejecuta en tu terminal:

```powershell
.\scripts\test-seguridad-confiabilidad.ps1
```
*(O en Node.js multiplataforma: `node .\scripts\test-seguridad-confiabilidad.js`)*

**Que verifica este script de forma automatica:**
1. Autentica a `dra.gomez` (`MEDICO`) y a `carlos.gomez` (`PACIENTE`) obteniendo sus tokens JWT firmados con `HMAC-SHA256`.
2. Intenta crear un registro sin token -> Verifica rechazo **`HTTP 401 Unauthorized`**.
3. Intenta crear un registro con el token de `PACIENTE` -> Verifica bloqueo **`HTTP 403 Forbidden`**.
4. Crea un registro con el token de `MEDICO` -> Verifica autorizacion **`HTTP 201 Created`** y replicacion en espejo.
5. Verifica el canal **HTTPS/TLS 1.3** y la huella `SHA-256` del certificado X.509.
6. Inyecta una corrupcion catastrofica en `records.json` y simula la caida del nodo primario de auditoria -> Verifica la **Auto-Recuperacion desde `records.replica.json` (`RPO = 0`)** y el **Failover automatico** hacia `notification-service-replica-02`.

---

### Opcion B: Laboratorio Interactivo en el Portal Web

1. Abre [https://localhost:3443](https://localhost:3443) o [http://localhost:3000](http://localhost:3000).
2. En el panel **"1. Autenticacion de Usuarios (JWT) y Autorizacion por Roles (RBAC)"**:
   * Haz clic en **"Ejecutar Prueba Empirica RBAC (201 Medico vs 403 Paciente vs 401 Sin Token)"**.
   * O selecciona el boton **`Carlos Gomez [Rol: PACIENTE - Solo Lectura]`** e intenta guardar o editar una historia clinica abajo para comprobar el bloqueo `HTTP 403 Forbidden`.
3. En el panel **"2. Mecanismo de Replicacion y Recuperacion Automatica ante Fallos"**:
   * Haz clic en **"Simular Fallo / Corrupcion Catastrofica y Ejecutar Auto-Recuperacion"** para ver paso a paso la inyeccion de falla y la restauracion con `RPO = 0`.

---

## Documentacion Oficial de la Entrega 5

| Documento | Ubicacion | Descripcion |
| :--- | :--- | :--- |
| **Certificacion Imprimible (HTML/PDF)** | [`docs/certificacion-entrega-5.html`](docs/certificacion-entrega-5.html) | Hoja oficial de 2 paginas lista para imprimir o guardar como PDF (`Ctrl + P`). |
| **Informe de Amenazas (STRIDE) y Recuperacion** | [`docs/informe-amenazas-y-recuperacion.md`](docs/informe-amenazas-y-recuperacion.md) | Modelado de amenazas consideradas y documentacion de la prueba de recuperacion ante fallos. |
| **Checklist Oficial Completado** | [`docs/checklist-entrega5.md`](docs/checklist-entrega5.md) | Tabla oficial de requisitos completada con justificaciones y evidencias tecnicas. |

---

<p align="center">
  <b>Hoscorp</b> · Grupo 2 · Programacion Distribuida y Componentes · 2026
</p>
