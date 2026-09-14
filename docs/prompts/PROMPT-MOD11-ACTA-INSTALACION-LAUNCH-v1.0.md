# LAUNCH — MOD11 · Acta de instalación · Tramo 1

**Plan:** `docs/plans/2026-09-14-mod11-acta-instalacion.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` v1.0
**Ola que lanza:** Ola 1 — verificar lo verificable · **Gates:** G1 **CERRADO** (CTO, 2026-09-14) · G2 n/a · G3 n/a · G4 emitido
**Bloqueos abiertos:** ninguno. **Restricción de secuencia:** no despachar a la vez que `PROMPT-MOD11-LINEA-TIEMPO-LAUNCH-v1.0.md` — ambos tocan el servicio de OT.

| # | Subagente | Encargo (prompt · bloque) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `prod-ux` | `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B4 | `system-vocabulary-review` | — (no toca código) |
| 2 | `sr-backend` | `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B1 | `architect-review`, `nestjs-expert`, `typescript-expert`, `testing-patterns` | `packages/shared/src/contracts/operations/execution-orders.ts` v1.1 → v1.2 |
| 3 | `sr-backend` | `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B2 | `database-migration`, `postgresql`, `nestjs-expert` | `INSTALACION_ESTANDAR` v2 (spec §4.2) |
| 4 | `sr-qa` | `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B3 | `testing-patterns`, `turborepo-caching`, `verification-before-completion` | consume ambos |

**Paralelo:** 1 y 2 a la vez — no comparten superficie. 3 espera a los dos. 4 espera a 3.
**Cierre de ola:** CA-01 a CA-07 de la spec §8 en verde, con jest directo y `Cached: 0`.

---

### Bloque copiar-pegar

> Actúa como `prod-ux`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-acta-instalacion.md` y tu encargo `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B4.
> Antes de escribir, lee el `SKILL.md` de `system-vocabulary-review` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Alcance: etiqueta y razón de los cinco requisitos. Fuera de alcance: código, tokens, layout.
> Cierras cuando ninguna etiqueta afirme un resultado que su regla no comprueba (ADR-088 §D4).

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B1.
> Antes de escribir código lee los `SKILL.md` de: `architect-review`, `nestjs-expert`, `typescript-expert`, `testing-patterns`.
> Amplías `packages/shared/src/contracts/operations/execution-orders.ts` de v1.1 a v1.2, solo lo autorizado; otro cambio es `[BLOQUEO]`.
> Lee la trampa del §3 antes del paso 3: sin transportar la disposición al contexto, inviertes el defecto.
> Alcance: solo B1. Fuera de alcance: migración de plantilla, portal, contrato legal.
> Cierras cuando CA-01 a CA-04 pasen con conteo real. Reporta rutas, evidencia y deuda por severidad.
