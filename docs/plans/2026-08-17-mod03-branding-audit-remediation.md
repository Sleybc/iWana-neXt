# MOD03 Branding — Plan de remediación auditoría UI/UX (P1 + P2-S)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 4 bloqueantes P1 (P1-A11y-1/2/3, P1-IDENT-1) y el lote quick-win P2-S (P2-IDENT-1, P2-A11Y-1, P2-DS-2, P2-UX-1, P2-UX-2) del informe `docs/informes/INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.0.md`, dejando `/dashboard/settings/branding` en condición de cierre de módulo (a11y AA, tokens Firma, copy aprobado).

**Architecture:** Carril rápido de UI (protocolo §3bis) **condicionado**: hay un cambio de primitivo compartido (`Input`) y una consulta de contrato DS-OWNER (token de error) que deben congelarse **antes** de la Task 1. Consume primitives existentes (`portalCheckboxClassName`, `interactiveFocusClassName`, `PortalAlert`, tokens `iwana-primary-300`/`gray-500`). No introduce primitives nuevas salvo decisión DS-OWNER.

**Tech Stack:** Next.js App Router (portal), React 19, Tailwind v4 CSS-first, primitives compartidas en `packages/ui/src/components/` y `apps/portal/src/components/shared/portal-ui.tsx`, labels en `mod00-settings-labels.ts`.

**Gobierno:** AI-EM-ARCH (Orquestador). R = AI-FE-PLATFORM. C = AI-DS-OWNER (token error, focus ring) / AI-PROD-UX (copy Tasks 8-9). V = AI-SR-QA en G6. **Sin prompt de ejecución no hay implementación (G4 — este plan es el prompt).**

**Fuente:** `docs/informes/INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.0.md` §3–§4.

---

## Decisiones congeladas (EM-ARCH + Design Layer)

| ID | Decisión | Estado |
| --- | --- | --- |
| P1-A11y-1 | Token de error: DS-OWNER decide `--color-iwana-error-700` (`#DC2626`, 4.83:1) **o** variante semántica en `Input` (p. ej. `text-red-700`). No cambiar `--color-iwana-error` para bordes/iconos. **Consulta antes de Task 1.** | Pendiente DS-OWNER |
| P1-A11y-2 | `Input` mergea `aria-describedby` externo con el interno; `BrandingForm` pasa el id real del mensaje (`{id}-error`). No quitar `role="alert"`. | Congelada |
| P1-A11y-3 | `SettingsSubTabs.tsx:69` → `interactiveFocusClassName` (`packages/ui/src/focus.ts:5-6`). Sin excepción. | Congelada por DS-OWNER |
| P1-IDENT-1 | Hover dark de enlaces = `dark:hover:text-iwana-primary-300` (verificado ≈6.2:1). | Congelada |
| P2-IDENT-1 | Preview de navegación replica la navegación **vigente**: light `bg-iwana-surface-soft` + texto `iwana-secondary-700`; dark `dark:bg-dark-surface-3/translúcida` + `dark:text-white`. Prohibido navy sólido `bg-iwana-primary` en previews. | Congelada (desempate EM-ARCH §4) |
| P2-A11Y-1 | Textos de 12 px de soporte → `text-gray-500 dark:text-gray-400` (≥4.5:1 en light). | Congelada |
| P2-UX-2 | Copy de precedencia URL/archivo: definir frase exacta por slot con PROD-UX + `system-vocabulary-review` antes de Task 8. | Pendiente PROD-UX |
| P2-SEC-1 | **Fuera de este lote.** Backlog SEC-ENG: validación `Content-Type` y/o proxy de activos de marca. No bloquea. | Congelada (diferida) |
| P2-DS-1 | Gradientes inline web (`TenantBrandingForm.tsx:543,550`) y hex de `SectionAccordion`: **fuera de este lote** salvo que DS-OWNER libere tokens en la consulta; si los libera, se incluyen como Task 7b. | Congelada (diferida) |

**Restricciones globales**

