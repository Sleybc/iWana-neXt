# PROMPT — MOD05 · Ciclo de vida suscriptor ↔ contrato y suspensión unificada (E4)

**Versión:** 1.1 · **Fecha:** 2026-10-19 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; G0 y aclaraciones del lanzamiento aprobados por el CTO el 2026-10-19; [PRD Fase 05 v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.1.md) §§9.1, 9.3.1
**Plan:** [2026-10-19-mod05-ciclo-vida-suspension.md](../plans/2026-10-19-mod05-ciclo-vida-suspension.md)
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) · **HLD:** [HLD-MOD05 Fase 05](../hlds/HLD-MOD05-FASE-05-v1.0.md) · **ADR:** [ADR-097](../adrs/ADR-097-Puertos-de-lectura-para-avisos-de-terminacion-MOD05.md)
**Base:** `main` en `a3c5539e`. Última migración tenant: `157` (`SubscriberFiscalCompleteness1570000000000`). Se trabaja en `main`, sin ramas. **Ningún agente commitea**: lo hace AI-EM-ARCH en G7.

## 0. Reglas comunes

1. Lee `AGENTS.md`, el PRD Fase 05 completo, el plan y tu § de este prompt antes de tocar código.
2. Lee los `SKILL.md` de tu fila en el plan §3 como documentación, no como tool.
3. Solo editas los archivos de tu fila en §2. Si necesitas otro, emite `[BLOQUEO]` y para. Los encargos ya iniciados siguen el contrato de S1 y estas aclaraciones aprobadas.
4. TDD: el test de cada RF se escribe primero y se ve fallar.
5. Nunca PII ni texto libre (`note`, `reason`) en logs, métricas ni mensajes de error.
6. Evidencia: comando exacto y conteo real de suites y tests, sin caché (`--force` o `--no-cache`). Un verde sin cifras no cuenta.
7. Si al implementar descubres que una regla del PRD no se puede trazar a un campo o a una consulta concreta, para y repórtalo: no la interpretes.

## 1. Hechos de partida

Los H1-H9 del PRD §1. Anclas:
- `apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts` (máquina del suscriptor, log con `reason` en L205-207);
- `apps/api/src/modules/crm/contracts/contracts.service.ts` (máquina del contrato L58-68, `_transition` L1027);
- `apps/api/src/modules/crm/contracts/contracts.controller.ts:411-452` (permisos `CRM_EXPEDIENTES_MANAGE`);
- `apps/portal/src/components/crm/subscribers/subscriber-ui.ts:169-175` (deriva `PROSPECT → SUSPENDED`).

## 2. Propiedad de archivos

| Bloque | Edita | Crea |
| --- | --- | --- |
| P0 | — | `docs/specs/2026-10-19-mod05-suspension-servicios-ux-spec.md` |
| B0 | `packages/database/src/migrations/tenant/runner.ts` | migración `158` de `crm_lifecycle_changes` y columnas de `contracts`, con su test integrado up/down |
| B1 | `packages/shared/src/**` (catálogo, esquemas, tipos), `apps/api/src/modules/crm/subscribers/**`, `apps/api/src/modules/crm/contracts/**`, OpenAPI de esos controladores | `subscriber-lifecycle.service.ts`, entidad `CrmLifecycleChange`, integración de puertos de MOD12/MOD11, specs unitarios e integrados |
| B2 | — | `apps/api/src/cli/report-lifecycle-inconsistencies.ts` y sus specs |
| B3 | `apps/portal/src/components/crm/subscribers/**`, `apps/portal/src/lib/api-client.ts` (solo métodos de ciclo de vida) | componentes y specs del diálogo |
| B4 | `apps/api/src/modules/inventory/ports/**`, `apps/api/src/modules/inventory/services/asset-loan.service.ts`, `apps/api/src/modules/inventory/inventory.module.ts` | puerto/adaptador de lectura de comodatos abiertos y tests unitarios/integrados |
| B5 | `apps/api/src/modules/tasks/ports/**`, `apps/api/src/modules/tasks/services/execution-orders.service.ts`, `apps/api/src/modules/tasks/tasks.module.ts` | puerto/adaptador de lectura de OT `RETIREMENT` abiertas y tests unitarios/integrados |

