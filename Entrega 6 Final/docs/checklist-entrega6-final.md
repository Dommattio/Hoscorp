# Certificacion de Entrega - Entrega Final: Integracion, demo en vivo y defensa oral
## Integracion de los Modulos
**Programacion Distribuida y Componentes - Proyecto Final**

---

> **Objetivo de la entrega:** Cierre del proyecto: las seis capas construidas a lo largo del semestre funcionando integradas, con una demo en vivo y defensa oral donde cualquier integrante debe poder explicar cualquier parte del sistema, no solo la que programo.
> 
> **Que evalua esta entrega:** El sistema completo funcionando de punta a punta, y que cada integrante pueda explicar cualquier parte del proyecto.

---

### Datos generales

* **Grupo N°:** 2
* **Integrantes:** Donato Mattio, Cristian Carilavi
* **Tematica y caso de uso:** Salud / MedTech — Sistema centralizado de gestion unificada de historias clinicas (Hoscorp)
* **Repositorio de GitHub:** `https://github.com/Dommattio/Hoscorp` (Rama: `main_Mattio`)
* **Tag / Release de esta entrega:** `v6-final`
* **Fecha de entrega:** 19/11/2026

---

### Checklist de la entrega

| Requisito de la entrega | Cumple | Justificacion breve / evidencia |
| :--- | :---: | :--- |
| **Las seis capas (infraestructura, comunicacion, middleware, seguridad, patrones/escalabilidad) funcionan integradas.** | [X] Si / [ ] No | El sistema corre de punta a punta integrando las 6 capas en un unico entorno cohesivo: **1) Arquitectura 4+1** orientada al dominio clinico; **2) Infraestructura** de 5 nodos fisicamente aislados en contenedores Docker; **3) Comunicacion** sincrona REST, asincrona con RabbitMQ AMQP y control de concurrencia optimista (OCC con HTTP 409); **4) Middleware** con contratos explicitos OpenAPI 3.0.3, patron Adapter con Hot-Swap de motor interno (V1/V2) y servidor `service-registry` (:5002); **5) Seguridad y Confiabilidad** con autenticacion JWT (HMAC-SHA256), autorizacion RBAC (MEDICO, PACIENTE, ADMIN), cifrado HTTPS/TLS 1.3 X.509 (:3443 y :5443) y replicacion espejo con Auto-Recuperacion (`RPO=0`); y **6) Patrones/Escalabilidad** con Cache-Aside L1, Circuit Breaker y escalado horizontal con balanceo Round-Robin. |
| **La demo en vivo fue ensayada de punta a punta antes de la presentacion.** | [X] Si / [ ] No | Se implemento y ensayo un **Orquestador Maestro de Demo en Vivo de Punta a Punta** (`POST /api/v1/demo/run-e2e-all-layers`), ejecutable tanto con un clic desde el Portal Web (`https://localhost:3443`) como mediante el script automatizado `.\scripts\demo-en-vivo-e2e.ps1`, que recorre y verifica las 6 capas en menos de 5 segundos sin pasos manuales fragiles. |
| **El repositorio de GitHub tiene el README, la carpeta /docs por modulo y un tag/release por entrega.** | [X] Si / [ ] No | El repositorio cuenta con el `README.md` raiz actualizado con la evolucion de las 6 entregas, las carpetas de codigo por entrega (`Entrega 1` a `Entrega 6 Final`), la carpeta `/docs` estructurada por modulo (`docs/entrega-1/` a `docs/entrega-6/`) y los tags de release correspondientes (`v1-arquitectura`, `v1-infraestructura`, `v1-comunicacion`, `v1-middleware`, `v1-seguridad` y `v6-final`). |
| **Cada integrante puede explicar cualquier parte del proyecto, no solo la propia.** | [X] Si / [ ] No | Ambos integrantes del Grupo 2 (**Donato Mattio** y **Cristian Carilavi**) participaron en el diseño y revision cruzada de las 6 capas, manteniendo una arquitectura homogenea (Node.js/Express, RabbitMQ, Nginx TLS y Docker Compose) y preparando la defensa oral integral sobre cualquiera de los componentes del sistema. |
| **Se repasaron las devoluciones de entregas anteriores y se resolvieron los pendientes señalados.** | [X] Si / [ ] No | Se verifico la continuidad incremental entre entregas eliminando cualquier acoplamiento estatico: se reemplazaron URLs hardcodeadas por resolucion dinamica en el Service Registry, se garantizo consistencia de interfaz mediante adaptadores de contrato OpenAPI 3.0, se incorporo persistencia replicada con auto-curacion (`RPO=0`) y se unifico el diseño visual de la interfaz web sin emojis. |

---

### Evidencia adicional

**Link al repositorio final con toda la info:**

* **Repositorio Oficial en GitHub:** `https://github.com/Dommattio/Hoscorp` (Rama de integracion: `https://github.com/Dommattio/Hoscorp/tree/main_Mattio`)
* **Carpeta de Cierre Integrador:** [`Entrega 6 Final/`](../README.md)
* **Script Automatizado de Demo en Vivo (Las 6 Capas):** `.\scripts\demo-en-vivo-e2e.ps1` o `node .\scripts\demo-en-vivo-e2e.js`
* **Certificacion Imprimible Oficial (HTML para PDF):** [`docs/certificacion-entrega-6-final.html`](./certificacion-entrega-6-final.html)

---

### Espacio para el docente

* **Nota:** _____ / 10
* **Corregido por:** __________________________________
* **Fecha de correccion:** _____ / _____ / _________

**Observaciones:**  
```text



```
