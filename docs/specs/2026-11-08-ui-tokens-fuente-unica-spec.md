# Spec — `@iwana/ui`: fuente única de tokens y hex de marca

**Versión:** 1.5
**Cambio v1.4 → v1.5 (2026-11-08):** §7 en pasado, con lo ejecutado; G6 registrado en el informe de cierre
**Cambio v1.3 → v1.4 (2026-11-08):** registro de la Ola 3 (§9.4): G3 y G4 ✅; §7 ejecutado; informe de cierre emitido
**Cambio v1.2 → v1.3 (2026-11-08):** registro de la Ola 2 (§9.3): B3-pre y B2 hechos, G2 ✅, incidente de procesos
**Cambio v1.1 → v1.2 (2026-11-08):** G0 y G1 registrados (§9); H10 y §3.5 (comentario erróneo de `globals.css`, sin efecto visual); deuda de B1 con destino
**Cambio v1.0 → v1.1 (2026-11-08):** correcciones de la revisión de `docs-governance`: H4b (hex con token exacto que `audit-ui.mjs` no marca), P1 pendientes de veredicto, H7-H9 corregidos y §5 con `#94b126`
**Estado:** Aprobado. G0 a G4 ✅ el 2026-11-08; cierre en [INFORME-UI-TOKENS-FUENTE-UNICA-v1.0](../informes/INFORME-UI-TOKENS-FUENTE-UNICA-v1.0.md)
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Dueños:** `ds-owner` (contrato de tokens y veredictos) · `fe-platform` (código de `packages/ui`)
**Origen:** deuda «fuera de alcance» de la consolidación de skills, [INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0](../informes/INFORME-SISTEMA-SKILLS-CONSOLIDACION-v1.0.md) §8.3
**Plan:** [2026-11-08-ui-tokens-fuente-unica-orquestacion.md](../plans/2026-11-08-ui-tokens-fuente-unica-orquestacion.md)

## 1. Problema

`@iwana/ui` tiene dos fuentes de tokens que no coinciden, y varios componentes llevan hex de marca escritos a mano en vez del token.

## 2. Hechos verificados el 2026-11-08

