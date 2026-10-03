# Checklist — Entrega 1: Propuesta de Arquitectura

**Grupo N°:** 2  
**Integrantes:** Donato Mattio, Cristian Carilavi  
**Temática:** Gestión unificada de historias clínicas  
**Dominio:** https://github.com/usuario/hoscorp  
**Área / Sector empresarial:** Tecnología médica / MedTech  
**Tag / Release de esta entrega:** v1-infraestructura  
**Fecha de entrega:** 01/10/2026  

---

## Requisitos de la Entrega

| Requisito | Cumple | Justificación / Evidencia |
|-----------|--------|---------------------------|
| El problema a resolver está descripto con claridad (qué hace el sistema y para quién) | Sí | El sistema Hoscorp resuelve la fragmentación de historias clínicas entre distintos centros de salud, unificándolas en un dashboard centralizado orientado al paciente/ciudadano. Se describe en detalle en el [Informe de Propuesta de Arquitectura](./informe-propuesta-arquitectura.md), sección Introducción. |
| La temática elegida está justificada, incluyendo su correlato real en el mercado de trabajo | Sí | La interoperabilidad en salud es un desafío global. Empresas como Epic Systems y Cerner validan el mercado. El sector MedTech está en crecimiento sostenido. Ver sección "Justificación de la Temática" del informe. |
| Vista Lógica: están identificadas las clases/entidades principales del dominio elegido | Sí | Se identificaron 8 entidades principales: Paciente, HistoriaClinica, RegistroMedico, CentroDeSalud, Profesional, Autorización, Pago y Turno. Incluye diagrama de clases UML. Ver sección "Vista Lógica" del informe. |
| Vista de Desarrollo: hay una primera idea de cómo se organizará el código (módulos/servicios) | Sí | Se definieron 9 microservicios: api-gateway, auth-service, patient-service, clinical-records-service, integration-service, appointment-service, payment-service (aislado), notification-service y frontend. Ver sección "Vista de Desarrollo" del informe. |
| Vista de Procesos: se identificó al menos un punto de concurrencia o sincronización esperado | Sí | Se identificaron 4 puntos de concurrencia: sincronización periódica de datos con hospitales, acceso concurrente de médicos al mismo registro, procesamiento asíncrono de pagos, y propagación de autorizaciones. Ver sección "Vista de Procesos" del informe. |
| Vista Física: se planteó cuántos nodos/máquinas tendrá el sistema y cómo se relacionan | Sí | Se plantearon 5 nodos de aplicación, 2 nodos de base de datos (PostgreSQL operativa + MongoDB para historias clínicas) y 1 message broker (RabbitMQ). El microservicio de pagos tiene su propio nodo aislado. Ver sección "Vista Física" del informe. |
| Escenarios (+1): hay al menos un caso de uso concreto descripto atravesando las cuatro vistas | Sí | Se describieron 2 casos de uso completos: (1) Paciente consulta su historia clínica unificada, y (2) Médico carga información manualmente. Ambos recorren las 4 vistas. Ver sección "Escenarios" del informe. |

---

## Evidencia Adicional

- **Informe completo:** [informe-propuesta-arquitectura.md](./informe-propuesta-arquitectura.md)
- **Diagramas incluidos en el informe:**
  - Diagrama de clases (Vista Lógica)
  - Diagrama de componentes/microservicios (Vista de Desarrollo)
  - Diagrama de secuencia - Sincronización (Vista de Procesos)
  - Diagrama de despliegue (Vista Física)
  - Diagrama de secuencia - Caso de uso principal (Escenarios)
- **Repositorio:** https://github.com/usuario/hoscorp
- **Tag:** v1-infraestructura
