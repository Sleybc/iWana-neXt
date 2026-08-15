# MOD00 Acceso UI/UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corregir los hallazgos P1–P3 de `/dashboard/settings/access` y alinear copy, IA y primitivas a la barra visual de Organización, con WCAG AA, cobertura suficiente y evidencia visual autenticada.

**Architecture:** remediación solo portal. Consume contratos de Access ya existentes; no añade endpoints, migraciones, paquetes ni tokens. Carriles: contrato UX/DS → pruebas RED → implementación FE → validación QA → cierre EM-ARCH.

**Tech Stack:** Next.js App Router, React 19, TypeScript estricto, React Hook Form, Zod, Tailwind CSS v4, `@iwana/ui`, Jest, Testing Library, Playwright, axe y pnpm.

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-08-15  
**Módulo:** MOD00 Configuración / Acceso

---

## Fuentes rectoras

- `AGENTS.md`
- `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`
- `docs/specs/2026-05-27-mod00-access-copy-design.md`
- `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md` (hermana visual)
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## Alcance cerrado

### Entra

- Copy, IA, errores sanitizados, diálogo de eliminar, mapeo `operations`, primitivas Firma, 44 px, peek, tests, E2E, axe, evidencia visual, informe vivo.

### No entra

- API, OpenAPI, PostgreSQL, migraciones, tenancy, permisos, Usuarios, tokens, `Switch`, cambios globales de `@iwana/ui`.

## Protocolo multiagente

| Fase | Responsable | Ownership exclusivo | Revisor |
| --- | --- | --- | --- |
| Contrato | AI-PROD-UX | Spec UX y copy | AI-DS-OWNER + AI-EM-ARCH |
| Prompt | AI-EM-ARCH | Prompt correctivo | — |
| Pruebas RED | AI-SR-QA | Specs Jest/E2E | FE consume el contrato |
| Implementación | AI-FE-PLATFORM | Cliente portal y labels | AI-DS-OWNER |
| Validación | AI-SR-QA | Cobertura, E2E, axe, capturas | AI-EM-ARCH |
| Cierre | AI-EM-ARCH | Informe vivo, gates y commits | — |

Reglas: un archivo, un dueño por fase activa. DS-OWNER no escribe componentes. Sin backend. Commits al cerrar cada checkpoint verde. TDD: no GREEN hasta publicar nombres RED y fallo esperado.

## Mapa de archivos

### Crear

- `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`
- `docs/prompts/PROMPT-MOD00-ACCESO-REMEDIACION-UI-v1.0.md`
- `e2e/tests/portal-settings-access-ui.spec.ts` — matriz visual, axe, colocación de CTA

### Modificar

