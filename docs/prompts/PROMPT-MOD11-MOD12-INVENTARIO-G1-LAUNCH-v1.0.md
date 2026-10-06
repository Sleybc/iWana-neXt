# LAUNCH — MOD11 ↔ MOD12 · Ola G1 (revisión cruzada)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.0 · **Spec:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.0 (Propuesto)
**Gates:** G1 abierto: esta ola lo alimenta y lo cierra el CTO · G4 pendiente, sin implementación
**Bloqueos abiertos:** ninguno · **Contexto:** la consola de OT sigue su cierre por su cuenta (NVDA → G6); este plan condiciona G7.

| # | Subagente | Encargo | Skills a leer | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-G1-v1.0.md` §F1 | `architect-review`, `nestjs-expert`, `bullmq-specialist` | Informe G1 SR-FULL |
| 2 | `sec-eng` | mismo encargo, §S1 | `security-auditor`, `backend-security-coder` | Informe G1 SEC-ENG |
| 3 | `prod-ux` | mismo encargo, §U1 | `system-vocabulary-review` | Informe G1 PROD-UX |

**Paralelo:** los tres a la vez; son de solo lectura y no tocan código.
**Cierre:** tres informes en disco. AI-EM-ARCH consolida y versiona la spec si hace falta, el CTO aprueba G1 y se emite G4 (I1 a I4).

---

### Bloque copiar-pegar — común (cambia subagente, sección y skills)

> Actúa como `<subagente>`. Lee `AGENTS.md`, la spec `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` completa y tu sección `<§F1 | §S1 | §U1>` de `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-G1-v1.0.md`.
> Antes de escribir lee los `SKILL.md` de: `<skills de la tabla>` (en `.agents/skills/<nombre>/SKILL.md`, como documentación).
> Es un dictamen de solo lectura: no escribas código ni modifiques la spec. Un desacuerdo es `[CONSULTA]` o `[DESEMPATE]` a AI-EM-ARCH, con evidencia de código.
> Entrega tu informe en `docs/informes/` con la ruta que fija tu sección. Sin commit.
