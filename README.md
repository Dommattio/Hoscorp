# Hoscorp

> **Sistema centralizado de gestión unificada de historias clínicas**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Estado de Entrega](https://img.shields.io/badge/Entrega-4%20(Actual)-blue.svg)](#plan-de-entregas)

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
│   ├── service-registry/        # Servidor de Descubrimiento (Auto-registro, TTL y Lookup)
│   ├── backend/                 # Core clínico con Adaptador de Contrato y Hot-Swap V1/V2
│   ├── notification-service/    # Servicio de auditoría auto-registrado y consumidor AMQP
│   ├── frontend/                # Portal Web, Directorio Discovery y Visor OpenAPI 3.0
│   ├── contracts/               # Especificaciones OpenAPI 3.0.3 (YAML) y Postman v2.1
│   ├── scripts/                 # Scripts automatizados de Contract Testing y Discovery
│   ├── docs/                    # Checklist oficial, informe y certificación imprimible
│   ├── docker-compose.yml       # Orquestación de 5 nodos sin URLs hardcodeadas
│   └── README.md                # Documentación detallada de Entrega 4
├── docs/
│   ├── entrega-1/
│   ├── entrega-2/
│   ├── entrega-3/
│   └── entrega-4/
├── .gitignore
├── LICENSE
└── README.md
```

---

## Plan de Entregas

| N° | Hito / Entrega | Alcance y Contenido Principal | Estado | Acceso |
|:--:|:---------------|:------------------------------|:------:|:-------|
| 1 | Entrega 1 | Propuesta inicial y arquitectura de software (Modelo de Vistas 4+1) | Completado | [Ver Entrega 1](./Entrega%201/README.md) |
| 2 | Entrega 2 | Arquitectura de Infraestructura: Nodos físicamente separados | Completado | [Ver Entrega 2](./Entrega%202/README.md) |
| 3 | Entrega 3 | Comunicación síncrona, asíncrona (RabbitMQ) y concurrencia (OCC) | Completado | [Ver Entrega 3](./Entrega%203/README.md) |
| **4** | **Entrega 4** | **Contratos de interfaz explícitos (OpenAPI 3.0) y Service Discovery** | **Actual / Completo** | [Ver Entrega 4](./Entrega%204/README.md) |
| 5 | Entrega 5 | Microservicio de pagos desacoplado e integraciones externas | Planificado | - |
| 6 | Entrega 6 | Pruebas de integración, resiliencia, seguridad y rendimiento | Planificado | - |
| 7 | Entrega 7 | Despliegue productivo, monitoreo, documentación final y cierre | Planificado | - |

---

## Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

## Documentación de la Entrega 4 (Actual)

| Documento | Descripción |
|-----------|-------------|
| [Checklist Oficial Entrega 4](./Entrega%204/docs/checklist-entrega4.md) | Checklist completado con justificaciones y evidencia del Módulo 4 |
| [Informe Técnico de Contratos y Service Discovery](./Entrega%204/docs/informe-tecnico-contratos-discovery.md) | Documento detallado con diagramas de secuencia, patrón Adapter y OpenAPI |
| [Certificación Imprimible Entrega 4 (HTML / PDF)](./Entrega%204/docs/certificacion-entrega-4.html) | Plantilla idéntica a la hoja oficial de cátedra para imprimir a PDF (Ctrl + P) |
| [Colección Oficial de Postman v2.1](./Entrega%204/contracts/hoscorp-entrega4.postman_collection.json) | Colección importable con pruebas de contrato y Service Discovery |

---

<p align="center">
  <b>Hoscorp</b> · Grupo 2 · Programación Distribuida y Componentes · 2026
</p>
