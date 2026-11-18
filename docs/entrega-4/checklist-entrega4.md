# Certificacion de Entrega - Entrega 4: Contratos de interfaz y descubrimiento de servicios
## Modulo 4 - Middleware y componentes distribuidos
**Programacion Distribuida y Componentes - Proyecto Final**

---

> **Objetivo de la entrega:** Formalizar como se comunican los componentes entre si: contratos de interfaz explicitos (API REST) y un mecanismo de descubrimiento de servicios, aunque sea simplificado.
> 
> **Que evalua esta entrega:** Que el sistema este desacoplado por contrato explicito, no por coincidencia entre los integrantes.

---

### Datos generales

* **Grupo N°:** 2
* **Integrantes:** Donato Mattio, Cristian Carilavi
* **Proyecto:** Hoscorp - Sistema centralizado de gestion unificada de historias clinicas
* **Tag / Release de esta entrega:** `v1-middleware`
* **Fecha de entrega:** 18/11/2026

---

### Checklist de la entrega

| Requisito de la entrega | Cumple | Justificacion breve / evidencia |
| :--- | :---: | :--- |
| **Los contratos de interfaz (API REST) entre componentes estan documentados formalmente.** | [X] Si / [ ] No | Se formalizaron las especificaciones bajo el estandar **OpenAPI 3.0.3** para cada componente del ecosistema en la carpeta `contracts/` (`openapi-clinical-records.yaml`, `openapi-notifications.yaml`, `openapi-service-registry.yaml`). Adicionalmente, cada microservicio publica su contrato formal en tiempo de ejecucion a traves del endpoint `GET /api/v1/contract` y se incluye una **Coleccion de Postman v2.1** (`contracts/hoscorp-entrega4.postman_collection.json`) con todos los esquemas y pruebas de contrato. |
| **Cada componente puede modificarse internamente sin romper el contrato hacia los demas.** | [X] Si / [ ] No | Se implemento una capa explicita de **Adaptador de Contrato y DTOs (`ClinicalRecordDTOV1`, `AuditLogEntryV1`)** que aisla el modelo interno de persistencia respecto de la interfaz publica. Tanto `clinical-records-service` como `notification-service` permiten conmutar en caliente su motor interno (`POST /api/v1/internal/switch-engine`): el Backend alterna entre `v1-flat-legacy-store` (estructura plana) y `v2-normalized-ehr-crypto` (arbol jerarquico tipo HL7/FHIR con sello criptografico SHA-256), mientras que el adaptador garantiza que el JSON entregado en `/api/v1/records` permanezca **100% invariante**, sin afectar a los consumidores. |
| **Hay un mecanismo de descubrimiento de servicios implementado (aunque sea simplificado).** | [X] Si / [ ] No | Se implemento el microservicio dedicado **`service-registry` (puerto 5002)** en su propio contenedor Docker. Al iniciar, los microservicios se **auto-registran** dinamicamente (`POST /api/v1/registry/register`) informando su host, puerto, version de contrato y rutas, y renuevan su vigencia enviando **heartbeats periodicos cada 5 segundos** con control de expiracion por TTL (`PUT /api/v1/registry/heartbeat/:service/:id`). Cuando el Backend Clinico necesita comunicarse con `notification-service`, no posee ninguna URL hardcodeada: consulta al registro (`GET /api/v1/registry/discover/notification-service`) con balanceo Round-Robin. |
| **El desacople esta verificado: no depende de que los integrantes se hayan puesto de acuerdo informalmente.** | [X] Si / [ ] No | El desacople se verifica de tres formas automatizadas: **1)** Validadores de contrato en runtime que rechazan con `HTTP 400 CONTRACT_VIOLATION` cualquier solicitud que incumpla los tipos o campos obligatorios del esquema OpenAPI; **2)** Eliminacion de `NOTIFICATION_SERVICE_URL` en el `docker-compose.yml` del Backend, forzando la resolucion dinamica exclusiva via Service Discovery; y **3)** Suite automatizada de Contract Testing (`scripts/test-contratos-discovery.ps1` y endpoint `/api/v1/contract/verify-decoupling`) que muta el motor interno en vivo y comprueba paridad exacta del contrato externo. |

---

### Evidencia adicional

**Link a la documentacion de la API (ej. coleccion de Postman, documentacion online, README):**

* **Especificaciones Formales OpenAPI 3.0.3 (YAML):**
  * Contrato Backend Clinico: [`contracts/openapi-clinical-records.yaml`](../contracts/openapi-clinical-records.yaml)
  * Contrato Servicio de Notificaciones y Auditoria: [`contracts/openapi-notifications.yaml`](../contracts/openapi-notifications.yaml)
  * Contrato Servidor de Descubrimiento (Service Registry): [`contracts/openapi-service-registry.yaml`](../contracts/openapi-service-registry.yaml)
* **Coleccion Oficial de Postman v2.1:**
  * [`contracts/hoscorp-entrega4.postman_collection.json`](../contracts/hoscorp-entrega4.postman_collection.json)
* **Endpoints de Contratos en Vivo y Visor Interactivo:**
  * Visor Web Integrado: [http://localhost:3000](http://localhost:3000) *(Seccion: Explorador de Contratos Formales OpenAPI 3.0.3)*
  * Contrato JSON Backend: [http://localhost:5000/api/v1/contract](http://localhost:5000/api/v1/contract)
  * Contrato JSON Notificaciones: [http://localhost:5001/api/v1/contract](http://localhost:5001/api/v1/contract)
  * Contrato JSON Service Registry: [http://localhost:5002/api/v1/contract](http://localhost:5002/api/v1/contract)
* **Documentacion y Scripts de Verificacion:**
  * Informe Tecnico de Contratos y Service Discovery: [`docs/informe-tecnico-contratos-discovery.md`](./informe-tecnico-contratos-discovery.md)
  * Certificacion Imprimible Oficial (HTML para PDF): [`docs/certificacion-entrega-4.html`](./certificacion-entrega-4.html)
  * Script de Certificacion Automatizada: `.\scripts\test-contratos-discovery.ps1` o `node .\scripts\test-contratos-discovery.js`

---

### Espacio para el docente

* **Nota:** _____ / 10
* **Corregido por:** __________________________________
* **Fecha de correccion:** _____ / _____ / _________

**Observaciones:**  
```text



```
