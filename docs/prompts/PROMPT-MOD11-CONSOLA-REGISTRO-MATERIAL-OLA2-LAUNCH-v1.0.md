# LAUNCH — MOD11 · Registro compacto de equipos y materiales · Ola 2 (F1 → F2)

**Plan:** `docs/plans/2026-10-11-mod11-consola-registro-material.md` · **Encargo:** `PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, adenda 1
**G2 cerrado:** spec UX v1.4 §16 · contrato `docs/specs/2026-10-11-ui-radio-card-group-contrato-componente.md` v1.0 · paso 0 aplicado (OT en la v3)
**No se toca:** el contrato v1.7, el API ni MOD12.

| # | Subagente | Encargo (adenda 1) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `fe-platform` | §F1: `RadioCardGroup` en `@iwana/ui` y migración de los 3 usos ad hoc | `frontend-dev-guidelines`, `tailwind-patterns`, `wcag-audit-patterns`, `testing-patterns` |
| 2 | `fe-platform` | §F2: rediseño de la hoja con las tres condiciones técnicas | las de F1 + `iwana-identity-ui-review` |

**Paralelo:** no. F2 consume el componente de F1, así que va en la misma sesión y en orden.
**Siguiente:** con F en GO, la ola 3: Q1 (`sr-qa`), registro real hasta `CONFIRMED` en el navegador.

---

### Bloque copiar-pegar — `fe-platform` (F1 → F2)

> Actúa como `fe-platform`. Lee `AGENTS.md`, el plan citado, la **adenda 1** de `docs/prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, la spec UX v1.4 §16 y el contrato de `RadioCardGroup`. Lee los `SKILL.md` de la tabla.
> **F1:** implementa `RadioCardGroup` según el contrato v1.0, expórtalo y migra `QuoteShippingFields`, `PlanCatalogFormPeek` y `ExhaustedAttemptsDecisionDialog` sin cambiar su negocio. Gates: jest de `packages/ui` y de los tres consumidores con `--no-cache`, y typecheck global.
> **F2:** rediseña `ExecutionOrderMaterialAction.tsx` según §16, con las tres condiciones:
> (1) el patrón se elige por `trackingMode`;
> (2) un manejador por lotes en el adaptador, en serie, con la versión vigente antes de cada POST y reintento único ante `412`;
> (3) una `Idempotency-Key` estable por fila (amplía `registerItemUsage` en `api-client.ts`).
> No toques el historial ni el reverso. Specs con los 8 criterios de §16.6 y las tres condiciones. Gates: jest de `operations/` (≥ 779) con `--no-cache`, typecheck global y `audit-ui.mjs`.
> Entrega `docs/informes/INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F-v1.0.md`. Sin commit.
