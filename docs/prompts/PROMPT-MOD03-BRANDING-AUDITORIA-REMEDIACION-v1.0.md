# PROMPT MOD03 Branding — Auditoría de verificación + Remediación UI/UX

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
**Versión:** 1.0
**Estado:** Aprobado para ejecución
**Fecha:** 2026-08-18
**Módulo:** MOD03 Branding Empresarial (superficie portal `/dashboard/settings/branding`)
**Fase:** Correctiva — auditoría de verificación + remediación UI/UX de Marca
**Generado por:** AI-EM-ARCH (modo EM + Orchestrator)
**Nombre de archivo destino:** `PROMPT-MOD03-BRANDING-AUDITORIA-REMEDIACION-v1.0.md`

**Informe vivo:** `docs/informes/INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.0.md` (vigente; se actualiza a v1.1 al cierre)
**Plan:** `docs/plans/2026-08-18-mod03-branding-auditoria-remediacion.md` (absorbe el inventario de tareas de `docs/plans/2026-08-17-mod03-branding-audit-remediation.md`)
**PRD:** `docs/prds/` del módulo de branding vigente (MOD03)
**Spec de diseño:** `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
**Skills obligatorias:** `iwana-identity-ui-review` (modo review en Fase A, modo diseño en Fase B) · `system-vocabulary-review` · `senior-ui-systems-designer` · `ui-ux-pro-max` (subordinada a las dos anteriores) · `testing-patterns` · `frontend-dev-guidelines` · `tailwind-patterns`

Ejecutar la Fase A (auditoría de verificación read-only), la Fase B (remediación del backlog congelado) y la Fase C (G6 + consolidación) del plan. No crear endpoints, migraciones, paquetes ni cambios globales del design system fuera de lo aprobado por AI-DS-OWNER en la consulta de contrato.

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** cerrar los 4 P1 y el lote P2-S del informe v1.0 (verificados contra el código actual), aplicar los P3 quick wins y dejar `/dashboard/settings/branding` conforme a identidad iWana, a11y AA y copy aprobado, con informe vivo en v1.1.
- **Lo que sí entra:** re-verificación de hallazgos con evidencia, consulta de contrato DS-OWNER (token de error AA, `interactiveFocusClassName`), copy congelado PROD-UX, correcciones en `Input.tsx`, `BrandingForm.tsx`, `SettingsSubTabs.tsx`, labels `mod00-settings-labels.ts`, tests, smoke Playwright y greps de cierre.
- **Lo que no entra:** backend, API, PostgreSQL, migraciones, tenancy, proxy de URLs externas (P2-SEC-1, backlog SEC-ENG), `SectionAccordion` (hex, diferido), gradientes web salvo Task 7b condicionada, navegación global, otros módulos.

## 2. Artefactos de entrada obligatorios

- `INFORME-MOD03-BRANDING-AUDITORIA-UIUX-v1.0.md` §3–§4 (hallazgos y decisión EM-ARCH).
- `docs/plans/2026-08-17-mod03-branding-audit-remediation.md` (inventario de tareas congelado: Tasks 0-10).
- `docs/plans/2026-08-18-mod03-branding-auditoria-remediacion.md` (secuencia de ejecución y RACI vigentes).
- Tokens reales: `packages/ui/src/styles/globals.css`; primitives: `packages/ui/src/components/`, `apps/portal/src/components/shared/portal-ui.tsx` (`interactiveFocusClassName`, `portalCheckboxClassName`, `PortalAlert`).
- Script de auditoría: `.agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs`.
- Artefactos faltantes: ninguno para el alcance cerrado.

## 3. Instrucciones por rol

1. **AI-FE-PLATFORM (R):** Fase A1 (verificación hallazgo por hallazgo con file:line), Fase B (Tasks 1-10 del plan absorbido) con TDD en Tasks 1, 2 y 9. Usar primitives y tokens existentes; no inventar tokens. En modo diseño aplicar `iwana-identity-ui-review` (playbook de alineación) y correr `audit-ui.mjs` antes de entregar.
2. **AI-DS-OWNER (C):** Task 0/A5 — decidir por escrito antes de Task 1: (a) token de texto de error AA (`--color-iwana-error-700` `#DC2626` ≈4.83:1 u opción aprobada; no alterar el token actual para bordes/iconos), (b) liberación de tokens para gradientes web (habilita o tacha Task 7b). Revisar el diff y emitir veredicto de contrato en C6. No escribir componentes.
3. **AI-PROD-UX (C):** A2 — re-verificar copy con `system-vocabulary-review` y congelar el copy de P2-UX-2 (frase por slot que declare la fuente activa y la precedencia URL vs archivo, y cuándo aplica "Guardar marca"). Emitir GO de copy/UX en C6. No escribir código.
4. **AI-SR-QA (C/V):** A3 — re-verificar los 3 P1 de a11y con evidencia (computed styles o axe A/AA); C2-C4 — tests, smoke y greps de cierre; emitir GO de a11y. RED primero en Tasks 1, 2 y 9 antes del GREEN.
5. **AI-SEC-ENG (C):** A4 — reconfirmar el diferimiento de P2-SEC-1 (URLs externas sin proxy) y registrar la nota; no implementar.
6. **AI-EM-ARCH:** A6 (consolidación del estado y GO a Fase B), C7 (informe vivo v1.1), resolución de bloqueos. No escribe código.

