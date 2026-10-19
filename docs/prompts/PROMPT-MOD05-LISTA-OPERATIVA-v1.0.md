# PROMPT — MOD05 · Lista operativa de Suscriptores (E1 + E2) y P3 de la Fase 05

**Versión:** 1.0 · **Fecha:** 2026-10-19 · **Emisor:** AI-EM-ARCH · **Estado:** Aprobado; G0 aprobado por el CTO el 2026-10-19 (D-F6-1 A (sin zona; ciudad del servicio principal), D-F6-2 regla RF-LO-02, D-F6-3 conteos globales, D-F6-4 diferir vistas guardadas, D-F6-5 teclado solo con foco en la tabla y D-F6-6 incluir los P3; [PRD Fase 06](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md) §9.1)
**Plan:** [2026-10-19-mod05-lista-operativa.md](../plans/2026-10-19-mod05-lista-operativa.md)
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (v1.2, En revisión; la estructura y el destino obligatorio se respaldan por `AGENTS.md` → Documentation Rules).
**Base:** `main` en `ec0e4e16`. Se trabaja en `main`, sin ramas. **Ningún agente commitea**: lo hace AI-EM-ARCH en G7.

## Artefactos de entrada obligatorios

- **PRD:** [MOD05 CRM Suscriptores — Fase 06](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md) (Aprobado).
- **HLD:** [MOD05 Arquitectura v2.0](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md) y [MOD05 Fase 05 v1.1](../hlds/HLD-MOD05-FASE-05-v1.1.md).
- **ADRs aplicables según el PRD:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md), [ADR-067](../adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md), [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md), [ADR-083](../adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md) y [ADR-097](../adrs/ADR-097-Puertos-de-lectura-para-avisos-de-terminacion-MOD05.md).
- **Plan de sprint:** no hay plan de sprint específico para Fase 06; la ejecución se coordina con el [plan de orquestación](../plans/2026-10-19-mod05-lista-operativa.md).
- **Prompt arquitectónico de origen:** [Activar AI-EM-ARCH](PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md) y [análisis de dispatch](PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md).
- **Artefactos faltantes:** no se detectan HLD ni ADR aplicables faltantes; no existe plan de sprint F06 dedicado. El alcance no requiere un ADR nuevo.

## 0. Reglas comunes

1. Lee `AGENTS.md`, los artefactos de entrada obligatorios, el plan y tu § antes de tocar código.
2. Lee los `SKILL.md` de tu fila en el plan §3 como documentación, no como tool.
3. Solo editas los archivos de tu fila en §2. Si necesitas otro, emite `[BLOQUEO]` y para.
4. TDD: el test de cada RF se escribe primero y se ve fallar.
5. Nunca PII en logs, en la URL ni en mensajes de error.
6. Evidencia: comando exacto y conteo real, sin caché. Un verde sin cifras no cuenta.
7. Si una regla del PRD no se puede trazar a un campo o a una consulta concreta, para y repórtalo.
8. Cualquier foco diferido (`requestAnimationFrame`, `setTimeout`) se cancela en el cleanup y no pisa un foco que el operador ya movió. Es la causa del rojo del CI en la Fase 05.

## 1. Hechos de partida

H1-H9 del PRD §1. Anclas:
- `apps/api/src/modules/crm/subscribers/subscribers.service.ts:621-700` (lista con la subconsulta `has_live_contracts`);
- `apps/api/src/modules/commercial/ports/plan-catalog-read.port.ts:31-40`, implementado por el adaptador activo `apps/api/src/modules/commercial/ports/commercial-catalog-read.adapter.ts`; `TenantPlanCatalogReadAdapter` en `apps/api/src/modules/tenant/tenant-crm-read-adapter.service.ts` es una implementación legado no registrada en runtime;
- `apps/api/src/modules/crm/subscribers/subscriber-fiscal-completeness.service.ts:22-34` (regla que `fiscalIncomplete` replica en SQL);
- `apps/portal/src/components/shared/portal-ui.tsx:1583` (`PortalSidePeek`);
- seis sitios con la guarda de foco: `packages/ui/src/components/Dialog.tsx`, `packages/ui/src/components/OperationalSidePeek.tsx`, `apps/portal/src/components/shared/portal-ui.tsx`, `apps/portal/src/components/shared/use-portal-side-drawer-a11y.ts`, `apps/portal/src/components/auth/SessionRecoveryModal.tsx`, `apps/portal/src/components/crm/subscribers/SubscriberLifecycleDialog.tsx`.