| # | Hecho | Evidencia |
| --- | --- | --- |
| H1 | `packages/ui/src/tokens/` exporta `iwanaColors`, `iwanaSpacing` e `iwanaTypography` (85 líneas), que salen en la API pública por `export * from './tokens'` en `src/index.ts` | `tokens/index.ts`, `src/index.ts` |
| H2 | Ningún código fuente los consume. Solo aparecen en artefactos de `apps/portal/.next/` (empaquetado del barrel) | `grep` sobre `apps`, `packages`, `e2e`, `scripts`, sin `node_modules` ni `.next` |
| H3 | `iwanaColors` diverge de `globals.css` (`@theme`, desde la línea 25), que es la fuente que usan los componentes vía clases Tailwind. Ejemplos: `primary.500` `#2D2A9E` frente a `--color-iwana-primary-500` `#5a5190`; `primary.50` `#EEEEFA` frente a `#f8f8fb`; la escala neutra es gris frío (`#F9FAFB`…) frente a la neutra de marca (`#f9f9f9`…); la nota de contraste dice 6,2:1 para `#6A7A1C` y `globals.css` dice 4,76:1 | `tokens/colors.ts`, `styles/globals.css` |
| H4 | `audit-ui.mjs` sobre `packages/ui/src` da **P0 0 · P1 2 · P2 9 · P3 1**. Hex de marca sin tokenizar (P2 `brand-hex`) en `auth/auth-form-styles.ts` (18, 36), `auth/AuthBrandHeader.tsx` (40) y `SectionAccordion.tsx` (153, 175, 248, 319, 353). Texto lima sin AA (P1 `lime-text-aa`, marcado `[revisar]`: pendiente del veredicto de B1) en `SectionAccordion.tsx` (154, 227). A revisar: `Select.tsx:606` (P2 `lime-50-surface`) y `Button.tsx:84` (P3 `spinner-primary`) | Salida de `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs packages/ui/src` |
| H4b | En las mismas líneas que B2 edita hay hex con token exacto que `audit-ui.mjs` no marca (su lista `BRAND_HEX` no los incluye): `#181818` en `auth-form-styles.ts:4` y `:36`, y `#E8E7F0` en `auth-form-styles.ts:33`. Y uno sin token: `hover:!bg-[#94b126]` en `auth-form-styles.ts:36` | `audit-ui.mjs:33`; `globals.css` |
| H5 | Los hex de H4 y H4b tienen token exacto en `globals.css`: `#A5C330` = `iwana-secondary`; `#E8E7F0` = `iwana-primary-100`; `#EDF8CC` = `iwana-secondary-100`; `#48531D` = `iwana-secondary-900`; `#6A7A1C` = `iwana-secondary-700`; `#181818` = `dark-surface` | `styles/globals.css` |
| H6 | `SectionAccordion.tsx:154` está dentro de un elemento con `aria-hidden="true"`: si es solo un ícono, el umbral es 3:1 (SC 1.4.11) y el P1 puede ser falso positivo, como anota el propio `globals.css` | `SectionAccordion.tsx:150-156` |
| H7 | El cabecero de `src/index.ts` dice «Sprint 0 — Scaffold: solo design tokens», cuando el paquete exporta 138 nombres y más de treinta módulos de `components/` | `src/index.ts:1-11` |
| H8 | Ningún spec de `packages/ui` ni de `apps/portal/src/components/auth/` afirma los hex de H4. `apps/portal` tiene muchos specs modificados por otras olas sin commitear, entre ellos `LoginForm.spec.tsx` y `SessionRecoveryModal.spec.tsx`, los specs de los dos componentes que consumen `AUTH_FORM_*` (`LoginForm.tsx`, `SessionRecoveryModal.tsx`) | `grep`; `git status` |
| H10 | El comentario de `globals.css` (línea 23) dice que la lima vale «como ícono aria-hidden» por el umbral 3:1 de SC 1.4.11, pero la lima sobre blanco mide 2,01:1: el comentario es falso y llevó a pensar que los P1 de H4 eran falsos positivos | `globals.css:20-23`; cálculo WCAG de B1, reproducido por el orquestador |
| H9 | Citan los tokens TS: `docs/identity/Manual_Implementacion_Identidad_Iwana.md` (ejemplo de `iwanaColors`) y `core-components/SKILL.md`. `iwana-identity-ui-review/references/tokens.md` menciona `tokens/colors.ts` como deriva conocida | `grep` |

## 3. Alcance

1. **Fuente única.** `globals.css` (`@theme`) es la única fuente de valores de token. Si D1: se retira `src/tokens/` de la API pública.
2. **Hex de marca.** Cada hex de H4 y H4b se sustituye por su token de H5. **Cambio visual nulo** en esos casos: el valor resultante es el mismo.
3. **Hallazgos P1 y a revisar.** `ds-owner` emite veredicto por hallazgo (real o falso positivo). Un P1 real se corrige con el token que fije el veredicto: es el único cambio visual permitido.
4. **Cabecero de `src/index.ts`.** Describe lo que el paquete exporta hoy, sin cifras que caduquen.
5. **Comentario de `globals.css` (H10).** Se corrige para que diga que la lima base no alcanza 3:1 sobre blanco ni como ícono, y que en claro se usa `iwana-secondary-700`. Solo el comentario: ningún valor cambia.

## 4. Fuera de alcance

- Hex sin token exacto en `globals.css` (como `#94b126`), hex no de marca (rojos y azules de alertas, gradientes `rgba`) y los de líneas que este encargo no edita: siguen como están.
- `apps/web` y `apps/portal`: no se editan. Si un cambio de `packages/ui` exige tocar una app, `[BLOQUEO]`.
- `.agents/skills/` y `docs/identity/`: ningún ejecutor los edita. El ajuste de `.agents/skills/` del §7 lo hace AI-EM-ARCH al cierre; `docs/identity/` queda al dueño de la identidad.
- Nuevos tokens: si un veredicto pide un token que no existe, `[BLOQUEO]` y contrato aparte.

