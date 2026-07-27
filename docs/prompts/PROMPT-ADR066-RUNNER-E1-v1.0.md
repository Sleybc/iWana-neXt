---
description: "Implementar ADR-066 flag transactional en runner/revert — AI-SR-FULL"
name: "ADR-066 runner E-1 ejecucion"
agent: "sr-backend"
---

# PROMPT — AI-SR-FULL · E-1 ejecución (ADR-066)

**Emisor:** AI-EM-ARCH  
**ADR:** [ADR-066](../../docs/adrs/ADR-066-Migraciones-No-Transaccionales-Runner.md) (Aprobado CTO)  
**Plan deuda:** [INFORME-ADR065-DEUDA-PAGO-PLAN-v1.0](../../docs/informes/INFORME-ADR065-DEUDA-PAGO-PLAN-v1.0.md)  
**Skills:** `database-migration`, `nestjs-expert`, `testing-patterns`

## Objetivo

Implementar el **primer entregable de Ola 2**: bifurcación `transactional` en `runner.ts` y `revert.ts`. **No** escribir aún la migración de índices de paginación.

## Alcance

1. `packages/database/src/migrations/tenant/runner.ts`: leer `transactional ?? true`; camino actual vs DDL fuera de TX + bookkeeping en TX (pseudocódigo ADR-066 §2).
2. `revert.ts`: misma bifurcación para `down()`.
3. Documentar en `.github/instructions/database.instructions.md` (o path vigente del repo): flag, idempotencia, sin DML en no-transaccionales.
4. Tests unitarios del runner si el repo ya tiene harness; si no, test mínimo que mockea `QueryRunner` y verifica que `transactional: false` **no** llama `startTransaction` antes de `up()`.
5. Default `true` — las 86 migraciones existentes intactas.

## Fuera de alcance

- Migración `087_*` de índices CONCURRENTLY (siguiente prompt Ola 2 tras este GO).
- Medición DDL en tenant real (supuesto ADR-066; diferida).
- D-4 CRM.

## Stop / Go

| Condición | Acción |
| --- | --- |
| Flag + ambos caminos + docs | GO E-1 ejecución |
| Rompe camino transaccional default | NO-GO / revertir |
| TypeORM tipado | Preferir narrowing local; evitar `any` amplio si hay interfaz extendida |

## Entregables

Diff runner/revert/docs + evidencia de test. **Sin commit.** Actualizar checklist ADR-066 §Criterio (casillas runner/revert/docs).
