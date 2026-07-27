---
description: "R-1 mocks addOrderBy + R-3 migración 088 backfill hash — AI-SR-FULL"
name: "Gate v1.1 R-1 R-3 remediacion"
agent: "sr-backend"
---

# PROMPT — AI-SR-FULL · Gate v1.1 bloqueantes R-1 + R-3

**Emisor:** AI-EM-ARCH  
**Gate vigente:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1](../../docs/informes/INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1.md)  
**Skills:** `nestjs-expert`, `database-migration`, `testing-patterns`, `backend-security-coder`

## Numeración (no negociar)

| # | Rol |
| --- | --- |
| 087 | Schema hash (ya existe) |
| **088** | **Backfill datos** (este prompt) |
| 089 | Índices paginación Ola 2 (fuera de alcance) |

## R-1 — bloqueante Ola 1 (esfuerzo S)

1. En `useful-life-alerts.service.spec.ts` y `useful-life-alerts.isolation.spec.ts`: añadir `addOrderBy: jest.fn().mockReturnThis()` al doble del QB.
2. Aserciones: `orderBy` / `addOrderBy` con los args que emite `serialized-asset.service` (p. ej. `asset.updated_at` + `asset.id`).
3. Correr Jest **sin tubería que oculte el exit code** — leer la línea de resumen Jest. Stop/go: 0 failed en esas suites + `pnpm --filter @iwana/api test` verde (o al menos 0 failed en el aggregate).

## R-3 — bloqueante cierre D-4

1. Migración tenant **`088_backfill_expediente_document_number_hash.ts`**:
   - Idempotente: solo filas `document_number_hash IS NULL AND document_number_encrypted IS NOT NULL`.
   - Por lotes / keyset (mismo espíritu que `backfillDocumentNumberHashes`).
   - Descifrado AES-GCM + `hashDocumentNumber` en Node (misma semántica que el service). **No** SQL plaintext.
   - Cero PII en logs.
   - `transactional = true` (DML + updates; no CONCURRENTLY).
   - `down()`: documentar no-op o `SET hash = NULL` solo si es seguro/reversible acordado — preferir down no-op documentado (backfill no destruye ciphertext).
2. Registrar en `TENANT_MIGRATIONS` **después** de 087.
3. La migración debe poder ejecutarse en el runner multi-tenant existente (cada schema).
4. Boundary: si `@iwana/db` no puede importar `apps/api` crypto, extraer un helper mínimo usable por la migración (sin secrets en el repo; lee env como `aes-gcm.util`). No reintroducir fallback decrypt en `findAll`.
5. Spec o test de migración/helper que demuestre: fila con ciphertext+hash NULL → tras backfill, hash coincide con `hashDocumentNumber(plaintext)` y list por documento la encuentra (mock/integration acotada).

## Fuera de alcance

- R-4 clamp (Ola 2).
- 089 índices.
- Pepper HMAC.
- UI.

## Stop / Go

| Condición | Acción |
| --- | --- |
| Suites useful-life verdes + aserción orden | GO R-1 |
| 088 en runner + backfill idempotente sin PII logs | GO R-3 |
| Suite API: leer **resumen Jest**, no exit de `| tail` | Compuerta válida |
| Colisión 088 con otra migración | NO-GO / renumerar con EM-ARCH |

## Entregables

Diff + evidencia Jest (pegar líneas `Test Suites:` / `Tests:`). Sin commit.
