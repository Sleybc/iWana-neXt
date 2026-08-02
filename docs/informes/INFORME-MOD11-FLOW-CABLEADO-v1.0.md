# INFORME — Flujo operativo cableado MOD10 + MOD11 + MOD09 + MOD12

**Versión:** 2.0  
**Estado:** Consolidado — R0–R4 remediados y verificados (2026-08-01). Estado vigente: **G6 GO de calidad registrado tras verificación QA/SEC/DS/PROD-UX**, **G6.5 pendiente de CI Linux**, **G7 NO-GO para producción**. AI-EM-ARCH consolida y recomienda; CTO aprueba finalmente G7. Ver §15.13.
**Fecha:** 2026-07-31  
**Fecha de cierre de remediación:** 2026-07-31  
**Verificación registrada:** QA/SEC/DS/PROD-UX y carriles técnicos (G6), AI-SR-QA (re-gate G6), AI-SEC-ENG (evidencia estática cruzada en v1.1), AI-DATA-ENG (datos), AI-SR-FULL (backend), AI-PLAT-OPS (plataforma); AI-EM-ARCH consolida y recomienda; CTO aprueba finalmente G7. ADR-069 (propuesto) permanece `Propuesto`, con aprobación final CTO pendiente.
**Modo activo:** Espera de G6.5 — G6 calidad registrada tras verificación QA/SEC/DS/PROD-UX y consolidación de AI-EM-ARCH; G6.5 solo tiene criterios registrados y requiere corrida Linux de ambos jobs; G7 NO-GO, AI-EM-ARCH recomienda y CTO aprueba finalmente.
**Autor:** AI-SR-FULL (v1.0–v1.3), AI-EM-ARCH (v1.4 — registro G4; v1.6 — decisión G7; v1.7 — auditoría independiente; v1.8 — re-gate; v1.9 — auditoría multiagente; v2.0 — consolidación final), AI-SR-QA (v1.5 — G6 QA audit; v2.0 — coautor consolidación R5)  
**Clasificación:** Uso interno

> **Autoridad vigente:** Este informe conserva snapshots históricos en §10, §11, §12, §13 y §14. Sus veredictos y redacciones de contexto no representan el estado actual. La única autoridad vigente para G6, G6.5 y G7 es §15.13 y su tabla de gates actual.

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
| GAP-FLOW-06 | Firma y sync estados cierre OT | **Reabierto — P0** | Auditoria 2026-07-27: la firma no es evidencia suficiente y las maquinas `ExecutionOrder`/`ScheduleEvent`/`VisitRequest`/`Task` pueden divergir |
| GAP-FLOW-07 | E2E ticket → OT → inventario | **Cerrado** | `portal-assurance.spec.ts` + `portal-field-flow-ticket-ot-inventory.spec.ts` |
| GAP-FLOW-08 | BOLA y permisos de OT por alcance/asignacion | **Abierto — P0** | Checklist QA-01 a QA-04 |
| GAP-FLOW-09 | Inmutabilidad terminal, idempotencia y concurrencia | **Abierto — P0** | Checklist QA-05 a QA-08 |
| GAP-FLOW-10 | Boundary e integridad OT ↔ Inventario | **Abierto — P0** | ADR-068 (Aprobado) + checklist QA-10 a QA-12 |
| GAP-FLOW-11 | Plantilla versionada y gate de cierre | **Abierto — P1** | Spec de OT + checklist QA-13/QA-14 |
| GAP-FLOW-12 | Agenda de coordinador vs ejecución de campo | **Abierto — P1** | Contratos UX/DS + checklist QA-15 a QA-20 |

---

## 3. Deuda técnica resuelta

| ID | Descripción | Resolución |
| --- | --- | --- |
| DT-FLOW-01 | Puerto Assurance stub | `AssuranceExecutionOrderNotifierAdapter` registra `EXECUTION_ORDER_CLOSED` en timeline MOD10 |
| DT-FLOW-02 | `ERR_ABORTED` en E2E Assurance | Cerrado: `playwright.portal.config.ts` usa Webpack dev y `workers: 1`; `portal-assurance.spec.ts` siembra sesión antes de navegar |

---

## 10. G6 QA Gate — 2026-07-27 (AI-SR-QA) — HISTÓRICA / SUPERADA

### 10.1 Ejecución de tests

| Suite | Comando | Resultado |
| --- | --- | --- |
| Backend execution-orders | `pnpm --filter @iwana/api test -- execution-orders` | 180 passed |
| Backend related (templates, reliability, convergence, gate) | `pnpm --filter @iwana/api test -- "execution-order-templates|execution-order-reliability|execution-order-projection-convergence|closure-gate"` | 43 passed |
| Frontend ExecutionOrder | `pnpm --filter @iwana/portal test -- ExecutionOrder` | 67 passed |
| Worker | `pnpm --filter @iwana/worker test` | 61 passed |
| **Total** | | **~363 passed** |
| Lint | `pnpm lint` | 0 errors, warnings only |
| Typecheck | `pnpm typecheck` | **FAIL** — portal `pending-visits-ui.ts` |
| Build | `pnpm --filter @iwana/shared build && pnpm --filter @iwana/db build && pnpm --filter @iwana/api build` | PASS |

### 10.2 Swagger spec failure (P1)

`tasks.swagger.spec.ts` (3 tests) falla porque `ExecutionOrderProjectionConvergenceService` no está declarado en el TestingModule del swagger spec test. Es un gap de infraestructura de tests, no de lógica de negocio. Requiere agregar `{ provide: ExecutionOrderProjectionConvergenceService, useValue: { verifyConvergence: jest.fn() } }` al spec.

### 10.3 Matriz QA-01 a QA-50

> **Foto histórica 2026-07-27** (primer gate G6, previo a remediación). Superada por §15.5/§15.13 tras R0–R4: tally histórico **43 PASS / 6 PARTIAL / 0 FAIL** + QA-34 diferido CTO.

| Estado | Cantidad | Items |
| --- | --- | --- |
| PASS | 35 | QA-01–10, QA-12–17, QA-19, QA-21, QA-25–32, QA-35, QA-38–39, QA-41–48 |
| PARTIAL | 8 | QA-11, QA-18, QA-20, QA-22, QA-24, QA-36 |
| FAIL | 7 | QA-23, QA-33, QA-34, QA-37, QA-40, QA-49, QA-50 |

### 10.4 Veredicto: **NO-GO**

**Bloqueantes P0:**
1. QA-23: Migraciones tenant sin test de reversibilidad
2. QA-34: Sin evidencia TLS/ingress (PLAT-OPS)
3. QA-40: Catálogo de permisos sin test de compatibilidad de migración
4. QA-49: Sin evidencia de que offline no persiste PII

**Bloqueantes P1:** QA-33 (rate limit), QA-37 (lag métrica), QA-50 (threat model)

**Typecheck:** `pending-visits-ui.ts` — Record<VisitRequestStatus> missing IN_EXECUTION, CLOSED, REQUIRES_RESCHEDULE (G3 DATA-P0-1)

### 10.5 Categorías con evidencia sólida (GO)

- **BOLA/Tenant isolation:** 4/4 QA items PASS con tests cross-tenant, ABAC, 404/403 indistinguibles
- **Terminal immutability + concurrency:** 4/4 QA items PASS con 4×5 mutaciones rechazadas + race conditions
- **Idempotency/Atomicity:** 4/4 QA items PASS con crash-window recovery, HMAC, tombstone
- **Evidence/Media:** 4/4 QA items PASS con cross-tenant, MIME, signed URLs sin storage leaks
- **DTO/Mass Assignment:** 2/2 QA items PASS con Zod strict() y PII protection
- **Convergence ADR-068:** 6 filas cubiertas en `execution-order-events.processor.spec.ts`

### 10.6 Recomendación

Completar los 8 items FAIL (5 P0 + 3 P1) antes de re-ejecutar G6. Las categorías GO no necesitan re-testeo. El typecheck failure en portal debe resolverse agregando los 3 estados faltantes a `pending-visits-ui.ts` (requiere coordinación con AI-FE-PLATFORM).

| Gap | Severidad | Owner sugerido | Fase |
| --- | --- | --- | --- |
| QA-23: migración reversible | P0 | AI-SR-FULL | G5 |
| QA-33: rate limit test | P1 | AI-SR-FULL | G5 |
| QA-34: TLS evidence | P0 | AI-PLAT-OPS | G5 |
| QA-37: lag métrica | P1 | AI-SR-FULL + AI-PLAT-OPS | G5 |
| QA-40: permission catalog migration test | P0 | AI-SR-FULL | G5 |
| QA-41: OT number race test | P0 | AI-SR-FULL | G5 (cerrado `6b8f8460`) |
| QA-49: offline PII evidence | P0 | AI-FE-PLATFORM | G5 |
| QA-50: threat model/ASVS | P1 | AI-SEC-ENG | G6 |
| Typecheck DATA-P0-1 | P0 | AI-FE-PLATFORM | G5 |
| Swagger DI gap | P1 | AI-SR-FULL | G5 |

