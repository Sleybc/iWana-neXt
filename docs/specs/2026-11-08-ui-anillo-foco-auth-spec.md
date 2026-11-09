# Spec — Flujos de autenticación: anillo de foco accesible y hex de marca

**Versión:** 1.5
**Cambio v1.4 → v1.5 (2026-11-08):** salvedad del CSS de web en §9.4 (revisión G6 de `docs-governance`)
**Cambio v1.3 → v1.4 (2026-11-08):** registro de la Ola 3 (§9.4): G3 y G4 ✅; informe de cierre emitido
**Cambio v1.2 → v1.3 (2026-11-08):** registro de la Ola 2 (§9.3): B3-pre y B2 hechos, G2 ✅
**Cambio v1.1 → v1.2 (2026-11-08):** §5 completado y congelado por `ds-owner`; G1 registrado (§9.2), con una corrección del orquestador a la fila `change-password:394`
**Cambio v1.0 → v1.1 (2026-11-08):** G0 registrado (§9.1); cifras de H5, H7, H8 y H11 corregidas tras la revisión de `docs-governance`
**Estado:** Aprobado. G0 a G4 ✅ el 2026-11-08; cierre en [INFORME-UI-ANILLO-FOCO-AUTH-v1.0](../informes/INFORME-UI-ANILLO-FOCO-AUTH-v1.0.md)
**Fecha:** 2026-11-08
**Emitido por:** AI-EM-ARCH
**Dueños:** `ds-owner` (contrato y veredictos) · `fe-platform` (código de `packages/ui`, `apps/portal` y `apps/web`)
**Origen:** deuda P2 y P3 de [INFORME-UI-TOKENS-FUENTE-UNICA-v1.0](../informes/INFORME-UI-TOKENS-FUENTE-UNICA-v1.0.md) §5
**Plan:** [2026-11-08-ui-anillo-foco-auth-orquestacion.md](../plans/2026-11-08-ui-anillo-foco-auth-orquestacion.md)

## 1. Problema

El indicador de foco de los campos de autenticación es un anillo lima que en modo claro no llega a 3:1 frente a su entorno: el usuario de teclado no ve dónde está. El mismo defecto está copiado a mano, con hex, en cuatro páginas del portal, y con opacidad en el login de plataforma, donde es aún más tenue.

## 2. Hechos verificados el 2026-11-08

