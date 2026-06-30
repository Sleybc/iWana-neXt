# ADR-038: Bounded Context Service Assurance / Mesa de Ayuda

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD10 Service Assurance / Mesa de Ayuda  
**PRD relacionado:** docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md  
**Spec de origen:** docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md  

---

## Contexto

El PRD maestro define Service Assurance como módulo responsable de ticketing, SLA y PQR CRC. La idea de Mesa de Ayuda agrega una necesidad real del ISP: manejar tanto tickets de clientes como tickets internos, necesidades operativas y escalamiento hacia trabajo de campo.

WFM ya fue aprobado por ADR-037 como owner de agenda y Work Orders. Por tanto, Assurance debe decidir cuándo un ticket requiere campo, pero no debe crear ni ejecutar órdenes de trabajo como owner.

Las restricciones vigentes son:

- Modulith NestJS con boundaries explícitos.
- Multi-tenant por schema PostgreSQL.
- Comunicación inter-módulo por interfaces tipadas o eventos.
- Sin acceso directo a tablas de otro módulo.
- Sin duplicación de PII ni datos sensibles en logs.
- Cumplimiento CRC para PQR con trazabilidad formal.

Existe un conflicto menor de numeración: el PRD maestro ubica Service Assurance como prioridad 7, pero el repositorio vigente ya asignó `MOD07` a Taxation y `MOD09` a WFM. Se propone usar `MOD10` para este paquete documental y evitar colisiones.

---

## Decision

Se propone adoptar `AssuranceModule` como bounded context de MOD10 Service Assurance / Mesa de Ayuda.

El módulo será owner de:

- `SupportTicket`
- `TicketComment`
- `TicketTimelineEvent`
- `TicketSlaPolicy`
- `TicketPqrRecord`
- `TicketWorkOrderLink`

La API se expondrá bajo `/api/v1/assurance`.

La UI visible en portal usará el nombre **Mesa de ayuda**.

Assurance se integrará con WFM mediante evento o puerto tipado `assurance.field-service-needed`, y almacenará solo la referencia `workOrderId` cuando WFM cree o asocie una orden.

---

## Alternativas consideradas

### A1: Implementar tickets dentro de CRM

Descartada. CRM es owner del expediente, suscriptor y pipeline comercial-operativo. Absorber tickets, SLA y PQR aumentaría acoplamiento, mezclaría responsabilidades y dificultaría integraciones con NMS/WFM.

### A2: Implementar tickets dentro de WFM

Descartada. WFM es owner de agenda y Work Orders. No todos los tickets requieren campo; poner Mesa de Ayuda dentro de WFM forzaría una visión técnica de todos los casos y dejaría débil PQR, SLA y soporte interno.

### A3: Crear `HelpDeskModule` genérico

Descartada como nombre técnico principal. El PRD maestro ya define `Service Assurance` para tickets, SLA y PQR CRC. Se conserva “Mesa de ayuda” como nombre visible de producto.

### A4: Crear `AssuranceModule` como bounded context propio

Elegida/propuesta. Alinea el PRD maestro, permite tickets mixtos cliente + internos, preserva el boundary de WFM y deja listo el crecimiento hacia NMS, Omnichannel y Reporting.

---

## Consecuencias

### Positivas

- Tickets, SLA y PQR tienen owner claro.
- Soporte interno y externo conviven sin obligar a que todo ticket tenga cliente.
- WFM permanece como owner de Work Orders.
- NMS podrá generar tickets automáticos en Fase 02 sin acoplarse a CRM.
- El portal tendrá una consola operativa de soporte y NOC.

### Costos y tradeoffs

- Se agregan nuevas tablas tenant-aware y migración reversible.
- Se requiere contrato de integración Assurance-WFM.
- Se necesita UI nueva en portal y pruebas E2E.
- La numeración `MOD10` debe aceptarse o renumerarse de forma controlada.

### Riesgos aceptados

- SLA Fase 01 será simple; calendario hábil avanzado puede diferirse.
- Diagnóstico automático y correlación NMS no entran en Fase 01.
- Portal cliente completo no entra en Fase 01; los comentarios visibles quedan preparados.

---

## Reglas de implementacion

1. No usar FKs cross-schema hacia CRM, Users, WFM, NMS o Billing.
2. No leer tablas de otros bounded contexts desde servicios Assurance.
3. Usar `UserRole.*` en decoradores `@Roles()`.
4. Todas las tablas Assurance deben residir en schema tenant y resolverse por `SET LOCAL search_path`.
5. Toda entrada externa debe validarse con Zod.
6. No persistir PII sensible del suscriptor en Assurance Fase 01.
7. PQR debe mantener timeline y timestamps auditables.
8. La solicitud de campo debe pasar por evento o puerto hacia WFM.

---

## Estado de aprobacion

Este ADR fue aprobado en estado **Aprobado** el 2026-05-09.

**Aprobación CTO:** Autorización explícita otorgada el 2026-05-09 para proceder con la ejecución controlada de MOD10 Fase 01. La numeración `MOD10` queda aceptada.

---

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
- docs/ideas/mesa_de_ayuda.md
- docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md
- docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md
- docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md
- docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md