## 2. Propiedad de archivos

| Bloque | Edita | Crea |
| --- | --- | --- |
| P0 | — | `docs/specs/2026-10-19-mod05-lista-operativa-ux-spec.md` |
| D0 | — | `docs/specs/2026-10-19-ds-deferred-initial-focus-contract.md` |
| B0 | `packages/shared/src/schemas/subscriber.schema.ts` (y su spec), `apps/api/src/modules/crm/subscribers/**`, `apps/api/src/modules/commercial/ports/plan-catalog-read.port.ts`, `apps/api/src/modules/commercial/ports/commercial-catalog-read.adapter.ts`, `apps/api/src/modules/tenant/tenant-crm-read-adapter.service.ts` (solo el método nuevo), OpenAPI de suscriptores | specs unitarios, de paridad e integrados |
| Q0 | — | `apps/api/src/modules/crm/contracts/tests/contracts.controller.http.spec.ts` |
| F1 | `packages/ui/src/components/Dialog.tsx`, `packages/ui/src/components/OperationalSidePeek.tsx`, `packages/ui/src/index.ts`, la guarda de foco de `apps/portal/src/components/shared/portal-ui.tsx`, `use-portal-side-drawer-a11y.ts`, `SessionRecoveryModal.tsx`, `SubscriberLifecycleDialog.tsx` | `packages/ui/src/hooks/use-deferred-initial-focus.ts` y su spec |
| F2 | `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx` (y su spec), `subscriber-ui.ts`, `apps/portal/src/lib/api-client.ts` (solo métodos de suscriptores) | `SubscriberPeek.tsx`, `SubscriberQueueChips.tsx`, `SubscriberMoreFilters.tsx` y sus specs; E2E `e2e/tests/portal-mod05-lista-operativa.spec.ts` |

---

## P0 — Spec UX de la lista operativa · `prod-ux`

Columnas (RF-LO-10), chips con conteo y su comportamiento con la búsqueda (RF-LO-11 y RF-LO-14), «Más filtros» con resumen de filtros activos (RF-LO-13), contenido y estados de la vista lateral (cargando, error, restringido, sin servicios, con acciones) (RF-LO-15 a RF-LO-18), teclado (RF-LO-19) y textos definitivos. Respeta las recetas §2 y §9 de `iwana-identity-ui-review` y SPEC-PORTAL-SIDEPEEK-A11Y.
**Cierras cuando:** cada RF de §5.3 a §5.5 tiene su estado y su texto (S2).

## D0 — Contrato del hook de foco diferido · `ds-owner`

Define `useDeferredInitialFocus` (RF-LO-21): firma, cuándo se considera «intacto» el foco (`body`, `documentElement`, `null` o el elemento que tenía el foco al dispararse), cancelación del frame en el cleanup y en el siguiente disparo, y los dos usos (apertura del contenedor y cambio de paso). Define también `DialogTitle` con `forwardRef` (RF-LO-22). Sin tokens ni variantes nuevas.
**Cierras cuando:** el contrato cubre los seis sitios de H8 sin excepciones (S3).

## B0 — Proyección, conteos y puerto de planes · `sr-backend`

1. **Primero (S1):** en `@iwana/shared`, `primaryService`, `otherLiveServicesCount`, `SubscriberQueueCountsSchema` y los filtros `contactPending`, `fiscalIncomplete` y `withoutLiveServices`. Avisa al orquestador.
2. `PlanCatalogReadPort.getPlansByIds` y sus implementaciones en una sola consulta por lote: `CommercialCatalogReadAdapter` es el provider activo usado por contratos; mantener también la implementación legado de `TenantPlanCatalogReadAdapter` para cumplir el contrato abstracto. No cambiar el wiring del token.
3. Proyección del principal (RF-LO-01 a RF-LO-05) en la lista y en el lookup exacto, con una subconsulta lateral que use `idx_contracts_tenant_subscriber`, y planes resueltos por lote.
4. `GET /crm/subscribers/queue-counts` (RF-LO-06 a RF-LO-09) con `COUNT(*) FILTER`, y los tres filtros nuevos con la misma regla SQL.
5. OpenAPI actualizado.
**Tests:** CA-LO-01 a CA-LO-04; un test que cuente las consultas principales de una página de 100 filas (filas, conteo total y lote de planes) y mida aparte las lecturas de Party/Privacy (RNF-LO-01); el test de paridad de `fiscalIncomplete` contra el servicio de completitud; tests integrados contra Postgres para la regla del principal y los conteos.
**Cierras cuando:** tests verdes con conteo real, typecheck verde y `EXPLAIN` de la lista anexado (RNF-LO-02).

