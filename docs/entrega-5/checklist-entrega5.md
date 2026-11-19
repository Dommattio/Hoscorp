# Certificacion de Entrega - Entrega 5: Seguridad y confiabilidad
## Modulo 5 - Seguridad y confiabilidad en entornos distribuidos
**Programacion Distribuida y Componentes - Proyecto Final**

---

> **Objetivo de la entrega:** Agregar autenticacion y autorizacion de usuarios, cifrado de la comunicacion en transito, y un mecanismo de replicacion o recuperacion ante fallos, junto con un informe corto de amenazas consideradas.
> 
> **Que evalua esta entrega:** Que el grupo haya pensado que pasa cuando algo falla o es atacado, no solo el camino feliz.

---

### Datos generales

* **Grupo N°:** 2
* **Integrantes:** Donato Mattio, Cristian Carilavi
* **Proyecto:** Hoscorp - Sistema centralizado de gestion unificada de historias clinicas
* **Tag / Release de esta entrega:** `v1-seguridad`
* **Fecha de entrega:** 19/11/2026

---

### Checklist de la entrega

| Requisito de la entrega | Cumple | Justificacion breve / evidencia |
| :--- | :---: | :--- |
| **Hay autenticacion de usuarios implementada.** | [X] Si / [ ] No | Se implemento autenticacion basada en **JWT (JSON Web Tokens) firmados criptograficamente con HMAC-SHA256 (`HS256`)** a traves del endpoint `POST /api/v1/auth/login`. Las contraseñas se validan mediante hashes `SHA-256` contra la base de identidades (`dra.gomez`, `carlos.gomez`, `admin.hoscorp`). El token emitido incluye claims de identidad (`sub`, `username`, `role`, `permissions`, `iat`, `exp`) y se verifica en cada solicitud protegida mediante la cabecera `Authorization: Bearer <token>`, rechazando peticiones sin token o con firma invalida con **`HTTP 401 Unauthorized`**. |
| **Hay autorizacion / control de acceso implementado (no todos los usuarios pueden todo).** | [X] Si / [ ] No | Se implemento un middleware de **Control de Acceso Basado en Roles (RBAC)** con tres roles estrictamente segregados: **1) `MEDICO`** (`dra.gomez`), autorizado para leer, crear (`POST /api/v1/records`) y actualizar historias clinicas (`PUT /api/v1/records/:id`); **2) `PACIENTE`** (`carlos.gomez`), restringido exclusivamente a **Solo Lectura** (si intenta crear o modificar un diagnostico medico, el middleware bloquea la operacion con **`HTTP 403 Forbidden - FORBIDDEN_INSUFFICIENT_ROLE`** y emite una alerta de seguridad a RabbitMQ); y **3) `ADMIN_AUDITOR`** (`admin.hoscorp`), habilitado para administracion, auditoria y pruebas de confiabilidad. |
| **La comunicacion entre componentes esta cifrada en transito (HTTPS/TLS).** | [X] Si / [ ] No | Se generaron e integraron certificados **X.509 v3 RSA-2048 con firma SHA-256** (`certs/hoscorp.crt` y `certs/hoscorp.key`, `CN=hoscorp.local`). El Gateway Frontend Nginx expone **HTTPS/TLS 1.2 y 1.3 en el puerto `3443`** (`https://localhost:3443`), y el tramo de red interna entre el Gateway Nginx y el Backend Clinico viaja cifrado sobre TLS hacia **`https://backend:5443`** (`proxy_pass https://backend:5443/api/`). El estado criptografico, cipher suite y huella SHA-256 del certificado son verificables en vivo en `GET /api/v1/security/tls-status`. |
| **Hay un mecanismo de replicacion o recuperacion ante fallos implementado y probado.** | [X] Si / [ ] No | Se implemento un doble mecanismo de confiabilidad: **1) Replicacion Sincrona en Espejo con Auto-Recuperacion (*Self-Healing Storage*):** cada escritura en el almacen primario (`records.json`) se replica atomicamente en `records.replica.json` junto con un manifiesto de integridad `SHA-256`. Ante corrupcion o perdida del archivo primario, el motor detecta la falla y restaura automaticamente el estado integro desde la replica con **`RPO = 0` (cero datos perdidos) y `RTO < 50ms`**; **2) Failover Automatico de Servicios:** `notification-service` registra una instancia `PRIMARY` y una `REPLICA_STANDBY` en el `service-registry`, conmutando el trafico automaticamente si cae la primaria. |
| **Se incluyo un informe corto de amenazas consideradas (que se protegio y de que).** | [X] Si / [ ] No | Se elaboro el documento [`docs/informe-amenazas-y-recuperacion.md`](./informe-amenazas-y-recuperacion.md) bajo la metodologia **STRIDE**, detallando para cada activo critico de Hoscorp (historias clinicas, canales de red, identidad medica y disponibilidad del servicio) que amenaza se considero, que control tecnico la mitiga y como verificar empiricamente que el ataque o fallo es neutralizado. |

---

### Evidencia adicional

**Link al informe de amenazas y a la prueba de recuperacion ante fallos:**

* **Informe de Amenazas Consideradas (STRIDE) y Prueba de Recuperacion:**
  * [`docs/informe-amenazas-y-recuperacion.md`](./informe-amenazas-y-recuperacion.md)
* **Certificacion Imprimible Oficial (HTML listo para exportar a PDF con Ctrl + P):**
  * [`docs/certificacion-entrega-5.html`](./certificacion-entrega-5.html)
* **Scripts Automatizados de Prueba (Seguridad JWT/RBAC/TLS + Recuperacion ante Fallos):**
  * PowerShell: `.\scripts\test-seguridad-confiabilidad.ps1`
  * Node.js multiplataforma: `node .\scripts\test-seguridad-confiabilidad.js`
* **Accesos en Vivo al Laboratorio de Seguridad y Confiabilidad:**
  * Portal Web HTTPS/TLS: `https://localhost:3443` *(o `http://localhost:3000`)*
  * Estado Criptografico TLS / X.509: `https://localhost:5443/api/v1/security/tls-status`
  * Estado de Replicacion Primaria y Espejo: `http://localhost:5000/api/v1/reliability/status`

---

### Espacio para el docente

* **Nota:** _____ / 10
* **Corregido por:** __________________________________
* **Fecha de correccion:** _____ / _____ / _________

**Observaciones:**  
```text



```
