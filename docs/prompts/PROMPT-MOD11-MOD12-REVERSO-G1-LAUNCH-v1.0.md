# LAUNCH — MOD11 ↔ MOD12 · Reverso de consumo · Ola G1 (revisión cruzada)

**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` v1.0 · **Spec:** `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` v1.0 (Propuesto)
**Gates:** G1 abierto: esta ola lo alimenta y lo cierra el CTO · G4 pendiente, sin implementación
**Decisiones del CTO que no se re-litigan:** P1 solo supervisor · P2 también después del cierre, con acto explícito · P3 el equipo vuelve a la custodia y se cierra el comodato · P4 movimiento contrario con rastro
**En paralelo, sin conflicto:** P2 y S3 de Redis (`PROMPT-PLAT-REDIS-AUTH-DEUDA-G7-LAUNCH-v1.0.md`). Esta ola no toca código.

| # | Subagente | Encargo | Skills a leer | Entrega |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-G1-v1.0.md` §F1 | `architect-review`, `nestjs-expert`, `bullmq-specialist`, `postgresql` | Informe G1 SR-FULL |
| 2 | `sec-eng` | mismo encargo, §S1 | `security-auditor`, `backend-security-coder` | Informe G1 SEC-ENG |
| 3 | `prod-ux` | mismo encargo, §U1 | `system-vocabulary-review` | Informe G1 PROD-UX |

**Paralelo:** los tres a la vez; son de solo lectura.
**Cierre:** tres informes en disco. AI-EM-ARCH consolida y versiona la spec, el CTO aprueba G1 y se emite G4 (V1 a V5).

---

### Bloque copiar-pegar — común (cambia subagente, sección y skills)

> Actúa como `<subagente>`. Lee `AGENTS.md`, la spec `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` completa, la spec hermana `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` (D4, D5, D8, D10, D11) y tu sección `<§F1 | §S1 | §U1>` de `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-G1-v1.0.md`.
> Antes de escribir lee los `SKILL.md` de `<skills de la tabla>` (en `.agents/skills/<nombre>/SKILL.md`, como documentación).
> Es un dictamen de solo lectura: no escribas código ni modifiques la spec, y no re-litigues P1 a P4. Un desacuerdo es `[CONSULTA]` o `[DESEMPATE]` a AI-EM-ARCH, con evidencia de código.
> Entrega tu informe en `docs/informes/` con la ruta que fija tu sección. Sin commit.