- `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
- `apps/portal/src/components/settings/mod00-settings-labels.ts`
- `apps/portal/src/components/settings/SettingsAccessShortcuts.spec.tsx` (si aserta el copy del hub)
- `e2e/tests/portal-settings-access-governance.spec.ts`
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

No tocar `OrganizationSettingsClient.tsx` ni snapshots de Organización.

---

### Task 1: Congelar el contrato UX/DS y el prompt correctivo

**Responsable:** AI-PROD-UX, AI-DS-OWNER, AI-EM-ARCH.

**Files:**
- Create: `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`
- Create: `docs/prompts/PROMPT-MOD00-ACCESO-REMEDIACION-UI-v1.0.md`
- Create: este plan

- [x] **Step 1: Spec con IA, copy, errores, diálogo, CA-ACC-UX-01…12 y contrato visual §10**
- [x] **Step 2: Prompt de ejecución en `docs/prompts/`**
- [ ] **Step 3: Commit de contrato**

```bash
git add docs/specs/2026-08-15-mod00-acceso-ui-remediation.md docs/plans/2026-08-15-mod00-acceso-ui-remediation.md docs/prompts/PROMPT-MOD00-ACCESO-REMEDIACION-UI-v1.0.md
git commit -m "docs: define access ui remediation contract"
```

---

### Task 2: Pruebas RED

**Responsable:** AI-SR-QA. No tocar producción.

**Files:**
- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
- Modify: `e2e/tests/portal-settings-access-governance.spec.ts` (retarget copy)

Casos RED mínimos (nombres exactos):

1. `places the create-profile action in the custom profiles panel instead of the page header`
2. `shows a single create-profile action in the editable empty state`
3. `does not expose template or category-base copy on the access screen`
4. `labels the operations module as Operaciones`
5. `sanitizes an internal API message when profiles fail to load`
6. `asks for confirmation before deleting a custom profile`

Retarget existentes que buscan `Plantillas iniciales`, `Usar como base`, `Ver accesos` (en sugeridos → `Ver lo que permite`), `Categoría base`, subtítulo con MFA/plantillas.

Fixture: añadir un permiso de catálogo con `moduleKey: 'operations'` para el caso 4.

Run:

```
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand
```

Expected: los 6 casos nuevos FALLAN por el comportamiento actual. No implementar.

- [ ] **Step 5: Commit RED** `test: add access settings ui remediation red cases`

---

### Task 3: Copy, errores, mapping e IA

**Responsable:** AI-FE-PLATFORM.

**Files:**
- Modify: `mod00-settings-labels.ts` — `ACCESS_SETTINGS_COPY`, `getAccessModuleLabel`, `SETTINGS_ACCESS_SHORTCUTS_COPY.cards.access.description`
- Modify: `AccessControlSettingsClient.tsx` — PageHeader sin actions; CTA en panel; MFA al final; mappers sanitizados; copy literal; diálogo eliminar (puede quedar el Dialog en este task si el RED de delete ya existe)

`getAccessModuleLabel`:

```ts
operations: 'Operaciones',
wfm: 'Operaciones de campo',
// ...existentes
return labels[moduleKey] ?? 'Sección';
```

Peek de permisos: `entry?.description ?? 'Acceso no descrito'`.

`mapAccessControlError` / `mapAuthenticationPolicyError`: nunca `error.message` salvo que se mapee a los strings de spec §6.4.

Orden JSX: header → alerts → grid perfiles|accesos → sugeridos → MFA.

- [ ] Run Jest hasta verde de Task 2.
- [ ] Commit: `fix: align access settings copy and information architecture`

---

### Task 4: Primitivas visuales

**Responsable:** AI-FE-PLATFORM. Review AI-DS-OWNER.

**Files:**
- Modify: `AccessControlSettingsClient.tsx`

Checklist §10:

- `PortalDataTableHead` + class-tokens; borrar `tableHeadClass` / `cellClass` locales.
- `CheckboxCard` en MFA, lista de accesos y «Mantener perfil activo».
- Tabs: `portalModuleTabsTrackClassName` + `portalModuleTabTriggerClassName`.
- Preview: `PortalSidePeek` en lugar del overlay `z-10000`.
- `Button size="lg"` en CTA de panel, Guardar política, Guardar cambios, empty.
- Fila: `size="sm"` + `min-h-11`; quitar `h-8`.
- Reintento: `Button variant="link" size="lg" className="min-h-11"`.
- Selector de creación: `interactiveFocusClassName`.
- Quitar `border-iwana-secondary` de `PortalPanel` MFA y cards sugeridas.
- Badge MFA activa: `bg-iwana-secondary-100 text-iwana-secondary-900`.
- Sin `shadow-2xl` ni `shadow-[var(--shadow-iwana)]`.
- Empty de búsqueda con acción `Limpiar búsqueda`.

Hermana de referencia: `OrganizationSettingsClient.tsx` (CTA en panel, diálogo destructivo, `CheckboxCard`, `PortalDataTableHead`).

- [ ] Jest verde.
- [ ] `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- [ ] Commit: `fix: align access settings with iwana ui`

---

### Task 5: E2E, axe y evidencia visual

**Responsable:** AI-SR-QA.

**Files:**
- Create: `e2e/tests/portal-settings-access-ui.spec.ts`
- Modify: `e2e/tests/portal-settings-access-governance.spec.ts`

E2E UI (sesión ADMIN sembrada, mocks de red):

- h1 `Perfiles de acceso`; `Crear perfil` dentro de la section de Perfiles personalizados, no en el rounded-2xl del h1.
- No hay `Plantillas iniciales` ni `Usar como base`.
- Hay `Perfiles sugeridos` y `Crear a partir de este perfil`.
- Eliminar abre diálogo; cancelar no llama DELETE.
- Axe wcag2a+wcag2aa en 390×844, 1024×768, 1440×900 × light/dark; 0 violaciones.
- CTA ≥44 px; `body` sin `overflow-x: scroll`.
- Snapshots `access-{mobile,tablet,desktop}-{light,dark}-chromium-win32.png`.

Run:

```
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-governance.spec.ts e2e/tests/portal-settings-access-ui.spec.ts --update-snapshots
```

Luego la misma corrida sin `--update-snapshots`.

- [ ] Commit: `test: add access settings visual and a11y evidence`

---

### Task 6: Gates, informe vivo y entrega

**Responsable:** AI-EM-ARCH. Review DS-OWNER (veredicto GO/NO-GO).

Comandos:

```
pnpm --filter @iwana/portal exec tsc --noEmit
pnpm --filter @iwana/portal exec eslint src/components/settings/AccessControlSettingsClient.tsx src/components/settings/mod00-settings-labels.ts
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand --coverage --collectCoverageFrom=src/components/settings/AccessControlSettingsClient.tsx
```

Cobertura ≥80 % en las cuatro métricas del cliente. Actualizar informe vivo a v1.62 (no crear informe nuevo). No inventar resultados.

- [ ] Commit: `docs: record access settings ui remediation`

---

## Criterios de aceptación del plan

CA-ACC-UX-01…12 de la spec. Cobertura ≥80 %. E2E + axe verdes. Sin API/migraciones/tokens.
