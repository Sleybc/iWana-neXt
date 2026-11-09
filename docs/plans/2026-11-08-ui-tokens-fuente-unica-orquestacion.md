# Plan de orquestación — `@iwana/ui`: fuente única de tokens y hex de marca

**Versión:** 1.6
**Cambio v1.0 → v1.1 (2026-11-08):** correcciones de la revisión de `docs-governance`: bloque B3-pre para las capturas «antes», evidencia por Playwright y no por una skill externa, `grep` de riesgo acotado al código, y P4 actualizado
**Cambio v1.1 → v1.2 (2026-11-08):** G0 y G1 cerrados; ruta de evidencias fijada; B2 incluye el comentario de `globals.css` (spec §3.5); el lanzamiento pasa a la Ola 2
**Cambio v1.2 → v1.3 (2026-11-08):** G2 cerrado (spec §9.3); prohibición de matar procesos por nombre tras el incidente de la Ola 2; el lanzamiento pasa a la Ola 3
**Cambio v1.3 → v1.4 (2026-11-08):** G3 y G4 cerrados (spec §9.4); informe de cierre emitido (B5)
**Cambio v1.4 → v1.5 (2026-11-08):** G6 cerrado; P5 actualizado (el ajuste de skills se hizo aquí); B6 en dos commits ordenados
**Cambio v1.5 → v1.6 (2026-11-08):** B6 ejecutado (`c73a9220`), P4 cerrada y G6.5 ✅ (informe de cierre §2 y §6)
**Estado:** Cerrado. G0 a G4, G6 y G6.5 el 2026-11-08; publicado en `c73a9220`. Las dos skills compartidas salen con el commit de la consolidación (informe de cierre §6)
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Definición:** [2026-11-08-ui-tokens-fuente-unica-spec.md](../specs/2026-11-08-ui-tokens-fuente-unica-spec.md) v1.5 · **Lanzadores:** [Ola 1](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-LAUNCH-v1.0.md) (G1 ✅) · [Ola 2](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-OLA2-LAUNCH-v1.0.md) (G2 ✅) · [Ola 3](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-OLA3-LAUNCH-v1.0.md) (G3 y G4 ✅) · **Cierre:** [INFORME-UI-TOKENS-FUENTE-UNICA-v1.0](../informes/INFORME-UI-TOKENS-FUENTE-UNICA-v1.0.md)

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-08 |
| --- | --- | --- |
| P1 | G0: el CTO resuelve D1 y D2 (spec §6) | **Cerrada** el 2026-11-08: D1 y D2 sí (spec §9.1) |
| P2 | Nadie en vuelo sobre `packages/ui` | **Cerrada**: `git status -- packages/ui` vacío. Se vuelve a comprobar al lanzar B2 |
| P3 | `apps/portal` tiene specs modificados por otras olas sin commitear (spec H8) | **Vigente.** B2 no edita `apps/`; las suites de `@iwana/portal` se corren con ese árbol, y una roja ajena se reporta, no se corrige |
| P4 | CI de `main` en verde | **Cerrada.** Rojo sobre `81c9be55` (run 42536520408) por privacy H-EXP; verde sobre `b48b2ba7`, que ya contiene `c73a9220` (run 42548805100) |
| P5 | La consolidación de skills edita `core-components` e `iwana-identity-ui-review` (Ola 3) | **Resuelta.** Plan original: no tocar `.agents/skills/`. Como el B4 de la consolidación cerró antes que este encargo, el ajuste del spec §7 se hizo aquí (spec §9.4); esos dos archivos se publican con el commit de la consolidación (informe de cierre §6) |

## 2. Superficie

| Zona | Archivos |
| --- | --- |
| Retiro (si D1) | `packages/ui/src/tokens/{colors,spacing,typography,index}.ts` y la línea `export * from './tokens'` de `src/index.ts` |
| Sustitución de hex | `packages/ui/src/components/auth/auth-form-styles.ts`, `auth/AuthBrandHeader.tsx`, `SectionAccordion.tsx` |
| Según veredicto | `SectionAccordion.tsx` (P1), `Select.tsx:606`, `Button.tsx:84` |
| Cabecero y comentario | `packages/ui/src/index.ts`; comentario de `packages/ui/src/styles/globals.css` (líneas 20-23, spec H10) |
| Contrato | Spec §5, que completa `ds-owner` |
| Pantallas de evidencia | Login del portal (`LoginExperience`), login de plataforma de `apps/web` (`PlatformAuthExperience`), `SessionRecoveryModal` y un consumidor de `SectionAccordion` (p. ej. `settings/BrandingForm.tsx`) |

