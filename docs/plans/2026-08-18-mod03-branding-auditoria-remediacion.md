# MOD03 Branding — Plan de auditoría de verificación + remediación UI/UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-auditar `/dashboard/settings/branding` del portal contra el informe vivo `docs/informes/INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.0.md` (2026-08-17, vigente) y ejecutar el backlog congelado de remediación del plan [`2026-08-17-mod03-branding-audit-remediation.md`](2026-08-17-mod03-branding-audit-remediation.md), cerrando los 4 P1, el lote P2-S y los P3 quick wins. El resultado deja la pantalla de Marca en condición de cierre de módulo: identidad iWana verificada, a11y AA, copy aprobado y evidencia visual.

**Modo:** EM + Orchestrator (AI-EM-ARCH). R = AI-FE-PLATFORM. C = AI-DS-OWNER (Task 0, token de error) / AI-PROD-UX (copy Tasks 8-9) / AI-SR-QA (a11y y regresión) / AI-SEC-ENG (reconfirmación del diferimiento P2-SEC-1). V = AI-SR-QA en G6. Consolidación = AI-EM-ARCH (informe v1.1).

**Relación con artefactos previos (sin contradicciones):** este plan **sucede** al plan de remediación 2026-08-17 absorbiendo su inventario de tareas como fuente congelada; el informe v1.0 permanece vigente hasta su actualización a v1.1 al cierre. No se crea informe nuevo.

**Tech Stack:** Next.js App Router (portal), React 19, Tailwind v4 CSS-first, primitives `packages/ui/src/components/` y `apps/portal/src/components/shared/portal-ui.tsx`, labels en `mod00-settings-labels.ts`.

---

## Estado de verificación previa (EM-ARCH, 2026-08-18)

Barrido de contexto ejecutado antes de emitir este plan (no reemplaza la Fase A de los agentes):

| Hallazgo (informe v1.0) | Estado observado en código actual | Evidencia |
| --- | --- | --- |
| P1-A11y-1 contraste error `Input` | **Abierto** — sigue `text-iwana-error` | `packages/ui/src/components/Input.tsx:150` |
| P1-A11y-2 `aria-describedby` sin el error | **Abierto** — no mergea id externo | `packages/ui/src/components/Input.tsx:88-91` |
| P1-A11y-3 foco de subtab lima | **Abierto** — sigue `focus-visible:ring-iwana-secondary` | `apps/portal/src/components/settings/SettingsSubTabs.tsx:69` |
| P1-IDENT-1 hover dark enlace | **Abierto** — sigue `dark:hover:text-iwana-primary` | `BrandingForm.tsx:755` |
| P2-IDENT-1 preview navy Superado | **Abierto** — sigue `bg-iwana-primary` | `BrandingForm.tsx:818` |
| P2-A11Y-1 gris-400 a 12 px | **Abierto** — sigue `text-gray-400` | `BrandingForm.tsx:706` |
| P2-DS-2 checkbox custom | **Abierto** — checkbox nativo estilado | `BrandingForm.tsx:875` |
| Script `audit-ui.mjs` (2 archivos branding) | 0 deterministas (consistente con informe) | corrido 2026-08-18 |

La Fase A confirma o corrige esta tabla hallazgo por hallazgo con evidencia de código y, donde sea posible, computed styles en vivo.

---

## Fases y tareas

### Fase A — Auditoría de verificación (read-only, no se escribe código)

- [ ] **A1.** AI-FE-PLATFORM: re-verificar los 4 P1 + 7 P2 + P3 del informe v1.0 §3 contra el código actual (file:line) y marcar Abierto/Cerrado/Modificado. Ejecutar `audit-ui.mjs` sobre `BrandingForm.tsx`, `BrandingSettingsClient.tsx`, `SettingsSubTabs.tsx`, `Input.tsx`. Actualizar la tabla §"Estado de verificación".
- [ ] **A2.** AI-PROD-UX: re-verificar copy del módulo (`BRANDING_SETTINGS_COPY` en `mod00-settings-labels.ts` + strings inline de `BrandingForm.tsx`) con `system-vocabulary-review`; emitir el copy congelado de P2-UX-2 (precedencia URL/archivo) que desbloquea Task 9. Sin términos técnicos visibles, español sentence case.
- [ ] **A3.** AI-SR-QA: re-verificar los 3 P1 de a11y con evidencia en vivo (computed styles o axe A/AA) si hay sesión disponible; si no, dejar evidencia de código y declarar el check visual para G6.
- [ ] **A4.** AI-SEC-ENG: reconfirmar que P2-SEC-1 (URLs externas sin proxy) sigue diferido al backlog y no bloquea este lote; registrar la reconfirmación.
- [ ] **A5.** AI-DS-OWNER: consulta de contrato (Task 0 del plan absorbido): (a) token de texto de error AA para `Input` (`--color-iwana-error-700` `#DC2626` o variante semántica aprobada); (b) liberación o diferimiento de tokens para gradientes web (Task 7b). Emitir decisión por escrito antes de Task 1.
- [ ] **A6.** AI-EM-ARCH: consolidar la Fase A como actualización de la sección de estado del informe vivo (borrador v1.1), congelar la lista final de tareas ejecutables y habilitar Fase B.

**Criterio stop/go A→B:** GO cuando los 4 P1 estén confirmados con evidencia (abiertos o cerrados), DS-OWNER haya emitido la decisión de token y PROD-UX haya congelado el copy. STOP si algún hallazgo ya no existe en código (se retira del backlog) o si aparece un P0 nuevo: escalar a AI-EM-ARCH antes de tocar código.