---

## 11. Decisión G7 y Task 10 — 2026-07-27 — HISTÓRICA / SUPERADA

> **Sección histórica/superada:** este registro conserva la fotografía de decisión del 2026-07-27 y no representa el estado vigente. La referencia actual de G6, G6.5 y G7 es §15.13.

**Modo:** EM + Architect + Orchestrator  
**Decisión:** **NO-GO** para producción y para retirar la compatibilidad ligera de `WorkOrder` o el alias `wfm.work_orders.execute`.  
**CTO:** no se solicita aprobación de producción: el gate no satisface las condiciones para escalar un GO.

### Evidencia consolidada

- G6 vigente permanece en **NO-GO**: QA-23, QA-34, QA-40 y QA-49 son P0 abiertos; QA-33, QA-37 y QA-50 son P1 abiertos. El typecheck y la spec Swagger también carecen de evidencia verde posterior. Ver checklist §7.3–§7.4 y este informe §10.
- La precondición de Task 10 no tiene evidencia de ciclo de release, telemetría verde, reconciliación sin discrepancias, rollback ensayado ni inventario que demuestre cero consumidores conocidos.
- El inventario de consultas de AI-SR-FULL, AI-FE-PLATFORM y AI-PLAT-OPS identifica consumidores activos de la OT ligera: API y servicio WFM, creación desde agenda y solicitudes de visita, portal de Programación, referencias persistidas en Agenda/Visita/Tareas/Assurance, catálogo de acceso y el alias deprecado. Por tanto, no se cumple la condición de ADR-068 §Decision 12.
- Los cambios locales no versionados ni las correcciones declaradas por ejecutores son evidencia insuficiente para levantar un gate: requieren verificación reproducible de G5/G6 y un release posterior.

### Consultas protocolarias

| Consultado | Dictamen |
| --- | --- |
| AI-SR-QA | G6 y Task 10 bloqueados: no hay cierre verificable, release, telemetría, consumidores en cero ni rollback ensayado. |
| AI-SEC-ENG | NO-GO: P0/P1 abiertos en migraciones, TLS, permisos, consecutivo, offline PII, rate limit, lag y threat model. |
| AI-PLAT-OPS | NO-GO: no hay release G7, TLS efectivo, telemetría/umbral de lag ni rollback probado; hay consumidores activos. |
| AI-SR-FULL | No hay cero consumidores: persisten endpoints, writes WFM y referencias de persistencia de `WorkOrder`. |
| AI-FE-PLATFORM | No hay cero consumidores: Agenda y cliente portal mantienen lecturas y cliente de mutación WFM; falta evidencia posterior para typecheck y offline PII. |

### Stop/go y próximo gate

No se autoriza retirar UI, mutaciones, persistencia ni alias. Antes de reabrir Task 10 deben cerrarse y verificarse los P0/P1 de G6, repetirse G6 con evidencia reproducible, obtener la aprobación de producción del CTO, y documentarse un ciclo post-release con TLS efectivo, telemetría y reconciliación verdes, cero consumidores conocidos y rollback ensayado. La remediación corresponde a AI-SR-FULL, AI-FE-PLATFORM, AI-PLAT-OPS y AI-SEC-ENG según la matriz de Task 9; esta decisión no autoriza implementación.

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

**GO condicionado — G4 congelado.** G1 (ADR-068) aprobado por CTO. G2 (UX/DS) aprobado. G3 (factibilidad) viable con ajustes — hallazgos registrados en §9.4 con owner y fase. G4 emitido con 5 prompts y declaracion literal de congelacion de contratos (ver §9).

Condiciones para G5 (implementacion):

1. ~~ADR-068 aprobado por el CTO el 2026-07-27.~~ (G1 cerrado)
2. ~~Contratos UX/DS/API congelados.~~ (G4 cerrado — ver §9.1–§9.3)
3. GAP-FLOW-06 y GAP-FLOW-08 a GAP-FLOW-12 cerrados con evidencia.
4. AI-SEC-ENG sin P0/P1 y AI-SR-QA con QA-01 a QA-25 aprobados.
5. Migraciones, reconciliacion, observabilidad y rollback verificados.

---

## 7. Trazabilidad

- Spec: `docs/specs/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado-design.md`
- Plan: `docs/plans/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado.md`
- ADR-047, ADR-048
- ADR de integracion: `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` (Aprobado)
- Spec de rediseño: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-coordinador-design.md`
- Plan: `docs/plans/2026-07-27-mod09-mod11-ot-instalacion-redesign.md`
- Checklist: `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md`

---

## 8. Nota de gobernanza

La reapertura no invalida el trabajo técnico ya realizado; corrige el alcance de la afirmación "cerrado". Hasta completar los nuevos gates, la feature puede servir como base de desarrollo, no como evidencia de aptitud productiva.

---

## 9. Registro de congelación G4 (2026-07-27)

**Fecha de congelación:** 2026-07-27  
**Hash documental:** pendiente de commit `docs(operations): freeze installation work order contracts`  
**Orquestador:** AI-EM-ARCH  
**Protocolo:** `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` §3bis

### 9.1 Contrato de API congelado

| Artefacto | Ruta | Dueño |
| --- | --- | --- |
| Tipos compartidos | `packages/shared/src/contracts/operations/execution-orders.ts` (416 lineas, 14 tipos + 11 payloads de evento + envelope) | AI-SR-FULL |
| OpenAPI | `apps/api/openapi/tasks-execution-orders.v1.json` (1553 lineas, 18 endpoints, 27 schemas) | AI-SR-FULL |
| Enums | `packages/shared/src/enums/operations/` (status, result, item-action) | AI-SR-FULL |

El contrato de API se declara **congelado**. Cualquier cambio requiere nueva version del contrato, coordinacion via AI-EM-ARCH y re-emision de prompts.

### 9.2 Contrato de componente congelado

| Artefacto | Ruta | Dueño |
| --- | --- | --- |
| Spec DS | `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` v1.1 | AI-DS-OWNER |
| `OperationalSidePeek` | `@iwana/ui` (5 regiones, 12 props, 8 estados de interaccion, 5 de contenido) | AI-DS-OWNER |
| `ExecutionOrderSummary` | `apps/portal` dominio Operaciones (15 props, 9 status->Badge, 8 estados de contenido) | AI-DS-OWNER |

El contrato de componente se declara **congelado**. Cambios dentro del carril rapido de UI que no alteren alcance, contrato de datos, boundary ni tokens de marca los aprueba AI-DS-OWNER por delegacion.

### 9.3 Nombres congelados

**Permisos (6 canonicos + 1 alias deprecado):**

| Permiso | Tipo |
| --- | --- |
| `operations.execution_orders.read` | Canonico |
| `operations.execution_orders.execute` | Canonico |
| `operations.execution_orders.supervise` | Canonico |
| `operations.execution_order_templates.read` | Canonico |
| `operations.execution_order_templates.manage` | Canonico |
| `operations.execution_events.redrive` | Canonico |
| `wfm.work_orders.execute` | Alias deprecado (retirable en Task 10) |

**Estados (9 `ExecutionOrderStatus`):** `CREATED`, `ASSIGNED`, `EN_ROUTE`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`, `COMPLETED_WITH_OBSERVATIONS`, `NOT_EXECUTED`, `CANCELLED`

**Resultados (5):** `EXECUTED`, `EXECUTED_WITH_OBSERVATIONS`, `NOT_EXECUTED`, `REQUIRES_FOLLOW_UP`, `CANCELLED`

**Eventos (11 `OperationalEventPayloadV1`):** `VisitScheduledV1`, `VisitWindowChangedV1`, `VisitResourceChangedV1`, `VisitCancelledV1`, `ExecutionOrderStartedV1`, `ExecutionOrderBlockedV1`, `InventoryConsumptionRequestedV1`, `ExecutionOrderClosedV1`, `ExecutionOrderFollowUpRequiredV1`, `InventoryMovementConfirmedV1`, `InventoryMovementRejectedV1`

**Componentes (2):** `OperationalSidePeek` (`@iwana/ui`), `ExecutionOrderSummary` (`apps/portal`)

### 9.4 Condiciones aceptadas de G3

Los dictamenes de factibilidad G3 (SEC-ENG, DATA-ENG, PLAT-OPS) emitieron veredicto **viable con ajustes**. Los hallazgos se asignan a las fases correspondientes:

#### P0 — Bloquean G5 (deben resolverse en sus fases)

