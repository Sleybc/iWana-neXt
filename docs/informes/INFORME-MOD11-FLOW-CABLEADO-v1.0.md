# INFORME — Flujo operativo cableado MOD10 + MOD11 + MOD09 + MOD12

**Versión:** 1.2  
**Estado:** Cerrado  
**Fecha:** 2026-07-07  
**Fecha de cierre:** 2026-07-07  
**Aprobado por:** CTO  
**Modo activo:** Mixto  
**Autor:** AI-SR-FULL  
**Clasificación:** Uso interno  

---

## 1. Objetivo

Cerrar el cableado end-to-end:

**Caso → (opcional Ticket) → Tarea → Solicitud de visita → Agenda → OT → Inventario cliente**

---

## 2. Matriz GAP — estado final

| ID | Descripción | Estado | Evidencia |
| --- | --- | --- | --- |
| GAP-FLOW-01 | Duplicidad visita Assurance portal vs worker | **Cerrado** | `assurance-field-service.processor.spec.ts`, `visit-request-origin-orchestration.spec.ts` |
| GAP-FLOW-02 | Crear tarea desde ticket (RF-TSK-11) | **Cerrado** | `AssuranceTicketDrawer`, `TaskForm`, `TASK_CREATED_FROM_TICKET` |
| GAP-FLOW-03 | Mapeo `TaskType` → `WfmWorkType` | **Cerrado** | `task-type-to-wfm-work-type.ts` |
| GAP-FLOW-04 | Refs trazabilidad en OT | **Cerrado** | Migración `056`, `execution-orders.service.spec.ts` |
| GAP-FLOW-05 | Ledger post-OT → `CUSTOMER_SITE` | **Cerrado** | `customer-site-location.resolver.ts`, `stock-ledger.service.spec.ts` |
| GAP-FLOW-06 | Firma y sync estados cierre OT | **Cerrado** | `AssuranceExecutionOrderNotifierAdapter`, `execution-orders.service.spec.ts`, `ExecutionOrderCloseStep` |
| GAP-FLOW-07 | E2E ticket → OT → inventario | **Cerrado** | `portal-assurance.spec.ts` + `portal-field-flow-ticket-ot-inventory.spec.ts` |

---

## 3. Deuda técnica resuelta

| ID | Descripción | Resolución |
| --- | --- | --- |
| DT-FLOW-01 | Puerto Assurance stub | `AssuranceExecutionOrderNotifierAdapter` registra `EXECUTION_ORDER_CLOSED` en timeline MOD10 |
| DT-FLOW-02 | `ERR_ABORTED` en E2E Assurance | Cerrado: `playwright.portal.config.ts` usa Webpack dev y `workers: 1`; `portal-assurance.spec.ts` siembra sesión antes de navegar |

---

## 4. Integración MOD10 en cierre OT

- Nuevo evento `TicketTimelineEventType.EXECUTION_ORDER_CLOSED`
- Adapter en `apps/api/src/modules/assurance/ports/assurance-execution-order-notifier.adapter.ts`
- `TasksModule` importa `AssuranceModule` para inyectar el puerto real
- Test: `assurance-execution-order-notifier.adapter.spec.ts`

---

## 5. Verificación final

```powershell
pnpm --filter @iwana/shared build
pnpm --filter @iwana/db build
pnpm --filter @iwana/api test -- "execution-orders.service.spec|assurance-execution-order-notifier|stock-ledger.service.spec"
pnpm --filter @iwana/worker test -- assurance-field-service
pnpm --filter @iwana/portal test -- visit-request-origin-orchestration ExecutionOrderClose
pnpm test:e2e:portal -- "portal-assurance|portal-field-flow-ticket-ot-inventory"
pnpm --filter @iwana/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @iwana/portal exec tsc -p tsconfig.json --noEmit
```

---

## 6. Stop/go

**GO** — Plan de cableado operativo cerrado. Listo para merge.

---

## 7. Trazabilidad

- Spec: `docs/specs/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado-design.md`
- Plan: `docs/plans/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado.md`
- ADR-047, ADR-048