## 3. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · veredictos y contrato | `ds-owner` | P1 | Solo la tabla del spec §5. No edita código |
| B3-pre · capturas «antes» | `sr-qa` | B1 | Capturas con Playwright, en claro y en oscuro, de las pantallas de §2, sobre el árbol sin B2, en `docs/informes/evidence/ui-tokens-fuente-unica/antes/` |
| B2 · implementación | `fe-platform` | B1 (§5 congelado), B3-pre | §2, filas de retiro, sustitución, veredicto y cabecero |
| B3 · evidencia visual y auditoría | `sr-qa` | B2 | Solo lectura del código; capturas «después» con el mismo guion que B3-pre y comparación |
| B4 · gates | `gate-verifier`, `test-change-reviewer` (si cambia algún spec) | B2 | Solo lectura |
| B5 · cierre documental | AI-EM-ARCH, con `docs-governance` | B3, B4 | Informe de cierre en `docs/informes/`; ajuste de skills derivado a la consolidación (spec §7) |
| B6 · publicación | AI-EM-ARCH | B5, P4 | Commit propio con lista explícita de rutas (`iwana-checkpoint-commit`); push; G6.5 |

**Olas:** 1 = B1; 2 = B3-pre → B2 (B2 no arranca hasta que `sr-qa` entrega las capturas «antes»); 3 = B3 ∥ B4; 4 = B5; 5 = B6. B3 y B4 son de solo lectura y no comparten salida.

**Ruta crítica:** G0 → B1 → B3-pre → B2 → B4 → B5 → P4 → B6 → G6.5.

## 4. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 `ds-owner` | `core-components`, `iwana-identity-ui-review` (modo review y `scripts/audit-ui.mjs`), `wcag-audit-patterns` | `tailwind-patterns` (si un token destino exige variante o modificador de opacidad) | `ui-ux-pro-max` (archivo aprobado en G0-1 de la consolidación, informe §8.1, efectivo en su B4; no fundamenta severidad); `senior-ui-systems-designer` (fusionada en `iwana-identity-ui-review`; se retira en el B4 de la consolidación) |
| B2 `fe-platform` | `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `iwana-test-evidence` | `typescript-expert` (si retirar `src/tokens/` rompe un tipo exportado) | `iwana-identity-ui-review` en modo dirección (no hay propuesta visual: §5 está congelado); skills de backend (no se toca backend) |
| B3-pre y B3 `sr-qa` | `e2e-testing-patterns` (las capturas del gate se producen con Playwright), `wcag-audit-patterns` | `anthropic-skills:built-in-browser` (solo Claude Code; inspección manual adicional, nunca la evidencia del gate) | `testing-patterns` (B3 no escribe pruebas del repo) |
| B4 | — (verificadores auxiliares) | `test-change-reviewer` solo si B2 modificó algún spec | `boundary-reviewer` (sin backend); `contract-drift-reviewer` (no se toca `packages/shared`) |
| B5 | `docs-architect` | — | — |
| B6 | `iwana-checkpoint-commit` | — | — |

Skills y subagentes verificados en disco el 2026-11-08 (`.agents/skills/<nombre>/SKILL.md`, `.claude/agents/<nombre>.md`). Se leen como documentación antes de trabajar.

## 5. Encargos

Trabajo en `main`, sin ramas, sin stash y sin commit hasta B6. **Nunca se matan procesos por nombre** (`taskkill /IM node.exe`, `turbo.exe` ni similares): solo los PID que lanzó el propio agente (incidente de la Ola 2, spec §9.3). Sin Prettier en `docs/`. `[BLOQUEO]` si un cambio exige tocar `apps/`, crear un token nuevo o contradice el spec.

- **B1.** Para cada fila del spec §5: token destino, veredicto (real, falso positivo o se mantiene) con su motivo y si hay cambio visual. Para los P1, contraste medido sobre el fondo real, en claro y en oscuro, y si el elemento es texto o ícono `aria-hidden`. Decide el token de texto para `#181818` en modo claro. Al terminar, el §5 queda congelado.
- **B2.** Tomar línea base sin caché de `@iwana/ui`, `@iwana/portal` y `@iwana/web`. Aplicar el §5 tal cual. Retirar `src/tokens/` y su `export *` (D1 aprobado). Actualizar el cabecero de `src/index.ts` y corregir el comentario de `globals.css` (spec §3.5), sin cambiar ningún valor. Correr `audit-ui.mjs packages/ui/src` y el `grep` de H4b al terminar.
- **B3-pre.** Guion de capturas con Playwright, en claro y en oscuro, de las pantallas de §2, sobre el árbol antes de B2, guardadas en `docs/informes/evidence/ui-tokens-fuente-unica/antes/`. El guion no se añade a la suite E2E del repo: vive junto a las capturas y se reutiliza en B3 (`docs/informes/evidence/ui-tokens-fuente-unica/despues/`). Las sesiones usan los usuarios de seed de desarrollo, nunca credenciales reales.
- **B3.** Capturas «después» con el guion de B3-pre y comparación; diferencias solo donde §5 las aprueba. Rerun de `audit-ui.mjs` y del `grep` de H4b. Contraste medido de los P1 corregidos.
- **B4.** `gate-verifier`: «Gates Before Merge» sobre `@iwana/ui`, `@iwana/portal` y `@iwana/web`, sin caché, con conteo frente a la línea base de B2.