---

## P0 — Spec UX del diálogo «Suspender / Reactivar servicios» · `prod-ux`

Entrega la spec con: flujo de dos pasos (PRD RF-LC-26), estados (cargando, vista previa, error de la API, 409 de §5.4, éxito), textos en el vocabulario del sistema, comportamiento con un solo servicio (salta la selección), acción primaria por estado (RF-LC-25), el aviso «Sin servicios vigentes» (RF-LC-29) y criterios de accesibilidad. Respeta la receta de diálogo de `iwana-identity-ui-review`.
**Cierras cuando:** la spec cubre RF-LC-25 a RF-LC-29 y cada estado tiene texto definitivo (S2).

## B0 — Migración · `sr-backend`

PRD §7 y RF-LC-19 a RF-LC-21. Migración `158` aditiva y reversible: tabla `crm_lifecycle_changes` con sus CHECK (incluido `reason_code` contra el catálogo de RF-LC-13), índice por suscriptor y columnas `status_reason_code` y `status_changed_at` en `contracts`. Regístrala en `runner.ts`.
**Tests:** up/down contra Postgres real en un schema tenant; un CHECK rechaza un `reason_code` fuera del catálogo.
**Cierras cuando:** tests verdes con conteo real y la migración aplica y revierte limpia en el tenant de desarrollo (G1).

## B1 — Servicio de ciclo de vida, endpoints y contratos compartidos · `sr-backend`

PRD RF-LC-01 a RF-LC-24 y RNF-LC-01 a RNF-LC-06.
1. **Primero (S1):** publica en `@iwana/shared` el catálogo por acto, `LifecycleCommandSchema`, `LifecyclePreviewResponse` y los códigos de error. Avisa al orquestador antes de seguir.
2. `SubscriberLifecycleService` con: la función de derivación (RF-LC-02/03), los comandos por lote con `SELECT … FOR UPDATE` y transacción única, la vista previa sin escritura, las guardas de §5.4, el historial con `batch_id` y la idempotencia.
3. Los endpoints de contrato individual delegan en el mismo servicio y exigen `{ reasonCode, note? }`.
4. `PATCH /crm/subscribers/:id/status` responde 409 `SUBSCRIBER_STATUS_DERIVED` para `ACTIVE ⇄ SUSPENDED` (RF-LC-06).
5. Permisos según D-E4-5 (RF-LC-24). El log de aplicación pasa a registrar solo ids, estados y `reason_code` (RF-LC-23).
6. `GET /crm/subscribers/:id/lifecycle-changes` paginado según ADR-065.
7. OpenAPI actualizado.
8. Integra en la vista previa de terminación los puertos `AssetLoanReadPort` (MOD12) y `ExecutionOrderReadPort` (MOD11) después de que B4 y B5 publiquen sus contratos. Las lecturas con error hacen fallar la vista previa; no se presenta una lista vacía sin consulta exitosa. El aviso de OT es general al suscriptor (`contractIds: []`).
**Tests:** CA-LC-01 a CA-LC-09, con un test integrado contra Postgres real por cada 409 de §5.4 y uno de atomicidad (CA-LC-07). Un test que capture el logger para CA-LC-08.
**Cierras cuando:** tests de `@iwana/api` y `@iwana/shared` verdes con conteo real, typecheck verde y OpenAPI regenerado.

## B4 — Puerto de lectura de comodatos · `sr-backend`

En MOD12 define y exporta `AssetLoanReadPort.findOpenContractIds(contractIds)`. Su adaptador consulta solamente asignaciones vigentes (`removedAt IS NULL`) en el tenant actual y devuelve IDs de contratos con comodato abierto. No devuelve detalle de activos ni expone `EntityManager` o repositorios. No cierra préstamos.
**Tests:** contrato mínimo, aislamiento por tenant y consulta real contra Postgres para asignación abierta/cerrada y contrato sin préstamo.
**Cierras cuando:** InventoryModule exporta el puerto y los tests pasan con conteo real; no editas CRM.