| # | Hecho | Evidencia |
| --- | --- | --- |
| H1 | `AUTH_FORM_INPUT_FOCUS_CLASS` = `border-slate-200 focus:ring-iwana-secondary`. El campo pone `focus:border-transparent focus:ring-2`: en foco, el anillo es el único indicador | `packages/ui/src/components/auth/auth-form-styles.ts:7` y `:18` |
| H2 | La consumen el login del portal (`LoginForm.tsx:121, 146, 172`) y `SessionRecoveryModal.tsx:515, 533, 551` | `grep` en `apps/` |
| H3 | Cuatro páginas del portal repiten el anillo con hex, 14 veces: `focus:ring-[#A5C330]` en `change-password` (3), `forgot-password` (2), `reset-password` (5) y `verify-email` (4). Su fondo de campo es `bg-slate-50` | `apps/portal/src/app/auth/*/page.tsx` |
| H4 | El login de plataforma usa su propia clase: `focus:ring-iwana-secondary/35` y `dark:focus:ring-iwana-secondary-400/25`; error, `focus:ring-red-500/30` | `apps/web/src/components/auth/LoginForm.tsx:61-62` |
| H5 | Contraste del anillo (fórmula WCAG sobre `globals.css`). Lima `#a5c330`: 1,91:1 sobre `iwana-surface-soft`, 2,01:1 sobre blanco, 7,14:1 sobre `dark-surface-3`. `iwana-secondary-700` `#6a7a1c`: 4,53:1, 4,76:1 y 3,02:1. `red-500` (Tailwind v4, `#fb2c36`): 3,62:1, 3,81:1 y 3,77:1. Con opacidad (H4) el contraste efectivo baja aún más | Cálculo del orquestador |
| H6 | `Button` ya resuelve el mismo caso: variante `lime` con `focus-visible:ring-iwana-secondary-700` en claro y `dark:focus-visible:ring-iwana-secondary` en oscuro | `packages/ui/src/components/Button.tsx:24` |
| H7 | `audit-ui.mjs apps/portal/src/app/auth`: P0 0 · P1 0 · P2 25 (`brand-hex`). 14 son los anillos de H3; los 11 restantes: `bg-[#A5C330]` y `text-[#A5C330]` en `change-password:81, 371, 394`, `hover:text-[#A5C330]` en enlaces de `forgot-password:120, 123`, `reset-password:209` y `verify-email:233`, y `text-[#17163A]` en `mfa/setup` y `mfa/verify` (líneas 14 y 28). El script no ve 4 más dentro de `bg-[radial-gradient(#A5C330_1px,…)]` (`forgot-password:61`, `change-password:75`, `reset-password:92`, `verify-email:96`), excluidas por §4 | Salida del script; `grep` |
| H8 | `audit-ui` no marca `#181818` (31 apariciones en esas páginas, incluidos fondos `bg-[#181818]` y atributos SVG `fill`), ni `#EEEEFA` (2, el `primary-50` viejo del espejo TS retirado; hoy `iwana-primary-50` es `#f8f8fb`) ni `#94b126` (1, sin token) ni `#6B7280` (2, `mfa/setup:29` y `mfa/verify:29`, gris no de marca) | `grep` sobre `apps/portal/src/app/auth` |
| H9 | `hover:text-[#A5C330]` es texto de enlace sobre blanco: 2,01:1 en hover, por debajo de AA | H5 |
| H10 | `globals.css:13` declara `@source "../tokens.ts"`; el archivo no existe. Inerte | `packages/ui/src/styles/globals.css` |
| H11 | Ninguna prueba del repo fija las clases de foco que cambian. Las dos que nombran `focus-visible:ring-iwana-secondary` (`apps/portal/src/components/settings/SettingsClient.spec.tsx:167`, `e2e/tests/portal-settings-branding-smoke.spec.ts:486`) comprueban que **no** esté, en otros componentes. `ui-primitives-a11y.spec.tsx:164` fija `focus:ring-iwana-error`, que este encargo no toca | `grep` sobre `*.spec.*` |
| H12 | `apps/portal/src/components/auth/LoginForm.spec.tsx` y `SessionRecoveryModal.spec.tsx` tienen cambios sin commitear de otra sesión | `git status` |

## 3. Alcance

1. **Contrato del anillo de foco de autenticación.** En claro, `iwana-secondary-700`; en oscuro, `iwana-secondary`; sin opacidad. Error: `red-500` sin opacidad. Es el patrón de `Button` (H6). Se fija en `AUTH_FORM_INPUT_FOCUS_CLASS` y `AUTH_FORM_INPUT_ERROR_CLASS`.
2. **Una sola fuente.** Las cuatro páginas de H3 y el login de plataforma (H4) dejan de escribir su anillo: usan las constantes de `@iwana/ui`. Si el login de plataforma necesita conservar su borde oscuro propio, lo compone junto a la constante, sin repetir el anillo.
3. **Hex de marca de las mismas páginas.** Cada hex en una clase Tailwind de `apps/portal/src/app/auth/` con token exacto en `globals.css` pasa a ese token (H7 y H8), con cambio visual nulo. Excepción: los enlaces de H9 pasan a `hover:text-iwana-secondary-700`, que es cambio visual.
4. **`@source` inerte.** Se retira `@source "../tokens.ts"` de `globals.css` (H10).

## 4. Fuera de alcance

