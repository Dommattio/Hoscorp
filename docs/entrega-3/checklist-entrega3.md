# Certificacion de Entrega - Entrega 3: Comunicacion sincrona y asincrona
## Modulo 3 - Comunicacion y sincronizacion en sistemas distribuidos
**Programacion Distribuida y Componentes - Proyecto Final**

---

> **Objetivo de la entrega:** Agregar un canal sincrono y otro asincrono entre componentes del sistema, mas la resolucion demostrable de un caso de concurrencia (por ejemplo, dos escrituras simultaneas sobre el mismo recurso).
> 
> **Que evalua esta entrega:** Que el grupo entienda cuando corresponde cada semantica de comunicacion, no solo que el sistema "funcione".

---

### Datos generales

* **Grupo N°:** 2
* **Integrantes:** Donato Mattio, Cristian Carilavi
* **Proyecto:** Hoscorp - Sistema centralizado de gestion unificada de historias clinicas
* **Tag / Release de esta entrega:** `v1-comunicacion`
* **Fecha de entrega:** 21/10/2026

---

### Checklist de la entrega

| Requisito de la entrega | Cumple | Justificacion breve / evidencia |
| :--- | :---: | :--- |
| **Hay un canal de comunicacion sincrono funcionando entre componentes (ej. REST/gRPC).** | [X] Si / [ ] No | Se implemento un canal sincrono basado en **HTTP/REST**. Opera tanto entre el portal web cliente y el backend clinico (`GET /api/records`, `POST /api/records`, `PUT /api/records/:id`) como en llamadas sincronas inter-servicio directas entre el backend clinico y el microservicio de notificaciones (`GET /api/records/:id/sync-audit-check` -> `GET /api/validate-audit`). El emisor se bloquea en espera de la respuesta inmediata del receptor con estricta semantica de solicitud-respuesta. |
| **Hay un canal de comunicacion asincrono funcionando entre componentes (ej. cola de mensajes).** | [X] Si / [ ] No | Se implemento un canal asincrono utilizando **RabbitMQ** como message broker distribuido bajo protocolo AMQP. El backend clinico actua como productor publicando eventos (`clinical.record.created`, `clinical.record.updated`, `clinical.record.conflict`) a un Topic Exchange (`hoscorp.events`). El microservicio consumidor independiente (`notification-service`) procesa estos mensajes desde la cola durable `hoscorp.notifications.queue` en segundo plano, sin bloquear el hilo ni la respuesta al cliente. |
| **Esta justificado por que se uso cada semantica en cada punto del sistema.** | [X] Si / [ ] No | **Canal Sincrono:** Se utiliza cuando se requiere consistencia fuerte, validacion previa inmediata o cuando el usuario medico necesita confirmacion instantanea de que una operacion critica fue leida o persistida.<br>**Canal Asincrono:** Se utiliza para desacoplar temporalmente tareas no criticas para la respuesta inmediata (envio de emails/SMS al paciente, generacion de bitacoras de auditoria, propagacion de alertas de seguridad). Esto previene que una lentitud o indisponibilidad temporal del servicio de notificaciones degrade la atencion medica. |
| **Se identifico un caso de concurrencia concreto (ej. dos escrituras simultaneas sobre el mismo recurso).** | [X] Si / [ ] No | Se identifico la anomalia de **Actualizacion Perdida (Lost Update Anomaly)** en historias clinicas: dos medicos (o un profesional y un proceso de ingesta automatica en background) consultan la misma version base de un registro medico (`rec-1001`, version `1`) e intentan actualizar concurrentemente el diagnostico y las observaciones clinicas. Sin control de concurrencia, la ultima escritura sobreescribiria ciegamente a la primera, provocando perdida irrevocable de informacion medica. |
| **Ese caso de concurrencia esta resuelto y la solucion puede demostrarse (no solo descripta).** | [X] Si / [ ] No | Se resolvio mediante **Control de Concurrencia Optimista (OCC)** con versionado numerico estricto. La primera escritura valida que la version recibida coincide con la de base de datos, aplica la modificacion e incrementa la version a `2` (respondiendo **HTTP 200 OK**). La segunda escritura, al presentar una version obsoleta (`1` vs `2`), es interceptada y rechazada preventivamente con **HTTP 409 Conflict**, emitiendo un evento asincrono de conflicto a RabbitMQ. La solucion se demuestra tanto desde el panel interactivo web como mediante scripts automatizados en PowerShell y Node.js. |

---

### Evidencia adicional

**Como reproducir el caso de concurrencia resuelto (pasos o script de prueba):**

Se proporcionan dos vias complementarias e inmediatas para reproducir y verificar la resolucion del caso de concurrencia:

#### Metodo 1: Script Automatizado por Consola (PowerShell / Node.js)
1. Con los contenedores levantados (`docker compose up -d`), abre una terminal en la carpeta `Entrega 3`.
2. Ejecuta el script de prueba de concurrencia:
   ```powershell
   .\scripts\test-concurrencia.ps1
   ```
   *(O de forma equivalente en Node.js multiplataforma: `node .\scripts\test-concurrencia.js`)*
3. **Resultado observable en consola:**
   - Hilo 1 (Dra. Gomez): Retorna **HTTP 200 OK**, aplicando la escritura e incrementando la version del registro de `1` a `2`.
   - Hilo 2 (Dr. Ramirez): Retorna **HTTP 409 Conflict**, rechazando la escritura por presentar una version obsoleta y evitando la sobreescritura ciega (*Lost Update*).
   - Verificacion asincrona: El script consulta el endpoint `/api/audit-logs` del microservicio de notificaciones y confirma que RabbitMQ recibio y encolo el evento `clinical.record.conflict`.

#### Metodo 2: Demostracion Visual Interactiva en el Portal Web
1. Abre el navegador en: [http://localhost:3000](http://localhost:3000)
2. En la seccion **"Laboratorio de Concurrencia: Dos Escrituras Simultaneas"**, selecciona el registro objetivo `rec-1001`.
3. Haz clic en el boton **"Ejecutar 2 Escrituras Simultaneas"**.
4. **Resultado observable en pantalla:**
   - La interfaz ejecuta ambas peticiones HTTP PUT en paralelo (`Promise.all`) con la misma version base.
   - En la columna izquierda (Hilo 1) se despliega el badge verde **"200 OK (EXITO)"** con el nuevo registro versionado.
   - En la columna derecha (Hilo 2) se despliega el badge rojo **"409 CONFLICT (RECHAZADO)"** con la explicacion detallada del conflicto prevenido.
   - En la tabla inferior de "Bitacora de Eventos Asincronos (RabbitMQ)" aparece inmediatamente el evento de actualizacion y el evento de colision procesados por el worker.

#### Repositorio y Documentacion Complementaria
* **Informe Tecnico Extendido:** [`docs/informe-tecnico-comunicacion-concurrencia.md`](./informe-tecnico-comunicacion-concurrencia.md)
* **Certificacion Imprimible Oficial (HTML listo para PDF):** [`docs/certificacion-entrega-3.html`](./certificacion-entrega-3.html)
* **Script de Demostracion Integral:** [`scripts/demo-completa.ps1`](../scripts/demo-completa.ps1)

---

### Espacio para el docente

* **Nota:** _____ / 10
* **Corregido por:** __________________________________
* **Fecha de correccion:** _____ / _____ / _________

**Observaciones:**  
```text



```
