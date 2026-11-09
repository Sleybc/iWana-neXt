# INFORME — `@iwana/ui`: fuente única de tokens y hex de marca

**Versión:** 1.0
**Estado:** Aprobado. G0 a G4 y G6 ✅ el 2026-11-08; publicación (B6) pendiente del CI de `main` y del orden de commits de §6
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Convención documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Vínculos de trazabilidad

- Definición: [2026-11-08-ui-tokens-fuente-unica-spec.md](../specs/2026-11-08-ui-tokens-fuente-unica-spec.md) (§9: registro por ola)
- Plan: [2026-11-08-ui-tokens-fuente-unica-orquestacion.md](../plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md)
- Lanzadores: [Ola 1](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-LAUNCH-v1.0.md) · [Ola 2](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-OLA2-LAUNCH-v1.0.md) · [Ola 3](../prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-OLA3-LAUNCH-v1.0.md)
- Origen: deuda «fuera de alcance» de [INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0](INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md) §8.3
- Evidencia visual: `docs/informes/evidence/ui-tokens-fuente-unica/antes/` y `despues/`

## 1. Resultado

`globals.css` (`@theme`) es la única fuente de valores de token de `@iwana/ui`. Se retiró `src/tokens/` (un espejo TypeScript sin consumidores y con valores que contradecían `globals.css`). Los hex de marca escritos a mano en `auth-form-styles.ts`, `AuthBrandHeader.tsx` y `SectionAccordion.tsx` pasaron a tokens con el mismo valor. Los dos íconos lima de `SectionAccordion`, que en modo claro no llegaban ni a 3:1, pasaron a `iwana-secondary-700`: es el único cambio visual.

## 2. Gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G0 | ✅ 2026-11-08 | CTO: D1 (retirar `src/tokens/`) y D2 (único cambio visual: P1 reales), sí |
| G1 | ✅ 2026-11-08 | `ds-owner` completó y congeló el spec §5; el orquestador recalculó los 8 contrastes y coinciden |
| G2 | ✅ 2026-11-08 | Diff de `packages/ui` igual al §5 fila por fila; `src/tokens/` borrado y sin consumidores en el código; `audit-ui.mjs`: P0 0 · P1 0 · P2 1 · P3 1 (los dos falsos positivos del §5 del spec: `Select.tsx:606` y `Button.tsx:84`); `grep` de H4b vacío; cabecero y comentario corregidos |
| G3 | ✅ 2026-11-08 | `sr-qa`: 7 de 8 parejas idénticas píxel a píxel; `04-section-accordion-claro` difiere en 44 px, los del `PlusIcon` (línea 227), de lima a `#6A7A1C`, aprobado en §5. `shadow-iwana-secondary/20` compila a `#a5c33033` en el CSS de portal y de web |
| G4 | ✅ 2026-11-08 | `gate-verifier`, sin caché (`Cached: 0`): `@iwana/ui` 55 tests en 8 suites, `@iwana/web` 233 en 38, `@iwana/portal` 3.479 en 348 (3.478 pasan, 1 omitido); los mismos conteos de la línea base. Lint y typecheck con exit 0 en los tres (10 avisos en web y 42 en portal, sin errores). Ningún spec cambió: `test-change-reviewer` no aplica |
| G6 | ✅ 2026-11-08 | `docs-governance`: un bloqueante (la publicación mezclaba dos skills con cambios de la consolidación) y nueve menores. El bloqueante se resolvió con el orden de commits de §6; los menores, en §7 |
| G6.5 | Bloqueado | CI de `main` en rojo sobre `81c9be55` (run 42536520408), por causas ajenas a este encargo |

## 3. Cambios

| Archivo | Cambio |
| --- | --- |
| `packages/ui/src/tokens/{colors,spacing,typography,index}.ts` | Borrados |
| `packages/ui/src/index.ts` | Sin `export * from './tokens'`; cabecero que describe la API actual sin cifras |
| `packages/ui/src/components/auth/auth-form-styles.ts` | `#181818` → `dark-surface`; `#A5C330` → `iwana-secondary`; `#E8E7F0` → `iwana-primary-100`. `hover:!bg-[#94b126]` se mantiene (sin token exacto) |
| `packages/ui/src/components/auth/AuthBrandHeader.tsx` | `bg-[#A5C330]` → `bg-iwana-secondary` |
| `packages/ui/src/components/SectionAccordion.tsx` | `#EDF8CC`, `#6A7A1C` y `#48531D` → `iwana-secondary-100`, `-700` y `-900`; íconos de las líneas 154 y 227 → `text-iwana-secondary-700 dark:text-iwana-secondary` |
| `packages/ui/src/styles/globals.css` | Solo el comentario de accesibilidad de la lima (2,01:1 sobre blanco); ningún valor cambia |
| `.agents/skills/core-components/SKILL.md` | Retiradas las filas del espejo TypeScript; la regla de discrepancia pasa a «no hay tokens en TypeScript»; la regla «sin hex de marca en otras skills» nombra su única excepción (la tabla de `tokens.md`) (spec §7). El resto del diff de este archivo es de la consolidación de skills |
| `.agents/skills/iwana-identity-ui-review/references/tokens.md` | Solo la divergencia 1, que registra el retiro de `src/tokens/` (spec §7). La cabecera «copia derivada de `globals.css`» es de la consolidación (B3a) |
| `docs/informes/evidence/ui-tokens-fuente-unica/` | 8 capturas «antes», 8 «después» y el guion `antes/capturas.mjs`. Después de generar las «después», el orquestador solo añadió al cabecero del guion el requisito `PW_CHANNEL=chrome` (comentario; el código no cambió) |

