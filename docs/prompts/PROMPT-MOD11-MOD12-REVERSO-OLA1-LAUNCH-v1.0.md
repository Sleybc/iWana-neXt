# LAUNCH — MOD11 ↔ MOD12 · Reverso de consumo · Ola 1 (V1 + U2)

**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` v1.1 · **Spec:** `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` v1.1 (**Aprobado por el CTO, 2026-10-10**)
**Gates:** G1 cerrado · G4 emitido (`PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`)
**Bloqueos abiertos:** ninguno · **Contrato:** spec §3, que V1 materializa como `execution-orders.ts` v1.7 en su paso 1
**Normas:** typecheck global, un test integrado por motivo, ningún import entre `apps/` y el motivo nunca sale de MOD11.

| # | Subagente | Encargo (`PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §V1: contrato v1.7, migración 140, comando de supervisión, R8 en los dos caminos, R5 en el worker y R10 | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`, `backend-security-coder` |
| 2 | `prod-ux` | §U2: ratificar los dos ajustes de copy de la spec §9 | `system-vocabulary-review` |

**Paralelo:** sí. V1 es backend y U2 es solo copy.
**Siguiente:** con el contrato v1.7 en verde (paso 1 de V1), la ola 2: V2 (MOD12) y V3 (consola, que espera también a U2). Con V2 en GO, la ola 3: V4 y V5.

---

### Bloque copiar-pegar — `sr-backend` (V1)

> Actúa como `sr-backend`. Lee `AGENTS.md`, la spec del reverso v1.1 completa (R1 a R10 no se re-litigan), la spec hermana de consumo (D4, D5, D8, D10, D11) y `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md` §V1. Lee los `SKILL.md` de la tabla.
> **Primero, el contrato v1.7 con su Zod, y avisa en cuanto esté verde.** Después: migración 140 con índice parcial; comando de supervisión (`SUPERVISE` + sede, motivo con `safeTextField`, original derivado de la línea, auditoría durable, motivo fuera del outbox); `REVERSE_ITEM_USAGE`; R8 en `getCompletion` y en el cierre; los tipos nuevos en cada punto de R5 del worker, incluida la clasificación del relay; y R10.
> Gates: typecheck global, `tasks` y worker con `Cached: 0`, la 140 con `down` y un test de que el outbox no lleva el motivo. Entrega el informe V1. Sin commit.

### Bloque copiar-pegar — `prod-ux` (U2)

> Actúa como `prod-ux`. Lee tu informe `INFORME-MOD11-MOD12-REVERSO-G1-PROD-UX-v1.0.md` y la spec del reverso v1.1 §9 (fila U1). Lee el `SKILL.md` de `system-vocabulary-review`.
> Ratifica o corrige: (a) el sustituto de «Esta línea no admite otra solicitud de reverso», coherente con que tras un rechazo se puede pedir uno nuevo (R3); (b) el copy de `REVERSAL_LOAN_MISMATCH`.
> Entrega la tabla final y completa en `INFORME-MOD11-MOD12-REVERSO-U2-PROD-UX-v1.0.md`. Sin commit.