## Q0 — Prueba HTTP de CA-LC-09 · `sr-qa`

RF-LO-20 con supertest, siguiendo el patrón de los `*.controller.http.spec.ts` existentes: 403 en `suspend`, `reactivate` y `terminate` para un usuario con `CRM_EXPEDIENTES_MANAGE` y sin `CRM_SUBSCRIBERS_MANAGE`, y que la petición pase el guard con `CRM_SUBSCRIBERS_MANAGE`.
**Cierras cuando:** la spec pasa con conteo real y falla si se revierte el permiso del controlador (anexa ese rojo).

## F1 — Hook de foco en `@iwana/ui` y adopción · `fe-platform` (tras S3)

Implementa el contrato de D0, expórtalo desde `@iwana/ui` y adóptalo en los seis sitios sin cambiar su comportamiento. `DialogTitle` con `forwardRef`, y `SubscriberLifecycleDialog` usa la ref en vez de `querySelector`.
**Tests:** los del hook (frame cancelado al desmontar y al volver a dispararse, no pisa un foco movido, enfoca si nadie lo reclamó). Los tests existentes de los seis sitios pasan **sin editarse**.
**Cierras cuando:** tests de `@iwana/ui` y `@iwana/portal` verdes con conteo real y typecheck de ambos verde.

## F2 — Lista, chips, «Más filtros» y vista lateral · `fe-platform` (tras S1 y S2)

RF-LO-10 a RF-LO-19 según la spec de P0. Consume `PortalSidePeek` y `SubscriberLifecycleDialog` sin editarlos. Chip y vista lateral en la URL (`?queue=`, `?peek=<id>`). Tras una acción de ciclo de vida, recarga la fila y los conteos.
**Tests:** CA-LO-05 a CA-LO-08 en specs de componente y en el E2E nuevo (sintético, sin credenciales ni datos reales). La spec de la vista lateral se corre cinco veces seguidas y una con `--maxWorkers=1` junto con `src/components/crm`.
**Cierras cuando:** tests verdes con conteo real, typecheck verde y `audit-ui.mjs` sin hallazgos.

---

## V1 — `sr-qa`
Traza CA-LO-01 a CA-LO-10. Corre API, shared, ui y portal sin caché. E2E: chip, vista lateral, suspender desde la vista lateral, teclado. Mide la página de 100 filas (CA-LO-02). Veredicto GO/NO-GO.

## V2 — `sec-eng`
Proyección de privacidad en la lista y la vista lateral (RF-LO-04, RF-LO-18, CA-LO-08); `?peek=` solo con el id; conteos sin filtrar datos de partes bloqueadas. Veredicto GO/NO-GO.

## V3 — `boundary-reviewer` ∥ `contract-drift-reviewer`
Método aditivo en el puerto de MOD06 sin acceso cruzado fuera de él; esquemas de shared consumidos igual por API y portal; OpenAPI coherente.

## V4 — `ds-owner`
Identidad de lista, chips y vista lateral contra la spec P0 y las recetas; adopción del hook sin desviaciones del contrato D0; `audit-ui.mjs` en 0.

## V5 — `gate-verifier`
Gates Before Merge **en local** sobre `@iwana/api`, `@iwana/shared`, `@iwana/ui` y `@iwana/portal` con `--force`, conteo real y `Cached: 0`, más `src/components/crm` con `--maxWorkers=1` y `pnpm audit --prod --audit-level critical` en 0. El CI de `main` se verifica en G7, después del push.

## 3. Formato de reporte

Entregables con ruta; comando y conteo real; RF y CA cubiertos por identificador; `[BLOQUEO]` si los hay; deuda nueva por severidad P0-P3.
