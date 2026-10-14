# Certificación de Entrega — Entrega 2: Infraestructura
## Módulo 2 — Arquitectura de infraestructura
**Programación Distribuida y Componentes · Proyecto Final**

---

> **Objetivo de la entrega:** Tener un esqueleto real con al menos dos nodos separados (contenedores o procesos), no una maqueta visual. El grupo debe poder mostrar que ambos nodos corren de forma independiente y justificar el modelo de ejecución elegido.
> 
> **Qué evalúa esta entrega:** Que la separación física entre nodos sea real y justificada, no interfaces sin backend.

---

### Datos Generales

* **Grupo N°:** 2
* **Integrantes:** Donato Mattio, Cristian Carilavi
* **Proyecto:** Hoscorp — Sistema centralizado de gestión unificada de historias clínicas
* **Tag / Release de esta entrega:** `v1-infraestructura`
* **Fecha de entrega:** 14/10/2026

---

### Checklist de la Entrega

| Requisito de la entrega | Cumple | Justificación breve / evidencia |
| :--- | :---: | :--- |
| **Hay al menos dos nodos separados funcionando (contenedores o procesos distintos).** | [X] Sí / [ ] No | Se implementaron dos nodos en contenedores Docker separados: **Nodo 1 (`hoscorp-backend`)**, que ejecuta un proceso Node.js/Express con la API clínica (`clinical-records-service`) en el puerto 5000; y **Nodo 2 (`hoscorp-frontend`)**, que ejecuta un servidor Nginx independiente en el puerto 3000 con la interfaz de usuario. Cada uno posee su propio `Dockerfile`, PID namespace y aislamiento de recursos. |
| **La separación es real: cada nodo puede iniciarse/detenerse de forma independiente.** | [X] Sí / [ ] No | Cada contenedor puede gestionarse autónomamente mediante `docker compose stop backend` o `docker compose stop frontend`. Si el Nodo 1 se detiene, el Nodo 2 sigue en ejecución, sirviendo la UI y alertando al usuario en tiempo real. Inversamente, si el Nodo 2 se detiene, el Nodo 1 continúa atendiendo peticiones REST de manera autónoma (`curl http://localhost:5000/health`). |
| **Se identificó el modelo de ejecución elegido (cliente-servidor / P2P / microservicios).** | [X] Sí / [ ] No | Se identificó y adoptó un modelo **Cliente-Servidor distribuido con arquitectura orientada a microservicios desacoplados** interconectados mediante red virtualizada tipo puente (*bridge network*) sobre protocolos estándar (HTTP/REST y Reverse Proxy). |
| **El modelo de ejecución elegido está justificado en función del caso de uso.** | [X] Sí / [ ] No | En el dominio de historias clínicas (Hoscorp), la separación física es mandatoria por normativas de seguridad sanitaria y soberanía del dato (HIPAA/GDPR): el backend clínico debe resguardar registros y validar accesos sin exponer acceso directo a la base de datos a los clientes web, permitiendo escalar el portal de consulta de pacientes independientemente de la capa de persistencia clínica. |
| **El README explica cómo levantar el entorno localmente (paso a paso).** | [X] Sí / [ ] No | El archivo `README.md` detalla minuciosamente los prerrequisitos, los comandos de inicio con Docker Compose (`docker compose up -d --build`), la verificación de salud de los nodos (`docker ps`, `/health`), las instrucciones de parada individual para probar la independencia y la alternativa de ejecución local sin Docker. |

---

### Evidencia Adicional

* **URL del Informe descriptivo y técnico correspondiente:**  
  [Informe Técnico de Infraestructura](./informe-tecnico-infraestructura.md)
* **Plantilla imprimible de Certificación idéntica al PDF oficial:**  
  [certificacion-entrega-2.html](./certificacion-entrega-2.html)
* **Código fuente de los nodos:**
  * Nodo 1 (Backend API Clínico): `backend/src/server.js` | `backend/Dockerfile`
  * Nodo 2 (Frontend Web Nginx): `frontend/src/` | `frontend/Dockerfile` | `frontend/nginx.conf`
  * Orquestación de infraestructura: `docker-compose.yml`
  * Script de prueba en vivo de independencia: `scripts/demo-independencia.ps1`

---

### Espacio para el Docente

* **Nota:** _____ / 10
* **Corregido por:** __________________________________
* **Fecha de corrección:** _____ / _____ / _________

**Observaciones:**  
```text


```
