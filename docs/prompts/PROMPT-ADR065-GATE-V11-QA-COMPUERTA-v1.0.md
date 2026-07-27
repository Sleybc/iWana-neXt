---
description: "QA compuerta post R-1/R-3 — leer resumen Jest — AI-SR-QA"
name: "Gate v1.1 QA compuerta"
agent: "sr-qa"
---

# PROMPT — AI-SR-QA · verificación post R-1/R-3

**Gate:** INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1  
**Regla de proceso:** el stop/go «suite verde» se lee de la **línea de resumen Jest** (`Test Suites:` / `Tests:`), nunca del exit code de un comando entubado (`| tail`).

## Verificar tras diff SR-FULL

1. `useful-life-alerts*.spec.ts` — 0 failed; hay expect sobre `addOrderBy`/`orderBy`.
2. Migración 088 registrada; backfill no deja ruta decrypt en `findAll` por documentNumber.
3. `cd apps/api && npx jest --no-coverage` (o filter api) — pegar resumen completo. Si se usa pipe, capturar también `PIPESTATUS` / ejecutar jest solo.

Veredicto: **GO** (Ola 1 → GO-CON-DEUDA posible) / **NO-GO**. Sin commit.