## 5. Contrato de sustitución (lo completa `ds-owner` en B1 y queda congelado)

| Archivo:línea | Hex o clase actual | Token destino | Veredicto (`ds-owner`) | ¿Cambio visual? |
| --- | --- | --- | --- | --- |
| `auth/auth-form-styles.ts:4` | `text-[#181818]` | `text-dark-surface` (conserva `dark:text-white`) | **Real, sustitución exacta.** `#181818` = `dark-surface`. No existe token de «tinta» de texto en claro; `iwana-foreground`/`iwana-primary` es `#17163a` y cambiaría el valor, lo que D2 no permite fuera de P1. Contraste 17,76:1 sobre blanco | No |
| `auth/auth-form-styles.ts:18` | `focus:ring-[#A5C330]` | `focus:ring-iwana-secondary` | **Real, sustitución exacta** (`#A5C330` = `iwana-secondary`). El anillo lima mide 1,91:1 sobre `iwana-surface-soft` en claro (7,14:1 sobre `dark-surface-3`): deuda aparte, no se corrige aquí (§4) | No |
| `auth/auth-form-styles.ts:33` | `border-[#E8E7F0]` | `border-iwana-primary-100` | **Real, sustitución exacta** (`#E8E7F0` = `iwana-primary-100`). El `dark:border-dark-border` existente no cambia | No |
| `auth/auth-form-styles.ts:36` | `!bg-[#A5C330]`, `!text-[#181818]`, `shadow-[#A5C330]/20` | `!bg-iwana-secondary`, `!text-dark-surface`, `shadow-iwana-secondary/20` | **Real, sustitución exacta.** Texto `#181818` sobre lima 8,83:1 (AA). Mismo par ya usado en `AuthBrandHeader` (`text-dark-surface` sobre lima). `shadow-iwana-secondary` no choca con los `--shadow-iwana*` del `@theme` (ninguno se llama `secondary`); B3 confirma en el CSS generado | No |
| `auth/auth-form-styles.ts:36` | `hover:!bg-[#94b126]` | — (sin token exacto) | **Se mantiene** (§4): no hay token con ese valor (el más cercano, `iwana-secondary-600`, es `#8ba020`). Texto `#181818` sobre `#94b126` 7,25:1 | No |
| `auth/AuthBrandHeader.tsx:40` | `bg-[#A5C330]` | `bg-iwana-secondary` | **Real, sustitución exacta.** Conserva `text-dark-surface` | No |
| `SectionAccordion.tsx:153, 319` | `bg-[#EDF8CC] text-[#6A7A1C]` | `bg-iwana-secondary-100 text-iwana-secondary-700` | **Real, sustitución exacta.** Son íconos `aria-hidden` (umbral 3:1, SC 1.4.11): 4,28:1 | No |
| `SectionAccordion.tsx:175, 248, 353` | `bg-[#EDF8CC] text-[#48531D]` | `bg-iwana-secondary-100 text-iwana-secondary-900` | **Real, sustitución exacta.** Texto de insignia de progreso: 7,47:1 (AA) | No |
| `SectionAccordion.tsx:154` | `text-iwana-secondary` (P1) | `text-iwana-secondary-700 dark:text-iwana-secondary` (rama no completa; `bg-iwana-secondary/10` y `dark:bg-iwana-secondary/20` sin cambio) | **P1 confirmado como defecto, reclasificado:** no es texto sino ícono decorativo `aria-hidden` (líneas 150-156, `{item.icon}` junto al título). Claro: lima sobre `lima/10` sobre blanco = 1,88:1, no llega ni a 3:1 (SC 1.4.11) → se corrige. `-700` da 4,45:1. Oscuro: lima sobre `lima/20` sobre `dark-surface-2` = 5,23:1 → se conserva | Sí, solo en claro: el ícono pasa de lima a `#6A7A1C` (D2) |
| `SectionAccordion.tsx:227` | `text-iwana-secondary` (P1) | `text-iwana-secondary-700 dark:text-iwana-secondary` (resto de clases sin cambio) | **P1 confirmado como defecto, reclasificado:** es `PlusIcon` `aria-hidden` (línea 233), el botón ya tiene título y `aria-expanded`. Claro: lima sobre `gray-100` = 1,83:1 (hover sobre `lima/20`: 1,76:1) → se corrige. `-700`: 4,32:1 (hover 4,17:1), coherente con el `group-hover:text-iwana-secondary-700` de la línea 320. Oscuro: 7,14:1 (hover 5,23:1) → se conserva | Sí, solo en claro (D2) |
| `Select.tsx:606` | `bg-iwana-secondary-50` (P2 a revisar) | `bg-iwana-secondary-50` (sin cambio) | **Falso positivo.** Es el fondo de la opción resaltada de la lista (hover/teclado): «hover marcado», uso permitido de `iwana-secondary-50` (`evaluation-criteria.md`), no fondo base de panel. Texto `iwana-primary` sobre él 16,53:1 | No |
| `Button.tsx:84` | `animate-spin` (P3 a revisar) | — | **Falso positivo.** Spinner del estado `loading` del propio `Button` (acción puntual, `aria-busy`, SVG `aria-hidden`): `component-recipes.md` lo prescribe; la regla de skeleton aplica a carga primaria de página o tabla | No |