| ID | Hallazgo | Fase | Owner |
| --- | --- | --- | --- |
| SEC-F01 | `POST /events/{eventId}/redrive` sin `Idempotency-Key` | Fase 01 | AI-SR-FULL |
| DATA-P0-1 | Enum `VisitRequestStatus` sin `IN_EXECUTION`, `CLOSED`, `REQUIRES_RESCHEDULE` | Fase 01 | AI-SR-FULL |
| DATA-P0-2 | Entidad `ExecutionOrderItemUsage` desalineada con contrato | Fase 03 | AI-SR-FULL |
| PLAT-P0-01 | Rate limiting no es tenant-aware (bucket global 100/min) | Fase 00 | AI-SR-FULL + AI-PLAT-OPS |
| PLAT-P0-02 | Sin evidencia TLS/terminacion en ingress de produccion | G5 | AI-PLAT-OPS |
| PLAT-P0-03 | Pool de conexiones del relay outbox insuficiente (max:2) | Fase 01 | AI-SR-FULL |

#### P1 — Deben resolverse antes de G6

| ID | Hallazgo | Fase | Owner |
| --- | --- | --- | --- |
| SEC-F02 | PII en campos de texto libre sin politica documentada | Fase 00 | AI-SR-FULL |
| SEC-F03 | `site.address` sin cobertura explicita en contrato §11 | Fase 00 | AI-SR-FULL |
| SEC-F04 | OpenAPI sin documentar MIME allowlist para upload | Fase 03 | AI-SR-FULL |
| DATA-P1-1 | Columna `occurred_at` ausente en entidad outbox | Fase 01 | AI-SR-FULL |
| DATA-P1-2 | Sin constraint UNIQUE en tabla evidencias | Fase 03 | AI-SR-FULL |
| DATA-P1-3 | Sin garantia de inmutabilidad de template version | Fase 03 | AI-SR-FULL |
| DATA-P1-4 | Sin indice para lookup por `inventoryRequestId` | Fase 03 | AI-SR-FULL |
| PLAT-P1-02 | Sin DLQ operativa con re-drive auditado | Fase 01 | AI-SR-FULL |
| PLAT-P1-03 | Worker no declarado en Docker Compose | G5 | AI-PLAT-OPS |
| PLAT-P1-04 | Sin metricas de observabilidad del outbox relay | Fase 01 | AI-SR-FULL |

#### P2 — Backlog (no bloquean G6)

| ID | Hallazgo |
| --- | --- |
| SEC-F05 | Modelo de alcance de supervision no definido en tipos |
| SEC-F06 | Publicar/retirar plantilla sin `If-Match` |
| SEC-F07 | Deuda de metadata en ADR-034/ADR-035 |
| SEC-F08 | Umbrales de rate limiting no especificados |
| DATA-P2-1/4 | Tipos y columnas de observabilidad en outbox/inbox |
| PLAT-P2-01/03 | `client_max_body_size`, purga de outbox, CI pipeline |

### 9.5 Prompts emitidos en G4

| Prompt | Estado | Ejecutor |
| --- | --- | --- |
| `PROMPT-...-FASE-00-CONTENCION-v1.0.md` | Emitido — G4 congelado | AI-SR-FULL |
| `PROMPT-...-FASE-01-CONTRATOS-v1.0.md` | Emitido — G4 congelado | AI-SR-FULL + AI-DATA-ENG |
| `PROMPT-...-FASE-02-EXPERIENCIA-v1.0.md` | Emitido — G4 congelado | AI-FE-PLATFORM |
| `PROMPT-...-FASE-03-PLANTILLAS-EVIDENCIAS-v1.0.md` | Emitido — G4 congelado | AI-SR-FULL + AI-FE-PLATFORM |
| `PROMPT-...-FASE-04-GATE-QA-v1.0.md` | Emitido — G4 congelado (G6) | AI-SR-QA |

### 9.6 Riesgos aceptados para monitoreo en G6

| Riesgo | Dueño de aceptacion |
| --- | --- |
| Lag de proyeccion (UI muestra "Actualizacion pendiente") | AI-EM-ARCH (ADR-068 §9) |
| Crash-window outbox relay (duplicados neutralizados por inbox) | AI-EM-ARCH (ADR-068 §Relay) |
| Cierre con `inventoryReconciliation=PENDING` | AI-EM-ARCH (ADR-068 §Decision 10) |
| Duplicados de entrega tras crash de Redis | AI-PLAT-OPS (inbox idempotente) |
| Offline read-only sin persistencia local | AI-EM-ARCH (contrato UX §12) |
| Rotacion de clave HMAC sin invalidar registros activos | AI-EM-ARCH (contrato §2.3, `keyId`) |
| Crecimiento lineal de `idempotency_records` | AI-DATA-ENG (tombstone diario, HMAC no-PII) |

---

## 12. Auditoría independiente G6/G7 — 2026-07-28 — HISTÓRICA / SUPERADA

**Modo:** Architect + EM + Orchestrator  
**Veredicto:** **NO-GO** para merge, producción y Task 10. No se solicita aprobación al CTO.

### Bloqueantes P0

1. **Autorización OT–evidencia incompleta:** consulta y descarga validan la OT y el tenant, pero no que el asset pertenezca a esa OT. `ExecutionOrdersService` permite consultar o firmar por `mediaAssetId` sin verificar el vínculo probatorio. Ver `apps/api/src/modules/tasks/services/execution-orders.service.ts:858-912`.
2. **Upload-intent y compensación ausentes:** el `intentId` se genera de forma efímera, no se persiste, y el claim de Media ocurre antes del vínculo tenant; un fallo posterior deja el asset reclamado sin reconciliación. Ver `apps/api/src/modules/tasks/services/execution-orders.service.ts:766-813,817-883`.
3. **Boundary Media vulnerado:** `TasksModule` registra `MediaAsset` y su provider accede a la entidad de Media, contrario al ownership de ADR-068. Ver `apps/api/src/modules/tasks/tasks.module.ts:18,52-68,86`.
4. **Migraciones no desplegables ni reversibles:** la tenant 094 no está en `TENANT_MIGRATIONS`; la pública 020 no está versionada y su `down()` restablece el CHECK que excluye `execution_evidence` antes de resolver esos datos. Ver `packages/database/src/migrations/tenant/runner.ts:49-52,177-182` y `packages/database/src/migrations/public/020_add_media_asset_status_and_claim.ts:89-110`.
5. **TLS efectivo no demostrado:** la configuración productiva escucha solo HTTP en el puerto 80. Ver `nginx/nginx.prod.conf:19-21`.
6. **Evidencia de gate contradictoria:** el plan declaraba GO sin artefactos reproducibles, mientras este informe y el checklist mantienen bloqueantes. Se normaliza el plan a NO-GO en esta decisión.

### Condiciones de reingreso

- Restablecer un boundary real: Media implementa el puerto y MOD11 solo conserva intent y vínculo probatorio.
- Persistir upload-intent, forzar autorización por tenant + OT + evidencia, e implementar compensación y reconciliación para cada ventana de fallo.
- Registrar/versionar migraciones, corregir reversión con datos y ejecutar apply/revert real en `public` y dos schemas tenant.
- Entregar TLS efectivo, worker desplegable, telemetría/umbral de relay y reconciliación, release y rollback ensayados.
- Repetir G6 con salidas archivadas de test, cobertura, E2E vertical API/PostgreSQL, a11y, regresión visual y pruebas de ráfaga 429 por actor/tenant.

Esta auditoría no autoriza implementación. Los hallazgos se asignan a AI-SR-FULL, AI-FE-PLATFORM, AI-DATA-ENG, AI-PLAT-OPS y AI-SEC-ENG según la RACI.

---

## 13. Re-gate de remediaciones — 2026-07-28 — HISTÓRICA / SUPERADA

**Modo:** Architect + EM + Orchestrator  
**Veredicto:** **NO-GO** para merge, producción y Task 10. Los commits `d847cbd6`, `e9b9dee9` y `be596061` no cierran los bloqueantes de raíz.

### P0 abiertos

1. **Receipt de evidencia aún permite enumeración intra-tenant:** busca el vínculo OT–asset pero continúa consultando Media cuando no existe. `apps/api/src/modules/tasks/services/execution-orders.service.ts:880-902`.
2. **Upload-intent no es durable:** se genera después de la carga y no persiste; no autoriza polling ni reconciliación. `apps/api/src/modules/tasks/services/execution-orders.service.ts:849-866`.
3. **Claim sin compensación recuperable:** el claim de Media ocurre fuera de la transacción tenant; el worker solo detecta assets sin `claim_ref`. `apps/api/src/modules/tasks/services/execution-orders.service.ts:766-824` y `apps/worker/src/processors/evidence-orphan-detection.processor.ts:117-130`.
4. **Boundary Media permanece roto:** el provider reside en MOD11 y manipula entidad, repositorio y storage de Media. `apps/api/src/modules/tasks/tasks.module.ts:38-39,84`.
5. **Migraciones no reversibles con datos:** 094 borra tablas/columnas pobladas y 020 reintroduce un CHECK incompatible con `execution_evidence`. `packages/database/src/migrations/tenant/094_template_versioning_and_closure_gate.ts:200-258` y `packages/database/src/migrations/public/020_add_media_asset_status_and_claim.ts:100-110`.
6. **Frontend de ejecución incompleto:** carga de evidencia es un no-op, los payloads de inicio/cierre e inventario no cumplen el contrato y no hay selector de acción/custodia. `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx:871-889`.
7. **Plataforma no desplegable para el flujo:** el perfil de producción solo incluye Nginx, no API, web, worker ni migrator; por ello TLS no acredita un ingress operativo. `docker-compose.yml:151-168`.

