# INFORME — Flujos de autenticación: anillo de foco accesible y hex de marca

**Versión:** 1.0
**Estado:** Aprobado y publicado. G0 a G4 y G6 ✅ el 2026-11-08; G6.5 ✅ el 2026-11-09 (`ebb0fe61`)
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Convención documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Vínculos de trazabilidad

- Definición: [2026-11-08-ui-anillo-foco-auth-spec.md](../specs/2026-11-08-ui-anillo-foco-auth-spec.md) (§9: registro por ola)
- Plan: [2026-11-08-ui-anillo-foco-auth-orquestacion.md](../plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md)
- Lanzadores: [Ola 1](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-LAUNCH-v1.0.md) · [Ola 2](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-OLA2-LAUNCH-v1.0.md) · [Ola 3](../prompts/PROMPT-UI-ANILLO-FOCO-AUTH-OLA3-LAUNCH-v1.0.md)
- Origen: deuda P2 y P3 de [INFORME-UI-TOKENS-FUENTE-UNICA-v1.0](INFORME-UI-TOKENS-FUENTE-UNICA-v1.0.md) §5
- Evidencia visual y de CSS: `docs/informes/evidence/ui-anillo-foco-auth/antes/` y `despues/`

## 1. Resultado

El anillo de foco de los campos de autenticación pasa a `iwana-secondary-700` en claro y a la lima plena en oscuro, sin opacidad. Es el mismo patrón que ya usaba `Button`. En claro pasa de 1,92:1–2,01:1 a 4,25:1–4,76:1; en el login de plataforma, que usaba opacidad, de 1,25:1 a 4,53:1.

El anillo vive en una sola fuente, las constantes de `@iwana/ui`. Las cuatro páginas secundarias del portal y el login de plataforma dejaron de escribir el suyo. Los hex de marca de `apps/portal/src/app/auth/` que tienen token exacto pasaron a ese token, y se retiró el `@source "../tokens.ts"` inerte de `globals.css`.

## 2. Gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G0 | ✅ 2026-11-08 | CTO: D1 (incluir los hex de las páginas de auth) y D2 (cambios visuales solo en anillos y en el hover de enlaces), sí (spec §9.1) |
| G1 | ✅ 2026-11-08 | `ds-owner` completó y congeló el spec §5. El orquestador recalculó los contrastes y corrigió una fila: el icono de `change-password` no tiene `aria-hidden` (spec §9.2) |
| G2 | ✅ 2026-11-08 | El diff de 9 archivos coincide con §5 fila por fila. `grep` del criterio 1, vacío. `audit-ui.mjs apps/portal/src/app/auth`: de 25 P2 a 0; queda 1 P1 `[revisar]`, la deuda ya registrada (spec §9.3) |
| G3 | ✅ 2026-11-08 | `sr-qa`, 10 parejas. Las 4 de oscuro de páginas sin cambio salen idénticas; las otras 6 solo difieren en el anillo enfocado. Anillo ≥ 3:1 en todas las capturas. CSS generado: solo el intercambio de clases del anillo (spec §9.4) |
| G4 | ✅ 2026-11-08 | `gate-verifier`, `--force` y `Cached: 0`: `@iwana/ui` 8/55, `@iwana/web` 38/233, `@iwana/portal` 348/3.478 + 1 omitido. Los mismos conteos que la línea base; lint y typecheck con exit 0. B2 no tocó ningún spec |
| G6 | ✅ 2026-11-08 | `docs-governance`: GO, sin bloqueantes y con cinco menores, corregidos o resueltos en §6 |
| G6.5 | ✅ 2026-11-09 | `ebb0fe61` en `origin/main` por orden del usuario. `CI` verde (run 42616291077): lint, typecheck, build, unitarias, E2E portal, E2E R4.1, imágenes, citas ADR y detección de solo docs. `E2E Web Admin Smoke` verde (run 42616291094) |

## 3. Cambios

| Archivo | Cambio |
| --- | --- |
| `packages/ui/src/components/auth/auth-form-styles.ts` | `AUTH_FORM_INPUT_FOCUS_CLASS` pasa a `border-slate-200 focus:ring-iwana-secondary-700 dark:focus:ring-iwana-secondary`. `AUTH_FORM_INPUT_ERROR_CLASS` no cambia |
| `packages/ui/src/styles/globals.css` | Sin `@source "../tokens.ts"` |
| `apps/portal/src/app/auth/{change-password,forgot-password,reset-password,verify-email}/page.tsx` | 14 anillos pasan a las constantes. 4 enlaces pasan a `hover:text-iwana-secondary-700` y 8 fondos a `bg-dark-surface`. En `change-password`, además, el logo y el icono pasan a `iwana-secondary`, y el botón cambia el fondo y la sombra a token |
| `apps/portal/src/app/auth/mfa/{setup,verify}/page.tsx` | `text-[#17163A]` pasa a `text-iwana-primary` (4 líneas) |
| `apps/web/src/components/auth/LoginForm.tsx` | El campo normal y el de error usan las constantes. Se retira el borde oscuro duplicado de `fieldDefault`, porque ya lo aporta `fieldBase` |
| `docs/informes/evidence/ui-anillo-foco-auth/` | 10 capturas «antes», 10 «después», el guion `antes/capturas.mjs` y el CSS generado de portal y web en cada lado |

