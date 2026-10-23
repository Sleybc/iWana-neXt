# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 8 (confirmación estática: V2-c ∥ V4-c)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.8 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 8 · **Gates:** G0–G3 ✅ · G4 ⏳ (entorno) · G5 ⏳ (esta ola lo cierra en código)
**Estado al arrancar:** la Ola 7 corrigió los 9 puntos de B-fix y F-fix. La prueba de reversión contra Postgres no corrió porque Docker no tenía daemon; queda para R-pg en la Ola 9.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Entregable |
| --- | --- | --- | --- | --- |
| 1 | `sec-eng` | §V2-c | `security-auditor`, `backend-security-coder` | Sección «Confirmación Ola 7» en `INFORME-MOD13-REVISION-SEGURIDAD-IMPLEMENTACION-v1.0.md` |
| 2 | `ds-owner` | §V4-c | `iwana-identity-ui-review` (con `audit-ui.mjs`), `core-components` | Sección «Confirmación Ola 7» en `INFORME-MOD13-REVISION-UI-v1.0.md` |

**Paralelo:** 1 ∥ 2. Las dos revisiones son de solo lectura y cada una escribe en su propio informe.
**Cierre (G5 en código):**
- los dos P1 confirmados como cerrados en el código;
- sin hallazgos P0 ni P1 nuevos;
- la reversión contra Postgres, marcada como pendiente de runtime (R-pg).

La Ola 9 (R-pg ∥ F1-v ∥ V1 ∥ V4-bis, y después V5) se lanza cuando el entorno cumpla las precondiciones del prompt §Ola 9. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sec-eng =====
Actúa como `sec-eng`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §V2-c y el informe `docs/informes/INFORME-MOD13-CORRECCIONES-OLA-7-v1.0.md`. Lee `security-auditor` y `backend-security-coder`. Confirma en solo lectura el cierre de SEC-IMPL-01, 02 y 03, y que no hay hallazgos nuevos en los archivos tocados. Marca la reversión contra Postgres como pendiente de runtime. No corrijas código ni imprimas secretos. Añade «Confirmación Ola 7» a tu informe de implementación.

===== 2 · ds-owner =====
Actúa como `ds-owner`. Lee `AGENTS.md`, el plan, tu encargo §V4-c del mismo prompt y el informe de la Ola 7. Lee `iwana-identity-ui-review` y `core-components`. Confirma DS-MOD13-P1-01, P2-02 y P3-03 en el código y vuelve a correr `audit-ui.mjs` sobre `network/*` y los componentes tocados. No corrijas código. Añade «Confirmación Ola 7» a `docs/informes/INFORME-MOD13-REVISION-UI-v1.0.md`.
