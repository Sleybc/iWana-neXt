# MOD05 Identificacion Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar la seccion Identificacion de MOD05 para diferenciar persona natural y juridica, mostrar documento solo en detalle autorizado y bloquear la edicion tras guardar con reapertura explicita.

**Architecture:** Se mantiene la seccion `Identificacion` dentro del expediente unico y se extiende de forma aditiva el modelo de datos del tenant. El backend pasa a ser la fuente de verdad para derivar `fullName`, validar por `personType`, cifrar `documentNumber` y exponer un campo de lectura autorizado solo en detalle. El frontend cambia de formulario siempre editable a un patron lectura/edicion con selector dinamico de campos y bloqueo posterior al guardado.

**Tech Stack:** NestJS, Next.js App Router, TypeScript, TypeORM, PostgreSQL multi-tenant por schema, Jest, Playwright.

---

## File Map

```text
Backend:
  packages/database/src/migrations/tenant/
    022_add_expediente_identification_refinement.ts          [CREATE]
  apps/api/src/modules/crm/expedientes/
    entities/expediente-record.entity.ts                     [MODIFY]
    dto/update-section.dto.ts                                [MODIFY]
    expediente.service.ts                                    [MODIFY]
    tests/expediente.service.spec.ts                         [MODIFY]
    tests/expediente-boundary-dto.spec.ts                    [MODIFY]

Frontend:
  apps/portal/src/lib/api-client.ts                          [MODIFY]
  apps/portal/src/components/crm/expedientes/expediente-ui.ts [MODIFY]
  apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx [MODIFY]

E2E:
  e2e/tests/portal-crm-expedientes.spec.ts                   [MODIFY]

Docs:
  docs/informes/INFORME-MOD05-DEFINICION-v1.0.md             [MODIFY]
```

---

### Task 1: Base de datos y entidad aditiva para Identificacion

**Files:**

- Create: `packages/database/src/migrations/tenant/022_add_expediente_identification_refinement.ts`
- Modify: `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`

- [ ] **Step 1: Write the failing service test for new identification fields**

Add a red test in `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts` that expects `updateSection(identification)` to persist the new fields.

```ts
it('persiste campos nuevos de identificacion para persona juridica', async () => {
  const updated = await service.updateSection(
    'exp-legal',
    {
      section: ExpedienteSection.IDENTIFICATION,
      data: {
        personType: 'PERSONA_JURIDICA',
        companyName: 'Empresa Demo SAS',
        primaryContactName: 'Laura Perez',
        primaryContactRole: 'Representante legal',
        documentType: 'NIT',
        documentNumber: '900123456',
      },
    },
    'user-1',
  );

  expect(updated.companyName).toBe('Empresa Demo SAS');
  expect(updated.primaryContactName).toBe('Laura Perez');
  expect(updated.primaryContactRole).toBe('Representante legal');
});
```

- [ ] **Step 2: Run the targeted service test to verify failure**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: FAIL because the entity and update mapping do not yet include the new fields.

- [ ] **Step 3: Add the tenant migration**

Create `packages/database/src/migrations/tenant/022_add_expediente_identification_refinement.ts` following the style of `020_add_mod05_expediente_hardening.ts`.

Minimal migration behavior:

```ts
await qr.query(`
  ALTER TABLE expediente_records
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(160)
`);
await qr.query(`
  ALTER TABLE expediente_records
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(160)
`);
await qr.query(`
  ALTER TABLE expediente_records
  ADD COLUMN IF NOT EXISTS primary_contact_name VARCHAR(160)
`);
await qr.query(`
  ALTER TABLE expediente_records
  ADD COLUMN IF NOT EXISTS primary_contact_role VARCHAR(120)
`);
```

Do not backfill values in this migration; keep it additive. Add an exported `rollbackMigration(dataSource)` in the same file that drops only these four columns with `DROP COLUMN IF EXISTS` per tenant schema so the migration is explicitly reversible for controlled rollback scenarios.

- [ ] **Step 4: Add the new entity columns**

Modify `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts` to add:

```ts
@Column({ type: 'varchar', length: 160, name: 'first_name', nullable: true })
firstName: string | null;

@Column({ type: 'varchar', length: 160, name: 'last_name', nullable: true })
lastName: string | null;

@Column({ type: 'varchar', length: 160, name: 'primary_contact_name', nullable: true })
primaryContactName: string | null;

@Column({ type: 'varchar', length: 120, name: 'primary_contact_role', nullable: true })
primaryContactRole: string | null;
```

Place them in the Identificacion section near `personType` and `companyName`.

- [ ] **Step 5: Re-run the targeted service test**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: still FAIL, but now for service mapping/validation rather than missing properties.

---

