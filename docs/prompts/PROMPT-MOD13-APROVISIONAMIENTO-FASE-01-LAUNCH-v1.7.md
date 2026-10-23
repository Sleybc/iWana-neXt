# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 7 (correcciones: B-fix ∥ F-fix)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.7 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1 (§12, aclaraciones al recibir V2 y V3)
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 7 · **Gates:** G0–G3 ✅ · G4 ⏳ (entorno) · G5 ⏳ (dos P1: SEC-IMPL-01 y DS-MOD13-P1-01)
**Bloqueos del entorno (los resuelve el CTO; no detienen esta ola):** API en `127.0.0.1:3000` con credenciales E2E; build del portal sin `EPERM` en `.next`.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Hallazgos |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B-fix | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | SEC-IMPL-01 (P1), códigos de error (P2), CRM → módulo estrecho (P3), SEC-IMPL-02 y 03 (P3) |
| 2 | `fe-platform` | §F-fix | `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `tailwind-patterns`, `system-vocabulary-review` | DS-MOD13-P1-01, P2-02 y P3-03; prueba de la etiqueta `PROVISIONING` |

**Paralelo:** 1 ∥ 2. Archivos disjuntos: `apps/api` frente a `apps/portal`.
**Cierre de ola:**
- los dos P1 corregidos y con su prueba;
- las suites de `network`, `tasks`, `crm`, worker y portal intactas, con conteo real;
- lint y typecheck.

G5 se cierra cuando `sec-eng` y `ds-owner` confirmen las correcciones; esa confirmación entra en la Ola 8, junto con V1, V4-bis y V5. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §B-fix (con las reglas comunes 1 a 9) y los informes `INFORME-MOD13-REVISION-SEGURIDAD-IMPLEMENTACION-v1.0.md` y `INFORME-MOD13-REVISION-FRONTERA-CONTRATOS-v1.0.md`. Antes de escribir código, lee los `SKILL.md` de `nestjs-expert`, `backend-security-coder` y `test-driven-development`. Corrige solo los cinco puntos del §B-fix según HLD v1.1 §12; no amplíes la lista de códigos ni el contrato. Si algo no cabe, emite `[BLOQUEO]` y para. Sin cachés de jest en el repo; no imprimas secretos. No commitees. Cierras con las pruebas nuevas y las suites intactas, con conteo real.

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, tu encargo §F-fix del mismo prompt y el informe `INFORME-MOD13-REVISION-UI-v1.0.md`. Antes de escribir código, lee los `SKILL.md` de `core-components`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `tailwind-patterns` y `system-vocabulary-review`. Corrige solo los cuatro puntos del §F-fix, sin primitivas nuevas y sin formatear `docs/` con Prettier. No commitees. Cierras con lint, typecheck y pruebas del portal con conteo real; si el build sigue con `EPERM`, repórtalo sin forzarlo.