### Condición de siguiente revisión

Requiere una remediación contract-first que mueva el adaptador a Media, persista y reconcilie intents/claims, haga reversibles las migraciones con datos, complete la experiencia de ejecución y entregue un artefacto de despliegue operable. G6 se repite solo con salidas archivadas de las verificaciones requeridas por §12.

---

## 14. Auditoría multiagente y consolidación G6/G7 — 2026-07-28 — HISTÓRICA / SUPERADA

**Modo:** EM + Architect + Orchestrator
**Autor:** AI-EM-ARCH
**Método:** seis carriles de auditoría independientes (AI-SR-FULL, AI-SEC-ENG, AI-FE-PLATFORM, AI-SR-QA, AI-PLAT-OPS, AI-DATA-ENG) sobre el commit `d91313a8`, con verificación cruzada de AI-EM-ARCH sobre los hallazgos decisivos.
**Veredicto:** **NO-GO** para merge, producción y Task 10. No se eleva aprobación al CTO.
**Plan de remediación:** `docs/plans/2026-07-28-mod09-mod11-ot-instalacion-remediacion-g6.md`

### 14.1 Motivo de esta sección

El commit `d91313a8` escribió, en un solo cambio: las siete remediaciones, las secciones §12 y §13 de este informe con veredicto **NO-GO**, y la reescritura del plan a **GO** citando una sección «§14» que ese commit no creó. Esta sección la crea, y su función es dejar **una sola verdad vigente**.

Quedaban tres artefactos contradictorios: el plan (GO), este informe §13 (NO-GO) y el checklist de calidad (NO-GO, sin actualizar desde el 2026-07-27). Se normalizan todos a NO-GO.

### 14.2 Defecto de gobernanza del gate

El productor de la remediación declaró aprobado su propio gate, mientras el artefacto del dueño del gate —el checklist de AI-SR-QA— nunca se tocó. Esto vulnera el Protocolo §3: *«Ningún gate se auto-aprueba: el aprobador es siempre distinto del productor del artefacto»*.

Además, la atribución de un «G6 SEC: GO (6 advisories, 0 críticas)» a AI-SEC-ENG **no fue emitida por ese rol**: la auditoría de seguridad de esta sesión emite NO-GO.

**Regla adoptada, vinculante desde hoy:** el registro de un gate no puede viajar en el mismo commit que su remediación. Primero el commit de código; después la verificación por un agente distinto; solo entonces el commit que registra el gate.

### 14.3 Estado real por tarea del plan antecesor

| Task | Declarado | Estado verificado | Causa |
| --- | --- | --- | --- |
| 0 Contratos G4 | Cerrado | **CONFIRMADO** | Los 5 prompts declaran ambos contratos congelados con ruta y versión; ADR-068 Aprobado; ADR-034/035 reconciliados; `audit:adr-citations` 0 bloqueantes; `audit:doc-locations` 0 hallazgos |
| 1 Contención | Cerrado | **PARCIAL** | Núcleo correcto (BOLA, mass assignment, terminalidad, DTO minimizado). 429 agrupa solo por tenant, store en memoria |
| 2 Permisos | Cerrado | **BLOQUEADO** | La migración 092 consulta `tenant_settings`, relación inexistente en el repo → `42P01` |
| 3 Contrato y concurrencia | Cerrado | **COMPLETO en lógica, inoperable** | `EXECUTION_ORDER_IDEMPOTENCY_SECRET` no existe en Joi, `.env*` ni compose → todo POST responde 500 |
| 4 Outbox | Cerrado | **PARCIAL** | `SET LOCAL` tras el `COMMIT`: el outbox nunca marca publicado. `redriveEvent` es stub 503 |
| 5 Plantillas | Cerrado | **COMPLETO con fail-open** | Versionado y snapshot correctos; el gate no evalúa sin snapshot y admite `kind` desconocido |
| 6 Agenda | Cerrado | **APROBADO CON RESERVA** | Objetivo cumplido y bien probado. `OperationalSidePeek` sin tests; `packages/ui` sin runner. 34 tests reales, no 51 |
| 7 Experiencia de ejecución | Cerrado | **NO APROBADO** | 3 de 5 mutaciones fallan 4xx; evidencia y plantilla nunca se cargan; sin `missingRequirements[]`; sin selectores de acción ni custodia. 44 tests reales, no 67 |
| 7A Evidencia | Cerrado | **PARCIAL** | P0-1 y P0-4 cerrados. No existe transición `QUARANTINED → AVAILABLE` en el repo: ninguna evidencia puede registrarse |
| 8 Inventario | Cerrado | **PARCIAL** | Criterios sustantivos cumplidos; su test de respaldo falla con ENOENT y dos de sus tres casos son vacuos |
| 9 Gate integral | G6 GO | **FALSO** | `pnpm typecheck` rojo; `tasks.boundary.spec.ts` rojo; §14 no existía; «297 tests» cuenta dos veces 25 (real: 272) |
| 10 Retiro legacy | Diferida | **CORRECTO** | Precondición no cumplida; el alias declarado «medible» no tiene telemetría |

### 14.4 Bloqueantes P0 consolidados

Los cuatro más graves comparten una firma: **invisibles a un test unitario con mocks, letales en el primer contacto con infraestructura real.**

1. **Cadena de migraciones tenant abortada en 092** — `tenant_settings` no existe. 093, 094 y 095 nunca se aplican en ningún schema: no hay catálogo de permisos, ni `occurred_at`, ni tablas de plantillas, ni upload-intents.
2. **Secreto de idempotencia inexistente** — todo comando POST de OT responde 500 en cualquier despliegue.
3. **Relay outbox que nunca drena** — `SET LOCAL` fuera de transacción; el error se traga con un mensaje engañoso; reencolado indefinido cada 5 s.
4. **Ciclo de evidencia imposible de completar** — sin promoción fuera de cuarentena, `registerEvidence` rechaza siempre. Los 25 tests no lo detectan porque mockean `getAssetStatus`.
5. **Frontend fuera de contrato** — inicio, inventario y evidencia fallan con 4xx; tres `as any` impiden que el typecheck lo revele.
6. **Perfil de producción no desplegable** — `migrator-prod` descarta stderr y emite «Migraciones completas» incondicionalmente, invocando una función inexistente. Un despliegue reporta migraciones aplicadas sin ejecutar ninguna.
7. **Gates de merge rojos en HEAD** — `pnpm typecheck` y `pnpm --filter @iwana/api test` fallan.

Hallazgos completos por carril, con evidencia `archivo:línea`, en el plan de remediación §1 y en sus tareas R0–R4.

### 14.5 Lo que sí quedó genuinamente cerrado

No todo el trabajo del re-gate fue nominal. Se verifican como cerrados: **P0-1** (IDOR intra-tenant en el recibo de evidencia, con regresión negativa que asserta que Media no se consulta sin vínculo) y **P0-4** en su wiring (`TasksModule` ya no registra `MediaAsset`; el provider vive en `media/`), con la reserva de que la dirección de la dependencia se invirtió y queda un ciclo de archivos entre módulos. También son correctos y están probados: el diseño de idempotencia y control optimista de Task 3, el versionado y snapshot de plantillas de Task 5, la simplificación de Agenda de Task 6, la ausencia de imports cruzados de MOD12 y la eliminación del `stockMovementId` fabricado de Task 8, y la ausencia de persistencia local en el portal.

### 14.6 Decisión y condición de reingreso

Se ejecuta el plan `docs/plans/2026-07-28-mod09-mod11-ot-instalacion-remediacion-g6.md`, con R0 como bloqueante absoluto.

**La condición de reingreso es una sola prueba, y es la única evidencia ausente en todo el expediente:** un flujo completo de OT —crear, iniciar, registrar trabajo, consumir material, subir y registrar evidencia, cerrar— ejecutado contra API, PostgreSQL y Redis reales, con la salida archivada y conteo explícito de *passed*. Esa corrida habría detectado los cuatro P0 principales. Ningún volumen de tests unitarios la sustituye.

### 14.7 Escalaciones al CTO — resueltas el 2026-07-28

Las tres se elevaron y el CTO decidió el mismo día. Quedan cerradas como escalación y vivas como tarea.

