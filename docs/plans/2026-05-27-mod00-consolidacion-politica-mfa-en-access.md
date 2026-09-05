# MOD00 Consolidacion de politica MFA global en Access Implementation Plan

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-27

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** retirar la ruta independiente de Seguridad del portal y consolidar la politica MFA global del tenant dentro de Access sin cambiar el contrato persistido `mfa_required_all`.

**Architecture:** la implementacion conserva a Auth/Tenant como owner del dato `mfa_required_all`, mueve la superficie visible de la politica a `/dashboard/settings/access`, elimina el duplicado de `Mi perfil` y deja una transicion controlada para la ruta legacy `/dashboard/settings/security`. Users sigue siendo owner de operaciones por cuenta y Access se consolida como gobierno de acceso del tenant.

**Tech Stack:** Next.js App Router, React 19, NestJS, Jest, Playwright, contratos tenant self-service, settings registry de MOD00.

---

## Mapa de archivos

- Modificar: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- Modificar: `apps/portal/src/components/settings/mod00-settings-labels.ts`
- Modificar o eliminar: `apps/portal/src/components/settings/SecuritySettingsClient.tsx`
- Modificar o eliminar: `apps/portal/src/components/settings/SecuritySettingsCard.tsx`
- Modificar: `apps/portal/src/app/dashboard/settings/security/page.tsx`
- Modificar: `apps/portal/src/components/profile/ProfileClient.tsx`
- Modificar o eliminar: `apps/portal/src/components/profile/MfaRequiredToggle.tsx`
- Modificar: `apps/api/src/modules/configuration/services/settings-registry.service.ts`
- Modificar: `apps/api/src/modules/configuration/configuration.controller.http.spec.ts`
- Modificar: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
- Modificar: `apps/portal/src/components/settings/SecuritySettingsClient.spec.tsx`
- Modificar: `e2e/tests/portal-settings-empresa.spec.ts`
- Modificar: `e2e/tests/portal-settings-federated-shell.spec.ts`
- Modificar: `e2e/tests/portal-users.spec.ts`

---

### Task 1: Fijar la decision documental y los asserts de ownership

**Files:**

- Modify: `docs/adrs/ADR-045-Consolidacion-Politica-MFA-Global-en-Access.md`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Test: `e2e/tests/portal-users.spec.ts`

- [ ] **Step 1: Añadir o reforzar el test de ownership visible**

