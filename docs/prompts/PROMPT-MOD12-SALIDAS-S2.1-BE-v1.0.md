# PROMPT DE EJECUCIÓN — MOD12 Salidas · Remediación BE S2.1 (P0/P1 + módulo + migración 126)

**Versión:** 1.0
**Fecha:** 2026-09-06
**Módulo:** MOD12 Inventario / SCM — Existencias y Catálogo maestro
**Fase:** S2.1 (remediación BE, sucede a S2)
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-SR-FULL** · **Revisión obligatoria:** **AI-DATA-ENG** (migración) · **Consulta:** AI-SR-QA (testabilidad)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*
**Spec normativa:** [SPEC S2 v1.0](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) §5 + §8
**Informe vigente:** [INFORME-MOD12-SALIDAS-S2-v1.0](../informes/INFORME-MOD12-SALIDAS-S2-v1.0.md) (actualizar, no crear nuevo)

---

## 0. Contratos congelados

| Contrato | Ruta y versión | Estado |
|---|---|---|
| Contrato API tipado | `packages/shared` (`StockIssueLineSchema` con `serializedAssetIds[]` + normalización singular→arreglo) + lectura `serializedAssets{id,serialNumber}` | **CONGELADO** — no cambiar forma sin evento de re-sync vía AI-EM-ARCH |
| Contrato componente | No aplica a este track | — |

## 1. Objetivo exacto

- **Resultado esperado:** S2 backend sin P0/P1 conocidos, migración 126 apta para rollout multi-tenant con datos, entidad hija registrada en el módulo.
- **Lo que sí entra:** (a) registro `StockIssueLineSerial` en `inventory.module.ts` (ya en árbol sucio, verificar + test); (b) refactor migración 126 según §3.1 del dictamen DATA-ENG; (c) P1s SR-FULL: `serialNumber` en ledger, `requestedQty` entero `=== len`, `createdByUserId`, eventos CUD, reserva por lote, `with-stock` en SQL; (d) P2s de bajo costo: centralizar constantes, test paridad enum↔predicado, 409 en replay con distinto handoff, snapshot en tx, schema cerrado `handoffAttachments`.
- **Lo que no entra:** frontend, cambio de forma del contrato, retiro del singular de transición, trigger DB para la espejo, E2E con datos reales (dueño operador).

## 2. Artefactos de entrada obligatorios

- Dictámenes: revisión SR-FULL (tabla P0-P3 + §4 refactor) y dictamen DATA-ENG (§1-§3, H1-H9) de la sesión 2026-09-06.
- Archivos: `apps/api/src/modules/inventory/services/stock-issue.service.ts`, `stock-issue-picking.service.ts`, `services/inventory-item.service.ts`, `dto/index.ts`, `inventory.module.ts`, `packages/database/src/migrations/tenant/126_*`, `entities/stock-issue-line-serial.entity.ts`.
- Gobernanza: `AGENTS.md` (strict TS, sin `any`, sin promesas flotantes, `SET LOCAL search_path`, `@Roles(UserRole.*)`, cero PII).

## 3. Instrucciones

### B0 · Higiene (primer commit)
Verificar el diff sucio de `inventory.module.ts` (registro `StockIssueLineSerial` en imports + `forFeature`). Si falta en algún contexto de test (in-memory store), registrarlo también. Test mínimo: crear salida con 2 seriales contra el módulo real resuelve el repositorio de la hija (hoy fallaría con `RepositoryNotFound`). No avanzar sin este commit en verde.

### B1 · Migración 126 refactorizada (con AI-DATA-ENG antes de reescribir)
Pre-vuelo (0a huérfanos, 0b mismatch tenant, 0c colisiones activas → abortan con conteo); DDL `IF NOT EXISTS` + índice nuevo `(tenant_id, issue_id)`; backfill idempotente heredando `l.created_at/l.updated_at` + `ON CONFLICT DO NOTHING`; post-vuelo cobertura + espejo 0 divergentes. `down` documentado LOSSY con backup `_backup_126`. Declarar H8 (sin FK a `serialized_assets`, integridad por app) en el header. Umbral: >5.000 singulares por tenant → backfill por rangos de `l.id`.

### B2 · Reglas y ledger
`serial-group.utils.ts` puro (`normalizeSerialGroup`, `assertSerialGroupQty` entero `=== len`); extraer `assertSerializedGroupsIntegrity` a validador inyectable por pasos testeables; `adjustReservation` único agregando deltas por `(item,lot,condition)` + disponibilidad GROUP BY única; `DispatchLedgerLine.serialNumber: string|null` poblado desde `assetById`; no rellenar `createdByUserId` con `actor.sub`; emitir `ISSUE_CREATED/UPDATED/CANCELLED` post-commit; `with-stock` con `HAVING SUM>0` + paginación en SQL.

### B3 · Coherencia
Centralizar `SERIALIZED_TRACKING_MODES` + `SERIAL_DISPATCHABLE_STATUSES` (= `PICKABLE_SERIAL_STATUSES`) + `SERIAL_COMMIT_TERMINAL_STATUSES`; test paridad enum TS↔predicado; replay `dispatch` con distinto handoff → 409 o documentar idempotencia; snapshot `beforeByItem` dentro de la tx; `handoffAttachments` con schema cerrado; `assertTrackingModeChangeAllowed` filtra activos no terminales + incluye `reserved`/salidas abiertas; merge `update()` incluye pareja barcode y agrega todos los mensajes.

## 4. Restricciones no negociables

- Sin cambiar la forma congelada del contrato; cualquier desviación → `[BLOQUEO]` a AI-EM-ARCH.
- Multi-tenant por schema, `tenant_id` en cada query, sin schema hardcodeado; `issue_status` espejo solo vía `syncSerialMirrorStatus` en la misma transacción.
- Mensajes al operador en español, sin enums crudos, sin PII/secretos en código, tests o logs.
- Migración numerada 126, con `down()`, orden que verifica `migration-order.spec.ts`.

## 5. Entregables

**Técnicos:** B0+B1+B2+B3 con tests (unit puros, service con batch, migración up/down + pre/post-vuelo, 23505→400, singular compat). Suites `api`/`db`/`shared` inventory en verde con conteo real, typecheck+lint 0 errores.
**Documentales:** sección S2.1 en el informe S2 vigente + evidencia en `docs/quality/`; script SQL de reconciliación de espejo documentado.

## 6. Criterios de aceptación

- CA-S2.1-BE01: módulo resuelve `StockIssueLineSerial` y el test B0 pasa.
- CA-S2.1-BE02: pre-vuelo aborta con conteo ante huérfanos/mismatch/colisiones; post-vuelo 0 faltantes + 0 divergentes.
- CA-S2.1-BE03: línea N seriales reserva N con 1 `applyDelta` por clave; ledger N×cantidad 1 con `serialNumber` legible.
- CA-S2.1-BE04: `requestedQty` fraccionaria o ≠ len se rechaza en borde; singular sigue despachando como grupo de 1.
- CA-S2.1-BE05: `audit:adr-citations` BLOQUEANTE 0.

## 7. Stop/go

Detenerse con `[BLOQUEO]` si: el pre-vuelo revela colisiones reales en tenants con datos; el registro del módulo exige cambiar boundaries; aparece flujo legítimo `SERIALIZED`+consumible (señal del ADR pendiente). GO cuando §6 verde + revisión DATA-ENG APRUEBA.
