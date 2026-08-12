# Cierre de pendientes MOD02 Dashboard Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los pendientes corregibles del delta UX de MOD02 y dejar G6.5/G7 preparados para una decisión externa verificable.

**Architecture:** Se conserva el boundary actual: no se crean endpoints ni se amplían permisos. La cobertura se mejora con pruebas de comportamiento del registro de composición; la validación multi-tenant se ejecuta contra el API real usando el provisioner E2E existente; la decisión documental se alinea entre PRD MOD01 y HLD/prompt MOD02 sin modificar el alcance de seguridad.

**Tech Stack:** pnpm, Jest/ts-jest, NestJS, Playwright API, PostgreSQL por schema, GitHub Actions, Markdown gobernado.

---

### Task 1: Elevar cobertura de ramas del registro de composición

**Files:**
- Modify: `apps/portal/src/components/dashboard/dashboard-role-composition.spec.ts`
- Test: `apps/portal/src/components/dashboard/dashboard-role-composition.spec.ts`

- [x] **Step 1: Medir las ramas no cubiertas**

Run:

```powershell
pnpm --filter @iwana/portal exec jest --coverage --collectCoverageFrom="components/dashboard/**/*.{ts,tsx}" --testPathPattern="components/dashboard" --runInBand --no-cache
```

Expected: la suite pasa y el resumen identifica el registro de composición como uno de los archivos con ramas pendientes.

- [x] **Step 2: Añadir pruebas de comportamiento para ramas no cubiertas**

Cubrir explícitamente: `isUserRole` con valor válido, nulo y desconocido; `resolveDashboardAction`, `resolveDashboardMetric` y `resolveDashboardBlock`; `toLocalDayKey` con cambio de mes; agrupación sin miembros; promoción sin métricas positivas; promoción con estado `error`, `loading`, `success` y `updating`; y composición con fuente `audit`.

- [x] **Step 3: Verificar cobertura**

Run:

```powershell
pnpm --filter @iwana/portal exec jest --coverage --collectCoverageFrom="components/dashboard/**/*.{ts,tsx}" --testPathPattern="components/dashboard" --runInBand --no-cache
```

Expected: 0 tests fallidos y branches del dashboard ≥80%.

### Task 2: Ejecutar E2E real de AUDITOR y aislamiento entre tenants

**Files:**
- Create: `e2e/tests/api/audit-logs-tenant-isolation.spec.ts`
- Modify: `scripts/e2e-provision-operational.mjs`
- Modify: `.github/workflows/ci.yml`

- [x] **Step 1: Provisionar un usuario AUDITOR efímero**

Crear el usuario en el tenant A con el mismo `tenantAdmin.token` que usa el provisioner, activarlo y asignarle el perfil canónico `Auditor`. Pasar sus credenciales y las credenciales del tenant B al spec mediante variables de proceso sin imprimirlas.

- [x] **Step 2: Escribir el E2E real antes del cambio de runner**

El spec debe autenticarse contra el API real y comprobar en una misma prueba: `GET /audit-logs` responde 200 para AUDITOR; el listado pertenece al tenant A aunque se envíe `X-Tenant-Slug` del tenant B; una actividad creada en tenant B no aparece; y `GET /audit-logs/export` responde 403 para AUDITOR. Las aserciones deben usar únicamente datos sintéticos y no registrar credenciales, emails ni payloads.

- [x] **Step 3: Integrar el spec al provisioner y al gate CI**

Ejecutar ambos specs API desde el provisioner, actualizar el mínimo esperado de marcadores y hacer que el gate de CI compruebe el nuevo conteo. El cleanup existente debe eliminar ambos schemas y tenants después del run.

- [x] **Step 4: Verificar localmente si el entorno E2E está disponible**

Run:

```powershell
$env:API_BASE_URL = "http://127.0.0.1:3010"; node scripts/e2e-provision-operational.mjs
```

> Nota: el stack dev local ocupa el puerto 3000, por lo que el runner se ejecutó en 3010 (el provisioner deriva `PORT` de `API_BASE_URL`). El run completo quedó **30/0/0/0/0** con `E2E_SETUP=OK` y `E2E_CLEANUP=OK`; el test 4d pasó tras los fixes de ráfaga BOLA (5 concurrentes) y el reset contractual 4a/4c. La validación del gate (`--verify-playwright-markers`) aceptó el log: `passed=30 failed=0 skipped=0 did-not-run=0 flaky=0` (exit 0). El run Linux de CI por SHA sigue pendiente para G6.5.

### Task 3: Resolver la contradicción documental y preparar gates externos

**Files:**
- Modify: `docs/prds/PRD-MOD01-DEFINICION-v1.1.md`
- Modify: `docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`
- Modify: `docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`

- [x] **Step 1: Alinear el PRD legado con el contrato vigente**

Actualizar la mención de exportación de `AUDITOR` para distinguir listado de exportación: el listado puede ser consultado; la exportación queda restringida a `ADMIN` y `SYSTEM_ADMIN` para MOD02, con referencia al HLD y al dictamen SEC. No cambiar permisos de código desde documentación.

- [x] **Step 2: Registrar recomendación G7 sin autoaprobarla**

Anexar al informe vivo una recomendación explícita al CTO: aceptar el delta tras CI/Linux verde, E2E real de auditoría verde, cobertura de branches ≥80% y revisión del conflicto documental; dejar el estado G7 como pendiente hasta la decisión formal.

- [x] **Step 3: Verificar gobernanza documental**

Run:

```powershell
pnpm audit:doc-locations
pnpm audit:adr-citations
```

Expected: bloqueantes 0.

### Criterio de salida

- [x] Portal dashboard branches ≥80% con prueba Jest fresca.
- [ ] E2E real de `AUDITOR` y aislamiento tenant integrado al gate Linux/CI.
- [x] PRD/HLD/prompt sin contradicción sobre exportación de `AUDITOR`.
- [ ] G6.5 solo se marca cerrado con SHA/run de CI Linux real.
- [ ] G7 solo se marca cerrado con decisión CTO registrada; el agente no la infiere.