- Atributos SVG (`fill="#181818"`), gradientes con hex dentro de un valor arbitrario (`bg-[radial-gradient(#A5C330_1px,…)]`) y hex sin token exacto (`#94b126`, `#EEEEFA`, `#6B7280`): siguen como están y quedan en deuda.
- Anillos con opacidad de otros componentes (`Select.tsx:494-498`, `MultiSelect.tsx:123-124`, `apps/web/.../PanelCard.tsx:29`, `CatalogPicker.tsx:63, 255`, `CreateContractDialog.tsx:67`): piden un contrato de foco general de `ds-owner`, no un parche por pantalla. Quedan en deuda.
- Tokens nuevos. Si un veredicto exige uno, `[BLOQUEO]`.
- `.agents/skills/` y la suite `e2e/`.

## 5. Contrato de sustitución (lo completa `ds-owner` en B1 y queda congelado)

| Archivo:línea | Clase actual | Clase destino | Veredicto (`ds-owner`) | ¿Cambio visual? |
| --- | --- | --- | --- | --- |
| `auth-form-styles.ts:18` | `focus:ring-iwana-secondary` | `focus:ring-iwana-secondary-700 dark:focus:ring-iwana-secondary` | Adoptar: es el patrón de `Button` lime (H6). En claro, 4,53:1 contra el campo (`surface-soft`) y 4,76:1 contra el contenedor (blanco); en oscuro, 7,14:1 contra el campo (`dark-surface-3`) y 7,92:1 contra el contenedor (`dark-surface-2`). Supera 3:1 en los cuatro (SC 1.4.11) y es visible (SC 2.4.7) | Sí, en claro (D2) |
| `auth-form-styles.ts:19` | `focus:ring-red-500` | `focus:ring-red-500` (se fija como `AUTH_FORM_INPUT_ERROR_CLASS`, sin opacidad y sin rama `dark`) | Adoptar tal cual: 3,62:1 contra el campo claro y 3,81:1 contra el contenedor; 3,77:1 contra el campo oscuro y 4,18:1 contra su contenedor. Una sola clase sirve a ambos temas | No |
| `apps/web/.../LoginForm.tsx:61-62` | anillo con `/35`, `/25` y error con `/30` | `AUTH_FORM_INPUT_FOCUS_CLASS` y `AUTH_FORM_INPUT_ERROR_CLASS` de `@iwana/ui` (§3.2); `fieldBase` conserva `dark:border-iwana-neutral-600` (ya lo tiene en L59; se retira el duplicado de `fieldDefault`) | Adoptar: con opacidad el contraste efectivo es 1,25:1 en claro (normal), 1,54–1,62:1 (error) y 1,83:1 en oscuro — invisible en los tres. La composición es limpia porque la base ya aporta el borde oscuro; no hay `[BLOQUEO]` | Sí (D2) |
| 4 páginas de H3, 14 líneas (anillo normal + rama de error del mismo ternario): `change-password:155, 228, 316`; `forgot-password:83, 102`; `reset-password:114, 132, 151, 169, 188`; `verify-email:117, 137, 183, 203` | `focus:ring-[#A5C330]` y rama de error `focus:ring-red-500` | constantes de `@iwana/ui` (§3.2) | Adoptar: el operando normal mide 1,92:1 contra el campo (`slate-50`) y 2,01:1 contra el contenedor (blanco) — el defecto de H1/H3; el destino da 4,55:1 y 4,76:1. La rama de error ya es `red-500` sin opacidad (3,64:1 / 3,81:1) y pasa a constante con valor idéntico. Páginas solo en claro, sin medición en oscuro | Sí en claro, operando normal (D2); rama de error nulo |
| Enlaces de H9 (4 líneas): `forgot-password:120, 123`; `reset-password:209`; `verify-email:233` | `hover:text-[#A5C330]` | `hover:text-iwana-secondary-700` | Adoptar: 2,01:1 → 4,76:1 sobre blanco; alcanza AA de texto (H9) | Sí, en hover (D2) |
| `change-password:81` | `bg-[#A5C330]` (pastilla del logo) | `bg-iwana-secondary` | Adoptar: token exacto, uso decorativo sobre el que no aplica contraste de texto | No |
| `change-password:394` | `text-[#A5C330]` (icono) | `text-iwana-secondary` | Adoptar: token exacto. **Corrección del orquestador (G1):** el `<svg>` de las líneas 393-398 no lleva `aria-hidden` y mide 2,01:1 sobre blanco; acompaña a un texto, así que no transmite información propia, pero D2 no permite cambiar su color aquí. Deuda P3 | No |
| `change-password:371` (botón primario; veredicto por clase) | `bg-[#A5C330]` + `shadow-[#A5C330]/20` + `text-[#181818]` + `hover:bg-[#94b126]` | `bg-iwana-secondary` + `shadow-iwana-secondary/20`; `text-[#181818]` y `hover:bg-[#94b126]` se quedan | Adoptar parcial: fondo y sombra tienen token exacto e idéntico. `hover:bg-[#94b126]` no tiene token exacto (§4, H8) y `text-[#181818]` sigue la fila de textos oscuros (deriva semántica si usara `dark-surface`) | No en lo migrado; el resto queda en deuda |
| `mfa/setup:14, 28`; `mfa/verify:14, 28` | `text-[#17163A]` (icono y título) | `text-iwana-primary` | Adoptar: token exacto (`DEFAULT`); 17,32:1 sobre blanco y semántica correcta (azul noche = texto) | No |
| Fondos oscuros (8 líneas): `change-password:64, 73`; `forgot-password:54, 60`; `reset-password:85, 91`; `verify-email:89, 95` | `bg-[#181818]` (paneles split) | `bg-dark-surface` | Adoptar: token exacto y semántica correcta — las piezas son superficies oscuras | No |
| Textos `text-[#181818]` (20 líneas): `change-password:93, 116, 130, 203, 291`; `forgot-password:65, 74, 93`; `reset-password:96, 106, 124, 143, 160, 179`; `verify-email:101, 109, 129, 166, 175, 195` | `text-[#181818]` sobre tarjeta blanca | Se queda | Queda: el único token exacto (`dark-surface`) es de superficie dark — usarlo como texto en claro es deriva semántica. El token correcto (`iwana-primary`) no es exacto y D2 no cubre el cambio. Deuda P2 nueva | No |
| `mfa/setup:12`; `mfa/verify:12` | `bg-[#EEEEFA]` | Se queda | Queda: sin token exacto (§4, H8; hoy `iwana-primary-50` es `#f8f8fb`). Deuda P3 | No |
| `mfa/setup:29`; `mfa/verify:29` | `text-[#6B7280]` | Se queda | Queda: gris no de marca, sin token exacto (§4, H8). Mide 4,83:1 sobre blanco (pasa AA), así que no es defecto de contraste. Deuda P3 | No |
| Gradientes (4): `forgot-password:61`; `change-password:75`; `reset-password:92`; `verify-email:96` — SVG (2): `change-password:83, 86` | hex dentro de valor arbitrario / atributos `fill` y `stroke` | Se quedan | Fuera de alcance (§4) | No |
| `globals.css:13` | `@source "../tokens.ts"` | — (se retira) | Retirar: inerte, el archivo no existe (H10). B3 verifica que el CSS generado no pierde clases ni reglas `iwana-*` | No |