| # | Decisión requerida | Decisión del CTO | Ejecuta |
| --- | --- | --- | --- |
| 1 | Umbral de lag del relay | **Aprueba la recomendación:** instrumentar primero, fijar el umbral después sobre datos reales. Hasta entonces se reporta "sin umbral aprobado" y no se deriva de él ningún criterio de abort | R3.3 |
| 2 | Certificado TLS de producción | **Certificado de CA reconocida.** El autofirmado queda restringido a desarrollo y staging cerrado; el HSTS de un año solo se habilita con cadena válida verificada | R3.5 |
| 3 | Datos personales y retención | **Amparados por Ley 1581, pero el sistema no oculta datos; la responsabilidad del buen uso recae en el usuario** | R2.4 |
| 4 | QA-34 (TLS/ingress) como bloqueante de G6/G7 | **Registro histórico del 2026-07-31:** el CTO autorizó diferir CA/TLS hasta definición formal del dominio productivo y, bajo esa decisión histórica, no bloqueaba G6 ni G7. El criterio vigente está superado por G6.5: QA-34 no bloquea G6/G6.5, pero sí bloquea G7 hasta evidencia de certificado CA, terminación TLS y redirección HTTPS sobre el dominio aprobado. Ver RUNBOOK-RELEASE-ROLLBACK §8.6. | AI-PLAT-OPS (cuando dominio definido) |

### 14.8 Alcance derivado de la decisión 3

La decisión responde a **visibilidad**. La escalación original era de **retención**. Son preguntas distintas —cuánto tiempo conservamos una copia no cambia quién puede verla— y AI-EM-ARCH deriva el alcance operativo en el plan, R2.4:

- **Se aplica:** no se añade enmascaramiento de presentación en las superficies de OT. El usuario autorizado ve el dato real.
- **No habilita relajar control de acceso:** autorización, aislamiento por tenant y minimización de DTO por rol se conservan. Que un contratista no vea la OT de otro tenant no es ocultar un dato; es que ese dato no es suyo.
- **Se conservan la redacción del log de auditoría y el rechazo de PII en texto libre**, porque no ocultan nada a nadie: evitan **duplicar** datos personales en tablas de transporte que hoy crecen sin techo. Mantenerlos reduce el problema de retención en lugar de agravarlo.
- **Retención:** AI-EM-ARCH recomienda separar tablas de **transporte** (outbox, inbox, audit-intents — borrado a 30 días de publicado/consumido) del **registro de verdad** (OT, evidencia, settlement, audit logs — sin cambio). Los agentes lo implementan salvo objeción.
- **Requiere verificación con fuente oficial:** el derecho de supresión (ARCO) que `AGENTS.md` lista para CRM/Portal implica poder eliminar el dato de un titular a petición; la responsabilidad del usuario sobre el buen uso no traslada esa obligación, que recae en el responsable del tratamiento. No se implementa en este plan ni se improvisa: queda como dependencia con Legal antes del cierre del módulo.

---

## 15. Consolidación final R5/G6 — 2026-07-31

**Modo:** EM + Architect + Orchestrator + QA  
**Autor consolidación:** AI-SR-QA (v2.0) con verificación cruzada de AI-EM-ARCH  
**Método:** consolidación de los cinco carriles de remediación (R0–R4) contra el checklist de calidad actualizado y los gates de merge de `AGENTS.md`. La evidencia de cada carril se verificó contra informes archivados, commits, salidas de test y el runbook de plataforma. No se repite el error de gobernanza de §14.2: el registro de este gate se emite en un documento distinto al commit de remediación.

### 15.1 Veredicto por carril

| Carril | Veredicto (auditoría 2026-07-31) | Estado 2026-08-01 tras remediación verificada |
| --- | --- | --- |
| **R0 — Desbloqueo** | **NO-GO** | **REMEDIADO Y VERIFICADO**: migración **099** aplicada en los 44 schemas; CHECK acepta `PENDING`; INSERT/UPDATE de intent con `PENDING` probado contra PostgreSQL real (ROLLBACK); integración postgres **2/2**; swagger **4/4**; typecheck 0 errores. El literal `status: 'PENDING'` de `execution-orders.service.ts:1292` ya es válido. |
| **R1 — Ciclo funcional** | **GO con reservas** | Reserva cerrada: la afirmación de §15.4/§15.9 sobre flujo completo está respaldada por la vertical real R4.1 **29/29, exit 0, flaky=0** (corrida final, evidencia sanitizada en `docs/quality/evidence-fase-06-g6/provision-run-r41-final.txt`). |
| **R2 — Recuperabilidad** | **GO** | P0-SEC-01 `nodemailer` 9.0.3, P0-SEC-02 con test 15/15, QA-33 5/5 + E2E 4a–4e, QA-49 115/115 y AppSec v1.1. |
| **R3 — Plataforma** | **NO-GO** | **Migrations reversible** con evidencia ejecutable R3.4 (public 20/20 revert; tenant 95/95 + revert de la 099 con datos; runbook corregido). Fuera de este gate: ensayo rollback por componente/imagen y restores global/tenant. CI `execution-orders-e2e` sigue sin pushear (garantía de regresión, no sustituto de corrida). |
| **R4.2 — Cobertura** | **NO-GO** | **MEASURED**: override Babel acotado `<8.0.0`; `--coverage` 230 suites / 2849 tests; core `tasks/services` **83.18% stmts**; API 79.66% stmts / 80.49% lines. Artefactos reales en `apps/api/coverage/`. |
| **R5 — G6 Re-gate** | **G6 GO / G6.5 PENDIENTE** | Vertical R4.1 **CERRADA 29/29, flaky=0**; checklist 45 PASS / 4 PARTIAL / 0 FAIL (+ QA-34 diferido CTO). Falta la corrida Linux real de `production-images` y `execution-orders-e2e`. |

**Nota:** esta tabla registra el estado de remediación y su verificación cruzada; **AI-EM-ARCH consolida la verificación QA/SEC/DS/PROD-UX y, tras verificarla, puede registrar y recomendar el estado de aceptación de calidad de G6**. G6.5 no está autorizado ni cerrado mientras ADR-069 (propuesto) permanezca `Propuesto` y la CI Linux esté pendiente; este informe solo registra sus criterios. **AI-EM-ARCH recomienda G7 y el CTO es su aprobador final**; ningún gate se auto-otorga en este informe.

### 15.2 Tabla de commits por carril

#### R0 — Desbloqueo (AI-SR-FULL / AI-DATA-ENG)

| Commit | Descripción | Owner |
| --- | --- | --- |
| `d77b74f6` | fix(db): repair execution order permission catalog seed | AI-DATA-ENG |
| `7e13064d` | fix(db): harden execution order permission seed | AI-DATA-ENG |
| `330955d5` | fix(db): preserve runtime-reapplied permission seeds | AI-DATA-ENG |
| `ebd15437` | fix(db): validate execution order catalog equivalence | AI-DATA-ENG |
| `35c01351` | fix(db): make execution permission seed reversible | AI-DATA-ENG |
| `49afcdb0` | fix(operations): fail fast on missing execution order idempotency secret | AI-SR-FULL |
| `e4e6564c` | fix(operations): align task configuration test mocks | AI-SR-FULL |
| `38573295` | fix(operations): validate required runtime configuration | AI-SR-FULL |
| `642dfb1a` | fix(operations): inject MFA encryption key in production | AI-SR-FULL |
| `e19789a3` | fix(operations): mark outbox events published inside tenant transaction | AI-SR-FULL |
| `5d94b9f6` | fix(operations): cover missing configuration placeholders | AI-SR-FULL |
| `e76c7c29` | fix(operations): harden R0.3 relay integration coverage | AI-SR-FULL |
| `6e73e154` | fix(operations): isolate relay integration harness | AI-SR-FULL |
| `773d7808` | fix(operations): clean relay integration resources safely | AI-SR-FULL |
| `d106f386` | fix(operations): restore typecheck and boundary test to green | AI-SR-FULL |
| `b9db3a62` | fix(operations): provide strict Jest worker test config | AI-SR-FULL |
| `0b83c5ea` | fix(db): repair migration 094 emptiness guards | AI-DATA-ENG |

#### R1 — Ciclo funcional (AI-SR-FULL / AI-FE-PLATFORM)

