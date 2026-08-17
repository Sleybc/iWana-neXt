# MOD00 Acceso densidad UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** compactar `/dashboard/settings/access` con `PortalPanel compact` y `PortalEmptyState embedded` para que perfiles sugeridos entren en el primer viewport, sin tokens ni API nuevos.

**Architecture:** carril rápido de UI (protocolo §3bis regla 3). Misma IA (header → grid perfiles|accesos → sugeridos → MFA). Solo props existentes. No se toca `portal-ui.tsx` ni Organización.

**Tech Stack:** Next.js App Router, React 19, TypeScript estricto, Tailwind v4, `@iwana/ui`, Jest, Playwright, axe, pnpm.

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-08-15
**Módulo:** MOD00 Configuración / Acceso

---

## Fuentes rectoras

- `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` v1.2
- `docs/prompts/PROMPT-MOD00-ACCESO-DENSIDAD-UI-v1.0.md`
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## Protocolo

| Fase | Dueño |
| --- | --- |
| Contrato UX | AI-PROD-UX |
| Contrato visual | AI-DS-OWNER |
| RED | AI-SR-QA |
| Implementación | AI-FE-PLATFORM |
| Evidencia | AI-SR-QA |
| Cierre | AI-EM-ARCH |

---

### Task 1: Congelar spec v1.2, plan y prompt

- [x] Spec CA-ACC-UX-13…15, densidad §10, empty embebido
- [x] Este plan
- [x] Prompt de ejecución

---

### Task 2: Pruebas RED

**Files:**
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
- Modify: `e2e/tests/portal-settings-access-ui.spec.ts`

Casos:

1. `embeds the custom-profile empty state without a nested well`
2. `does not render a second no-profile-selected empty in the accesses panel`
3. E2E: con 0 perfiles personalizados, `Perfiles sugeridos` está in-viewport en 1440×900
4. E2E: título sugerido no intersecta el CTA (CA-ACC-UX-15)

---

### Task 3: Implementación FE

**Files:**
- Modify: `AccessControlSettingsClient.tsx`

- Root cargado: `space-y-4`
- Workspace: `items-start`
- Perfiles vacío: `compact`, sin `description`, `PortalEmptyState embedded`
- Accesos sin selección: `compact`, sin `PortalEmptyState`
- Sugeridos y MFA: `compact`
- Cards sugeridas: sin `min-h-[3.25rem]`; CTAs `flex-col sm:flex-row`; no `w-full` en `sm+`

No tocar `OrganizationSettingsClient.tsx` ni `portal-ui.tsx`.

---

### Task 4: Evidencia y cierre

```
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand
pnpm --filter @iwana/portal exec tsc --noEmit
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-ui.spec.ts --update-snapshots
```

Informe vivo v1.64. Sin inventar cobertura.