Tabla congelada por `ds-owner` el 2026-11-08 (B1). G1 se cumple: sin celdas «(B1)». Ningún veredicto exige un token inexistente en `globals.css`: no hay `[BLOQUEO]` (`red-500` es paleta por defecto de Tailwind v4; `shadow-iwana-secondary/20` deriva de `--color-iwana-secondary`).

`ds-owner` midió cada contraste sobre el fondo real del campo y de su contenedor, en claro y en oscuro, y confirma que el anillo de 2 px alcanza 3:1 contra ambos (SC 1.4.11) y es visible (SC 2.4.7).

## 6. Decisiones para G0

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | Ampliar el encargo a los hex de marca de `apps/portal/src/app/auth/` (§3.3), no solo a los anillos | **Sí.** Son las mismas cuatro páginas que B2 ya edita; dejar decenas de hex al lado de los anillos corregidos obliga a abrirlas otra vez |
| D2 | Cambios visuales permitidos: el anillo de foco en claro (lima → `iwana-secondary-700`), el anillo del login de plataforma y su error (sin opacidad) y el hover de los enlaces de H9. Todo lo demás, valor idéntico | **Sí.** Son los defectos de contraste; nada más cambia |

## 7. Documentos que quedan desalineados al cerrar

- `INFORME-UI-TOKENS-FUENTE-UNICA-v1.0.md` §5: las dos filas de deuda ya apuntan a este spec. El informe de cierre de este encargo las da por resueltas.
- `.agents/skills/iwana-identity-ui-review/references/tokens.md` y `core-components/SKILL.md`: si `ds-owner` fija una regla de anillo de foco reutilizable, AI-EM-ARCH la registra en `core-components` al cierre, después del commit de la consolidación de skills.

