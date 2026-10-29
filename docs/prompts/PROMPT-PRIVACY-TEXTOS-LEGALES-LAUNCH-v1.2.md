# LAUNCH — `privacy` · Textos legales · Ola 3

> **Cumplido en B3; B4 bloqueado por P1** (2026-10-29). Continúa en [`PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.3.md`](PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.3.md).

**Plan:** `docs/plans/2026-10-29-privacy-textos-legales.md` v1.1 · **Spec:** `docs/specs/2026-10-29-privacy-textos-legales.md` v1.1 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.1.md`
**Ola que lanza:** B3 → B4 (secuencial) · **Gates:** G1–G4 cubiertos; Ola 2 cerrada el 2026-10-29 (B1 y B2 v1.1, verificados por AI-EM-ARCH). No re-despachar B0, B1, B2 ni E1.
**Bloqueos:** ninguno para esta ola. Externo a G6: el typecheck de API falla solo por el fixture WFM de MOD13 (`findRouterSummariesByIds`); no se toca aquí.
**Estado real al arrancar:** la migración 166, los contratos, `purposes`, `current` abierto y el portal están implementados y sin commitear. CA-LT-01 a 06 y CA-LT-13 están en verde; CA-LT-07 a 12 están pendientes. La cobertura no se ha medido.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato congelado |
| --- | --- | --- | --- | --- |
| B3 | `sr-qa` | prompt v1.1 §B3 (pasos 1–4, incluido el gate de cobertura) | `testing-patterns`, `playwright-skill`, `e2e-testing-patterns`, `iwana-test-evidence`; apoyo `wcag-audit-patterns` | spec v1.1 §3–§4 |
| B4 | `sec-eng` | prompt v1.1 §B4, **después de cerrar B3** | `security-auditor`, `backend-security-coder`, `frontend-security-coder`; apoyo `auth-implementation-patterns` | spec v1.1 §3 y §8 |

**Secuencia:** B4 revisa el árbol con las pruebas de B3 ya en verde. Ninguno de los dos modifica código productivo: si un hallazgo lo exige, `[BLOQUEO]` o un bloque nuevo para su dueño.
**Cierre de ola:** `INFORME-PRIVACY-TEXTOS-LEGALES-B3-QA-v1.0.md`, con CA-LT-07 a 12, cobertura ≥ 80 % y conteo real sin caché, e `INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md`, sin P0/P1 abiertos. Después, AI-EM-ARCH consolida G6.

---

### Bloque copiar-pegar

> Actúa como `{sr-qa | sec-eng}`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-29-privacy-textos-legales.md` v1.1 y tu encargo `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.1.md` §{B3 | B4}, y los informes B1 y B2 v1.1 en `docs/informes/`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Consumes el contrato congelado `docs/specs/2026-10-29-privacy-textos-legales.md` v1.1: no lo modifiques. No toques código productivo; si un hallazgo lo exige, emite `[BLOQUEO]` y para.
> No toques los cambios ajenos de MOD13 (incluido el fixture WFM), no los reviertas y no commitees. Textos de prueba sintéticos o del anexo; nunca PII real.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-{B3-QA|B4-SEC}-v1.0.md` con conteo real sin caché, la trazabilidad CA → test (B3) o los hallazgos P0–P3 (B4), y deuda nueva por severidad.
