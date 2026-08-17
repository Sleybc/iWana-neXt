# MOD00 Acceso — Pulido dirigido UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Use `subagent-driven-development` only when the user explicitly authorizes delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pulir `/dashboard/settings/access` para que la card sugerida única conserve una densidad correcta, el editor explique mejor la tarea y el pie de verificación en dos pasos sea legible en móvil, sin cambiar contratos funcionales.

**Architecture:** remediación exclusiva de composición y copy en el cliente portal existente. Se preservan la IA `header → perfiles/accesos → sugeridos → MFA`, las primitivas actuales y todos los contratos API. El cambio parte de la spec v1.4, la promueve a v1.5 y se ejecuta con TDD sobre Jest y Playwright.

**Tech Stack:** Next.js App Router, React 19, TypeScript estricto, Tailwind CSS v4, `@iwana/ui`, Jest, Testing Library, Playwright, axe y pnpm.

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-08-15  
**Módulo:** MOD00 Configuración / Acceso

---

## Fuentes rectoras

- `AGENTS.md`
- `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` v1.4 como baseline; v1.5 será el contrato de ejecución
- `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
- `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/prompts/PROMPT-MOD00-ACCESO-PULIDO-DIRIGIDO-UI-v1.0.md`

## Decisiones congeladas

1. La IA de la ruta no cambia.
2. Una sugerencia ocupa una columna responsive en desktop y ancho completo en mobile.
3. El perfil seleccionado se explica desde lo que la persona administradora puede revisar o cambiar.
4. El pie MFA se apila en mobile y vuelve a fila desde `sm`.
5. No se crean tokens, primitives, endpoints, migraciones ni contratos nuevos.
6. Los artefactos anteriores de densidad se conservan como historia; este plan no los reescribe.

## Mapa de archivos

**Crear:**

- `docs/plans/2026-08-15-mod00-acceso-pulido-dirigido-ui.md`
- `docs/prompts/PROMPT-MOD00-ACCESO-PULIDO-DIRIGIDO-UI-v1.0.md`

**Modificar durante la ejecución:**

- `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- `apps/portal/src/components/settings/mod00-settings-labels.ts`
- `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
- `e2e/tests/portal-settings-access-ui.spec.ts`
- `e2e/tests/portal-settings-access-ui.spec.ts-snapshots/access-{mobile,tablet,desktop}-{light,dark}-chromium-win32.png`
- `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

---

### Task 1: Congelar la spec v1.5

**Files:**

- Modify: `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`

- [ ] **Step 1: elevar la versión y registrar el propósito**

Cambiar la cabecera a `Version: 1.5`. En el historial final registrar que v1.5 añade card sugerida única contenida, copy orientado a tarea y footer MFA responsive.

- [ ] **Step 2: corregir contradicciones del contrato vigente**

Aplicar estas correcciones:

- búsqueda sin resultados y “sin accesos compatibles” usan `PortalEmptyState embedded`;
- retirar la fila `Eyebrow de card sugerida | Sugerido` del copy congelado;
- reemplazar la regla final `v1.3+` por `v1.5+`;
- documentar que la grilla siempre usa `md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, incluso con una card;
- documentar footer MFA apilado en mobile y en fila desde `sm`.

- [ ] **Step 3: añadir criterios de aceptación**

Añadir:

| ID           | Criterio                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| CA-ACC-UX-18 | Con una sugerencia, la card ocupa una columna responsive en desktop y ancho completo en mobile.                                      |
| CA-ACC-UX-19 | El editor muestra `Revisa lo que «{perfil}» puede/podrá ver o hacer en cada sección.` según sea perfil guardado o borrador.          |
| CA-ACC-UX-20 | En 390×844 la ayuda MFA queda encima del CTA, sin solape, y `Guardar política` ocupa el ancho disponible; desde `sm` vuelven a fila. |

- [ ] **Step 4: revisar la spec**

Verificar que no queden marcadores pendientes, referencias a v1.2/v1.3 como contrato activo ni instrucciones incompatibles con CTAs sugeridos apilados.

---

### Task 2: Publicar pruebas RED unitarias

**Files:**

- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`

- [ ] **Step 1: escribir RED para la grilla con una sugerencia**

Añadir un caso que configure `listProfiles` con un único perfil de sistema y compruebe:

```tsx
it('keeps a single suggested profile inside the responsive catalog grid', async () => {
  const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
    accessControlApi: { listProfiles: jest.Mock };
  };

  accessControlApi.listProfiles.mockResolvedValue([profiles.find((profile) => profile.isSystem)!]);
  useAuthMock.mockReturnValue({
    user: { id: 'admin-1', role: UserRole.ADMIN },
    isLoading: false,
  });

  render(<AccessControlSettingsClient />);

  const grid = (await screen.findByText('Administrador general')).closest('div.grid');
  expect(grid).not.toBeNull();
  expect(grid?.className).toContain('md:grid-cols-2');
  expect(grid?.className).toContain('lg:grid-cols-3');
  expect(grid?.className).toContain('xl:grid-cols-4');
});
```

- [ ] **Step 2: escribir RED para el copy del perfil seleccionado**

Después del render administrativo normal, comprobar:

```tsx
expect(
  await screen.findByText('Revisa lo que «Perfil noc lectura» puede ver o hacer en cada sección.'),
).toBeInTheDocument();
```

- [ ] **Step 3: escribir RED para el copy del borrador**

Abrir la creación desde `Administrador general` y comprobar:

```tsx
fireEvent.click(
  await screen.findByRole('button', {
    name: 'Crear a partir de este perfil Administrador general',
  }),
);

expect(
  await screen.findByText(
    'Revisa lo que «Basado en Administrador general» podrá ver o hacer en cada sección.',
  ),
).toBeInTheDocument();
```

- [ ] **Step 4: escribir RED para el footer MFA responsive**

Localizar el padre directo de `Guardar política` y comprobar:

```tsx
const savePolicy = await screen.findByRole('button', { name: 'Guardar política' });
const footer = savePolicy.parentElement;

expect(footer?.className).toContain('flex-col');
expect(footer?.className).toContain('items-stretch');
expect(footer?.className).toContain('sm:flex-row');
expect(footer?.className).toContain('sm:items-center');
expect(savePolicy.className).toContain('w-full');
expect(savePolicy.className).toContain('sm:w-auto');
```

- [ ] **Step 5: ejecutar RED**

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand
```

Expected: los casos nuevos fallan por clases y copy anteriores; los casos existentes permanecen verdes.

---

### Task 3: Implementar el pulido mínimo

**Files:**

- Modify: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/mod00-settings-labels.ts`

- [ ] **Step 1: hacer incondicional la grilla responsive**

Reemplazar el cálculo por:

```tsx
const templatesGridClassName = 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
```

No añadir `max-w-*`, estilos inline ni una rama específica para una sola card.

- [ ] **Step 2: actualizar el copy compartido**

En `ACCESS_SETTINGS_COPY` usar:

```tsx
selectedProfileDescription: (profileName: string) =>
  `Revisa lo que «${profileName}» puede ver o hacer en cada sección.`,
draftSelectedProfileDescription: (profileName: string) =>
  `Revisa lo que «${profileName}» podrá ver o hacer en cada sección.`,
```

Eliminar `templateEyebrow`; no modificar los demás textos congelados.

- [ ] **Step 3: hacer responsive el footer MFA**

Usar:

```tsx
<div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
  <p className="text-xs text-gray-500 dark:text-gray-400">
    {ACCESS_SETTINGS_COPY.authPolicyAdminHint}
  </p>
  <Button
    type="button"
    size="lg"
    className="w-full sm:w-auto"
    onClick={() => void handleSaveAuthenticationPolicy()}
    disabled={!tenantSettings || !isPolicyDirty || isPolicySaving}
    loading={isPolicySaving}
  >
    {ACCESS_SETTINGS_COPY.authPolicySaveAction}
  </Button>
</div>
```

- [ ] **Step 4: ejecutar GREEN unitario**

```powershell
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand
```

Expected: suite completa verde; actualmente el baseline es 51 tests y debe aumentar con los casos nuevos.

---

### Task 4: Añadir validación E2E observable

**Files:**

- Modify: `e2e/tests/portal-settings-access-ui.spec.ts`
- Modify: seis snapshots de Acceso

- [ ] **Step 1: validar una card sugerida en desktop**

En el escenario con una sola sugerencia y viewport 1440×900, obtener las cajas del panel y la card. Comprobar que la card queda dentro del panel y que su ancho es menor al 35% del ancho del panel.