## 8. Criterios de aceptación

1. `audit-ui.mjs apps/portal/src/app/auth`: cero `brand-hex` salvo los de §4. `grep -E 'ring-\[#|ring-iwana-secondary/|ring-red-500/'` sobre las rutas de §2: vacío.
2. Contraste medido de cada anillo nuevo ≥ 3:1 contra el fondo del campo y del contenedor, en claro y en oscuro; enlaces de H9 ≥ 4,5:1 en hover.
3. Lint, typecheck y pruebas de `@iwana/ui`, `@iwana/portal` y `@iwana/web` en verde, sin caché, con conteo no inferior a la línea base.
4. Evidencia visual antes y después, con Playwright, en claro y en oscuro, con un campo **enfocado por teclado** en: login del portal, `SessionRecoveryModal`, login de plataforma, `forgot-password` y `verify-email`. Sin diferencias salvo las de D2.
5. `globals.css` sin `@source "../tokens.ts"`; el CSS generado de portal y web no pierde clases (comparación de tamaño y de las reglas `iwana-*` antes y después).

## 9. Registro de ejecución

### 9.1 G0 — 2026-11-08

El CTO aprobó en chat («G0 aprobado») las dos decisiones con la recomendación de §6: **D1 sí** (el encargo incluye los hex de marca de `apps/portal/src/app/auth/`) y **D2 sí** (los únicos cambios visuales son los anillos de foco, el anillo del login de plataforma y su error, y el hover de los enlaces de H9). Antes de G0, `docs-governance` dio GO sin bloqueantes; sus cuatro menores se corrigieron en v1.1.

### 9.2 Ola 1 (B1, `ds-owner`) — G1 ✅ 2026-11-08

`ds-owner` completó y congeló §5 sin `[BLOQUEO]`. `audit-ui.mjs apps/portal/src/app/auth`: P0 0 · P1 0 · P2 25 · P3 0, igual que H7. Solo editó este spec.

Verificación del orquestador:
- §5 no tiene celdas «(B1)».
- Los números de línea de los 14 anillos y de los 8 fondos `bg-[#181818]` coinciden con el código. Los 20 `text-[#181818]` más el del botón de `change-password:371` suman los 21 del `grep`.
- Contrastes recalculados: coinciden. Destino 4,53:1 o 4,55:1 en claro, 7,14:1 y 7,92:1 en oscuro; error 3,62:1 a 4,18:1; hover de enlaces 4,76:1.
- Una corrección: la fila `change-password:394` daba el icono como `aria-hidden`, y el `<svg>` no lo lleva. Se mantiene la sustitución exacta y se anota la deuda.

