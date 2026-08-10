# MOD02 — Portal Dashboard Recomposición Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recomponer el inicio `/dashboard` de `apps/portal` como centro de trabajo útil para los 12 roles, alineado con la identidad iWana, accesible y verificable sin ampliar permisos ni crear endpoints.

**Architecture:** El cliente conserva el fan-out sobre los seis contratos existentes y degrada cada bloque de forma independiente con `Promise.allSettled`. La composición visual se deriva del rol autenticado y usa exclusivamente primitives y tokens compartidos. Los tracks A–D trabajan contra HLD, UX spec y contrato DS congelados; AI-EM-ARCH sincroniza A-3 → C-6 y custodia los gates.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, Tailwind CSS v4, `@iwana/ui`, NestJS, Jest, Testing Library, Playwright y axe.

**Versión:** 1.0  
**Estado:** Aprobado para ejecución  
**Fecha:** 2026-08-10  
**Dueño:** AI-EM-ARCH  
**Gate de entrada:** G4 cumplido  
**Gate actual:** G6 NO-GO

---

## 1. Fuentes congeladas y precedencia

1. [`AGENTS.md`](../../AGENTS.md).
2. [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md), v2.0.1 con G1 firmado.
3. [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md), v1.0 congelada.
4. [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md), v1.0 congelado.
5. [`ADR-075-Contrato-Capas-Z-Portal.md`](../adrs/ADR-075-Contrato-Capas-Z-Portal.md), aprobado.
6. [`PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md), autorización G4.
7. [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md), auditoría de origen y revalidación.

No modificar HLD, UX spec ni contrato DS salvo contradicción demostrable. En ese caso detener solo el track afectado y emitir `[BLOQUEO]` a AI-EM-ARCH.

## 2. Alcance cerrado

### Entra

- Correcciones A-1…A-4 del resumen de tenant.
- Composición útil por los 12 valores de `UserRole`.
- Bandas B0–B3, indicadores accionables y accesos filtrados por rol.
- Estados independientes por bloque, recarga silenciosa y filtros en URL.
- Sustitución de primitives locales por primitives compartidas.
- Firma iWana del shell, foco móvil, buscador táctil y capas z de ADR-075.
- Pruebas unitarias, accesibilidad, E2E, regresión visual y documentación viva.

### No entra

- Endpoints nuevos, ampliación de `@Roles`, fachada agregadora o permisos nuevos.
- Gráficas, series temporales, billing, dashboard componible o dependencias npm nuevas.
- Migraciones de base de datos, salvo hallazgo formalmente escalado.
- Cookie httpOnly, rate limit global o migración del lienzo de `apps/web`.

## 3. Protocolo del checklist vivo

El checklist de este documento es la única fuente de avance. El informe vivo conserva resultados y evidencia, no replica todas las casillas.

Formato de actualización por ítem:

```text
ID · responsable · estado · criterio de hecho · evidencia · fecha/SHA
```

Estados permitidos: `Pendiente`, `En curso`, `Bloqueado`, `Hecho`, `No aplica`.

- Cada agente modifica únicamente las casillas de su track y su sección del informe vivo.
- AI-EM-ARCH mantiene dependencias, bitácora global y gates.
- `Hecho` exige prueba ejecutada, ruta de evidencia y SHA o PR.
- La bitácora es append-only. Una corrección agrega una entrada; no borra la anterior.
- Un agente no cierra su track con tests heredados que solo certifican el baseline v1.

## 4. Mapa de archivos y ownership

| Track | Dueño | Archivos principales |
| --- | --- | --- |
| A — backend | AI-SR-FULL | `apps/api/src/modules/tenant/dashboard-summary.service.ts`, `apps/api/src/modules/tenant/dto/tenant-self.dto.ts`, `apps/api/src/modules/tenant/tenant-self.spec.ts` |
| B — design system | AI-DS-OWNER consulta; AI-FE-PLATFORM código | `apps/portal/src/components/shared/portal-ui.tsx`, `packages/ui/src/styles/globals.css`, tests estructurales compartidos |
| C — dashboard y shell | AI-FE-PLATFORM | `apps/portal/src/components/dashboard/**`, `apps/portal/src/components/layout/{Sidebar,TopHeader,PageHeader}.tsx`, `apps/portal/src/app/dashboard/layout.tsx` |
| D — calidad | AI-SR-QA | specs unitarios del dashboard, `e2e/tests/portal-dashboard-empresa.spec.ts`, evidencias visuales |
| Documentación | AI-EM-ARCH | prompt G4, auditoría vigente e informe vivo de recomposición |

Los agentes no revierten cambios ajenos. Antes de editar deben revisar `git status --short` y coordinar cualquier solapamiento con AI-EM-ARCH.

---

## Task 0: Preparar trazabilidad documental y baseline

**Owner:** AI-EM-ARCH  
**ID:** DOC-1…DOC-4

**Files:**

- Modify: `docs/prompts/PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`
- Modify: `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`
- Create: `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`
- Reference: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

- [x] **DOC-1 · Enlazar este plan desde el prompt G4**

Añadir una adenda operativa fechada 2026-08-10: plantilla base, plan canónico, informe vivo, reglas del checklist, responsables y evidencia P1 de desbordamiento en accesos rápidos. Mantener el alcance v1.0.

> DOC-1 · AI-EM-ARCH · Hecho · adenda en prompt G4 · 2026-08-10 / rama feat

- [x] **DOC-2 · Registrar la revalidación multiagente**

Agregar a la auditoría una sección append-only con HEAD auditado, pruebas heredadas, cobertura focal, hallazgos actuales, limitación de autenticación del navegador y G6 NO-GO.

> DOC-2 · AI-EM-ARCH · Hecho · §10ter auditoría · HEAD 39a7bbc6 · 2026-08-10

- [x] **DOC-3 · Crear el informe vivo consolidado**

Crear el informe con estado `En progreso` y secciones por track, matriz criterio↔test, evidencia, deuda, bitácora y gates G6/G6.5/G7 separados.

> DOC-3 · AI-EM-ARCH · Hecho · INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md · 2026-08-10

- [x] **DOC-4 · Validar gobernanza documental**

Run:

```powershell
pnpm audit:doc-locations
pnpm audit:adr-citations
```

Expected: ambos comandos terminan con código 0 y ningún bloqueante.

> DOC-4 · AI-EM-ARCH · Hecho · `BLOQUEANTE: 0` · exit 0 · 2026-08-10

---

## Task 1: Corregir el contrato del resumen de tenant

**Owner:** AI-SR-FULL  
**IDs:** A-1…A-4

**Files:**

- Modify: `apps/api/src/modules/tenant/dashboard-summary.service.ts`
- Modify: `apps/api/src/modules/tenant/dto/tenant-self.dto.ts`
- Modify: `apps/api/src/modules/tenant/tenant.controller.ts`
- Test: `apps/api/src/modules/tenant/tenant-self.spec.ts`

- [x] **A-1 · Escribir pruebas del umbral de instalación**

Añadir una prueba que compare `fiberInstallationThresholdMeters` en el resumen y la configuración del mismo tenant.

> Evidencia: `tenant-self.spec.ts` · A-1 · default 50 y valor persistido 120 · paridad con mapper de settings · 2026-08-10

- [x] **A-2 · Escribir pruebas de cobertura MFA**

Cubrir tenant con usuarios, tenant sin usuarios y fallo del conteo. `null` significa fallo de fuente; cero usuarios produce una cobertura definida según el HLD.

> Evidencia: ratio `mfaEnabled/ACTIVE` · 0 usuarios → `1` · fallo de conteo → `null` · 2026-08-10

- [x] **A-3 · Estrechar el tipo de `tenant`**

Definir un DTO propio con los 13 campos realmente servidos. `TenantSelfResponseDto` permanece intacto y la marca no forma parte del resumen.

> Evidencia: `DashboardSummaryTenantDto` (13 campos) · sin branding · `TenantSelfResponseDto` intacto · 2026-08-10

- [x] **A-4 · Publicar metadata OpenAPI y ejecutar pruebas**

Run:

```powershell
pnpm --filter @iwana/api exec jest src/modules/tenant/tenant-self.spec.ts --runInBand
pnpm --filter @iwana/api typecheck
```

Expected: suites en verde, contrato estricto y ningún permiso ampliado.

> Evidencia: jest 17/17 PASS · typecheck exit 0 · `@ApiOkResponse` + `@ApiProperty` en resumen · sin ampliación `@Roles` · 2026-08-10

- [x] **A-DONE · Registrar SHA y evidencia en el informe vivo**

Commit sugerido:

```powershell
git add apps/api/src/modules/tenant docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md
git commit -m "fix(api): align tenant dashboard summary contract"
```

> Evidencia: Track A cerrado en informe vivo · SHA en bitácora tras commit · 2026-08-10

---

## Task 2: Materializar el contrato del design system

**Owner de contrato:** AI-DS-OWNER  
**Owner de código:** AI-FE-PLATFORM  
**IDs:** B-1…B-3, C-2, C-3

**Files:**

- Modify: `apps/portal/src/components/shared/portal-ui.tsx`
- Modify: `packages/ui/src/styles/globals.css`
- Test: specs estructurales de `apps/portal/src/components/shared/`

- [x] **B-1 · Escribir pruebas de las nuevas interfaces**

Las pruebas deben exigir `href` navegable, foco visible, valor nulo accesible y estados `idle`, `loading` y `error`.

> B-1 · AI-FE-PLATFORM · Hecho · `portal-dashboard-metric.spec.tsx` · 2026-08-10

- [x] **B-2 · Implementar `PortalDashboardMetric`**

La interfaz pública debe coincidir con el contrato congelado DS §1
(`eyebrow`, `accent: PortalMetricCardAccent`, `delta.tone`, `icon` ComponentType,
exclusión `href`/`onClick`). La API simplificada del plan (accent success/error)
difiere del contrato — se implementó el contrato DS y se emitió `[CONSULTA]`.

Usar figuras tabulares para valores, texto accesible para `null` y ningún acento lima decorativo.

> B-2 · AI-FE-PLATFORM · Hecho · `portal-ui.tsx` PortalDashboardMetric · 2026-08-10

- [x] **B-3 · Extender `PortalNavListRow`**

Mantener compatibilidad con `onClick` y añadir navegación por `href`, foco normado y targets de al menos 44 px.

> B-3 · AI-FE-PLATFORM · Hecho · href + min-h-11 + disabled sin enlace · 2026-08-10

- [x] **B-4 · Sustituir estados locales por primitives compartidas**

Adoptar `PortalPanel` (`busy`+`shadow-iwana-soft`), `PortalAlert` (live),
`PortalEmptyState` y `PortalSkeletonBlock`. Cableado completo de consumidores = Task 4.

> B-4 · AI-FE-PLATFORM · Hecho · primitives listas/exportadas · 2026-08-10

- [x] **B-5 · Declarar tokens de capas y corregir documentación de contraste**

Aplicar exactamente los siete niveles aprobados por ADR-075. Corregir las cifras documentales del lima sin cambiar el valor de color.

> B-5 · AI-FE-PLATFORM · Hecho · `--z-base`…`--z-toast` + 4,76:1 en globals.css · 2026-08-10

- [x] **B-6 · Ejecutar pruebas y auditor mecánico**

Run:

```powershell
pnpm --filter @iwana/portal test -- --runInBand
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/shared/portal-ui.tsx apps/portal/src/components/dashboard apps/portal/src/components/layout
```

Expected: pruebas en verde, cero hex nuevos y cero hallazgos P0/P1.

> B-6 · AI-FE-PLATFORM · Hecho · 1121 pass · auditor P0:0 P1:0 P2:3 heredados · 2026-08-10

Commit sugerido:

```powershell
git add apps/portal/src/components/shared packages/ui/src/styles/globals.css
git commit -m "feat(ui): add portal dashboard primitives"
```

---

## Task 3: Implementar composición y carga por rol

**Owner:** AI-FE-PLATFORM  
**IDs:** C-1, C-4, C-6, C-7

**Files:**

- Modify: `apps/portal/src/components/dashboard/DashboardClient.tsx`
- Create: `apps/portal/src/components/dashboard/dashboard-role-composition.ts`
- Create: `apps/portal/src/components/dashboard/dashboard-role-composition.spec.ts`
- Create or modify: `apps/portal/src/components/dashboard/DashboardClient.spec.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

- [x] **C-1 · Escribir la prueba de los 12 roles**

La tabla debe cubrir `Object.values(UserRole)` y verificar para cada rol: bloque de identidad, al menos una tarea o destino útil y ausencia de accesos no autorizados.

> C-1 · AI-FE-PLATFORM · Hecho · `dashboard-role-composition.spec.ts` · 12 roles · 2026-08-10

- [x] **C-2 · Definir composición tipada**

Usar un contrato interno exhaustivo. Los IDs se resuelven mediante registros tipados de acciones y bloques; las rutas exactas son las verificadas en UX spec §5.3 y en el inventario real de `apps/portal/src/app/dashboard/`:

```typescript
import { UserRole } from '@iwana/shared';

type DashboardActionId =
  | 'register-subscriber'
  | 'schedule-visit'
  | 'view-today-agenda'
  | 'register-case'
  | 'new-opportunity'
  | 'review-plans-without-price'
  | 'view-profile';

type DashboardMetricId = 'I-1' | 'I-2' | 'I-3' | 'I-4' | 'I-5' | 'I-6' | 'I-7';

type DashboardBlockId =
  | 'field-attention'
  | 'help-desk'
  | 'commercial-attention'
  | 'pipeline'
  | 'inventory'
  | 'next-configuration'
  | 'change-history'
  | 'quick-actions';

interface DashboardRoleComposition {
  primaryActionId: DashboardActionId;
  secondaryActionId: DashboardActionId | null;
  metricIds: readonly DashboardMetricId[];
  dominantBlockId: DashboardBlockId | null;
  supportBlockIds: readonly DashboardBlockId[];
  foldedBlockIds: readonly DashboardBlockId[];
  showOperationalTenantCard: boolean;
}

const DASHBOARD_ROLE_COMPOSITION: Record<UserRole, DashboardRoleComposition> = {
  [UserRole.ADMIN]: {
    primaryActionId: 'register-subscriber',
    secondaryActionId: 'schedule-visit',
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6', 'I-7'],
    dominantBlockId: 'field-attention',
    supportBlockIds: ['next-configuration', 'change-history', 'quick-actions'],
    foldedBlockIds: ['help-desk', 'commercial-attention', 'inventory'],
    showOperationalTenantCard: true,
  },
  [UserRole.NOC]: {
    primaryActionId: 'schedule-visit',
    secondaryActionId: 'view-today-agenda',
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4'],
    dominantBlockId: 'field-attention',
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: ['inventory'],
    showOperationalTenantCard: true,
  },
  [UserRole.SUPPORT]: {
    primaryActionId: 'register-case',
    secondaryActionId: 'register-subscriber',
    metricIds: ['I-3', 'I-4', 'I-1', 'I-2'],
    dominantBlockId: 'help-desk',
    supportBlockIds: ['field-attention', 'quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.SALES]: {
    primaryActionId: 'register-subscriber',
    secondaryActionId: 'new-opportunity',
    metricIds: ['I-5', 'I-6', 'I-7'],
    dominantBlockId: 'commercial-attention',
    supportBlockIds: ['pipeline', 'quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.ACCOUNTANT]: {
    primaryActionId: 'review-plans-without-price',
    secondaryActionId: null,
    metricIds: ['I-5'],
    dominantBlockId: 'commercial-attention',
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.TECHNICIAN]: {
    primaryActionId: 'view-today-agenda',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.CONTRACTOR]: {
    primaryActionId: 'view-today-agenda',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.AUDITOR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.HR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.SUBSCRIBER]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.PARTNER]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.INVESTOR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
};
```

No usar `default` que oculte roles sin mapear; TypeScript debe fallar si el enum crece. `AUDITOR` conserva la vista base hasta que exista la aprobación de seguridad y un destino de historial completo verificable.

> C-2 · AI-FE-PLATFORM · Hecho · `dashboard-role-composition.ts` · Record exhaustivo · 2026-08-10

- [x] **C-3 · Eliminar el gate binario**

Retirar `RoleRestrictedView` y `const isAdmin`. Renderizar bandas B0–B3 según la composición tipada.

> C-3 · AI-FE-PLATFORM · Hecho · `DashboardClient.tsx` sin gate ADMIN · 2026-08-10

- [x] **C-4 · Implementar fan-out y degradación por bloque**

Usar `Promise.allSettled`; cada resultado actualiza solo su bloque. La recarga conserva cifras previas y expone estado “Actualizando”.

> C-4 · AI-FE-PLATFORM · Hecho · fan-out por fuente + “Actualizando” · 2026-08-10

- [x] **C-5 · Sincronizar el contrato real de A-3**

Reemplazar mocks del tipo de tenant solo después de que A-3 publique SHA. No ampliar la respuesta del backend ni duplicar el DTO completo.

> C-5 · AI-FE-PLATFORM · Hecho · `DashboardSummaryTenant` 13 campos sync `e4f93324` · 2026-08-10

- [x] **C-6 · Deduplicar peticiones y persistir filtros URL**

Los indicadores accionables navegan a los destinos/filtros definidos en UX spec. Atrás restaura el dashboard sin una recarga de red innecesaria.

> C-6 · AI-FE-PLATFORM · Hecho · hrefs §3.2 + caché sesión R-5 · 2026-08-10

- [x] **C-7 · Ejecutar pruebas focalizadas**

Run:

```powershell
pnpm --filter @iwana/portal exec jest src/components/dashboard/dashboard-role-composition.spec.ts src/components/dashboard/DashboardClient.spec.tsx --runInBand
pnpm --filter @iwana/portal typecheck
```

Expected: 12 roles cubiertos, fallos parciales contenidos y typecheck en verde.

> C-7 · AI-FE-PLATFORM · Hecho · jest 48/48 · typecheck 0 · 2026-08-10

Commit sugerido:

```powershell
git add apps/portal/src/components/dashboard apps/portal/src/lib/api-client.ts
git commit -m "feat(portal): compose dashboard by tenant role"
```

---

## Task 4: Recomponer jerarquía visual y accesos

**Owner:** AI-FE-PLATFORM  
**IDs:** C-2…C-5

**Files:**

- Modify: `apps/portal/src/components/dashboard/MetricCard.tsx`
- Modify: `apps/portal/src/components/dashboard/DashboardPanel.tsx`
- Modify: `apps/portal/src/components/dashboard/QuickActionsPanel.tsx`
- Modify: `apps/portal/src/components/dashboard/RecentActivityPanel.tsx`
- Modify: `apps/portal/src/components/dashboard/OnboardingAlerts.tsx`
- Modify: `apps/portal/src/components/dashboard/TenantSummaryCard.tsx`
- Modify: `apps/portal/src/components/layout/PageHeader.tsx`

- [x] **C-8 · Escribir pruebas de métricas y accesos**

Cubrir valor `null`, loading, error, navegación filtrada por rol, ausencia de “Reportes/Fase siguiente” y targets accesibles.

- [x] **C-9 · Sustituir primitives locales**

Migrar consumidores a las primitives compartidas y eliminar `MetricCard.tsx`/`DashboardPanel.tsx` cuando `rg` confirme cero imports.

- [x] **C-10 · Implementar bandas B0–B3**

El primer viewport debe mostrar una acción operativa y al menos dos indicadores aplicables a 375, 768 y 1280 px. La ficha empresarial queda subordinada.

- [x] **C-11 · Corregir accesos rápidos estructuralmente**

Usar una lista de una columna con `PortalNavListRow`. No parchear el desbordamiento con `truncate`; retirar badge, contador y celdas deshabilitadas.

- [x] **C-12 · Traducir actividad y estados**

Mapear `action` y `entityType` a vocabulario amigable. Los vacíos deben indicar siguiente acción y los errores deben tener reintento por bloque.

- [x] **C-13 · Ejecutar pruebas focalizadas**

Run:

```powershell
pnpm --filter @iwana/portal exec jest src/components/dashboard --runInBand
```

Expected: todos los componentes tocados en verde y cero referencias a las primitives eliminadas.

**Cierre Task 4:** jest dashboard 5 suites / 61 pass · typecheck `@iwana/portal` exit 0 · `audit-ui` P0/P1: 0 · `MetricCard`/`DashboardPanel` eliminados (cero imports).

Commit sugerido:

```powershell
git add apps/portal/src/components/dashboard apps/portal/src/components/layout/PageHeader.tsx
git commit -m "feat(portal): recompose dashboard information hierarchy"
```

---

## Task 5: Corregir shell, responsive, foco y firma iWana

**Owner:** AI-FE-PLATFORM  
**IDs:** C-5 y bloqueantes de shell

**Files:**

- Modify: `apps/portal/src/components/layout/Sidebar.tsx`
- Modify: `apps/portal/src/components/layout/Sidebar.spec.tsx`
- Modify: `apps/portal/src/components/layout/TopHeader.tsx`
- Modify: `apps/portal/src/app/dashboard/layout.tsx`
- Modify: `apps/portal/src/app/dashboard/layout.spec.tsx`

- [x] **SHELL-1 · Escribir pruebas de drawer cerrado y foco**

Verificar que los enlaces cerrados no sean tabulables, que el foco entre al abrir, Escape cierre y el disparador recupere el foco.

Evidencia: `Sidebar.spec.tsx` (inert/foco/Escape) + `TopHeader.spec.tsx` (disparador recupera foco) — 15 tests shell en verde.

- [x] **SHELL-2 · Implementar drawer inerte**

Usar `inert`/`aria-hidden` de forma coherente con el estado. Mantener targets de al menos 44 px y `interactiveFocusClassName`.

Evidencia: `Sidebar.tsx` — `inert`/`aria-hidden` solo en viewport ≤1023 px cerrado; `min-h-11` + `interactiveFocusClassName`.

- [x] **SHELL-3 · Añadir firma activa**

El ítem activo conserva `aria-current="page"` y añade la barra lima contratada como forma no cromática.

Evidencia: barra `bg-iwana-secondary dark:bg-iwana-secondary-400` (contrato DS §5.1) + `aria-current="page"`.

- [x] **SHELL-4 · Mantener buscador disponible bajo 1024 px**

Añadir una entrada táctil accesible al buscador sin duplicar el diálogo ni el estado de búsqueda.

Evidencia: botón «Buscar» `h-11` abre la misma `GlobalSearch` vía `openRequestId` (una instancia); hoja móvil `z-(--z-overlay)`.

- [x] **SHELL-5 · Migrar lienzo, tokens y capas**

Usar `bg-iwana-neutral-50 dark:bg-dark-surface`, eliminar `z-35` y los hex del dashboard/header, y asignar capas semánticas de ADR-075.

Evidencia: layout `bg-iwana-neutral-50`; `z-(--z-overlay|drawer|sticky)`; hex `#17163a` → `text-iwana-primary`.

- [x] **SHELL-6 · Ejecutar pruebas**

Run:

```powershell
pnpm --filter @iwana/portal exec jest src/components/layout/Sidebar.spec.tsx src/app/dashboard/layout.spec.tsx --runInBand
pnpm --filter @iwana/portal typecheck
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/layout apps/portal/src/app/dashboard/layout.tsx
```

Expected: teclado y layout en verde, sin estilos arbitrarios en la superficie.

Evidencia: jest Sidebar+layout 12/12; TopHeader 3/3; GlobalSearch 4/4; typecheck 0; audit-ui P0/P1=0.

Commit sugerido:

```powershell
git add apps/portal/src/components/layout apps/portal/src/app/dashboard/layout.tsx apps/portal/src/app/dashboard/layout.spec.tsx
git commit -m "fix(portal): align dashboard shell with iWana identity"
```

---

## Task 6: Implementar cobertura QA y regresión E2E

**Owner:** AI-SR-QA  
**IDs:** D-1…D-7

**Files:**

- Modify: `e2e/tests/portal-dashboard-empresa.spec.ts`
- Create or modify: tests unitarios bajo `apps/portal/src/components/dashboard/`
- Update: `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`
- Create: capturas bajo `docs/informes/evidencias/portal-dashboard-recomposicion/`

- [x] **D-1 · Axe en temas claro y oscuro**

Cubrir cargando, cargado, vacío, error, actualizando y dato no disponible. Confirmar `backgroundImage` computado en estados de error.
Evidencia: `e2e/tests/portal-dashboard-empresa.spec.ts` (axe claro/oscuro + `backgroundImage === none` en PortalAlert) · residuales filtrados documentados en informe ([CONSULTA] DS/FE).

- [x] **D-2 · Valor nulo y contraste**

Verificar que `null` no se convierta en cero y que el sustituto alcance WCAG AA en ambos temas.
Evidencia: unit `dashboard-metrics-states` + `DashboardClient` null · E2E `Sin dato disponible` sin cifra `0` · tokens `text-gray-700 dark:text-gray-200`.

- [x] **D-3 · Composición por 12 roles**

Ejecutar una tabla unitaria exhaustiva y E2E representativo para ADMIN, NOC, SALES y rol base.
Evidencia: `dashboard-role-composition.spec.ts` (12 roles) · E2E ADMIN/NOC/SALES/TECHNICIAN.

- [x] **D-4 · Recorrido móvil de teclado**

En 375 px comprobar Tab, Shift+Tab, Escape, entrada y retorno de foco del drawer.
Evidencia: E2E D-4 · drawer `inert` · foco en cerrar del aside · Escape → Abrir menú.

- [x] **D-5 · Primer viewport y responsive**

Capturar 375, 768 y 1280 px; comprobar acción operativa, al menos dos indicadores aplicables y ausencia de solapamientos.
Evidencia: `docs/informes/evidencias/portal-dashboard-recomposicion/viewport-{375,768,1280}.png`.

- [x] **D-6 · Sustituir selectores frágiles**

Usar roles y nombres accesibles; no seleccionar por texto numérico exacto.
Evidencia: E2E sin `getByText` de cifras exactas; roles/nombres (`Registrar suscriptor`, `Visitas de hoy`, etc.).

- [x] **D-7 · Cobertura y regresión visual**

La superficie tocada debe alcanzar al menos 80% de cobertura. Validar sombra dual y firmas funcionales en tres módulos.
Evidencia: jest dashboard `stmts 81.89% / lines 84.97%` · E2E barra lima + `boxShadow` métrica · `firmas-iwana-1280.png`.

Run:

```powershell
pnpm --filter @iwana/portal test -- --coverage --runInBand
pnpm test:e2e:portal
```

Expected: suites en verde, cobertura ≥80% del núcleo tocado y evidencias enlazadas desde el informe.

Commit sugerido:

```powershell
git add apps/portal/src/components/dashboard e2e/tests/portal-dashboard-empresa.spec.ts docs/informes
git commit -m "test(portal): verify dashboard recomposition criteria"
```

---

## Task 7: Cerrar documentación y gates

**Owner:** AI-EM-ARCH con dictámenes AI-DS-OWNER, AI-PROD-UX y AI-SR-QA

**Files:**

- Modify: `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`
- Modify: `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`
- Modify only after gate: `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md`

- [ ] **G6-1 · Ejecutar gates técnicos**

Run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e:portal
pnpm audit:adr-citations
pnpm audit:doc-locations
```

Expected: códigos 0, `BLOQUEANTE: 0`, sin violaciones de boundary y sin PII.

- [ ] **G6-2 · Obtener dictamen de identidad**

AI-DS-OWNER verifica contrato DS, sombras, tokens, firmas, contraste y ausencia de primitives paralelas. Resultado requerido: sin P0/P1.

- [ ] **G6-3 · Obtener dictamen de experiencia**

AI-PROD-UX verifica bandas, tareas por rol, primer viewport, destinos y estados. Resultado requerido: CA-V2-01…12 satisfechos.

- [ ] **G6-4 · Obtener dictamen QA**

AI-SR-QA enlaza cada criterio con prueba y evidencia reproducible. Tests heredados sin aserción nueva no cuentan.

- [ ] **G6-5 · Consolidar informe vivo**

Registrar SHAs, comandos, evidencias, deuda residual y decisión G6. Cambiar a `Completado` solo si no queda trabajo requerido.

- [ ] **G6.5 · Registrar merge readiness por separado**

Requiere corrida Linux de CI identificada por SHA. No se infiere de G6.

- [ ] **G7 · Registrar recomendación de release por separado**

Requiere recomendación AI-EM-ARCH y aprobación CTO. No se infiere de G6.5.

Commit documental sugerido:

```powershell
git add docs/plans docs/prompts docs/informes docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md
git commit -m "docs(mod02): close portal dashboard recomposition"
```

## 5. Matriz mínima de aceptación

| Criterio | Evidencia obligatoria | Task |
| --- | --- | --- |
| CA-V2-01/02 | Test exhaustivo de 12 roles y destinos autorizados | 3, 6 |
| CA-V2-03 | Capturas 375/768/1280 con acción útil | 4, 6 |
| CA-V2-04 | Máximo de indicadores y jerarquía B0–B3 | 4 |
| CA-V2-05 | Indicador→lista filtrada y navegación Atrás | 3, 6 |
| CA-V2-06 | Una fuente falla y los demás bloques permanecen | 3, 6 |
| CA-V2-07/11 | Seis estados, `null` honesto y AA en ambos temas | 2, 4, 6 |
| CA-V2-08 | Teclado móvil y drawer inerte | 5, 6 |
| CA-V2-09/10 | Sin enums crudos; vacíos con siguiente acción | 4 |
| CA-V2-12 | Dos firmas iWana funcionales | 2, 5, 6 |
| UX-15/16 | Recarga silenciosa y Atrás sin fetch innecesario | 3, 6 |

## 6. Condiciones de bloqueo

Detener solo el track afectado y emitir `[BLOQUEO]` cuando:

- Se necesite un dato ausente del HLD §4.2.
- Se pretenda ampliar un permiso o añadir endpoint.
- El contrato DS no cubra un patrón requerido.
- Aparezca una dependencia npm nueva.
- Dos contratos congelados se contradigan.
- Un criterio no pueda probarse como está redactado.

## 7. Definition of Done

- [ ] A-1…A-4 cerrados con evidencia.
- [x] B-1…B-3 y C-1…C-13 cerrados sin primitives paralelas.
- [x] D-1…D-7 en verde y cobertura ≥80% del núcleo tocado.
- [ ] CA-V2-01…12 y UX-01…16 trazados a pruebas.
- [ ] Cero P0/P1 de identidad, accesibilidad o experiencia.
- [ ] Informe vivo completo y auditoría revalidada.
- [ ] G6 documentado sin anticipar G6.5 ni G7.
- [ ] `pnpm audit:adr-citations` y `pnpm audit:doc-locations` sin bloqueantes.

## 8. Bitácora viva

| Fecha/hora | ID | Agente | Estado | Evidencia/SHA | Nota |
| --- | --- | --- | --- | --- | --- |
| 2026-08-10 | PLAN | AI-EM-ARCH | Hecho | Este documento | Plan canónico emitido para ejecución multiagente |
| 2026-08-10 | A-1…A-4 | AI-SR-FULL | Hecho | `e4f93324` · jest 17/17 · typecheck 0 | C-1/C-2/C-3: fiber default, mfaCoverage real, tenant DTO 13 campos, OpenAPI |
| 2026-08-10 | C-1…C-7 | AI-FE-PLATFORM | Hecho | `b8517caa` · jest 48/48 · typecheck 0 | Composition + fan-out; sync A-3; sin gate binario |
| 2026-08-10 | SHELL-1…6 | AI-FE-PLATFORM | Hecho | `e09ffa9a` · jest shell 15/15 · typecheck 0 · audit-ui P0/P1=0 | Drawer inert; barra lima; Buscar móvil 1× GlobalSearch; z ADR-075; lienzo neutral-50 |
| 2026-08-10 | D-1…D-7 | AI-SR-QA | Hecho | Task 6 · jest dashboard 76 pass · cobertura ≥80% · E2E portal-dashboard-empresa 25/25 | Axe claro/oscuro; null honesto; 12 roles unit + 4 E2E; teclado 375; capturas; residuales [CONSULTA] DS/FE |
| 2026-08-10 | A11Y-R1…3 | AI-FE-PLATFORM | Hecho | `1014990f` · base `9937c7d7` · DS v1.1 §1.7 | Eyebrow gray-700 en danger/warning; CTAs dark; sin opacity-80; filtros axe retirados |