## B5 — Puerto de lectura de órdenes de retiro · `sr-backend`

En MOD11 define y exporta `ExecutionOrderReadPort.hasOpenWithdrawalOrders(subscriberId)`. Solo considera `workType=RETIREMENT`, estados `CREATED`, `ASSIGNED`, `EN_ROUTE`, `IN_PROGRESS` o `BLOCKED`, y `isAnnulled=false`, en el tenant actual. Devuelve un booleano; no devuelve datos de OT ni la modifica.
**Tests:** contrato mínimo, tenant correcto y consulta real contra Postgres para OT abierta, terminal, anulada, no retirada y otro suscriptor.
**Cierras cuando:** TasksModule exporta el puerto y los tests pasan con conteo real; no editas CRM.

## B2 — CLI de inconsistencias · `sr-backend` (tras S1)

CLI en simulación por defecto, sin modo de escritura: por tenant, lista los suscriptores cuyo `status` no coincide con la derivación de RF-LC-02, con su id, estado actual, estado derivado y conteo de contratos por estado. Reutiliza la función de derivación de B1, sin duplicarla. Sin PII en la salida.
**Cierras cuando:** CA-LC-11 cubierto con test integrado y la salida contra el tenant de desarrollo queda anexada al reporte (solo conteos e ids).

## B3 — Portal · `fe-platform` (tras S1 y S2)

PRD RF-LC-25 a RF-LC-29 y la spec de P0.
1. Diálogo en dos pasos con vista previa; motivo obligatorio del catálogo y nota opcional.
2. Acción primaria por estado en el encabezado; «Cambiar estado» queda para `LEAD → PROSPECT` y la cancelación.
3. Acciones de `ContractCard` con motivo, mediante el mismo componente.
4. Corrige la deriva H7: la tabla de transiciones del portal se alinea con la de la API.
5. Último motivo y fecha en el contrato; aviso «Sin servicios vigentes».
6. Manejo de los 409 de §5.4 con su mensaje y la acción que corresponda.
**Tests:** CA-LC-10 y cada estado de la spec P0.
**Cierras cuando:** tests verdes con conteo real, typecheck verde y `audit-ui.mjs` sin hallazgos en la carpeta.

---

## V1 — `sr-qa`
Traza CA-LC-01 a CA-LC-11 a tests concretos. Corre API, shared y portal sin caché. Navegador en `localhost:3002`: suspender todos, reactivar uno, intentar cancelar con servicios vivos, verificar que el portal no ofrece `PROSPECT → SUSPENDED`. Veredicto GO/NO-GO.

## V2 — `sec-eng`
Sin PII ni `note` en logs; historial sin UPDATE/DELETE desde la app; CA-LC-09 (403 con solo `CRM_EXPEDIENTES_MANAGE`); idempotencia; responde Q3 del PRD (¿cifrar `note`?). Veredicto GO/NO-GO.

## V3 — `boundary-reviewer` ∥ `contract-drift-reviewer`
Sin accesos cruzados fuera de los puertos del Modulith, incluidos los nuevos puertos MOD12/MOD11; sin lecturas fuera del tenant actual; esquemas de shared consumidos igual por API y portal; OpenAPI coherente con los DTO.

## V4 — `ds-owner`
Veredicto de identidad del diálogo contra la spec P0 y las recetas; `audit-ui.mjs` en 0.

## V5 — `gate-verifier`
Gates Before Merge sobre `@iwana/api`, `@iwana/shared`, `@iwana/db` y `@iwana/portal` con `--force`, conteo real, cobertura del servicio de ciclo de vida ≥80 % y `pnpm audit --prod --audit-level critical` en 0.

## 3. Formato de reporte

Entregables con ruta; comando y conteo real; RF y CA cubiertos por identificador; `[BLOQUEO]` si los hay; deuda nueva por severidad P0-P3.