Decisiones de B1:
- **Anillo de error:** `red-500` sin opacidad, una sola clase para los dos temas.
- **`apps/web`:** usa las dos constantes; se retira el borde oscuro duplicado de `fieldDefault`, porque `fieldBase` ya lo aporta.
- **`bg-[#181818]` → `bg-dark-surface`:** son superficies oscuras.
- **`text-[#181818]` se queda:** `dark-surface` como texto en claro es deriva semántica.

Este último criterio difiere del que el mismo `ds-owner` aplicó en `auth-form-styles.ts` en el encargo de tokens (`c73a9220`, `text-dark-surface`). Los dos casos convergen en la deuda del token de texto «tinta» (INFORME-UI-TOKENS-FUENTE-UNICA §5).

**Deuda de la Ola 1 y destino:**

| Sev. | Deuda | Destino |
| --- | --- | --- |
| P2 | `text-[#181818]` en 21 líneas de `apps/portal/src/app/auth/` (20 textos y el botón de `change-password:371`): falta un token de texto oscuro para claro | Contrato de tokens de `ds-owner`, junto con el token «tinta» del encargo de tokens |
| P3 | Icono lima de `change-password:394` sin `aria-hidden`, 2,01:1 sobre blanco | Próximo encargo que abra la página |
| P3 | `bg-[#EEEEFA]` (2) y `text-[#6B7280]` (2) en MFA; `hover:bg-[#94b126]` en `change-password:371` | Sin token exacto; contrato de tokens de `ds-owner` |
| — | Gradientes con hex (4) y SVG `fill`/`stroke` (2) | Fuera de alcance (§4) |

### 9.3 Ola 2 (B3-pre → B2) — G2 ✅ 2026-11-08

**B3-pre (`sr-qa`).** Su informe no llegó al orquestador. Se verificó la evidencia en disco:
- `docs/informes/evidence/ui-anillo-foco-auth/antes/`: 10 capturas (5 pantallas × 2 temas), el guion `capturas.mjs` y `css/` con el CSS de portal y web, el listado de reglas `iwana-*` y `resumen.json`.
- Las capturas son de las 21:55 y las primeras ediciones de B2, de las 21:59: el «antes» es anterior al cambio.
- El guion exige `PW_CHANNEL=chrome` y enfoca con `Tab`. El mock usa `contacto@isp-prueba.test` y `+570000000000`, con lo que queda resuelta la deuda del guion del encargo de tokens.

**B2 (`fe-platform`).** Aplicó §5 fila por fila y retiró `@source "../tokens.ts"`. Nueve archivos: 77 líneas añadidas y 64 borradas.

Verificación del orquestador sobre el diff:
- Los 14 anillos (3 en `change-password` y 11 en las otras tres páginas) pasan a `AUTH_FORM_INPUT_FOCUS_CLASS` y `AUTH_FORM_INPUT_ERROR_CLASS`. La rama de error conserva el valor (`border-red-500 focus:ring-red-500`).
- 4 enlaces pasan a `hover:text-iwana-secondary-700`.
- 8 fondos pasan a `bg-dark-surface`.
- `change-password` cambia el logo, el icono, y el fondo y la sombra del botón. MFA pasa a `text-iwana-primary` en 4 líneas.
- `apps/web` usa las dos constantes, y `fieldBase` conserva `dark:border-iwana-neutral-600`.
- Hex que quedan en `apps/portal/src/app/auth/`: 23 `#181818` (21 textos o botón y 2 del SVG), 4 `#A5C330` (gradientes), `#94b126`, 2 `#EEEEFA` y 2 `#6B7280`. Son exactamente las filas «Se queda» de §5.