## 6. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-08 (spec §9.1) |
| G1 | **✅ 2026-11-08** (spec §9.2). B1: spec §5 completo, sin celdas «(B1)», y congelado |
| G2 | **✅ 2026-11-08** (spec §9.3). B2: spec §8 criterios 1, 2 y 5 |
| G3 | **✅ 2026-11-08** (spec §9.4). B3-pre y B3: spec §8 criterios 4 y 6, con capturas «antes» y «después» del mismo guion, versionadas y referenciadas en el informe de cierre |
| G4 | **✅ 2026-11-08** (spec §9.4). B4: spec §8 criterio 3, con conteo real y `Cached: 0` |
| G6 | **✅ 2026-11-08** (informe de cierre §2 y §7). `docs-governance` sin bloqueantes sobre el informe de cierre |
| G6.5 | **✅ 2026-11-08** (run 42548805100). CI de `main` en verde sobre el SHA publicado |

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un consumidor de `iwanaColors`, `iwanaSpacing` o `iwanaTypography` que el `grep` de H2 no ve | B2 repite el `grep` sobre todo el código del repo (`*.ts`, `*.tsx`, `*.js`, `*.mjs`, `*.cjs`), sin `node_modules`, `.next`, `docs/` ni `.agents/`. Un consumidor de código es `[BLOQUEO]`; las menciones en documentación se tratan en el spec §7 |
| Una sustitución cambia el color por un modificador de Tailwind (`!`, `/20`, `dark:`) | §5 fija el token con su modificador; B3 compara capturas en claro y en oscuro |
| Un agente mata procesos ajenos para detener los suyos (ocurrió en la Ola 2) | Prohibido en §5 y en cada lanzador; solo los PID propios |
| La suite de `@iwana/portal` está roja por specs de otras olas en vuelo (P3) | B4 separa los rojos ajenos (presentes en la línea base) de los nuevos; solo los nuevos bloquean |
| Choque con la consolidación de skills en `core-components` o `tokens.md` | Ningún ejecutor de este encargo edita `.agents/skills/`. El ajuste del spec §7 lo hizo AI-EM-ARCH al cierre, cuando la consolidación ya había pasado su B4 (P5); se publica con el commit de la consolidación |
| Se publica mezclado con otras olas | B6 con `iwana-checkpoint-commit` y lista explícita de rutas |

## Lanzamiento

El archivo [PROMPT-UI-TOKENS-FUENTE-UNICA-OLA3-LAUNCH-v1.0](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-OLA3-LAUNCH-v1.0.md) es la fuente y **prevalece si divergen**. Lanza la Ola 3 (B3 ∥ B4). Olas anteriores: [Ola 1](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-LAUNCH-v1.0.md) (G1 ✅) y [Ola 2](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-OLA2-LAUNCH-v1.0.md) (G2 ✅). Cada ola siguiente se lanza con su propio archivo cuando cierra su gate.

```text
===== UI-TOKENS-FUENTE-UNICA · Ola 3 · B3 · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el spec docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md (§5, §8 y §9) y el plan docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md (§5 B3, §6 G3).
Antes de trabajar, lee los SKILL.md de e2e-testing-patterns y wcag-audit-patterns (como documentación).
Alcance: corre docs/informes/evidence/ui-tokens-fuente-unica/antes/capturas.mjs sin cambios sobre el árbol actual, con salida en docs/informes/evidence/ui-tokens-fuente-unica/despues/; compara las 8 parejas píxel a píxel. Solo se admiten diferencias en modo claro en los íconos de SectionAccordion (líneas 154 y 227: lima → iwana-secondary-700); mide su contraste final. Confirma en el CSS generado por la app que shadow-iwana-secondary/20 es una sombra de color lima al 20 % (criterio 6). Repite audit-ui.mjs sobre packages/ui/src.
Fuera de alcance: editar código, packages/ui, la suite e2e/ y .agents/skills/. En main, sin commit. Nunca mates procesos por nombre (taskkill /IM node.exe, turbo.exe ni similares): solo los PID que lanzaste tú.
Cierras cuando G3 se cumple: cada diferencia está explicada por §5 o es un hallazgo.
Informa: tabla de las 8 parejas (idéntica o con diferencia y su causa), contraste medido, regla CSS de la sombra, salida de audit-ui.mjs y deuda nueva por severidad.

===== UI-TOKENS-FUENTE-UNICA · Ola 3 · B4 · gate-verifier =====
Actúa como gate-verifier. Lee AGENTS.md («Gates Before Merge»), el spec (§8 criterio 3, §9.3) y el plan (§5 B4, §6 G4).
Alcance: los gates sobre @iwana/ui, @iwana/web y @iwana/portal, sin caché de Turbo (Cached: 0): lint, typecheck y pruebas con conteo real. Línea base declarada por fe-platform: 55, 233 y 3.479 tests. Separa los rojos ya presentes en esa línea base (apps/portal tiene specs de otras olas sin commitear) de los nuevos; solo los nuevos bloquean. Si algún spec cambió en el diff de packages/ui, deriva a test-change-reviewer.
Fuera de alcance: corregir código o pruebas. Nunca mates procesos por nombre (taskkill /IM node.exe, turbo.exe ni similares): solo los PID que lanzaste tú.
Cierras cuando G4 tiene veredicto con evidencia.
Informa: comando, conteo y Cached por paquete y gate; rojos nuevos frente a preexistentes; veredicto de G4.
```