**Congelado por `ds-owner` el 2026-11-08 (G1).** Todos los tokens destino existen en `globals.css`; no se crea ninguno. Contraste medido con la fórmula WCAG sobre los valores de `globals.css` (`gray-100` = `#f3f4f6`, el de Tailwind v4). Decisión de `#181818`: `text-dark-surface`, valor idéntico (ver fila de `:4`).

`#181818` es `dark-surface`, un token de superficie oscura. Usarlo como color de texto en modo claro es decisión de `ds-owner` (puede existir un token de texto más adecuado).

## 6. Decisiones para G0

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | Retirar `src/tokens/` (`colors.ts`, `spacing.ts`, `typography.ts`, `index.ts`) y su `export *` de `src/index.ts` | **Sí.** Sin consumidores (H2) y con valores que contradicen la fuente real (H3). Alternativa descartada: regenerarlo desde `globals.css`, que mantendría dos fuentes sin que nadie use la segunda |
| D2 | Único cambio visual permitido: corregir P1 reales | **Sí.** Lo demás es sustitución por valor idéntico |

## 7. Documentos que quedan desalineados al cerrar

- `core-components/SKILL.md` citaba `iwanaColors` e `iwana-identity-ui-review/references/tokens.md` mencionaba `tokens/colors.ts` como deriva. **Ejecutado (2026-11-08):** como el B4 de la consolidación ya había cerrado, AI-EM-ARCH hizo el ajuste dentro de este encargo (§9.4). Esos dos archivos se publican con el commit de la consolidación, que comparte su diff (informe de cierre §6).
- `docs/identity/Manual_Implementacion_Identidad_Iwana.md` muestra `iwanaColors` como ejemplo de implementación. Lo decide el dueño de la identidad; se registra en el informe de cierre.

## 8. Criterios de aceptación

