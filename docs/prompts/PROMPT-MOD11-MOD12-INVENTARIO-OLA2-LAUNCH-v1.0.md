# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 2 (I2 + I3 + I1-R)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 · **Spec:** v1.1 (Aprobado, 2026-10-06)
**Gates:** G1 cerrado · G4 emitido · **ola 1 en GO** (I1 y P1, auditados el 2026-10-06)
**Contrato congelado:** `packages/shared/src/contracts/operations/execution-orders.ts` **v1.6**, con `InventoryConsumptionRequestedV2Schema`, `SignedInventoryExecutionRequestSchema` y `canonicalizeInventoryExecutionRequest`. No se modifica.
**Cerrado, no re-despachar:** G1, P1 e I1 (salvo la remediación acotada de I1-R).

| # | Subagente | Encargo (`PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md`) | Skills a leer antes de codificar |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §I2: recibos (139), ledger tipado y consumidor en el API | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`, `backend-security-coder` |
| 2 | `fe-platform` | §I3: motivo del rechazo y pendiente prolongado | `frontend-dev-guidelines`, `testing-patterns` |
| 3 | `sr-backend` | §I1-R: fila envenenada en D7 | `nestjs-expert`, `postgresql`, `testing-patterns` |

**Paralelo:** los tres a la vez, porque los archivos son disjuntos: `inventory` más la migración 139, el portal y el servicio de rescan. Los bloques 1 y 3 son del mismo agente, en sesiones separadas.
**Local:** genera `INTERNAL_QUEUE_SIGNING_KEY` con `openssl rand -base64 32` en tu `.env` no versionado.
**Cierre:** tres informes en GO. Después, la ola 3: S2 e I4.

---

### Bloque copiar-pegar — `sr-backend` (I2)

> Actúa como `sr-backend`. Lee `AGENTS.md`, la spec v1.1 completa (D3, D4, D5, D8, D9 y D11 son de esta ola) y `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §I2. Lee los `SKILL.md` de la tabla.
> Migración 139 de recibos. `InventoryBusinessRejection` y las validaciones de serial en custodia y artículo activo, **solo en el camino de OT**.
> Consumidor `@Processor('inventory-execution-requests')` en `InventoryModule`, en este orden: firma (actual o anterior, comparada en tiempo constante) → Zod con el esquema compartido → tenant en `public.tenants` (si no está `ACTIVE`, se difiere) → recibo (si existe, reemite) → ledger con principal `{ sub }` → recibo en la misma transacción → respuesta con `eventId = uuidv5(inventoryRequestId)`, y el job se completa solo si el encolado fue aceptado.
> Gates: typecheck, jest de `inventory` con `Cached: 0`, la 139 con `down` y la carrera de dos jobs probada. Entrega el informe I2. Sin commit.

### Bloque copiar-pegar — `fe-platform` (I3)

> Actúa como `fe-platform`. Lee `AGENTS.md`, la spec v1.1 §4 y `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §I3. Lee los `SKILL.md` de `frontend-dev-guidelines` y `testing-patterns`.
> En `ExecutionOrderMaterialAction.tsx`: el motivo del rechazo con su copy literal de dos partes (`rejectionReasonCode` del contrato v1.6) y el pendiente prolongado a partir de una constante compartida. Sin enums crudos.
> Gates: typecheck del portal, `operations/` ≥ 759 con `Cached: 0` y `audit-ui.mjs` limpio. Entrega el informe I3. Sin commit.

### Bloque copiar-pegar — `sr-backend` (I1-R)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §I1-R. Lee los `SKILL.md` de `nestjs-expert`, `postgresql` y `testing-patterns`.
> En el scanner D7, procesa cada fila con su propio `SAVEPOINT`. Una fila con datos nulos o inválidos se excluye con su código, se marca agotada y se registra sin payload. Nunca bloquea al resto del tenant.
> Prueba un lote con la fila envenenada en primer lugar. Worker ≥ 123 más los casos nuevos con `Cached: 0`. Entrega el informe I1-R. Sin commit.