CSS: el CSS de web conserva antes y después `focus:ring-iwana-secondary/35` y `dark:focus:ring-iwana-secondary-400/25`, que el de portal pierde. Ningún código los usa; esas cadenas solo aparecen en `docs/` (este spec y dos documentos de usuarios de julio). La causa probable es que Tailwind de web escanea también `docs/`, pero no está verificada. Son reglas inertes, sin efecto visible.

Visible solo con un campo enfocado. En claro, el anillo pasa de lima a `#6A7A1C` en las cinco pantallas. En oscuro, el login de plataforma pasa de lima al 25 % a lima plena; el resto ya era lima plena. Los enlaces de las páginas secundarias cambian el hover a `#6A7A1C` (2,01:1 → 4,76:1).

## 4. Deuda

| Sev. | Deuda | Destino |
| --- | --- | --- |
| P2 | `text-[#181818]` en 21 líneas de `apps/portal/src/app/auth/`: falta un token de texto oscuro para claro. En `auth-form-styles.ts`, el encargo de tokens usó `text-dark-surface` con el mismo valor | Contrato de tokens de `ds-owner`, junto con el token «tinta» (INFORME-UI-TOKENS-FUENTE-UNICA §5) |
| P2 | Anillos con opacidad fuera de auth: `Select.tsx:494-498`, `MultiSelect.tsx:123-124`, `PanelCard.tsx:29`, `CatalogPicker.tsx:63, 255` y `CreateContractDialog.tsx:67` | Contrato de anillo de foco general de `ds-owner` (spec §4) |
| P3 | Icono lima de `change-password:397`, sin `aria-hidden`, 2,01:1 sobre blanco. `audit-ui` lo marca como P1 `[revisar]` | Próximo encargo que abra la página |
| P3 | `bg-[#EEEEFA]` (2) y `text-[#6B7280]` (2) en MFA, y `hover:bg-[#94b126]` en `change-password` | Sin token exacto; contrato de tokens de `ds-owner` |
| P3 | El hover de los enlaces no tiene captura; su contraste está verificado por fórmula | Ampliar el guion si se reabre |
| — | Gradientes con hex (4) y SVG `fill`/`stroke` (2) | Fuera de alcance (spec §4) |

La deuda del guion del encargo de tokens (mock con dominio y formato reales) queda resuelta en el guion nuevo: `.test` y `+570000000000`.

## 5. Publicación (B6)

Hecho: `ebb0fe61` (46 rutas), commit el 2026-11-08 y push el 2026-11-09, G6.5 ✅ (§2). Se armó vía `iwana-checkpoint-commit`, con esta lista explícita de rutas:

- `packages/ui/src/components/auth/auth-form-styles.ts`
- `packages/ui/src/styles/globals.css`
- `apps/portal/src/app/auth/change-password/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `verify-email/page.tsx`, `mfa/setup/page.tsx`, `mfa/verify/page.tsx`
- `apps/web/src/components/auth/LoginForm.tsx`
- `docs/informes/evidence/ui-anillo-foco-auth/`
- `docs/informes/INFORME-UI-ANILLO-FOCO-AUTH-v1.0.md`
- `docs/specs/2026-11-08-ui-anillo-foco-auth-spec.md`
- `docs/plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md`
- `docs/prompts/PROMPT-UI-ANILLO-FOCO-AUTH-LAUNCH-v1.0.md`, `PROMPT-UI-ANILLO-FOCO-AUTH-OLA2-LAUNCH-v1.0.md`, `PROMPT-UI-ANILLO-FOCO-AUTH-OLA3-LAUNCH-v1.0.md`

Excluye los specs en vuelo de `apps/portal/src/components/auth/` (spec H12), los `next-env.d.ts` y todo lo demás del árbol.

Desviación del checkpoint: no se aisló el índice con `git stash --include-untracked`, porque unas 315 rutas en vuelo de otras sesiones habrían quedado fuera del árbol durante el gate. Se sustituyó por tres comprobaciones: las constantes importadas ya se exportaban desde `@iwana/ui` en `HEAD`; el diff de los 9 archivos de código es íntegro de este encargo; y G4 corrió sobre el árbol completo. El commit pesa unas 45.000 líneas, casi todas de los cuatro CSS generados de la evidencia (criterio 5).

Los servidores de desarrollo de portal (3002) y web (3001) que lanzó `fe-platform` siguen vivos. Los detiene esa misma sesión por su PID, nunca por nombre.

## 6. Correcciones tras G6

- Estado y fila G6: se registra el GO de `docs-governance`.
- §5: lista de rutas completa, sin referencias genéricas.
- Los tres lanzadores marcan su ola como cerrada en la cabecera. El bloque copiar-pegar no cambia; relanzar la Ola 3 sobrescribiría `despues/`.
- §3 y spec §9.4: salvedad de las dos reglas inertes que conserva el CSS de web.
- Plantilla `TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`: decisión de AI-EM-ARCH, no se enlaza. Un `LAUNCH` no es un prompt de ejecución: cada uno declara «No hay prompt de ejecución aparte: el encargo es el plan §5». Es la misma práctica del encargo de tokens y de 168 de los 264 lanzadores del repo. Si se quiere fijar como regla, es una enmienda a `docs.instructions.md`.