Contrastes finales en claro: ícono de la línea 154, 1,88:1 → 4,45:1; ícono de la línea 227, 1,83:1 → 4,32:1 (hover 1,76:1 → 4,17:1). Umbral de íconos: 3:1 (SC 1.4.11). En oscuro no cambian.

## 4. Incidente

En la Ola 2, `fe-platform` ejecutó `taskkill` sobre todos los `node.exe` y `turbo.exe` de la máquina para detener una corrida suya. Pudo cortar procesos de otras sesiones; el MCP `redis-dev` de la sesión del orquestador se desconectó y reconectó en ese intervalo. Desde la Ola 3, el plan y los lanzadores prohíben matar procesos por nombre: solo los PID propios. Queda como norma para futuros lanzadores.

## 5. Deuda

| Sev. | Deuda | Destino |
| --- | --- | --- |
| P2 | El anillo de foco lima de `AUTH_FORM_INPUT_FOCUS_CLASS` mide 1,91:1 sobre `iwana-surface-soft` en claro: indicador de foco por debajo de 3:1 | Encargo aparte de UI (cambia lo visible; D2 no lo permitía aquí) |
| P3 | `globals.css:13` declara `@source "../tokens.ts"`, archivo inexistente; inerte y anterior a este encargo | Mismo encargo aparte |
| P3 | No existe un token de texto «tinta» para modo claro; `dark-surface` como texto es semánticamente impreciso | Contrato de tokens de `ds-owner` |
| P3 | Ninguna captura versionada cubre el ícono de la línea 154 (los ítems salen cerrados); `sr-qa` lo verificó por estilos computados (claro `rgb(106,122,28)`, oscuro lima) | Ampliar el guion si se reabre el componente |
| P3 | `gate-verifier` no pudo comparar los avisos de lint (10 en web, 42 en portal) con una corrida anterior | Sin acción: ningún error, y el diff no toca `apps/` |
| — | `docs/identity/Manual_Implementacion_Identidad_Iwana.md` muestra `iwanaColors` como ejemplo | Decisión del dueño de la identidad |
| P3 | El mock de `capturas.mjs` usa `contacto@test-isp.co` (línea 66) y `+573001234567` (línea 157): ficticios, pero con dominio y formato reales. Cambiarlos obliga a regenerar las 16 capturas | Si se reabre el guion: dominio `.test` y número de rango ficticio |
| — | Los lanzadores `-OLA2-` y `-OLA3-` añaden un segmento al patrón literal de `AGENTS.md`, como otros lanzadores por ola del repo (p. ej. `PROMPT-MOD11-CONSOLA-OT-OLA2A-LAUNCH-v1.0.md`) | Sin acción; si se quiere fijar la convención, es decisión de AI-EM-ARCH |

## 6. Publicación (B6)

Pendiente. `core-components/SKILL.md` y `iwana-identity-ui-review/references/tokens.md` tienen en el mismo archivo cambios de este encargo y de la consolidación de skills, también sin commitear, así que no se pueden publicar por separado. Orden:

1. **Commit de este encargo**, sin esas dos skills. Vía `iwana-checkpoint-commit`, con esta lista explícita de rutas:
   - `packages/ui/src/index.ts`
   - `packages/ui/src/styles/globals.css`
   - `packages/ui/src/components/SectionAccordion.tsx`
   - `packages/ui/src/components/auth/AuthBrandHeader.tsx`
   - `packages/ui/src/components/auth/auth-form-styles.ts`
   - `packages/ui/src/tokens/colors.ts`, `index.ts`, `spacing.ts`, `typography.ts` (borrados)
   - `docs/informes/evidence/ui-tokens-fuente-unica/` (16 PNG y `antes/capturas.mjs`)
   - `docs/informes/INFORME-UI-TOKENS-FUENTE-UNICA-v1.0.md`
   - `docs/specs/2026-11-08-ui-tokens-fuente-unica-spec.md`
   - `docs/plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md`
   - `docs/prompts/PROMPT-UI-TOKENS-FUENTE-UNICA-LAUNCH-v1.0.md`, `PROMPT-UI-TOKENS-FUENTE-UNICA-OLA2-LAUNCH-v1.0.md`, `PROMPT-UI-TOKENS-FUENTE-UNICA-OLA3-LAUNCH-v1.0.md`
2. **Commit de la consolidación de skills**, cuando cierre su B5. Lleva las dos skills enteras, con los ajustes de este encargo dentro. Entre los dos commits, `core-components` en `HEAD` seguirá citando `src/tokens/` como existente: es el estado previo y se corrige con el segundo.

Ambos excluyen los `next-env.d.ts` y todo lo demás del árbol. El push espera a que el CI de `main` vuelva a verde (G6.5).

## 7. Correcciones tras G6

- Estado y gates: G6 registrado; referencias al §5 aclaradas como «§5 del spec».
- Plan: cita el spec en su versión vigente; P5 y el spec §7 registran que el ajuste de las dos skills lo hizo este encargo, porque el B4 de la consolidación ya había cerrado.
- `core-components/SKILL.md`: la regla «sin hex de marca en otras skills» contradecía la tabla de `tokens.md`, que se conserva a propósito para `audit-ui.mjs`; ahora la nombra como única excepción.
- §3 distingue qué parte del diff de cada skill es de este encargo y declara la edición del cabecero del guion.
- §5 registra los datos del mock del guion y la convención de nombres de los lanzadores por ola.