- Solo archivos bajo `apps/portal/src/components/settings/**`, `apps/portal/src/components/shared/portal-ui.tsx` (a lo sumo un export aprobado), `packages/ui/src/components/Input.tsx`, `packages/ui/src/styles/globals.css` (solo si DS-OWNER aprueba el token), labels `mod00-settings-labels.ts`, specs asociadas.
- No tocar `apps/api/**`, `apps/web/**` (salvo Task 7b si aplica), nginx ni otros módulos.
- No commit salvo que el humano lo pida.
- Texto visible en español, sentence case, sin enums crudos.
- Skills: `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `tailwind-patterns`, `iwana-identity-ui-review` (modo diseño al implementar), `system-vocabulary-review`, `testing-patterns`.

---

## Mapa de archivos

**Modificar (esperado)**

- `packages/ui/src/components/Input.tsx` — P1-A11y-1 (color error), P1-A11y-2 (merge aria-describedby)
- `packages/ui/src/styles/globals.css` — solo si DS-OWNER aprueba `--color-iwana-error-700`
- `apps/portal/src/components/settings/BrandingForm.tsx` — P1-A11y-2, P1-IDENT-1, P2-IDENT-1, P2-A11Y-1, P2-DS-2, P2-UX-1, P2-UX-2, P3 eyebrows/shadow
- `apps/portal/src/components/settings/SettingsSubTabs.tsx` — P1-A11y-3
- `apps/portal/src/components/settings/mod00-settings-labels.ts` — copy P2-UX-2
- Specs: `BrandingForm.spec.tsx`, spec de `Input` (si existe en `packages/ui`), `branding-validation.spec.ts`
- `apps/web/src/components/tenants/TenantBrandingForm.tsx` — solo Task 7b (si DS-OWNER libera tokens)

**No tocar en este lote:** `SectionAccordion` (hex, diferido), `TenantBrandingForm` gradientes salvo 7b, proxy de URLs (P2-SEC-1), backend.

---

### Task 0: Consulta de contrato DS-OWNER (bloqueante)

- [ ] **Step 1:** Consultar a DS-OWNER: (a) token de texto de error AA (P1-A11y-1), (b) liberación de tokens para gradientes web (P2-DS-1 → habilita 7b).
- [ ] **Step 2:** Congelar decisiones; si P2-DS-1 queda diferido, tachar Task 7b.

---

### Task 1: P1-A11y-1 — Contraste AA del texto de error (Input)

**Files:**
- Modify: `packages/ui/src/components/Input.tsx` (~150)
- Modify: `packages/ui/src/styles/globals.css` (solo si token aprobado)
- Test: spec de `Input` o formulario con error

- [ ] **Step 1:** Aplicar la decisión DS-OWNER (token `iwana-error-700` o `text-red-700`) en el texto de error.
- [ ] **Step 2:** Verificar contraste ≥4.5:1 sobre blanco y sobre `dark-surface-*` (≥4.5:1 dark con la variante dark elegida).
- [ ] **Step 3:** Test que falle si el color de error regresa a un valor <4.5:1 (snapshot del computed color o clase esperada).

---

### Task 2: P1-A11y-2 — `aria-describedby` con el error asociado

**Files:**
- Modify: `packages/ui/src/components/Input.tsx` (~88-91)
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (~774)

- [ ] **Step 1:** En `Input`, mergear `aria-describedby` recibido por props con el id interno de mensajes (no sobrescribir).
- [ ] **Step 2:** En `BrandingForm`, pasar el id real del mensaje de error (`{id}-error`, el mismo del `role="alert"`) en la prop de descripción.
- [ ] **Step 3:** Test DOM: con error visible, `input.getAttribute('aria-describedby')` incluye un id que existe en el documento y apunta al mensaje de error.

---

### Task 3: P1-A11y-3 — Focus ring del subtab con contrato

**Files:**
- Modify: `apps/portal/src/components/settings/SettingsSubTabs.tsx` (~69)

- [ ] **Step 1:** Sustituir `focus-visible:ring-iwana-secondary` por `interactiveFocusClassName`.
- [ ] **Step 2:** Verificar visual (tab en foco) contraste ≥3:1 del anillo sobre surface.

---

### Task 4: P1-IDENT-1 — Hover dark de enlace

**Files:**
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (~755)

- [ ] **Step 1:** `dark:hover:text-iwana-primary` → `dark:hover:text-iwana-primary-300`.
- [ ] **Step 2:** Grep en `BrandingForm.tsx` de `dark:hover:text-iwana-primary` (sin `-300`) → 0 ocurrencias.

---

### Task 5: P2-IDENT-1 — Preview de navegación con la navegación vigente

**Files:**
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (~818-830)

- [ ] **Step 1:** Reemplazar `bg-iwana-primary` del pill por patrón vigente: `bg-iwana-surface-soft text-iwana-secondary-700 dark:bg-dark-surface-3 dark:text-white` (verificar tokens reales en `globals.css`).
- [ ] **Step 2:** Smoke visual light + dark (Playwright) contra la sidebar real.

---

### Task 6: P2-A11Y-1 — Contraste de textos de soporte 12 px

**Files:**
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (~706-708 y análogos)

- [ ] **Step 1:** `text-gray-400` → `text-gray-500 dark:text-gray-400` en textos de 12 px ("Subir imagen", requisitos).
- [ ] **Step 2:** Verificar computed color en vivo ≥4.5:1 light; dark ≥4.5:1 con la variante oscura.

---

### Task 7: P2-DS-2 — Checkbox con primitive

**Files:**
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (~875)

- [ ] **Step 1:** Adoptar `portalCheckboxClassName`.
- [ ] **Step 2:** Smoke: estados checked/unchecked/indeterminate si aplica.

---

### Task 7b: P2-DS-1 (solo si DS-OWNER libera tokens)

**Files:**
- Modify: `apps/web/src/components/tenants/TenantBrandingForm.tsx` (~543, 550)

- [ ] **Step 1:** Reemplazar gradientes inline por tokens aprobados.
- [ ] **Step 2:** Smoke visual web (paridad).

---

### Task 8: P2-UX-1 — Feedback de imagen y readonly

**Files:**
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (~697-710)
- Modify: `apps/portal/src/components/settings/BrandingSettingsClient.tsx` (propagación `isReadOnly` si aplica)

- [ ] **Step 1:** Estado de error de imagen explícito en la card del slot (URL inaccesible/inválida visualmente distinta del vacío).
- [ ] **Step 2:** En modo readonly (permiso limitado), `PortalAlert variant="info"` arriba del panel con copy congelado por PROD-UX.

---

### Task 9: P2-UX-2 — Copy de precedencia URL/archivo

**Files:**
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts` (`BRANDING_SETTINGS_COPY`)
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (render de copy)

