# LAUNCH — UI · TOKENS-FUENTE-UNICA · Ola 2

**Plan:** `docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md` v1.2 · **Spec:** `docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md` v1.2
**Ola que lanza:** Ola 2 — B3-pre (capturas «antes») y luego B2 (implementación) · **Gates:** G0 ✅ · G1 ✅ · G2 y G3 no iniciados
**Bloqueos abiertos:** ninguno. P4 (CI de `main` en rojo) solo bloquea B6

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | Plan §5 B3-pre | `e2e-testing-patterns`, `wcag-audit-patterns` | Spec v1.2 §5 |
| 2 | `fe-platform` | Plan §5 B2 | `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `iwana-test-evidence` | Spec v1.2 §5 |

**Secuencia:** 2 no arranca hasta que 1 entrega las capturas «antes»: comparten el árbol de `packages/ui`.
**Cierre de ola:** G2 (spec §8 criterios 1, 2 y 5). No hay prompt de ejecución aparte: el encargo es el plan §5.

---

### Bloque copiar-pegar

```text
===== UI-TOKENS-FUENTE-UNICA · Ola 2 · paso 1 · B3-pre · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el spec docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md (§5, §8 y §9) y el plan docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md (§2 y §5 B3-pre).
Antes de trabajar, lee los SKILL.md de e2e-testing-patterns y wcag-audit-patterns (como documentación).
Alcance: un guion de Playwright que capture, en claro y en oscuro, el login del portal, el login de plataforma de apps/web, SessionRecoveryModal y un consumidor de SectionAccordion (p. ej. settings/BrandingForm), sobre el árbol actual, sin cambios de B2. Guarda guion y capturas en docs/informes/evidence/ui-tokens-fuente-unica/antes/. Usuarios de seed de desarrollo, nunca credenciales reales.
Fuera de alcance: editar código, packages/ui, la suite e2e/ del repo y .agents/skills/. En main, sin commit.
Cierras cuando las 8 capturas (4 pantallas × 2 temas) existen y el guion corre de nuevo sin cambios. Avisa al orquestador: B2 no arranca antes.
Informa: comando del guion, rutas de las capturas, cómo llegaste a cada pantalla y deuda nueva por severidad.

===== UI-TOKENS-FUENTE-UNICA · Ola 2 · paso 2 · B2 · fe-platform (solo tras el paso 1) =====
Actúa como fe-platform. Lee AGENTS.md, el spec (§2, §3, §5 congelado, §8, §9) y el plan (§2, §5 B2, §7).
Antes de codificar, lee los SKILL.md de core-components, tailwind-patterns, frontend-dev-guidelines e iwana-test-evidence (como documentación).
Toma la línea base sin caché de @iwana/ui, @iwana/portal y @iwana/web. Repite el grep de consumidores de iwanaColors, iwanaSpacing e iwanaTypography sobre el código del repo (plan §7).
Alcance: aplica el spec §5 tal cual; retira packages/ui/src/tokens/ y su export * (D1); actualiza el cabecero de src/index.ts; corrige el comentario de globals.css (§3.5) sin cambiar valores.
Fuera de alcance: apps/, .agents/skills/, tokens nuevos y cualquier hex que §5 no liste. Sin Prettier en docs/. En main, sin commit.
Si aparece un consumidor de los tokens TS o un cambio exige tocar apps/, emite [BLOQUEO] con archivo:línea y para.
Cierras cuando G2 se cumple (spec §8 criterios 1, 2 y 5), con lint, typecheck y pruebas de los tres paquetes sin caché y conteo no inferior a la línea base; los rojos ya presentes en la línea base se reportan, no se corrigen.
Informa: diff por archivo; salida de audit-ui.mjs y del grep de H4b; línea base frente al cierre de los tres paquetes; deuda nueva por severidad.
```
