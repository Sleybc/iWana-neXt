# INFORME — Flujo operativo cableado MOD10 + MOD11 + MOD09 + MOD12

**Versión:** 1.8  
**Estado:** Reabierto — G4 congelado (contratos); G5 ejecutado; G6 QA ejecutado: **NO-GO**; G7 recomienda **NO-GO**  
**Fecha:** 2026-07-27  
**Fecha de cierre anterior:** 2026-07-07  
**Aprobado por:** CTO (G1), AI-EM-ARCH (G2–G4)  
**Modo activo:** Gate G7 — decisión de stop/go  
**Autor:** AI-SR-FULL (v1.0–v1.3), AI-EM-ARCH (v1.4 — registro G4; v1.6 — decisión G7; v1.7 — auditoría independiente; v1.8 — re-gate), AI-SR-QA (v1.5 — G6 QA audit)  
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

## 10. G6 QA Gate — 2026-07-27 (AI-SR-QA)

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

| Estado | Cantidad | Items |
| --- | --- | --- |
| PASS | 34 | QA-01–10, QA-12–17, QA-19, QA-21, QA-25–32, QA-35, QA-38–39, QA-42–48 |
| PARTIAL | 8 | QA-11, QA-18, QA-20, QA-22, QA-24, QA-36 |
| FAIL | 8 | QA-23, QA-33, QA-34, QA-37, QA-40, QA-41, QA-49, QA-50 |

### 10.4 Veredicto: **NO-GO**

**Bloqueantes P0:**
1. QA-23: Migraciones tenant sin test de reversibilidad
2. QA-34: Sin evidencia TLS/ingress (PLAT-OPS)
3. QA-40: Catálogo de permisos sin test de compatibilidad de migración
4. QA-41: Sin test de carrera de consecutivo OT
5. QA-49: Sin evidencia de que offline no persiste PII

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
| QA-41: OT number race test | P0 | AI-SR-FULL | G5 |
| QA-49: offline PII evidence | P0 | AI-FE-PLATFORM | G5 |
| QA-50: threat model/ASVS | P1 | AI-SEC-ENG | G6 |
| Typecheck DATA-P0-1 | P0 | AI-FE-PLATFORM | G5 |
| Swagger DI gap | P1 | AI-SR-FULL | G5 |

---

## 11. Decisión G7 y Task 10 — 2026-07-27

**Modo:** EM + Architect + Orchestrator  
**Decisión:** **NO-GO** para producción y para retirar la compatibilidad ligera de `WorkOrder` o el alias `wfm.work_orders.execute`.  
**CTO:** no se solicita aprobación de producción: el gate no satisface las condiciones para escalar un GO.

### Evidencia consolidada

- G6 vigente permanece en **NO-GO**: QA-23, QA-34, QA-40, QA-41 y QA-49 son P0 abiertos; QA-33, QA-37 y QA-50 son P1 abiertos. El typecheck y la spec Swagger también carecen de evidencia verde posterior. Ver checklist §7.3–§7.4 y este informe §10.
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

## 12. Auditoría independiente G6/G7 — 2026-07-28

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

## 13. Re-gate de remediaciones — 2026-07-28

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
