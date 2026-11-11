import { expect, test, type Page, type Route } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

// UI real con API y sesión interceptadas: no valida persistencia ni autorización del servidor.
const TENANT = 'qa-plan-change-synthetic';
const CONTRACT_ID = '00000000-0000-4000-8000-000000000051';
const VERSION = '2026-10-30T10:00:00.000Z';
const oldPlan = {
  name: 'Fibra sintética 100',
  technology: 'FTTH',
  basePrice: 50000,
  downloadSpeedMbps: 100,
  uploadSpeedMbps: 50,
};
const newPlan = {
  name: 'Fibra sintética 300',
  technology: 'FTTH',
  basePrice: 80000,
  downloadSpeedMbps: 300,
  uploadSpeedMbps: 150,
};

async function installFixture(page: Page, status: 'DRAFT' | 'ACTIVE') {
  const actor = {
    sub: 'qa-plan-user',
    role: 'ADMIN',
    tenantId: 'qa-plan-tenant',
    schemaName: 'tenant_qa_plan_synthetic',
    type: 'tenant',
  };
  const payload = Buffer.from(
    JSON.stringify({ ...actor, exp: Math.floor(Date.now() / 1000) + 900 }),
  ).toString('base64url');
  const token = `eyJhbGciOiJSUzI1NiJ9.${payload}.synthetic`;
  const subscriber = {
    id: 'qa-plan-subscriber',
    personType: 'NATURAL',
    firstName: 'Cliente',
    lastName: 'Sintético',
    documentType: 'CC',
    documentNumber: '0000000051',
    customerSegment: 'RESIDENTIAL',
    status: 'ACTIVE',
    hasLiveContracts: status === 'ACTIVE',
    privacyRestricted: false,
    contactPending: false,
    anonymizedAt: null,
    createdAt: VERSION,
    updatedAt: VERSION,
  };
  let contract = {
    id: CONTRACT_ID,
    tenantId: actor.tenantId,
    subscriberId: subscriber.id,
    quoteId: null,
    planId: 'qa-plan-old',
    planSnapshotJson: oldPlan,
    status,
    alias: 'Servicio sintético',
    customerSegment: 'RESIDENTIAL',
    serviceUsage: 'RESIDENTIAL',
    installationStratum: 3,
    installationAddress: null,
    installationCity: null,
    installationDepartment: null,
    installationPostalCode: null,
    installationNotes: null,
    stratumEvidenceMediaId: null,
    titularAnonymizedAt: null,
    vatSnapshot: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    deletedAt: null,
    createdAt: VERSION,
    updatedAt: VERSION,
  };
  const changes: unknown[] = [];
  const otherMutations: string[] = [];
  async function fulfill(route: Route, data: unknown) {
    await route.fulfill({
      json: {
        data,
        total: Array.isArray(data) ? data.length : 1,
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          nextCursor: null,
          capabilities: { randomAccess: true, sortableFields: [] },
        },
      },
    });
  }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/crm/billing-cycles')) return route.fulfill({ json: [] });
    if (path.endsWith('/auth/refresh')) return fulfill(route, { accessToken: token });
    if (path.endsWith('/auth/me')) return fulfill(route, actor);
    if (path.endsWith('/users/qa-plan-user'))
      return fulfill(route, {
        id: actor.sub,
        firstName: 'Usuario',
        lastName: 'Sintético',
        role: 'ADMIN',
      });
    if (path.endsWith('/tenants/me'))
      return fulfill(route, {
        id: actor.tenantId,
        name: 'Tenant sintético QA',
        slug: TENANT,
        status: 'ACTIVE',
      });
    if (path.endsWith('/effective-permissions'))
      return fulfill(route, {
        effectivePermissions: ['crm.subscribers.read', 'crm.subscribers.manage', 'privacy.read'],
        isAdmin: true,
      });
    if (path.endsWith('/crm/subscribers/qa-plan-subscriber/360'))
      return fulfill(route, {
        subscriber,
        contacts: [],
        contracts: [contract],
        quotes: [],
        habeasData: [],
        arcoRequests: [],
        privacyMarks: [],
        timelineSeed: [],
        expedienteSummary: null,
      });
    if (path.endsWith('/commercial/plans/search')) {
      expect(url.searchParams.get('isActive')).toBe('true');
      expect(request.headers()['x-tenant-slug']).toBe(TENANT);
      return fulfill(route, [{ id: 'qa-plan-new', label: newPlan.name }]);
    }
    if (path.endsWith('/commercial/catalog/qa-plan-new/price')) {
      expect(url.searchParams.get('segment')).toBe('RESIDENTIAL');
      return fulfill(route, { basePrice: '80000.00' });
    }
    if (path.endsWith('/commercial/catalog/qa-plan-new'))
      return fulfill(route, {
        id: 'qa-plan-new',
        ...newPlan,
        currentPrice: '80000',
        isActive: true,
      });
    if (path.endsWith(`/crm/contracts/${CONTRACT_ID}/plan-change`)) {
      expect(request.method()).toBe('POST');
      expect(request.headers()['x-tenant-slug']).toBe(TENANT);
      changes.push(request.postDataJSON());
      contract = {
        ...contract,
        planId: 'qa-plan-new',
        planSnapshotJson: newPlan,
        updatedAt: '2026-10-30T10:01:00.000Z',
      };
      return fulfill(route, contract);
    }
    if (path.endsWith(`/crm/contracts/${CONTRACT_ID}`)) return fulfill(route, contract);
    if (request.method() !== 'GET' && request.method() !== 'OPTIONS')
      otherMutations.push(`${request.method()} ${path}`);
    return fulfill(route, []);
  });
  await seedPortalSession(page, { token, tenantSlug: TENANT });
  await page.goto('/dashboard/crm/subscribers/qa-plan-subscriber?tab=servicios');
  // Spec MOD05 UISP §3 E: «Ver detalle» navega a la página del contrato (antes, panel lateral).
  await page.getByRole('button', { name: 'Ver detalle' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/crm/subscribers/qa-plan-subscriber/services/${CONTRACT_ID}$`),
  );
  const detail = page.getByRole('main');
  await expect(detail.getByRole('heading', { level: 1, name: 'Servicio Sintético' })).toBeVisible();
  await detail.getByRole('button', { name: 'Editar contrato' }).click();
  // cacheComponents conserva la ficha previa oculta en el DOM (Activity): las aserciones de
  // texto se acotan a la región visible del plan, no a todo `main`.
  const planRegion = detail.getByRole('region', { name: 'Plan contratado' });
  return { changes, otherMutations, detail, planRegion };
}

for (const status of ['DRAFT', 'ACTIVE'] as const) {
  test(`${status}: compara y confirma el plan con API simulada, actualiza detalle y tarjeta`, async ({
    page,
  }) => {
    const fixture = await installFixture(page, status);
    await fixture.detail.getByRole('button', { name: 'Cambiar plan', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar plan', exact: true });
    // K3c punto 5: el selector precarga el plan vigente (spec E:22).
    await expect(dialog.getByRole('combobox', { name: 'Nuevo plan' })).toHaveValue(oldPlan.name);
    const confirm = dialog.getByRole('button', { name: 'Confirmar cambio de plan' });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('combobox', { name: 'Nuevo plan' }).fill('Fibra');
    await dialog.getByRole('option', { name: newPlan.name }).click();
    await expect(dialog.getByRole('heading', { name: 'Plan actual' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Plan seleccionado' })).toBeVisible();
    await expect(dialog.getByText(newPlan.name, { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Bajada: 300 Mbps. Subida: 150 Mbps')).toBeVisible();
    await expect(dialog.getByText(/80[.]000\/mes/)).toBeVisible();
    await expect(
      dialog.getByText(/Las facturas ya emitidas conservarán sus valores/),
    ).toBeVisible();
    await confirm.click();
    await expect(dialog).toBeHidden();
    expect(fixture.changes).toEqual([
      { planId: 'qa-plan-new', expectedUpdatedAt: VERSION, expectedMonthlyPrice: 80000 },
    ]);
    expect(fixture.otherMutations).toEqual([]);
    await expect(fixture.planRegion.getByText(newPlan.name, { exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`plan-change-${status.toLowerCase()}.png`),
      fullPage: true,
    });
    // En página, Cancelar/Guardar van arriba y abajo (spec MOD05 UISP §2): se usa el primero.
    await fixture.detail.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
    await expect(fixture.detail.getByRole('button', { name: 'Editar contrato' })).toBeVisible();
    await fixture.detail.getByRole('link', { name: 'Volver a servicios' }).click();
    await expect(page).toHaveURL(
      /\/dashboard\/crm\/subscribers\/qa-plan-subscriber\?tab=servicios/,
    );
    // La tarjeta del servicio refleja el plan nuevo.
    const services = page.getByRole('region', { name: 'Servicios contratados' });
    await expect(services.getByText(newPlan.name, { exact: true })).toBeVisible();
    await expect(services.getByText(oldPlan.name, { exact: true })).toHaveCount(0);
  });
}

test('cancelar conserva el plan y los campos pendientes bloquean cambio sin guardado parcial', async ({
  page,
}) => {
  const fixture = await installFixture(page, 'ACTIVE');
  await fixture.detail.getByRole('button', { name: 'Cambiar plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar plan', exact: true });
  await dialog.getByRole('combobox', { name: 'Nuevo plan' }).fill('Fibra');
  await dialog.getByRole('option', { name: newPlan.name }).click();
  await expect(dialog.getByText(newPlan.name, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(fixture.planRegion.getByText(oldPlan.name, { exact: true })).toBeVisible();
  await fixture.detail.getByLabel('Alias del servicio').fill('Alias pendiente sintético');
  await expect(
    fixture.detail.getByRole('button', { name: 'Cambiar plan', exact: true }),
  ).toBeDisabled();
  await expect(
    fixture.detail.getByText('Guarda o cancela los cambios pendientes antes de cambiar el plan.'),
  ).toBeVisible();
  expect(fixture.changes).toEqual([]);
  expect(fixture.otherMutations).toEqual([]);
});