| Commit | Descripción | Owner |
| --- | --- | --- |
| `a2a69992` | feat(media): promote evidence assets out of quarantine after analysis | AI-SR-FULL |
| `0d4ac8a3` | fix(operations): make evidence commands and recovery states safe | AI-SR-FULL |
| `16e26506` | fix(operations): make evidence upload intent idempotent | AI-SR-FULL |
| `5cfb86df` | fix(operations): preserve evidence labels and versioned uploads | AI-SR-FULL |
| `ad325a5c` | test(operations): track OT version through e2e evidence chain | AI-SR-FULL |
| `b0c67ead` | fix(operations): align portal execution payloads with frozen contract | AI-FE-PLATFORM |
| `1243e377` | fix(operations): reconcile custody contract with backend schema | AI-FE-PLATFORM |
| `8bf8ba27` | feat(operations): load evidence, template and closure gaps | AI-FE-PLATFORM |
| `556d4bb1` | feat(operations): add material action and custody selectors | AI-FE-PLATFORM |
| `335a66c2` | feat(operations): capture customer acceptance in execution workspace | AI-FE-PLATFORM |
| `a7e92a4a` | fix(operations): stabilize linked order workspace states | AI-FE-PLATFORM |
| `03d6b726` | fix(operations): align agenda and closure actions with backend | AI-FE-PLATFORM |
| `bf1f58b2` | fix(operations): finish portal contract and strict state handling | AI-FE-PLATFORM |
| `04d48968` | fix(operations): align customer signature evidence and execution permissions | AI-FE-PLATFORM |
| `7b061c8c` | fix(operations): honor evidence expiry contract | AI-FE-PLATFORM |
| `6df10c72` | fix(operations): align unlinked and acceptance UX gates | AI-FE-PLATFORM |
| `f766791d` | fix(media): fail closed on tenant and acceptance context | AI-FE-PLATFORM |
| `4ca22b68` | fix(media): validate evidence intent and customer signature state | AI-FE-PLATFORM |
| `a1771648` | fix(operations): close remaining workspace state and artifact UX findings | AI-FE-PLATFORM |
| `39b026b2` | fix(media): close generic execution evidence upload bypass | AI-SR-FULL |
| `380d67c4` | fix(operations): complete execution workspace design-system states | AI-FE-PLATFORM |
| `03b79516` | fix(operations): enforce acceptance and safe requirement labels | AI-FE-PLATFORM |
| `26e340e0` | fix(operations): close R1 workspace UX and design-system findings | AI-FE-PLATFORM |
| `51e0bf1f` | fix(media): bind evidence registration to execution order intent | AI-SR-FULL |

#### R2 — Recuperabilidad (AI-SR-FULL / AI-DATA-ENG / AI-SEC-ENG)

| Commit | Descripción | Owner |
| --- | --- | --- |
| `62059ece` | fix(db): unify migration reversibility policy and data retention | AI-DATA-ENG |
| `a5bd5434` | fix(db): complete migration rollback and real down coverage | AI-DATA-ENG |
| `6995004f` | fix(db): order media asset migration before execution evidence changes | AI-DATA-ENG |
| `1bc82376` | fix(operations): make closure gate fail closed | AI-SR-FULL |
| `6b8f8460` | fix(operations): complete material closure and concurrency gates | AI-SR-FULL |
| `b484717b` | fix(operations): enforce rate limit per actor and tenant | AI-SR-FULL |
| `63c1a709` | fix(media): harden evidence pipeline and complete retention lifecycle | AI-SR-FULL |
| `4e7c1963` | fix(operations): align execution order response contracts | AI-SR-FULL |
| `528fb487` | fix(operations): make agenda to execution order flow contract safe | AI-SR-FULL |
| `8c7a33d5` | feat(operations): implement event redrive and follow-up creation | AI-SR-FULL |
| `f4ac2476` | fix(operations): restore Redis guard test harness | AI-SR-FULL |
| `c083d6f5` | fix(operations): make execution commands contract safe | AI-SR-FULL |
| `10fdf0fa` | fix(media): close binary validation and tenant guard bypass | AI-SR-FULL |
| `658e6e2e` | fix(operations): publish nullable template and safe closure labels | AI-SR-FULL |
| `d655d664` | test(operations): provide tenant context in tasks http harnesses | AI-SR-FULL |
| `2bf5187c` | fix(operations): tighten evidence and quantity API contracts | AI-SR-FULL |
| `da769adf` | fix(db): persist execution order server scope | AI-SR-FULL |
| `0efe3a5b` | fix(operations): enforce server-owned follow-up and redrive access | AI-SR-FULL |
| `cdb235ee` | feat(shared): type execution order redrive command | AI-SR-FULL |
| `18e685bc` | docs(openapi): document execution event redrive input | AI-SR-FULL |
| `f2a49562` | test(operations): cover scoped follow-up and redrive controls | AI-SR-FULL |
| `b04bb9ef` | docs(operations): report R2.2 implementation evidence | AI-SR-FULL |
| `75580c3b` | docs(operations): normalize R2.2 report formatting | AI-SR-FULL |

#### R3 — Plataforma (AI-PLAT-OPS)

| Commit | Descripción | Owner |
| --- | --- | --- |
| `c8f3d14c` | fix(platform): make production profile deployable | AI-PLAT-OPS |
| `0fceb0df` | fix(platform): make production compose validation reproducible | AI-PLAT-OPS |
| `1ad55340` | fix(platform): enforce production database identities | AI-PLAT-OPS |
| `36652e50` | fix(platform): pin production image references | AI-PLAT-OPS |
| `956c960e` | fix(platform): require production service credentials | AI-PLAT-OPS |
| `6d02227b` | fix(platform): include api runtime workspace in image | AI-PLAT-OPS |
| `f4b70552` | fix(platform): disable api ddl and local production storage | AI-PLAT-OPS |
| `1bddfb5d` | fix(platform): complete production image hardening | AI-PLAT-OPS |
| `83d84ca2` | ci(platform): build and validate production images | AI-PLAT-OPS |
| `28477c75` | ci(platform): build and validate migrator image | AI-PLAT-OPS |
| `a7141125` | feat(platform): instrument outbox relay telemetry | AI-PLAT-OPS |
| `84f57fcd` | docs(platform): refresh R3.3 verification evidence | AI-PLAT-OPS |
| `6867e50c` | fix(platform): report actual relay scan timestamp | AI-PLAT-OPS |
| `ce047c24` | docs(platform): add release and rollback runbook | AI-PLAT-OPS |

#### R4 — Verificación / Cobertura / E2E (AI-SR-QA / AI-SR-FULL)

| Commit | Descripción | Owner |
| --- | --- | --- |
| `ff0b77a4` | test(operations): make execution order e2e executable | AI-SR-QA |
| `80aae793` | test(operations): wire e2e closure with frozen template | AI-SR-QA |
| `31aef714` | fix(e2e): provision execution template via SQL seed instead of failed API call | AI-SR-QA |
| `28955dd5` | ci(e2e): enhance R4.1 job with lockfile validation, docker diagnostics, and safety cleanup | AI-SR-QA |
| `33b5ed0d` | test(operations): close remaining named coverage gaps | AI-SR-FULL |
| `f3274a09` | test(tasks): agrega tests unitarios para TaskTimelineService (7 tests, 100% cov) | AI-SR-FULL |
| `0774517c` | test(tasks): reescribe tests de ExecutionOrderTemplatesService (23 tests reales, 25%→~80% cov) | AI-SR-FULL |
| `d3642a87` | test(tasks): agrega tests unitarios para ExecutionOrderInventoryService (7 tests, +38% cov) | AI-SR-FULL |
| `1aa36828` | test(tasks): 23 tests TasksService - retry, update, transition, link, validations | AI-SR-FULL |

#### Seguridad / Dependencias (AI-SEC-ENG / AI-SR-FULL)

| Commit | Descripción | Owner |
| --- | --- | --- |
| `c5642b2b` | chore(security): resolve critical CVE + 88 dependency vulnerabilities | AI-SR-FULL |

### 15.3 Matriz de gates de merge AGENTS.md — verificada

Cada gate del bloque «Gates Before Merge» de `AGENTS.md` fue verificado contra la evidencia archivada en este expediente:

| Gate | Estado | Evidencia |
| --- | --- | --- |
| No critical vulnerabilities | **PASS (re-medido)** | `pnpm audit --prod` 2026-08-01: **0 critical**, 2 high, 4 moderate. P0-SEC-01 `nodemailer` resuelto en working tree (`^9.0.1` → resuelve 9.0.3). Quedan 2 high `brace-expansion` (vía `typeorm>glob>minimatch`) y 2 moderate `file-type` (vía `@nestjs/common>file-type`) como seguimiento fuera del gate crítico. |
| No boundary violations | **PASS** | `tasks.boundary.spec.ts` verde. Imports de MOD12 verificados como ausentes. Media provider vive en `media/` (P0-4 cerrado). Sin imports circulares entre módulos. Verificado por AI-SR-QA en R5. |
| Tests ≥80% core modules | **MEASURED** | Override Babel acotado a `>=7.29.6 <8.0.0` (resuelve `@babel/core@7.29.7`). `pnpm --filter @iwana/api test --coverage` 2026-08-01: **230 suites passed (4 skipped), 2849 tests passed**. API global **79.66% stmts / 80.49% lines**; core `src/modules/tasks/services` **83.18% stmts / 83.6% lines**. Artefactos: `apps/api/coverage/lcov.info` y `coverage-final.json`. |
| OpenAPI updated (if new endpoints) | **PASS** | OpenAPI versionada a **1.1.0** con changelog de breaking en `info.description` (`apps/api/openapi/tasks-execution-orders.v1.json`). `tasks.swagger.spec.ts` re-ejecutado tras el bump: **4/4 PASS, exit 0**, sin fallos de schema. Descongelación/recongelación registrada en §15.7; aprobación formal del gate pendiente de AI-EM-ARCH. |
| Migrations reversible | **PASS** | Evidencia ejecutable **R3.4** (entorno aislado `postgres:18.3-alpine`, `INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md`): public 20/20 apply + revert; tenant 95/95 (000→099) por schema + revert de la **099** con datos (bloqueo sin flag destructivo, aborto atómico ante evidencia enlazada, revert destructivo restaura el CHECK previo). Pendientes fuera del gate: ensayo rollback por componente e imagen (§7.2) y restores global/tenant (§6.3). |
| No PII in logs | **PASS** | Verificado: `execution-orders.task3.spec.ts:941`, `execution-orders.controller.http.spec.ts:402-442`, `execution-orders.evidence.service.spec.ts:302`. Sin PII, stacktraces ni secretos en respuestas. |
| Lint and typecheck passing | **PASS** | `pnpm lint` 0 errors. `pnpm typecheck` verde en todos los paquetes. `pending-visits-ui.ts` cubre los 10 estados de `VisitRequestStatus`. `as any` eliminados del portal. |

### 15.4 Matriz de condiciones de reingreso (§14.6) — verificadas

| Condición §14.6 | Estado | Evidencia |
| --- | --- | --- |
| R0 como bloqueante absoluto | **CERRADO** | QA independiente verificó PostgreSQL real. Cadena tenant aplicada, POST de OT operativo, outbox drena, typecheck verde. |
| Flujo completo contra API, PostgreSQL y Redis reales | **CERRADO** | Corrida final **R4.1** 2026-08-01: **29/29 passed, exit 0, flaky=0, cleanup OK**. Provisionado por `scripts/e2e-provision-operational.mjs` con migraciones + worker BullMQ real; evidencia sanitizada en `docs/quality/evidence-fase-06-g6/provision-run-r41-final.txt`. El job `execution-orders-e2e` queda como garantía de regresión y G6.5 aún exige su ejecución Linux. |
| Salida archivada con conteo explícito de passed | **CERRADO** | Corrida final local: **29/29**, `E2E_PLAYWRIGHT_EXIT=0`, `E2E_PLAYWRIGHT_FLAKY=0`, `E2E_CLEANUP=OK`; evidencia sanitizada en `docs/quality/evidence-fase-06-g6/provision-run-r41-final.txt`. El job de CI conserva artefactos para regresión. |
| Boundary real restablecido (Media owner del puerto) | **CERRADO** | `TasksModule` ya no registra `MediaAsset`. Provider en `media/`. Verificado en §14.5. |
| Upload-intent persistido y compensación implementada | **CERRADO** | R1 backend: `16e26506`, `5cfb86df`, `51e0bf1f`. Idempotencia con fingerprint SHA-256, replay con clave+fingerprint idénticos, compensación de claims. |
| Migraciones aplicables/reversibles con datos | **CERRADO** | R2.4: 59 unit + 23 integration PostgreSQL real. Downs con datos probados. |
| TLS / worker desplegable / telemetría / release / rollback | **EVIDENCIA TÉCNICA G6/G6.5; PRERREQUISITOS G7 PENDIENTES** | Compose productivo validado, worker healthcheck en perfil prod, telemetría relay instrumentada (R3.3) y runbook documentado. QA-34/TLS está diferido para G6/G6.5 y bloquea G7 hasta verificación productiva; rollback por componente y restore global/tenant siguen pendientes y son prerrequisitos de G7. |

### 15.5 Estados QA consolidados — G6 final

| Estado | Cantidad | Detalle |
| --- | --- | --- |
| **PASS** | 45 | QA-01–10, QA-12–17, QA-18, QA-19, QA-21, QA-22, QA-23, QA-25–33, QA-35, QA-36, QA-38–50 |
| **PARTIAL** | 4 | QA-11 (custodia cross-module), QA-20 (responsive), QA-24 (reconciliador — sin fault injection), QA-37 (lag métrica — telemetría completa, umbral sin aprobar) |
| **FAIL** | **0** | Sin bloqueantes P0 ni P1 activos |
| **Diferido CTO** | 1 | QA-34/TLS está diferido para G6/G6.5 y bloquea G7 hasta verificación productiva |

### 15.6 CVE y dependencias

| Métrica | Valor |
| --- | --- |
| CVE críticas | **0** (`pnpm audit --prod` 2026-08-01) |
| High / moderate | **2 high** (`brace-expansion` vía `typeorm>glob>minimatch`, GHSA-3jxr-9vmj-r5cp / GHSA-mh99-v99m-4gvg) / **4 moderate** (`file-type` vía `@nestjs/common`, GHSA-5v7r-6r5c-r473 / GHSA-j47w-4g3g-c36v; `brace-expansion` GHSA-f886-m6hf-6m8v / GHSA-jxxr-4gwj-5jf2) |
| P0-SEC-01 nodemailer | **Resuelto**: `^9.0.1` en `apps/api/package.json`, resuelve **9.0.3** en lockfile; test de no-exposición del contenido de `text` 15/15 PASS |
| Auditoría | AppSec v1.1 emitido; `pnpm audit --prod` registra 0 críticos, 2 high y 4 moderate transitivos no críticos |

### 15.7 Descongelación y recongelación de contratos G4 — pendiente de gate

La afirmación anterior de que los contratos permanecieron sin cambio era
incorrecta. La auditoría identificó cambios breaking en
`packages/shared/src/contracts/operations/execution-orders.ts` durante R0–R4.
La descongelación debe registrarse explícitamente y no equivale a aprobación.

La OpenAPI se actualizó en el working tree a **v1.1.0** en
`apps/api/openapi/tasks-execution-orders.v1.json`, con changelog de:

- `expiresAt` obligatorio en `RegisterEvidenceCommand`;
- `ExecutionOrderDetail.template` nullable;
- `ExecutionOrderEvidence.capturedAt` obligatorio nullable;
- custodia `serial` → `serialNumber` y `custodySelection` → `technicianCustodyId`
  (excepción autorizada R1.4);
- adiciones no-breaking de asset status, completion totals y redrive.

El contrato no se considera recongelado para G7 hasta que el cambio v1.1.0 tenga
registro separado, compatibilidad revisada, `tasks.swagger.spec.ts` ejecutado
después del cambio y aprobación de un rol distinto al productor. La spec DS
`docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` permanece
pendiente de reconciliación con la versión API.

**Actualización 2026-08-01 (verificación AI-SR-FULL):** `tasks.swagger.spec.ts`
fue re-ejecutado **después** del bump a 1.1.0: **4/4 PASS, exit 0**, sin fallos de
schema ni diffs (verificado en el carril R0). Queda pendiente únicamente la
aprobación formal de la descongelación/recongelación por parte de AI-EM-ARCH
como parte del re-registro de gate.

### 15.8 Dependencias abiertas (no bloquean G6/G6.5; algunas bloquean G7)

| Dependencia | Estado | Responsable |
| --- | --- | --- |
| QA-34: certificado TLS de CA reconocida | Diferido para G6/G6.5; bloquea G7 hasta definición de dominio y verificación productiva | AI-PLAT-OPS (cuando dominio definido) |
| `EVIDENCE_UPLOAD_EXPIRED` en contrato público | Residual menor preexistente: los códigos `EVIDENCE_UPLOAD_*` no están publicados en OpenAPI ni en `@iwana/shared`; el portal conserva el mensaje genérico. No bloquea el gate congelado actual. | AI-SR-FULL + AI-FE-PLATFORM, siguiente revisión de contrato |
| Derecho de supresión ARCO | Dependencia con Legal antes del cierre del módulo | CTO + Legal |
| QA-37: umbral de lag formal | Instrumentado (R3.3), sin umbral aprobado — se fija sobre datos reales | AI-PLAT-OPS post-release |
| Ensayo de rollback reproducible | Documentado en runbook, no ejecutado | AI-PLAT-OPS |
| Restore global/tenant verificado | Documentado en runbook, no ejecutado | AI-PLAT-OPS + AI-DATA-ENG |

### 15.9 Recomendación G7

**G6 GO de calidad; merge pendiente de G6.5; G7 NO-GO para producción — estado 2026-08-01.** La consolidación original se emitió sobre precondiciones incumplidas (seis P0, §15.11). Esas precondiciones quedaron remediadas y verificadas:

1. R4.1 vertical completa: **29/29, exit 0, flaky=0, cleanup OK** en la corrida final local; CI Linux sigue pendiente para G6.5.
2. R0 resuelto contra PostgreSQL real: CHECK de la 099 acepta `PENDING` en los 44 schemas; integración postgres 2/2; swagger 1.1.0 4/4.
3. Cobertura **medida** (core `tasks/services` 83.18% stmts; API 79.66% stmts / 80.49% lines).
4. Migraciones reversibles con evidencia ejecutable (R3.4); OpenAPI 1.1.0 con changelog.
5. Seguridad: `nodemailer` 9.0.3, sin exposición del token en logs, `pnpm audit --prod` 0 critical.

El registro formal queda separado por gate: G6 queda registrado como GO de calidad tras la verificación QA/SEC/DS/PROD-UX consolidada por AI-EM-ARCH; G6.5 espera la primera corrida Linux real de los dos jobs y no autoriza el merge mientras siga pendiente; para G7, AI-EM-ARCH recomienda y CTO aprueba tras verificar dominio productivo, TLS, rollback por componente y restores ensayados.

### 15.10 Trazabilidad de artefactos de cierre

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Informe vivo (este documento) | `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md` | v2.0 consolidado |
| Checklist de calidad | `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md` | v1.0 NO-GO con remediación verificada (45 PASS, 4 PARTIAL, 0 FAIL + QA-34 diferido CTO — §7.3/§7.5) |
| Plan de remediación | `docs/plans/2026-07-28-mod09-mod11-ot-instalacion-remediacion-g6.md` | R0–R4 ejecutados |
| Runbook release/rollback | `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` | v1.0 creado |
| Runbook E2E R4.1 | `docs/runbooks/RUNBOOK-E2E-R41-OPERATIONS-v1.0.md` | v1.0 creado |
| ADR-068 | `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` | Aprobado (G1) |
| CI pipeline | `.github/workflows/ci.yml` | Job `execution-orders-e2e` (rama local, no presente en `origin/main`) — garantía de regresión; la corrida local de referencia es 29/29 con flaky=0; G6.5 aún requiere SHA/URL de ambos jobs Linux |

### 15.11 Seis P0 que invalidaron el GO anterior — foto histórica

**Fecha de constatación:** 2026-07-31. **Rol constatador:** AI-EM-ARCH (auditoría de gobernanza, no productor de los carriles).

1. **El flujo vertical de R4.1 nunca se ha completado.** `1f. Cerrar OT exitosamente` sigue en `422`. De 26 casos del spec E2E, 19 no se han ejecutado nunca. La última corrida local (`test-results/.last-run.json`, 15:36) está en `"status": "failed"`, con cinco reintentos fallidos de crear/iniciar/actividad/consumo/evidencia. Cero salidas archivadas con conteo de `passed`. Es la evidencia que §14.6 declaró «la única ausente en todo el expediente» y sigue ausente.

2. **§15.4 y §15.9 sustituyeron la corrida por su cableado, y el cableado nunca ha corrido.** Declararon que el job `execution-orders-e2e` «se ejecutará en cada push… sin requerir corrida manual». El job no existe en `origin/main`: la rama local lleva 110 commits sin pushear. GitHub Actions jamás lo ha visto. Una promesa sobre un push futuro se presentó como cumplimiento de un criterio de salida que exige salida archivada.

3. **HEAD está roto contra una base real, y el arreglo no está commiteado.** `execution-orders.service.ts:1292` escribe `status: 'PENDING'` contra el CHECK de `095:36-38`, que no lo admite: toda creación de intent de evidencia falla con `23514`. La corrección (migración 099 + unión de tipos en la entidad) vive solo en el working tree. Es el patrón exacto del defecto que abrió este plan: fallo de PostgreSQL invisible a la suite porque el tipo era `string` y el `EntityManager` estaba mockeado. Con esto, R0 GO carece de respaldo.

4. **Los contratos congelados de G4 fueron violados.** Siete commits sobre `packages/shared/.../execution-orders.ts` en la ventana R0–R4; solo dos autorizados (redrive y la excepción de custodia de R1.4). Al menos tres cambios breaking sin registro ni versionado: `expiresAt` añadido como obligatorio, template a nullable, `capturedAt` de opcional a nullable. La OpenAPI sigue en `"version": "1.0.0"`. §15.7 afirmaba exactamente lo contrario.

5. **La cobertura no es medible y se declaró PASS.** Un override sin techo en `pnpm-workspace.yaml` resuelve `@babel/core@8.0.1` e incompatibiliza `babel-plugin-istanbul@6.1.1`: 31 suites abortan bajo `--coverage`. Los artefactos archivados están vacíos (`lcov.info = 0 bytes`, `coverage-final.json = {}`). El «≥82%» del §15.3 no citaba ningún reporte: citaba commits de tests. Un commit de tests no es una medición.

6. **El veredicto formal de AI-SEC-ENG es NO-GO.** Los dos informes que §15.1 citaba como «SEC: aprobado» tienen Owner: AI-SR-FULL. El nuevo `INFORME-MOD11-R2-SEC-ENG-VEREDICTO-v1.0.md` identifica `nodemailer@8.0.11` vulnerable en runtime, posible exposición del token de recuperación en `options.text` y ausencia de ráfaga Redis real. La corrección de Nodemailer/logging está en el working tree, pero requiere verificación independiente antes de cambiar el veredicto.

### 15.11.1 Estado de remediación 2026-08-01 (verificación cruzada por rol distinto)

| P0 | Remedio | Verificación ejecutada | Estado |
| --- | --- | --- | --- |
| 1. R4.1 vertical nunca completado | Fix fixture 8a (retire de versiones de material + parseo tolerante del 422) + fix backend 8b (advisory lock en `generateCode` + reintento con savepoint en `createWithinManager`) + correcciones QA-33/BOLA | R4.1 **29/29, exit 0, flaky=0, cleanup OK**; 4e Redis real y 6a BOLA verificados en corrida final | **CERRADO** |
| 2. §15 sustituyó corrida por cableado CI | Corrida final R4.1 ejecutada y archivada | `docs/quality/evidence-fase-06-g6/provision-run-r41-final.txt` (29/29 passed, exit 0, flaky=0, cleanup OK) | **CERRADO** |
| 3. HEAD roto (`PENDING` vs CHECK 095) | Migración **099** + unión de tipos en entidad | CHECK 099 en 44 schemas; INSERT/UPDATE `PENDING` contra PostgreSQL real con ROLLBACK; integración postgres 2/2 | **CERRADO** |
| 4. Contratos G4 violados | OpenAPI **1.1.0** + changelog breaking en `info.description` | `tasks.swagger.spec.ts` **4/4** tras bump (verificado por AI-SR-FULL); descongelación/recongelación en §15.7 | **CERRADO** (aprobación formal AI-EM-ARCH pendiente) |
| 5. Cobertura no medible | Override Babel acotado `<8.0.0` | `--coverage`: 230 suites / 2849 tests; core `tasks/services` 83.18% stmts; API 79.66% stmts / 80.49% lines | **CERRADO** |
| 6. Sin veredicto formal SEC | Veredicto AppSec v1.1 + fix `nodemailer`/logging | `pnpm audit --prod` 0 critical; `nodemailer@9.0.3`; mailer 15/15 incl. no-exposición de `text` | **CERRADO** |

**Nota histórica:** los seis P0 están remediados. El registro vigente y separado de gates está en §15.13.

### 15.12 Orden de reingreso requerido

1. Remediar los P0 técnicos (R0, R4.1, cobertura, contratos) en commits separados del registro de gate. — **HECHO**
2. Verificar cada reparación con un rol distinto al productor. — **HECHO** (R0/swagger, R4.1, R3.4 y AppSec v1.1 con evidencia cruzada)
3. Actualizar el checklist QA con estados reales y evidencia ejecutada, no por deducción. — **HECHO** (45 PASS / 4 PARTIAL / 0 FAIL + QA-34 diferido CTO)
4. Emitir un nuevo registro de gate (§15) que no mezcle remediación y veredicto en el mismo commit. — **HECHO** (§15.13 registra G6/G6.5/G7)
5. Reconsiderar G7 solo cuando el expediente tenga cero P0 activos y las salidas archivadas lo sustenten. — **PRERROGATIVA AI-EM-ARCH/CTO**

### 15.13 Registro vigente G6/G6.5/G7 — 2026-08-01

| Gate                        | Estado        | Evidencia / pendiente                                                                                                                    |
| --------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| G6 Quality acceptance       | **GO**        | Checklist 45/4/0, AppSec v1.1, lint/typecheck, suites focalizadas y migraciones verificadas.                                             |
| G6.5 Merge readiness        | **PENDIENTE** | Requiere `production-images` y `execution-orders-e2e` verdes en Linux, identificados por SHA; la evidencia local no sustituye esos jobs. |
| G7 Production authorization | **NO-GO**     | AI-EM-ARCH recomienda; CTO aprueba; requiere dominio, TLS efectivo, rollback por componente y restore global/tenant.                     |
