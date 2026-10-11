# LAUNCH — MOD11 · Registro compacto de equipos y materiales · Ola 3 (Q1)

**Plan:** `docs/plans/2026-10-11-mod11-consola-registro-material.md` · **Encargo:** `PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`, adenda 2
**Estado:** F1 y F2 en GO (portal 805/805, `@iwana/ui` 34/34, typecheck 8/8). Falta la evidencia en el navegador.
**Datos:** solo `tenant_iwana`, en desarrollo y con datos de ejemplo. Sesión de Nepomuceno (técnico); OT `OTE-20260828-001` y `-002`, en la v3.

| # | Subagente | Encargo (adenda 2) | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §Q1: serial y consumibles hasta `CONFIRMED`, fallo por fila, visual, a11y y regresión | `playwright-skill`, `wcag-audit-patterns`, `verification-before-completion`, `e2e-testing-patterns` |

**Siguiente:** con Q1 en GO, AI-EM-ARCH cierra G6 de este frente y propone el commit.

---

### Bloque copiar-pegar — `sr-qa` (Q1)

> Actúa como `sr-qa`. Lee `AGENTS.md`, el plan citado, la spec UX v1.4 §16 (criterios de §16.6), la **adenda 2** de `docs/prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md` y el informe F. Lee los `SKILL.md` de la tabla.
> Con api, worker y portal locales, y solo en `tenant_iwana`:
> (1) registra `XC220-TEST-0031` desde las tarjetas y comprueba `CONFIRMED`, que sale de la lista, el requisito «Cumplido» y, en la base, `INSTALLED_COMODATO` con su comodato;
> (2) registra 2 patchcord y 1 roseta en «Materiales usados en la instalación» y comprueba dos registros `CONFIRMED` y los saldos (4→2, 2→1);
> (3) fuerza el fallo de una fila y comprueba que el reintento no duplica;
> (4) visual en 375 y 1280 px, tema claro y oscuro, teclado y foco, y la hoja dentro de 812 px;
> (5) regresión del historial, del reverso y de las tres pantallas migradas a `RadioCardGroup`.
> Entrega `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-Q1-SR-QA-v1.0.md` con capturas en `docs/informes/assets/`. Sin commit.
