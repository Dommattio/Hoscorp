# Hoscorp

> **Sistema centralizado de gestión unificada de historias clínicas**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Estado de Entrega](https://img.shields.io/badge/Entrega-6%20Final%20(Completa)-success.svg)](#plan-de-entregas)

---

## Descripción del Proyecto

**Hoscorp** es una plataforma tecnológica distribuida, centralizada y orientada al ciudadano, concebida para superar la fragmentación de la información médica entre diversas instituciones de salud (públicas y privadas). El propósito central es unificar el historial clínico de cada persona a lo largo de su vida en un único repositorio interoperable, seguro y accesible.

### Características y Principios Fundamentales

- **Soberanía del Dato y Orientación al Ciudadano:** Los datos médicos pertenecen de forma exclusiva al usuario (ciudadano). Es el paciente quien tiene la visibilidad absoluta y la potestad para otorgar o revocar autorizaciones para la extracción, visualización y actualización de sus registros entre los diferentes centros de atención médica.
- **Arquitectura Distribuida en Microservicios:** Diseñado bajo el paradigma de microservicios para garantizar alta disponibilidad, escalabilidad horizontal independiente, resiliencia operativa y una clara separación de responsabilidades.
- **Doble Vía de Integración de Datos:**
  1. **Integración Automática vía API:** Mecanismo directo de ingesta e interoperabilidad para hospitales, clínicas y laboratorios que cuentan con sistemas de gestión hospitalaria (HIS/EMR) modernos.
  2. **Interfaz Médica Web:** Módulo interactivo optimizado para profesionales de la salud, permitiendo la carga manual, validación y consulta de registros clínicos en aquellos centros de salud o consultorios que no dispongan de conectividad API directa.
- **Segregación de Almacenamiento (Bases de Datos Separadas):**
  - **Base de Datos Operacional:** Destinada a la gestión de identidad, autenticación, control de accesos, auditoría, trazabilidad y configuraciones del sistema.
  - **Base de Datos de Historias Clínicas:** Repositorio especializado, altamente protegido y cifrado, dedicado exclusivamente a los registros médicos, diagnósticos, evoluciones y estudios de los pacientes.
- **Microservicio de Pagos Aislado:** Módulo completamente desacoplado para gestionar cobros, suscripciones o aranceles de servicios médicos/administrativos. Este aislamiento estricto protege la información financiera sensible y facilita el cumplimiento de normativas de seguridad (como PCI-DSS) sin comprometer el dominio clínico.

---

## Integrantes

* **Grupo:** N° 2
* **Miembros:**
  * **Donato Mattio**
  * **Cristian Carilavi**

---

## Temática y Área

* **Temática:** Gestión unificada de historias clínicas
* **Área / Sector:** Tecnología médica / MedTech

---

## Arquitectura del Sistema

El sistema implementa una arquitectura basada en microservicios desacoplados que interactúan a través de APIs REST y eventos asíncronos. La documentación técnica del proyecto se estructura siguiendo el **Modelo de Vistas 4+1** de Kruchten:

* **Vista Lógica:** Descomposición funcional en servicios y modelos de dominio.
* **Vista de Desarrollo:** Organización del código fuente, librerías compartidas y estándares de programación.
* **Vista de Procesos:** Concurrencia, sincronización de datos y flujos de trabajo e ingesta.
* **Vista Física:** Topología de despliegue, balanceadores de carga, redes y contenedores.
* **Escenarios (+1):** Casos de uso críticos representativos que validan el comportamiento integral del sistema.

---

## Estructura del Repositorio

```
hoscorp/
├── Entrega 0/
├── Entrega 1/
├── Entrega 2/
├── Entrega 3/
├── Entrega 4/
├── Entrega 5/
├── Entrega 6 Final/
│   ├── certs/                   # Certificados X.509 RSA-2048 SHA-256 para HTTPS/TLS 1.3
│   ├── contracts/               # Especificaciones OpenAPI 3.0.3 (YAML) y Postman v2.1
│   ├── service-registry/        # Discovery Server con Escalabilidad Horizontal y Round-Robin
│   ├── backend/                 # Core clínico integrado (6 Capas: OCC, Adapter, JWT/RBAC, Replica, Cache L1)
│   ├── notification-service/    # Cluster de auditoría escalable y consumidor AMQP
│   ├── frontend/                # Consola Web HTTPS (:3443) y Orquestador de Demo en Vivo E2E
│   ├── scripts/                 # Script de Demo en Vivo de Punta a Punta (demo-en-vivo-e2e.ps1)
│   ├── docs/                    # Checklist y Certificación Oficial Imprimible de Entrega Final
│   ├── docker-compose.yml       # Orquestación integrada de los 5 nodos
│   └── README.md                # Guía completa de la Entrega 6 Final
├── docs/
│   ├── entrega-1/               # Documentación Módulo 1: Arquitectura 4+1
│   ├── entrega-2/               # Documentación Módulo 2: Infraestructura y Nodos
│   ├── entrega-3/               # Documentación Módulo 3: Comunicación y Concurrencia
│   ├── entrega-4/               # Documentación Módulo 4: Contratos y Service Discovery
│   ├── entrega-5/               # Documentación Módulo 5: Seguridad, TLS y Confiabilidad
│   └── entrega-6/               # Documentación Módulo 6: Integración Final y Escalabilidad
├── .gitignore
├── LICENSE
└── README.md
```

---

## Plan de Entregas y Tags del Semestre

| N° | Hito / Entrega | Tag / Release | Alcance y Contenido Principal | Estado | Acceso |
|:--:|:---------------|:-------------:|:------------------------------|:------:|:-------|
| 1 | Entrega 1 | `v1-arquitectura` | Propuesta inicial y arquitectura de software (Modelo de Vistas 4+1) | Completado | [Ver Entrega 1](./Entrega%201/README.md) |
| 2 | Entrega 2 | `v1-infraestructura` | Arquitectura de Infraestructura: Nodos físicamente separados | Completado | [Ver Entrega 2](./Entrega%202/README.md) |
| 3 | Entrega 3 | `v1-comunicacion` | Comunicación síncrona, asíncrona (RabbitMQ) y concurrencia (OCC) | Completado | [Ver Entrega 3](./Entrega%203/README.md) |
| 4 | Entrega 4 | `v1-middleware` | Contratos de interfaz explícitos (OpenAPI 3.0) y Service Discovery | Completado | [Ver Entrega 4](./Entrega%204/README.md) |
| 5 | Entrega 5 | `v1-seguridad` | Seguridad (JWT + RBAC + HTTPS/TLS) y Confiabilidad (Replicación y Failover) | Completado | [Ver Entrega 5](./Entrega%205/README.md) |
| **6** | **Entrega 6 Final** | **`v6-final`** | **Integración de las 6 Capas, Escalabilidad (Cache L1 + Scale-Out) y Demo en Vivo** | **Actual / Completo** | [Ver Entrega 6 Final](./Entrega%206%20Final/README.md) |

---

## Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

## Documentación de la Entrega 6 Final (Actual)

| Documento | Descripción |
|-----------|-------------|
| [Certificación Imprimible Entrega 6 Final (HTML / PDF)](./Entrega%206%20Final/docs/certificacion-entrega-6-final.html) | Plantilla idéntica a la hoja oficial de cátedra para imprimir a PDF (Ctrl + P) |
| [Checklist Oficial Entrega 6 Final](./Entrega%206%20Final/docs/checklist-entrega6-final.md) | Checklist completado con justificaciones y evidencia de las 6 capas integradas |
| [Guía de Demo en Vivo E2E](./Entrega%206%20Final/README.md) | Instrucciones paso a paso para ejecutar la demostración de punta a punta |

---

<p align="center">
  <b>Hoscorp</b> · Grupo 2 · Programación Distribuida y Componentes · 2026
</p>
