# LAUNCH — MOD11 · Línea de tiempo de la OT · Tramo 1

**Plan:** `docs/plans/2026-09-14-mod11-linea-tiempo-ot.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-linea-tiempo-ot-design.md` v1.0
**Ola que lanza:** Ola 1 — el hecho, no la duración · **Gates:** G1 **CERRADO** (CTO, 2026-09-14) · G2 n/a · G3 n/a · G4 emitido
**Bloqueos abiertos:** ninguno de gobierno. **Lanzar solo después de cerrar el tramo de acta de instalación** — ambos tocan el servicio de OT.

| # | Subagente | Encargo (prompt · bloque) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sec-eng` | `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B3 | `security-auditor`, `backend-security-coder` | — (dictamen, no código) |
| 2 | `sr-backend` | `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B1 | `architect-review`, `nestjs-expert`, `database-migration`, `postgresql`, `testing-patterns` | archivo hermano v1; `execution-orders.ts` v1.1 **no se toca** |
| 3 | `sr-backend` | `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B2 | `nestjs-expert`, `typescript-expert`, `testing-patterns` | idem |
| 4 | `sr-qa` | `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B4 | `testing-patterns`, `turborepo-caching`, `verification-before-completion` | consume ambos |

**Paralelo:** 1 y 2 a la vez — el dictamen condiciona qué se retiene, no cómo se registra. 3 espera a 2. 4 espera a 3.
**Cierre de ola:** CA-01 a CA-07 de la spec §8 en verde, con jest directo y `Cached: 0`.

---

### Bloque copiar-pegar

> Actúa como `sec-eng`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-linea-tiempo-ot.md` y tu encargo `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B3.
> Antes de dictaminar lee los `SKILL.md` de: `security-auditor`, `backend-security-coder` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Trátalo como dato personal del trabajador, no como dato operativo. Eres auditor: dictaminas, no implementas.
> No afirmes requisitos regulatorios que no puedas citar: lo no confirmado se marca «requiere verificación con fuente oficial».
> Cierras cuando exista finalidad declarada por campo y política de retención con plazo.

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B1.
> Antes de escribir código lee los `SKILL.md` de: `architect-review`, `nestjs-expert`, `database-migration`, `postgresql`, `testing-patterns`.
> **No modifiques** `packages/shared/src/contracts/operations/execution-orders.ts` v1.1: la línea de tiempo es recurso propio, en archivo hermano.
> El valor del tramo está en el bloqueo: si solo instrumentas `start()` y `close()`, no resuelves nada — esos instantes ya existen.
> Alcance: solo B1. Fuera de alcance: corrección aditiva, `EN_ROUTE`, superficie de consulta.
> Cierras cuando CA-01, CA-02 y CA-05 pasen con conteo real. Reporta rutas, evidencia y deuda por severidad.