## 4. Restricciones no negociables

- Sin backend, migraciones ni OpenAPI; sin cambios de tenancy; sin PII real ni secretos.
- Sin tokens nuevos salvo aprobación escrita de DS-OWNER (Task 0/A5). Tailwind v4 CSS-first: nunca `tailwind.config.js`.
- Lima (`iwana-secondary*`) = avance/acción; nunca urgencia, nunca fondo base; texto en lima siempre sufijo `-700+`.
- Navy sólido `bg-iwana-primary` prohibido en previews de marca (patrón Superado; decisión EM-ARCH §4 del informe v1.0).
- Copy visible en español, sentence case, sin enums crudos ni términos técnicos (validar con `system-vocabulary-review`).
- Foco visible con `interactiveFocusClassName`; targets ≥44 px; contraste AA en claro y oscuro.
- `Input.tsx` es primitivo compartido: tras Tasks 1-2, verificar regresión en specs de `packages/ui` y formularios de `apps/web`.
- No commit salvo que el humano lo pida.

## 5. Entregables técnicos obligatorios

- Código portal/ui del mapa de archivos del plan (Fase B).
- Tests unitarios: `BrandingForm.spec.tsx`, spec de `Input` (asociación de error y color AA), labels, `branding-validation` — cobertura ≥80 % en statements, branches, functions y lines de los archivos tocados.
- Smoke Playwright light/dark/error/mobile de `/dashboard/settings/branding` con capturas.
- Greps de cierre (C4) y `audit-ui.mjs` en 0 deterministas (C5).

## 6. Entregables documentales obligatorios

- Plan y este prompt.
- Decisión escrita de DS-OWNER (Task 0/A5) y copy congelado de PROD-UX (A2).
- Actualización del informe vivo a v1.1 (no crear informe nuevo).

## 7. Criterios de aceptación

- 4 P1 cerrados con evidencia (file:line + verificación en vivo o axe); P2-S ejecutados o diferidos con registro; P3 quick wins aplicados.
- Unit, lint, typecheck y smoke en verde; DS-OWNER, PROD-UX y SR-QA con GO.
- El módulo se reconoce como iWana sin logo: ≥2 elementos de firma con función; sidebar/preview sin navy Superado.

## 8. Criterio de stop/go

- Detenerse si la Fase A revela un P0 nuevo, si DS-OWNER no emite la decisión de token antes de Task 1, o si una prueba crítica permanece roja tras dos intentos.
- Documentar en el informe vivo y escalar a AI-EM-ARCH.

## 9. Criterio de salida de la fase

- Fase C completa: tests, smoke y greps en verde; veredictos GO emitidos; informe vivo actualizado a v1.1 con puntaje recalculado y evidencia visual.
