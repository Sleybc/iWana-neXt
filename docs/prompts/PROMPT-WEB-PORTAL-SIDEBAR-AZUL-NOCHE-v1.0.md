# PROMPT-WEB-PORTAL-SIDEBAR-AZUL-NOCHE-v1.0

## Prompt de ejecución — G2 sidebar azul noche (web + portal)

**Versión:** 1.0  
**Estado:** Superado — 2026-08-11 el operador revirtió el navy; código restaurado al sidebar blanco  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** G2 · protocolo v1.5 §3bis  
**Destinatarios:** AI-DS-OWNER (A) · AI-FE-PLATFORM (C) · AI-SR-QA (D)  
**Plantilla:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)

> Sin prompt no hay implementación. Lo que no está aquí no entra.  
> Esto **aplica** la receta Firma ya aprobada; no inventa lenguaje de marca.

---

## 1. Desempate (AI-EM-ARCH)

La deuda «Sidebar azul noche unificada» del [`INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md`](../informes/INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md) queda **abierta a ejecución**. El usuario ordenó cerrarla.

| Artefacto | Qué dice | Cómo se resuelve |
| --- | --- | --- |
| Firma §3.1 + `firma-elements.md` | Sidebar atenuada + barra lima; activo `bg-white/10` **sobre sidebar azul**; inactivos `text-white/70` | **Manda.** «Atenuada» = chrome dim (Linear), no fondo blanco. |
| `component-recipes.md` §10 | `bg-iwana-primary` + barra lima | **Manda** (traducción de Firma). |
| Prototipo `prototipo_datos_usuario.html` | Sidebar azul noche colapsable | Composición de identidad; no se copia HTML. |
| Fase-1 BLOQUEO-3 | Prohibía `bg-iwana-primary` en el sidebar | **Superado por este G2.** Era aplazamiento de fase, no derogación de Firma. |
| Carril rápido 2026-08-10 | Sidebar `bg-white/95` | **Derogado solo en el fondo y en los textos/estados que cuelgan del fondo.** Foco, canvas sin mordida, isotipo squircle, targets ≥44 px y activo plano **siguen**. |
| HLD TailAdmin | Estado **En revisión** | No bloquea: ADR-023 está Aprobado; TailAdmin no aporta paleta. Identidad iWana manda. |
| Firma §2.2 | Un solo componente portal + web | **No en este G2.** Misma receta visual en ambos `Sidebar.tsx`. Extraer a `@iwana/ui` exige ADR (fuera). |

**No es cambio de tokens de marca.** Se usa `iwana-primary` ya existente. El usuario autoriza aplicar la receta aplazada.

---

## 2. Contratos

| Contrato | Ruta | Rol en este G2 |
| --- | --- | --- |
| Firma iWana | [`2026-07-12-firma-iwana-diseno-visual-design.md`](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) | Dirección vigente |
| Receta shell | `.agents/skills/iwana-identity-ui-review/references/firma-elements.md` §1 · `component-recipes.md` §10 | Clases canónicas |
| Fase-1 | [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md) | BLOQUEO-3 **superado**; barra lima vigente |
| Carril rápido + deuda sidebar | [`2026-08-10-web-shell-sidebar-carril-rapido-contrato.md`](../specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md) · [`2026-08-10-web-shell-sidebar-deuda-contrato.md`](../specs/2026-08-10-web-shell-sidebar-deuda-contrato.md) | Vigentes salvo fondo blanco |
| **Contrato G2 (a crear)** | `docs/specs/2026-08-11-sidebar-azul-noche-ds-contrato.md` | Congela receta + CA; **antes** de que FE codee |
| Informe vivo | [`INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md`](../informes/INFORME-WEB-DASHBOARD-UI-REVIEW-v1.1.md) §10.2 | Actualizar disposición de deuda |

**API / backend:** sin cambio.

---

## 3. Objetivo

Pintar el sidebar de `apps/web` y `apps/portal` con azul noche de marca, ítem activo con tinte `bg-white/10` + barra lima + icono lima, inactivos atenuados. El canvas (datos) sigue claro y domina.

### Entra

| ID | Owner | Cierra |
| --- | --- | --- |
| A-1 | DS-OWNER | Contrato G2: anatomía, tokens, estados, contraste, dark, derogaciones, CA-AN-01… |
| C-1 | FE | `apps/web` `Sidebar.tsx` (+ specs) según contrato |
| C-2 | FE | `apps/portal` `Sidebar.tsx` (+ specs) según el **mismo** contrato visual |
| C-3 | FE | Wordmark / eyebrow / close / group labels legibles sobre navy (sin tocar isotipo squircle salvo contraste) |
| D-1 | QA | Matriz CA-AN ↔ test; Jest + `audit-ui` + E2E touch existentes |
| D-2 | QA | Recaptura evidencia 375/1440 si el E2E de shell la genera |
| D-3 | QA | Dictamen + informe §10.2 (deuda G2 **cerrada**) |

### No entra