### Task 2: Backend validation and server-side derivation for Identificacion

**Files:**

- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/dto/update-section.dto.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente-boundary-dto.spec.ts`

- [ ] **Step 1: Write the failing tests for personType validation and fullName derivation**

Add these tests to `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`:

```ts
it('deriva fullName desde firstName y lastName para persona natural', async () => {
  const updated = await service.updateSection(
    'exp-natural',
    {
      section: ExpedienteSection.IDENTIFICATION,
      data: {
        personType: 'PERSONA_NATURAL',
        firstName: 'Laura',
        lastName: 'Perez',
        documentType: 'CC',
        documentNumber: '1012345678',
      },
    },
    'user-1',
  );

  expect(updated.fullName).toBe('Laura Perez');
  expect(updated.companyName).toBeNull();
});

it('rechaza persona juridica sin contacto principal ni cargo', async () => {
  await expect(
    service.updateSection(
      'exp-invalid',
      {
        section: ExpedienteSection.IDENTIFICATION,
        data: {
          personType: 'PERSONA_JURIDICA',
          companyName: 'Empresa Demo SAS',
          documentType: 'NIT',
          documentNumber: '900123456',
        },
      },
      'user-1',
    ),
  ).rejects.toThrow('Contacto principal');
});

it('redacta documentNumber en auditoria al actualizar identificacion', async () => {
  await service.updateSection(
    'exp-audit',
    {
      section: ExpedienteSection.IDENTIFICATION,
      data: {
        personType: 'PERSONA_NATURAL',
        firstName: 'Laura',
        lastName: 'Perez',
        documentType: 'CC',
        documentNumber: '1012345678',
      },
    },
    'user-1',
  );

  expect(auditServiceMock.log).toHaveBeenCalledWith(
    expect.objectContaining({
      newValue: expect.not.objectContaining({
        data: expect.objectContaining({ documentNumber: '1012345678' }),
      }),
    }),
  );
});
```

Add one DTO boundary test in `apps/api/src/modules/crm/expedientes/tests/expediente-boundary-dto.spec.ts` to confirm `UpdateSectionBodyDto` keeps new identification fields intact through the Nest validation pipe.

- [ ] **Step 2: Run the targeted tests to verify failure**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente-boundary-dto.spec.ts`

Expected: FAIL because `buildSectionUpdate()` still accepts free-form `fullName` and does not validate by `personType`.

- [ ] **Step 3: Implement minimal server-side validation and normalization**

In `apps/api/src/modules/crm/expedientes/expediente.service.ts`, replace the `ExpedienteSection.IDENTIFICATION` branch with a dedicated helper.

Target shape:

```ts
case ExpedienteSection.IDENTIFICATION:
  return this.buildIdentificationSectionUpdate(data);
```

Add a helper that:

- normalizes `personType`, `documentType`, and all text inputs with `sanitizePlainText()`;
- accepts only `PERSONA_NATURAL` or `PERSONA_JURIDICA`;
- accepts only `CC`, `CE`, `TI`, `NIT`, `PASAPORTE`, `PEP`, `PPT`, `OTRO` for `documentType`;
- requires `documentNumber` for both person types;
- requires `firstName` + `lastName` for natural;
- requires `companyName` + `primaryContactName` + `primaryContactRole` for juridica;
- derives `fullName` on the server;
- nulls incompatible fields when the type changes;
- encrypts `documentNumber` only when a plain value is present.
- sanitizes the audit payload so `documentNumber` is never stored in plain text when `updateSection()` logs `newValue`.

Recommended helper outline:

```ts
private buildIdentificationSectionUpdate(data: Record<string, unknown>): Record<string, unknown> {
  const personType = this.requireAllowedValue(data.personType, ['PERSONA_NATURAL', 'PERSONA_JURIDICA']);
  const documentType = this.requireAllowedValue(data.documentType, DOCUMENT_TYPE_OPTIONS);
  const documentNumber = this.requireNonEmptyText(data.documentNumber, 'Numero de documento');

  if (personType === 'PERSONA_NATURAL') {
    const firstName = this.requireNonEmptyText(data.firstName, 'Nombres');
    const lastName = this.requireNonEmptyText(data.lastName, 'Apellidos');
    return {
      personType,
      firstName,
      lastName,
      companyName: null,
      primaryContactName: null,
      primaryContactRole: null,
      documentType,
      documentNumberEncrypted: this.encryptValue(documentNumber),
      fullName: `${firstName} ${lastName}`.trim(),
    };
  }

  const companyName = this.requireNonEmptyText(data.companyName, 'Razon social');
  const primaryContactName = this.requireNonEmptyText(data.primaryContactName, 'Contacto principal');
  const primaryContactRole = this.requireNonEmptyText(data.primaryContactRole, 'Cargo del contacto');
  return {
    personType,
    firstName: null,
    lastName: null,
    companyName,
    primaryContactName,
    primaryContactRole,
    documentType,
    documentNumberEncrypted: this.encryptValue(documentNumber),
    fullName: companyName,
  };
}
```