Comprobaciones repetidas por el orquestador:
- `grep` del criterio 1: vacío.
- `audit-ui.mjs apps/portal/src/app/auth`: P0 0 · P1 1 · P2 0 · P3 0, frente a los 25 P2 de antes. El P1 `[revisar]` es el icono de `change-password`, ahora en la línea 397 (antes 394); es la deuda P3 de §9.2.
- `packages/ui/src` mantiene sus dos falsos positivos (`Select.tsx:606`, `Button.tsx:84`).

Línea base frente al cierre, según `fe-platform` (`--force`, `Cached: 0`):

| Paquete | Suites | Tests | Avisos de lint |
| --- | --- | --- | --- |
| `@iwana/ui` | 8 → 8 | 55 → 55 | 0 → 0 |
| `@iwana/web` | 38 → 38 | 233 → 233 | 10 → 10 |
| `@iwana/portal` | 348 → 348 | 3.478 + 1 omitido → igual | 42 → 42 |

Typecheck en verde en los tres, sin rojos en la línea base. B4 lo confirma de forma independiente. No tocó los specs en vuelo de `apps/portal/src/components/auth/` ni dejó deuda nueva.

`fe-platform` dejó corriendo los servidores de desarrollo de portal (3002) y web (3001) que lanzó él, para B3. Se detienen por su PID, nunca por nombre.

### 9.4 Ola 3 (B3 ∥ B4) — G3 ✅ y G4 ✅ 2026-11-08

**B3 (`sr-qa`).** Antes de capturar, confirmó que los servidores de 3002 y 3001 servían el código actual: el CSS contenía `ring-iwana-secondary-700`. Corrió el guion sin cambios y con `PW_CHANNEL=chrome`. Salida en `despues/`.

Resultado de las 10 parejas:
- 4 idénticas: en oscuro, el login del portal y la recuperación ya tenían la lima plena, y `forgot-password` y `verify-email` son solo claro.
- Las otras 6 difieren solo en el rectángulo del anillo enfocado, entre 1.904 y 2.144 px. El color nuevo es `#6a7a1c` en claro y `#a5c330` en el login de plataforma en oscuro. Todo lo admite D2.

Contraste del anillo medido en las capturas:
- En claro, 4,26:1 a 4,55:1 contra el campo y 4,25:1 a 4,76:1 contra el contenedor.
- En oscuro, 7,14:1 y 7,92:1.
- El hover de los enlaces no sale en las capturas. Su 4,76:1 está verificado por fórmula.

CSS generado (criterio 5):
- Portal: 242.476 → 241.393 bytes, 238 → 238 reglas `iwana-*`.
- Web: 242.550 → 242.625 bytes, 238 → 240 reglas.
- Lo único que cambia es el intercambio de clases del anillo y `text-iwana-secondary`. El orquestador lo confirmó con un `diff` de los listados de `antes/css/` y `despues/css/`, y comprobó byte a byte que dos de las parejas idénticas lo son.

`audit-ui.mjs`: P0 0 · P1 1 · P2 0 · P3 0. El P1 es la deuda P3 de §9.2. Sin deuda nueva.

**B4 (`gate-verifier`).** Corrió `turbo run lint|typecheck|test --filter=@iwana/ui --filter=@iwana/web --filter=@iwana/portal --force`, con `Cached: 0` y exit 0.
- Conteos iguales a la línea base: 8/55, 38/233 y 348/3.478 + 1 omitido.
- Avisos de lint: 0, 10 y 42.
- B2 no tocó ningún spec: 9 archivos, 77 líneas añadidas y 64 borradas. `test-change-reviewer` no aplica.

Salvedad: el CSS de web conserva antes y después `focus:ring-iwana-secondary/35` y `dark:focus:ring-iwana-secondary-400/25`, que el de portal pierde. Ningún código los usa; esas cadenas solo aparecen en `docs/` (este spec y dos documentos de usuarios de julio). La causa probable es que Tailwind de web escanea también `docs/`, pero no está verificada. Son reglas inertes, sin efecto visible.