- Extraer sidebar compartido a `@iwana/ui` o fusionar los dos archivos.  
- Tokens nuevos en `globals.css`.  
- TopHeader, canvas `rounded-*`, MetricCard, portal dashboard, G6.5/G7.  
- Copiar TailAdmin (`#465FFF`, Outfit, expand-on-hover, `z-99999`).  
- Reabrir portada de señal (CA-PS).  
- Sidebar de auth.

---

## 4. Track A — AI-DS-OWNER

Skills: `iwana-identity-ui-review` (modo diseño) · `core-components`. No codeas.

Escribe `docs/specs/2026-08-11-sidebar-azul-noche-ds-contrato.md` v1.0 **congelado**.

Receta mínima (citar token, no hex):

```
aside:     bg-iwana-primary   (dark: el navy YA es oscuro; no volver a dark-surface-2)
activo:    relative + bg-white/10 + font-medium + text-white
barra:     absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary
icono on:  text-iwana-secondary
inactivo:  text-white/70 hover:bg-white/5 hover:text-white
icono off: text-white/50 group-hover:text-iwana-secondary
foco:      interactiveFocusClassName (sin sombra/ring extra)
radio ítem: rounded-xl  (deuda D1 vigente)
target:    min-h-11
```

Obligatorio en el contrato:

1. Contraste AA de `text-white/70` y wordmark `text-white` sobre `iwana-primary`. Si `/70` no llega a 4.5:1, subir opacidad (p. ej. `/80`) — **no** inventar token.  
2. Dark: sidebar permanece `bg-iwana-primary` (no `dark-surface-2`).  
3. Isotipo: conservar squircle del carril rápido si el contraste basta; si no, receta mínima (p. ej. `bg-white/10`) sin rediseñar el PNG.  
4. Derogar explícitamente BLOQUEO-3 y las filas «sidebar `bg-white/95`» del carril rápido.  
5. CA-AN numerados y verificables.  
6. Lista de estados: default, hover, active, focus, disabled (portal), collapsed, mobile drawer.

No reabres flujos (PROD-UX no hace wireframe nuevo).

---

## 5. Track C — AI-FE-PLATFORM

Arranca **cuando A-1 exista y cite versión**. Skills: `iwana-identity-ui-review` (modo diseño) · `frontend-dev-guidelines` · `test-driven-development` · `tailwind-patterns`.

Implementa el contrato, no este resumen. Dos archivos locales; misma receta.

Prohibido: primitive nueva · commitear · tocar portada de señal · `inline-flex` que anule `hidden`.

Comandos:

```
pnpm --filter @iwana/web exec jest --runInBand --testPathPattern=layout/Sidebar
pnpm --filter @iwana/portal exec jest --runInBand --testPathPattern=layout/Sidebar
pnpm --filter @iwana/web typecheck
pnpm --filter @iwana/portal typecheck
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/web/src/components/layout/Sidebar.tsx
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/layout/Sidebar.tsx
```

Si no hay spec de Sidebar en web, créalo (fondo navy, activo `bg-white/10`, sin `bg-white/95` en el `aside`).

---

## 6. Track D — AI-SR-QA

Arranca cuando C entregue. Skills: `testing-patterns` · `playwright-skill` · `wcag-audit-patterns` · `verification-before-completion`.

- Trazar CA-AN ↔ test.  
- Re-ejecutar Jest web/portal Sidebar + typecheck.  
- E2E `e2e/tests/web-shell-sidebar-touch-a11y.spec.ts` (y el de portal shell touch si existe). Recapturar PNGs de evidencia.  
- Axe del shell no es obligatorio si el spec touch no lo tiene; no inventar suite grande.  
- Dictamen GO / NO-GO. Actualizar informe §10.2: deuda sidebar **cerrada**. G6.5/G7 no se anticipan.

```
pnpm exec playwright test e2e/tests/web-shell-sidebar-touch-a11y.spec.ts --config e2e/playwright.web.config.ts
pnpm exec playwright test e2e/tests/portal-shell-touch-a11y.spec.ts --config e2e/playwright.portal.config.ts
```

---

## 7. Stop / go

**Stop — `[BLOQUEO]`:** token nuevo · primitive `@iwana/ui` · copiar TailAdmin · reintroducir fondo blanco «para no tocar portal» · lima como fondo del aside.

**Go:** contrato A-1 congelado · C-1/C-2 en verde · D-3 GO · deuda G2 cerrada en el informe.

---

## 8. Decisiones — no reabrir

| Asunto | Decisión |
| --- | --- |
| Fondo | `bg-iwana-primary` (Firma / receta). BLOQUEO-3 superado. |
| Unificación | Receta compartida; **no** un solo archivo. |
| TailAdmin | Solo ADR-023 (shell/interacción). Cero paleta TailAdmin. |
| Isotipo | Squircle carril rápido; no rediseño. |
| Portada de señal | Intacta. |

**Emitido por AI-EM-ARCH el 2026-08-11.**