- [ ] **Step 1:** Aplicar copy congelado por PROD-UX (fuente activa + precedencia URL vs archivo, "Guarda la marca para aplicar URLs externas" cuando corresponda).
- [ ] **Step 2:** Validación `system-vocabulary-review` (sin términos técnicos visibles).
- [ ] **Step 3:** Test unitario de copy: textos esperados presentes en labels; sin enums crudos en el DOM.

---

### Task 10: P3 quick wins (un solo commit de pulido)

**Files:**
- Modify: `apps/portal/src/components/settings/BrandingForm.tsx` (eyebrows, headings)
- Modify: `apps/portal/src/components/settings/SettingsSectionPanel.tsx` (shadow si aprobado)

- [ ] **Step 1:** 6 eyebrows → `.portal-eyebrow-muted`.
- [ ] **Step 2:** Jerarquía de headings: `h3` de paneles mantiene nivel (documentar salto h2 como deuda si no hay h2 semántico) — verificar con la spec de settings.
- [ ] **Step 3:** `shadow-iwana-card` → `shadow-card`/primitive aprobada (solo si DS-OWNER lo incluye).

---

## Verificación final (G6)

- [ ] `pnpm --filter @iwana/portal lint` y `pnpm --filter @iwana/portal typecheck` (o el filtro del paquete afectado) en verde.
- [ ] Tests unitarios de `BrandingForm` + `Input` + labels en verde.
- [ ] Smoke Playwright: light/dark/error/mobile de `/dashboard/settings/branding` sin regresión (reusar sesión de auditoría si está disponible).
- [ ] Greps de cierre: `dark:hover:text-iwana-primary` sin `-300` = 0; `bg-iwana-primary` en previews = 0; `text-gray-400` en textos 12 px = 0.
- [ ] Actualizar `docs/informes/INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.0.md` → v1.1 (o informe de cierre) al terminar.