```ts
const suggestedPanel = page
  .getByRole('heading', { name: 'Perfiles sugeridos' })
  .locator('xpath=ancestor::section[1]');
const suggestedCard = suggestedPanel
  .locator('div.rounded-2xl')
  .filter({ has: page.getByRole('button', { name: /Crear a partir de este perfil/ }) })
  .first();
const panelBox = await suggestedPanel.boundingBox();
const cardBox = await suggestedCard.boundingBox();

expect(cardBox).toBeTruthy();
expect(panelBox).toBeTruthy();
expect(cardBox!.width).toBeLessThan(panelBox!.width * 0.35);
expect(cardBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width);
```

Usar selectores accesibles existentes; no añadir `data-testid` solo para esta prueba.

- [ ] **Step 2: validar el footer MFA en mobile**

En 390×844, llevar `Guardar política` al viewport y comprobar con cajas observables que el botón aparece debajo del texto, no se solapa y ocupa al menos el 90% del ancho del panel:

```ts
const mfaPanel = page
  .getByRole('heading', { name: 'Verificación en dos pasos global' })
  .locator('xpath=ancestor::section[1]');
const hint = mfaPanel.getByText(
  'Este ajuste aplica a toda la empresa y solo puede cambiarlo un administrador.',
);
const savePolicy = mfaPanel.getByRole('button', { name: 'Guardar política' });
await savePolicy.scrollIntoViewIfNeeded();

const panelBox = await mfaPanel.boundingBox();
const hintBox = await hint.boundingBox();
const saveBox = await savePolicy.boundingBox();

expect(panelBox).toBeTruthy();
expect(hintBox).toBeTruthy();
expect(saveBox).toBeTruthy();
expect(saveBox!.y).toBeGreaterThanOrEqual(hintBox!.y + hintBox!.height);
expect(saveBox!.width).toBeGreaterThanOrEqual(panelBox!.width * 0.9);
```

- [ ] **Step 3: ejecutar E2E antes de actualizar capturas**

```powershell
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-ui.spec.ts
```

Expected: fallan únicamente assertions visuales/snapshots afectados.

- [ ] **Step 4: actualizar y confirmar snapshots**

```powershell
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-ui.spec.ts --update-snapshots
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-access-ui.spec.ts
```

Expected: las dos corridas terminan verdes; la segunda no modifica snapshots.

---

### Task 5: Gates y cierre documental

**Files:**

- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

- [ ] **Step 1: ejecutar gates**

```powershell
pnpm --filter @iwana/portal exec tsc --noEmit
pnpm --filter @iwana/portal exec eslint src/components/settings/AccessControlSettingsClient.tsx src/components/settings/mod00-settings-labels.ts src/components/settings/AccessControlSettingsClient.spec.tsx
pnpm --filter @iwana/portal exec jest src/components/settings/AccessControlSettingsClient.spec.tsx --runInBand --coverage --collectCoverageFrom=src/components/settings/AccessControlSettingsClient.tsx
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/settings/AccessControlSettingsClient.tsx
git diff --check
```

Expected:

- typecheck y lint sin errores;
- cobertura ≥80% en statements, branches, functions y lines;
- auditor UI con P0/P1 = 0;
- las dos heurísticas conocidas de `En edición`, si permanecen, se documentan como descartadas;
- `git diff --check` exit 0.

- [ ] **Step 2: actualizar el informe vivo a v1.67**

Registrar solo resultados observados: número final de tests, cobertura, E2E, axe, auditor y archivos de evidencia. No crear otro informe.

- [ ] **Step 3: revisar alcance del diff**

Confirmar que no hay cambios en backend, API, migraciones, tokens, `portal-ui.tsx`, Organización ni snapshots ajenos a Acceso. No crear commit ni publicar cambios salvo solicitud explícita del usuario.

## Criterio de salida

- CA-ACC-UX-01…20 verdes.
- Unit, E2E, axe, typecheck y lint verdes.
- Cobertura ≥80% en las cuatro métricas.
- Seis snapshots de Acceso revisados en claro/oscuro.
- Spec v1.5 e informe vivo v1.67 coherentes con la implementación.
- Sin cambios de API, backend, base de datos o design system global.