### Fase B — Remediación (ejecuta el plan 2026-08-17 absorbido)

- [ ] **B1.** Task 1 — P1-A11y-1: contraste AA del texto de error en `Input` (decisión DS-OWNER). Test de regresión que falle si el color vuelve a <4.5:1.
- [ ] **B2.** Task 2 — P1-A11y-2: merge de `aria-describedby` en `Input` + id real del error en `BrandingForm`. Test DOM de asociación.
- [ ] **B3.** Task 3 — P1-A11y-3: `SettingsSubTabs.tsx:69` → `interactiveFocusClassName`.
- [ ] **B4.** Task 4 — P1-IDENT-1: `dark:hover:text-iwana-primary-300`; grep de cierre = 0.
- [ ] **B5.** Task 5 — P2-IDENT-1: preview de navegación con la navegación vigente (surface clara / oscura translúcida; prohibido navy sólido).
- [ ] **B6.** Task 6 — P2-A11Y-1: textos de soporte 12 px → `text-gray-500 dark:text-gray-400`.
- [ ] **B7.** Task 7 — P2-DS-2: `portalCheckboxClassName`.
- [ ] **B8.** Task 7b — P2-DS-1 solo si DS-OWNER libera tokens en A5(b); si no, se tacha y queda diferido.
- [ ] **B9.** Task 8 — P2-UX-1: estado de error de imagen por slot + aviso readonly (`PortalAlert variant="info"`).
- [ ] **B10.** Task 9 — P2-UX-2: copy de precedencia congelado por PROD-UX en A2 + validación `system-vocabulary-review` + test de copy.
- [ ] **B11.** Task 10 — P3 quick wins: eyebrows → `.portal-eyebrow-muted`; jerarquía de headings (h1→h3: documentar si el salto de h2 queda como deuda); `shadow-iwana-card` → primitive aprobada (solo si DS-OWNER lo incluye).

**Nota de transversalidad:** `Input.tsx` es primitivo compartido web + portal. Tras B1/B2 correr los specs de `Input`/formularios que existan en `packages/ui` y `apps/web` para descartar regresión; si no existen, smoke manual de un formulario con error en web.

### Fase C — Verificación final (G6) y consolidación

- [ ] **C1.** Lint + typecheck de `@iwana/portal` (y del paquete tocado en `packages/ui`) en verde.
- [ ] **C2.** Tests unitarios: `BrandingForm.spec.tsx`, spec de `Input`, labels, `branding-validation` en verde; cobertura ≥80 % en las cuatro métricas de los archivos tocados.
- [ ] **C3.** Smoke Playwright light/dark/error/mobile de `/dashboard/settings/branding` (sesión ADMIN dev, tenant `iwana`); capturas como evidencia.
- [ ] **C4.** Greps de cierre: `dark:hover:text-iwana-primary` sin sufijo = 0 · `bg-iwana-primary` en previews = 0 · `text-gray-400` en textos 12 px = 0 · `focus-visible:ring-iwana-secondary` en `SettingsSubTabs` = 0.
- [ ] **C5.** `audit-ui.mjs` sobre los archivos tocados = 0 deterministas.
- [ ] **C6.** AI-DS-OWNER emite veredicto de contrato sobre el diff; AI-PROD-UX emite GO de copy/UX; AI-SR-QA emite GO de a11y.
- [ ] **C7.** AI-EM-ARCH actualiza `INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.0.md` → v1.1 con el estado final (puntaje recalculado, hallazgos cerrados, diferidos y evidencia).

---

## Restricciones no negociables

- Sin backend, migraciones, OpenAPI ni cambios de tenancy. P2-SEC-1 queda en backlog SEC-ENG.
- Archivos: `apps/portal/src/components/settings/**`, `apps/portal/src/components/shared/portal-ui.tsx` (a lo sumo un export aprobado), `packages/ui/src/components/Input.tsx`, `packages/ui/src/styles/globals.css` (solo token aprobado por DS-OWNER), `apps/web/src/components/tenants/TenantBrandingForm.tsx` (solo Task 7b).
- Copy en español, sentence case, sin enums crudos ni términos técnicos visibles.
- No PII real, no secretos, no commit salvo que el humano lo pida.
- TDD en los cambios de comportamiento (RED primero en Tasks 1, 2, 9).
- Lima = avance/acción, nunca urgencia; navy sólido prohibido en previews (ADR-056, decisión EM-ARCH §4 del informe v1.0).

## RACI

| Tarea | R | C | V |
| --- | --- | --- | --- |
| A1-A4 | FE-PLATFORM / PROD-UX / SR-QA / SEC-ENG | — | EM-ARCH (A6) |
| A5 | DS-OWNER | EM-ARCH | — |
| B1-B11 | FE-PLATFORM | DS-OWNER (tokens/primitives), PROD-UX (copy) | SR-QA (G6) |
| C1-C7 | SR-QA + FE-PLATFORM | — | EM-ARCH + DS-OWNER + PROD-UX |

## Criterio de salida

- 4 P1 cerrados con evidencia; P2-S ejecutados o diferidos con registro; P3 quick wins aplicados.
- Tests, lint, typecheck, smoke y greps de cierre en verde; DS-OWNER y PROD-UX con GO; informe vivo en v1.1.