Add tiny private helpers if needed for allowed values / required strings, but keep them local to this service.

- [ ] **Step 4: Re-run the targeted tests**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente-boundary-dto.spec.ts`

Expected: PASS.

---

### Task 3: Backend detail contract for authorized document visibility

**Files:**

- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

- [ ] **Step 1: Write the failing detail/list PII tests**

Add tests to `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`:

```ts
it('expone documentNumber en detalle autorizado', async () => {
  const result = await service.findById('exp-1');
  expect((result as any).documentNumber).toBe('900123456');
});

it('sigue ocultando documentNumber en listados', async () => {
  const result = await service.findAll({ page: 1, limit: 10 });
  expect((result.data[0] as any).documentNumber).toBeUndefined();
  expect(result.data[0].documentNumberEncrypted).toBeNull();
});

it('audita acceso autorizado al documento visible sin persistir el valor plano', async () => {
  await service.findById('exp-1');

  expect(auditServiceMock.log).toHaveBeenCalledWith(
    expect.objectContaining({
      action: expect.anything(),
      entityId: 'exp-1',
    }),
  );
  expect(auditServiceMock.log).not.toHaveBeenCalledWith(
    expect.objectContaining({
      newValue: expect.objectContaining({ documentNumber: '900123456' }),
    }),
  );
});
```

- [ ] **Step 2: Run the targeted service test to verify failure**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: FAIL because `findById()` currently returns only the encrypted field.

- [ ] **Step 3: Implement the minimal authorized detail contract**

In `apps/api/src/modules/crm/expedientes/expediente.service.ts`:

- keep list sanitization as-is for PII fields;
- in `findById()`, after loading the entity, derive a non-persisted `documentNumber` property from `documentNumberEncrypted`;
- do not null `documentNumberEncrypted` in detail if other code still depends on it, but prefer to keep the plain value in a new additive property;
- make sure no audit payload or logs include the plain number.
- add an explicit audit trace for authorized detail access to sensitive PII without storing the plain document value.

Minimal pattern:

```ts
if (entity.documentNumberEncrypted) {
  (entity as ExpedienteRecord & { documentNumber?: string }).documentNumber = this.decryptValue(
    entity.documentNumberEncrypted,
  );
}
```

If needed, define a local response type or widen the shared portal contract in Task 4, but keep persistence unchanged.

Use a dedicated audit entry for detail access, for example an `AuditAction.UPDATE` or equivalent action available in the repo, with metadata semantica como `piiAccess: 'documentNumber'`, pero nunca el valor plano.

- [ ] **Step 4: Re-run the targeted service test**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: PASS.

---

### Task 4: Portal contract and helper metadata for Identificacion

**Files:**

- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/crm/expedientes/expediente-ui.ts`

- [ ] **Step 1: Write the failing E2E expectation for detail data visibility**

In `e2e/tests/portal-crm-expedientes.spec.ts`, add a new expectation that the detail view shows the document number text and the person type dependent labels.

```ts
await expect(page.getByText('Número de documento')).toBeVisible();
await expect(page.getByText('900123456')).toBeVisible();
```

- [ ] **Step 2: Run the E2E spec to verify failure**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: FAIL because the frontend contract/UI does not yet use a visible `documentNumber` field in Identificacion.

- [ ] **Step 3: Update the portal API contract and UI helpers**

In `apps/portal/src/lib/api-client.ts`, extend `ExpedienteRecord` with the additive properties:

```ts
documentNumber?: string | null;
firstName?: string | null;
lastName?: string | null;
primaryContactName?: string | null;
primaryContactRole?: string | null;
```

In `apps/portal/src/components/crm/expedientes/expediente-ui.ts`, add helper metadata for:

- person type labels;
- document type labels;
- optional helper to decide whether an identification section should start locked.

Keep these as focused exported helpers, not a large stateful abstraction.

- [ ] **Step 4: Re-run the E2E spec**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: still FAIL, now at the actual detail rendering/edit state.

---

### Task 5: Detail UI - dynamic Identificacion by person type

**Files:**

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

- [ ] **Step 1: Write the failing UI/E2E expectations for conditional fields**

Expand `e2e/tests/portal-crm-expedientes.spec.ts` with two cases:

```ts
test('identificacion muestra nombres y apellidos para persona natural', async ({ page }) => {
  await expect(page.getByLabel('Nombres')).toBeVisible();
  await expect(page.getByLabel('Apellidos')).toBeVisible();
  await expect(page.getByLabel('Razón social')).toHaveCount(0);
});

test('identificacion muestra razon social y contacto principal para persona juridica', async ({
  page,
}) => {
  await expect(page.getByLabel('Razón social')).toBeVisible();
  await expect(page.getByLabel('Nombre del contacto principal')).toBeVisible();
  await expect(page.getByLabel('Cargo del contacto')).toBeVisible();
});
```

Use route fixtures or mutable mock payloads in the existing spec to exercise both person types.

- [ ] **Step 2: Run the E2E spec to verify failure**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: FAIL because the detail section still renders the old generic inputs.

- [ ] **Step 3: Implement the minimal dynamic identification editor**

In `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`:

- extend `FIELD_LABELS`, `FIELD_PLACEHOLDERS`, `SECTIONS`, and `buildDraftValues()` for the new identification fields;
- stop using the generic `section.fields.map(...)` rendering for `identification`; branch to a dedicated renderer for this section only;
- render a `select` for `personType`;
- render a `select` for `documentType` using the approved catalogue;
- render natural/juridica specific inputs conditionally;
- when `personType` changes, clear incompatible local fields immediately (`companyName`, `primaryContactName`, `primaryContactRole` vs `firstName`, `lastName`);
- use `draftValues.documentNumber` from the new plain detail field instead of the old protected placeholder behavior;
- remove the helper text that suggests the document is hidden in this view.

Recommended shape:

```tsx
if (section.id === 'identification') {
  return renderIdentificationSection({
    expediente,
    draftValues,
    onChange: handleDraftChange,
  });
}
```

Keep the specialized rendering local to this file unless it becomes too large.

- [ ] **Step 4: Re-run the E2E spec**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: PASS for dynamic field visibility, but the lock/edit toggle will still fail until Task 6.

---

### Task 6: Detail UI - locked-after-save editing flow

**Files:**

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `e2e/tests/portal-crm-expedientes.spec.ts`

- [ ] **Step 1: Write the failing E2E flow for save-lock-edit-cancel**

Add a flow test:

```ts
test('identificacion se bloquea despues de guardar y solo reabre con editar', async ({ page }) => {
  await page.getByRole('button', { name: /editar identificación/i }).click();
  await page.getByLabel('Nombres').fill('Laura');
  await page.getByRole('button', { name: /guardar sección/i }).click();

  await expect(page.getByLabel('Nombres')).toHaveCount(0);
  await expect(page.getByText('Laura')).toBeVisible();

  await page.getByRole('button', { name: /editar identificación/i }).click();
  await expect(page.getByLabel('Nombres')).toBeVisible();
});
```

Also add a cancel assertion proving the original persisted values are restored.

- [ ] **Step 2: Run the E2E spec to verify failure**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: FAIL because the section remains editable after save and has no explicit edit toggle.

- [ ] **Step 3: Implement the minimal lock/edit/cancel state**

In `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`:

- add local state such as `editableSections` or `isIdentificationEditing`;
- initialize Identificacion in locked mode when persisted data exists;
- show a read-only presentation by default;
- add a button with pencil icon and accessible label `Editar identificación`;
- show `Guardar sección` and `Cancelar` only in edit mode;
- after successful save, call `loadExpediente()` and return to locked mode;
- on cancel, rebuild draft values from the last loaded expediente.

Do not change this behavior for all sections yet; scope it to `identification` only.

- [ ] **Step 4: Re-run the E2E spec**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: PASS.

---

### Task 7: Verification and living documentation update

**Files:**

- Modify: `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

- [ ] **Step 1: Run focused backend tests**

Run: `pnpm --filter @iwana/api test -- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts apps/api/src/modules/crm/expedientes/tests/expediente-boundary-dto.spec.ts apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run backend build/type verification**

Run: `pnpm --filter @iwana/api build`

Expected: PASS.

- [ ] **Step 3: Run database package verification**

Run: `pnpm --filter @iwana/db build`

Expected: PASS.

- [ ] **Step 4: Run portal build verification**

Run: `pnpm --filter @iwana/portal build`

Expected: PASS.

- [ ] **Step 5: Run the targeted CRM E2E spec**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`

Expected: PASS.

- [ ] **Step 6: Update the MOD05 living report with implementation evidence**

Append a new subsection to `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md` describing:

- migration 022 and new identification columns;
- dynamic natural/juridica flow;
- document visibility limited to detail;
- locked-after-save behavior;
- commands executed and results;
- explicit evidence of the concrete architectural document action taken for the model change: either a MOD05 addendum/spec update created during this work or a clearly recorded follow-up artifact path agreed for immediate execution.

Use concrete file references and evidence only; no generic prose.