1. `audit-ui.mjs packages/ui/src`: cero `brand-hex`; los P1 y los «a revisar» resueltos según el veredicto de §5. Además, `grep` de `#181818` y `#E8E7F0` en `packages/ui/src/components/auth/auth-form-styles.ts`: vacío (H4b, que `audit-ui` no ve).
2. `grep -rE 'iwanaColors|iwanaSpacing|iwanaTypography' apps packages` (sin `node_modules` ni `.next`): vacío. `src/tokens/` no existe (si D1).
3. Lint, typecheck y pruebas de `@iwana/ui`, `@iwana/portal` y `@iwana/web` en verde, sin caché, con conteo no inferior a la línea base.
4. Evidencia visual antes y después, producida con Playwright (`e2e-testing-patterns`), en claro y en oscuro, de: login del portal (`LoginExperience`), login de plataforma de `apps/web` (`PlatformAuthExperience`), recuperación de sesión (`SessionRecoveryModal`) y un consumidor de `SectionAccordion`. Sin diferencias salvo las de P1 aprobadas en §5.
5. Cabecero de `src/index.ts` actualizado (H7) y comentario de `globals.css` corregido (H10).
6. El CSS generado contiene `shadow-iwana-secondary/20` como sombra de color lima al 20 % (nota de B1 en §5).

## 9. Registro de ejecución

### 9.1 G0 — 2026-11-08

El CTO aprobó en bloque: **D1 sí** (se retira `src/tokens/`) y **D2 sí** (único cambio visual: P1 reales).

### 9.2 Ola 1 (B1, `ds-owner`) — G1 ✅ 2026-11-08

§5 completo, sin celdas «(B1)», y congelado. Todos los tokens destino existen en `globals.css`; no hay `[BLOQUEO]`. `ds-owner` solo editó §5.

Verificación del orquestador: recalculó con la fórmula WCAG los contrastes de §5 y coinciden todos (4,28; 7,47; 17,76; 8,83; 7,25; 1,88 → 4,45; 1,83 → 4,32; hover 1,76 → 4,17). Confirma además 2,01:1 para la lima sobre blanco (H10). `packages/ui` sigue sin cambios en vuelo.

Resultado: las sustituciones de hex no cambian nada visible; los dos P1 son íconos `aria-hidden` que no llegan ni a 3:1 en claro y se corrigen con `text-iwana-secondary-700 dark:text-iwana-secondary` (único cambio visual); `Select.tsx:606` y `Button.tsx:84` son falsos positivos y no se tocan; `#181818` pasa a `text-dark-surface`, que es el mismo valor.

**Deuda de B1 y destino:**

| Sev. | Deuda | Destino |
| --- | --- | --- |
| P2 | Comentario de `globals.css` erróneo sobre la lima como ícono (H10) | B2 (§3.5): solo texto, sin efecto visual |
| P2 | El anillo de foco lima de `AUTH_FORM_INPUT_FOCUS_CLASS` mide 1,91:1 sobre `iwana-surface-soft` en claro (7,14:1 en oscuro): indicador de foco por debajo de 3:1 | Encargo aparte: cambia lo visible y D2 no lo permite aquí |
| P3 | No existe un token de texto «tinta» para modo claro; usar `dark-surface` como texto es semánticamente impreciso | Contrato de tokens aparte de `ds-owner` |
| P3 | Confirmar que `shadow-iwana-secondary/20` compila como sombra de color | B3 (§8 criterio 6) |

### 9.3 Ola 2 (B3-pre → B2) — G2 ✅ 2026-11-08

**B3-pre (`sr-qa`).** Las 8 capturas «antes» (4 pantallas × claro y oscuro) y el guion `capturas.mjs` están en `docs/informes/evidence/ui-tokens-fuente-unica/antes/`. Según su informe, el guion corrió dos veces y las 8 PNG salieron idénticas byte a byte. El orquestador comprobó que existen y que `packages/ui` no cambió durante este paso.

**B2 (`fe-platform`).** Verificación del orquestador sobre el árbol:

