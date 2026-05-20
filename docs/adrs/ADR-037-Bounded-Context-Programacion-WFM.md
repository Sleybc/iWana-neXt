# ADR-037: Bounded Context Programacion / WFM

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Autor:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Modulo:** MOD09 Programacion / WFM  
**PRD relacionado:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**Spec de origen:** docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md

---

## Contexto

El PRD maestro de iWana neXt define WFM como modulo propio para ordenes de trabajo, cuadrillas, materiales, firma, evidencias y portal contratista. El CRM vigente ya contiene referencias `ticketId` y `workOrderId`, pero su boundary aprobado indica que CRM no debe ser owner de ticketing, provisioning, inventario ni ordenes de trabajo.

La necesidad inmediata es programar visitas, instalaciones, soporte, retiros y mantenimientos por horas, dias, semanas y meses. Esta necesidad cruza CRM, Service Assurance, Provisioning, Inventory y Users. Resolverla dentro de CRM introduciria acoplamiento indebido y haria mas dificil extraer WFM como componente operativo independiente en el futuro.

Las restricciones vigentes son:

- Modulith NestJS con boundaries explicitos.
- Multi-tenant por schema PostgreSQL.
- Comunicacion inter-modulo por interfaces tipadas o eventos.
- Sin acceso directo a tablas de otro modulo.
- Sin PII real ni duplicacion innecesaria de datos sensibles.

---

## Decision

Se adopta `WfmModule` como nuevo bounded context para MOD09 Programacion / WFM.

La Fase 01 implementara una agenda operativa con Work Orders ligeras. El modulo sera owner de:

- `ScheduleEvent`
- `WorkOrder`
- `WorkOrderTask`
- `ScheduleRescheduleLog`
- `TechnicianAvailability`

La API externa se expondra bajo `/api/v1/wfm`. El subdominio de agenda puede nombrarse internamente como scheduling, pero el modulo NestJS y el boundary funcional se llamaran WFM para alinearse con el PRD maestro.

CRM consumira referencias de Work Order por puerto tipado o evento, no por acceso directo a tablas WFM.

---

## Alternativas consideradas

### A1: Implementar agenda dentro de CRM

Descartada. CRM ya tiene ownership del expediente y pipeline comercial-operativo, pero no debe absorber agenda, tecnicos, disponibilidad ni Work Orders. La alternativa viola responsabilidad unica y aumenta riesgo de imports circulares.

### A2: Crear solo un modulo `SchedulingModule`

Considerada. Es adecuado para agenda pura, pero queda corto frente al alcance del PRD maestro: Work Orders, materiales, evidencias, firma y productividad. Se prefiere `WfmModule` con subdominio scheduling.

### A3: Esperar a Provisioning o Service Assurance

Descartada. La agenda es necesaria para instalaciones y visitas aun antes de que los modulos completos de Assurance/Provisioning existan. Se puede operar con referencias externas/stubs sin romper boundaries.

---

## Consecuencias

### Positivas

- Se preservan boundaries del modulith.
- CRM queda desacoplado de la ejecucion tecnica.
- WFM puede crecer hacia materiales, evidencias, firma y portal contratista sin reescritura mayor.
- La agenda puede servir tanto a instalaciones como a soporte y mantenimiento.
- El modelo queda preparado para integraciones futuras con Inventory y Service Assurance.

### Costos y tradeoffs

- Se agregan nuevas tablas tenant-aware y migracion de schema.
- Se requiere contrato de integracion CRM-WFM.
- La Fase 01 no cubre el WFM completo del PRD maestro; se limita a agenda + Work Order ligera.
- El dashboard inicial sera operativo basico, no analitica avanzada.

### Riesgos aceptados

- Service Assurance aun no existe; `ticketId` se tratara como referencia externa o stub.
- Inventory aun no existe; materiales y equipos se difieren.
- Portal contratista dedicado se difiere; contratistas usan portal con ownership estricto.

---

## Reglas de implementacion

1. No usar FKs cross-schema hacia CRM, Users, Inventory o Assurance.
2. No leer tablas de otros bounded contexts desde servicios WFM.
3. Usar `UserRole.*` en decoradores `@Roles()`.
4. Todas las tablas WFM deben residir en schema tenant y resolverse por `SET LOCAL search_path`.
5. Toda entrada externa debe validarse con Zod.
6. Las referencias cross-module deben ser IDs logicos y contratos tipados.
7. No persistir PII sensible del suscriptor en WFM Fase 01.

---

## Estado de aprobacion

Este ADR queda en estado **Aprobado** por CTO el 2026-05-06. La implementacion de MOD09 Fase 01 puede iniciar bajo las reglas de implementacion definidas en este documento, PRD, HLD, plan y prompt de ejecucion relacionados.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
- docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md
- docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md
- docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
- docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md
- docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md