```ts
test('ownership seguridad global — access concentra la politica MFA del tenant', async ({ page }) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/settings/access');

  await expect(page.getByRole('heading', { name: /roles de empresa/i })).toBeVisible();
  await expect(page.getByText(/politicas de autenticacion/i)).toBeVisible();
  await expect(page.getByLabel(/activar mfa obligatorio/i)).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que hoy falla**

Run: `pnpm exec playwright test e2e/tests/portal-users.spec.ts --config e2e/playwright.portal.local.config.ts`

Expected: falla porque la politica MFA aun no vive en Access.

- [ ] **Step 3: Actualizar los artefactos documentales de apoyo antes del refactor**

```md
- Access sera owner visible de politicas globales de autenticacion.
- Users conserva operaciones por cuenta.
- Mi perfil deja de exponer politicas globales del tenant.
```

- [ ] **Step 4: Confirmar que ADR e informe no contradicen el plan**

Run: `rg -n "mfa_required_all|dashboard/settings/security|Mi perfil|Roles de empresa" docs/adrs docs/informes docs/plans`

Expected: coincidencias consistentes con ADR-045 y este plan.

- [ ] **Step 5: Commit**

```bash
git add docs/adrs/ADR-045-Consolidacion-Politica-MFA-Global-en-Access.md docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md docs/plans/2026-05-27-mod00-consolidacion-politica-mfa-en-access.md
git commit -m "docs: proponer consolidacion de MFA global en access"
```

### Task 2: Mover la politica MFA global a Access con TDD

**Files:**

- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`
- Test: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`

- [ ] **Step 1: Escribir el test unitario que exija el bloque de politicas de autenticacion en Access**

```tsx
it('muestra la politica MFA global dentro de access para administradores', async () => {
  render(<AccessControlSettingsClient />);

  expect(await screen.findByText('Politicas de autenticacion')).toBeInTheDocument();
  expect(screen.getByLabelText('Activar MFA obligatorio')).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar el test y confirmar fallo**

Run: `pnpm --filter @iwana/portal test -- AccessControlSettingsClient.spec.tsx`

Expected: FAIL porque el panel todavia no existe.

- [ ] **Step 3: Implementar el panel dentro de Access usando el contrato actual de tenant settings**

```tsx
<PortalPanel>
  <PortalSectionHeader
    eyebrow="Politicas de autenticacion"
    title="Acceso protegido al portal"
    description="Define si toda la empresa debe configurar verificacion en dos pasos antes de entrar."
  />
  <label>
    <input
      type="checkbox"
      aria-label="Activar MFA obligatorio"
      checked={mfaRequiredAll}
      onChange={handleToggleMfaRequiredAll}
    />
  </label>
</PortalPanel>
```

- [ ] **Step 4: Reusar el mensaje de exito sobre la misma mutacion `tenantSelfApi.updateSettings({ features: { mfa_required_all } })`**

```ts
const updated = await tenantSelfApi.updateSettings({
  features: { mfa_required_all: nextValue },
});
setMfaRequiredAll(updated.features.mfa_required_all);
setFeedback('Politica de seguridad actualizada correctamente.');
```

- [ ] **Step 5: Ejecutar el test unitario y el slice del cliente settings**

Run: `pnpm --filter @iwana/portal test -- AccessControlSettingsClient.spec.tsx SettingsClient.spec.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/AccessControlSettingsClient.tsx apps/portal/src/components/settings/mod00-settings-labels.ts apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx
git commit -m "feat: mover politica MFA global a access"
```

### Task 3: Eliminar el duplicado en Mi perfil

**Files:**

- Modify: `apps/portal/src/components/profile/ProfileClient.tsx`
- Delete or stop using: `apps/portal/src/components/profile/MfaRequiredToggle.tsx`
- Test: `e2e/tests/portal-users.spec.ts`

- [ ] **Step 1: Escribir test que confirme que Mi perfil solo muestra seguridad personal**

```ts
test('mi perfil no expone la politica MFA global del tenant', async ({ page }) => {
  await setupAuthenticatedAdminMocks(page);
  await page.goto('/dashboard/profile');

  await expect(page.getByRole('heading', { name: /mi perfil/i })).toBeVisible();
  await expect(page.getByLabel(/activar mfa obligatorio/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Ejecutar el test y verificar que hoy falla**

Run: `pnpm exec playwright test e2e/tests/portal-users.spec.ts --config e2e/playwright.portal.local.config.ts`

Expected: FAIL porque `MfaRequiredToggle` sigue renderizando en `ProfileClient`.

- [ ] **Step 3: Quitar el estado y el bloque de politica global de `ProfileClient`**

```tsx
<div className="space-y-6">
  {alerts.length > 0 && <OnboardingAlerts alerts={alerts} />}
  <ChangePasswordForm />
</div>
```

- [ ] **Step 4: Ajustar el copy del header para que hable de datos personales y credenciales propias**

```tsx
<PageHeader
  title="Mi perfil"
  subtitle="Gestiona tu informacion personal y tus credenciales de acceso"
/>
```

- [ ] **Step 5: Reejecutar pruebas focalizadas del perfil y users**

Run: `pnpm --filter @iwana/portal exec jest --ci --runInBand -- ProfileClient.spec.tsx && pnpm exec playwright test e2e/tests/portal-users.spec.ts --config e2e/playwright.portal.local.config.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/profile/ProfileClient.tsx apps/portal/src/components/profile/MfaRequiredToggle.tsx e2e/tests/portal-users.spec.ts
git commit -m "refactor: sacar politica MFA global de mi perfil"
```

### Task 4: Deprecar la ruta `/dashboard/settings/security`

**Files:**

- Modify: `apps/portal/src/app/dashboard/settings/security/page.tsx`
- Modify: `apps/api/src/modules/configuration/services/settings-registry.service.ts`
- Modify: `apps/api/src/modules/configuration/configuration.controller.http.spec.ts`
- Test: `e2e/tests/portal-settings-empresa.spec.ts`
- Test: `e2e/tests/portal-settings-federated-shell.spec.ts`

- [ ] **Step 1: Escribir test del registry para el estado legado o ausencia de la seccion independiente**

```ts
expect(body).not.toContainEqual(
  expect.objectContaining({ key: SettingsSectionKey.SECURITY, route: '/dashboard/settings/security' }),
);
```

- [ ] **Step 2: Ejecutar test backend y confirmar fallo inicial**

Run: `pnpm --filter @iwana/api exec jest --ci --runInBand -- configuration.controller.http.spec.ts`

Expected: FAIL porque el registry aun publica SECURITY disponible.

- [ ] **Step 3: Implementar la redireccion legacy en la pagina portal**

```tsx
import { redirect } from 'next/navigation';

export default function SecuritySettingsPage() {
  redirect('/dashboard/settings/access#politicas-de-autenticacion');
}
```

- [ ] **Step 4: Ajustar el registry para que deje de anunciar la ruta independiente**

```ts
// eliminar SettingsSectionKey.SECURITY del listado AVAILABLE
// o marcarla como deprecated/not_configured segun decision final de DTO
```

- [ ] **Step 5: Migrar los E2E al nuevo entrypoint**

```ts
await page.goto('/dashboard/settings/access');
await expect(page.getByText('Politicas de autenticacion')).toBeVisible();
await page.getByLabel('Activar MFA obligatorio').check({ force: true });
```

- [ ] **Step 6: Ejecutar validacion del slice settings**

Run: `pnpm --filter @iwana/api exec jest --ci --runInBand -- configuration.controller.http.spec.ts && pnpm exec playwright test e2e/tests/portal-settings-empresa.spec.ts e2e/tests/portal-settings-federated-shell.spec.ts --config e2e/playwright.portal.local.config.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/portal/src/app/dashboard/settings/security/page.tsx apps/api/src/modules/configuration/services/settings-registry.service.ts apps/api/src/modules/configuration/configuration.controller.http.spec.ts e2e/tests/portal-settings-empresa.spec.ts e2e/tests/portal-settings-federated-shell.spec.ts
git commit -m "refactor: deprecar ruta security independiente"
```

### Task 5: Cierre, reporte y regresion focalizada

**Files:**

- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Test: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
- Test: `e2e/tests/portal-users.spec.ts`
- Test: `e2e/tests/portal-settings-empresa.spec.ts`

- [ ] **Step 1: Actualizar el informe vivo con resultado real de la ejecucion**

```md
### v1.xx — 2026-05-27 — Politica MFA global consolidada en Access

- `/dashboard/settings/access` ahora expone `Politicas de autenticacion`.
- `/dashboard/profile` conserva solo seguridad personal.
- `/dashboard/settings/security` queda deprecada mediante redirect legacy.
```

- [ ] **Step 2: Ejecutar la regresion focalizada completa**

Run: `pnpm --filter @iwana/portal exec jest --ci --runInBand -- AccessControlSettingsClient.spec.tsx ProfileClient.spec.tsx SettingsClient.spec.tsx && pnpm --filter @iwana/api exec jest --ci --runInBand -- configuration.controller.http.spec.ts && pnpm exec playwright test e2e/tests/portal-users.spec.ts e2e/tests/portal-settings-empresa.spec.ts e2e/tests/portal-settings-federated-shell.spec.ts --config e2e/playwright.portal.local.config.ts`

Expected: PASS.

- [ ] **Step 3: Revisar diff final antes de cerrar**

Run: `git --no-pager diff --stat && git --no-pager diff -- docs/adrs/ADR-045-Consolidacion-Politica-MFA-Global-en-Access.md docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md apps/portal/src/components/settings/AccessControlSettingsClient.tsx`

Expected: solo cambios del slice documentado.

- [ ] **Step 4: Commit**

```bash
git add docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
git commit -m "docs: cerrar consolidacion de MFA global en access"
```

---

## Self-review del plan

- Cobertura de spec: cubre decision documental, consolidacion UI, retiro del duplicado en perfil, deprecacion de ruta legacy y regresion de pruebas.
- Placeholder scan: no deja `TODO` ni referencias abstractas; cada tarea nombra archivos, pruebas y comandos.
- Consistencia: el owner visible final queda estable en Access para politica global, Users para cuentas y Profile para seguridad personal.