- `git status`: 5 archivos modificados en `packages/ui` (`SectionAccordion.tsx`, `auth/AuthBrandHeader.tsx`, `auth/auth-form-styles.ts`, `index.ts`, `styles/globals.css`) y los 4 de `src/tokens/` borrados. Nada en `apps/` salvo los `next-env.d.ts`, que no son de esta ola.
- El diff coincide fila por fila con §5. `hover:!bg-[#94b126]` se mantiene, como fija §5.
- `src/tokens/` no existe; el `grep` de `iwanaColors`, `iwanaSpacing` e `iwanaTypography` sobre el código del repo (sin `node_modules`, `.next`, `docs/` ni `.agents/`) sale vacío.
- `audit-ui.mjs packages/ui/src`: **P0 0 · P1 0 · P2 1 · P3 1**. Los dos restantes son los falsos positivos de §5 (`Select.tsx:606`, `Button.tsx:84`).
- `grep` de H4b (`#181818`, `#E8E7F0`) en `auth-form-styles.ts`: vacío.
- Cabecero de `src/index.ts` sin cifras y con la fuente única de tokens; comentario de `globals.css` corregido (2,01:1), sin cambio de valores.

**Pruebas.** Según `fe-platform`, la línea base y el cierre de `@iwana/ui`, `@iwana/web` y `@iwana/portal` coinciden, sin caché: 55, 233 y 3.479 tests. El orquestador no las repitió; las verifica `gate-verifier` en B4 (G4).

**Incidente.** Para detener una corrida suya, `fe-platform` ejecutó `taskkill` sobre todos los `node.exe` y `turbo.exe` de la máquina. Pudo cortar dev servers, sesiones de prueba o servidores MCP de otras sesiones; en la sesión del orquestador el MCP `redis-dev` se desconectó y reconectó en ese intervalo. A partir de la Ola 3, todo lanzador con ejecución prohíbe matar procesos por nombre.

**Deuda de la Ola 2 y destino:**

| Sev. | Deuda | Destino |
| --- | --- | --- |
| P3 | `globals.css:13` declara `@source "../tokens.ts"`, un archivo que no existe. Ya estaba en `HEAD` (no lo introdujo B2) y es inerte | Encargo aparte de UI, junto al anillo de foco (§9.2) |
| P3 | Confirmar que `shadow-iwana-secondary/20` compila como sombra de color | B3 (§8 criterio 6) |

### 9.4 Ola 3 (B3 ∥ B4) — G3 ✅ y G4 ✅ 2026-11-08

- **B3 (`sr-qa`).** 7 de 8 parejas idénticas píxel a píxel; `04-section-accordion-claro` difiere en 44 px, los del `PlusIcon` de la línea 227 (lima → `#6A7A1C`, aprobado en §5). Contraste final de los íconos: 4,45:1 (línea 154) y 4,32:1 (línea 227; hover 4,17:1). `shadow-iwana-secondary/20` compila a `#a5c33033` en el CSS de portal y de web (criterio 6). `audit-ui.mjs`: P0 0 · P1 0 · P2 1 · P3 1. El guion exige `PW_CHANNEL=chrome`: con el Chromium de Playwright el antialiasing hacía diferir las 8 parejas. El orquestador documentó el requisito en el cabecero del guion y comprobó que las 8 capturas «después» existen y que `packages/ui` no cambió después de B2.
- **B4 (`gate-verifier`).** Sin caché: `@iwana/ui` 55 tests (8 suites), `@iwana/web` 233 (38), `@iwana/portal` 3.479 (348; 1 omitido), iguales a la línea base; lint y typecheck con exit 0 en los tres. Ningún rojo. Ningún spec cambió.
- **§7 ejecutado por el orquestador.** El B4 de la consolidación de skills ya había cerrado (43 skills), así que el ajuste fue propio: `core-components/SKILL.md` sin las filas del espejo TypeScript y con la regla «no hay tokens en TypeScript»; `iwana-identity-ui-review/references/tokens.md` registra el retiro. `pnpm sync:skills:check`: «OK: 43 skills».
- Cierre, deuda y publicación: [INFORME-UI-TOKENS-FUENTE-UNICA-v1.0](../informes/INFORME-UI-TOKENS-FUENTE-UNICA-v1.0.md).
