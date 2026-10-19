import { expect, test, type Page, type Route } from '@playwright/test';

type SubscriberStatus = 'PROSPECT' | 'ACTIVE' | 'SUSPENDED';
type ContractStatus = 'ACTIVE' | 'SUSPENDED';
type LifecycleAction = 'SUSPEND' | 'REACTIVATE';

type SubscriberFixture = {
  id: string;
  personType: 'NATURAL';
  customerSegment: 'RESIDENTIAL';
  documentType: 'CC';
  documentNumber: string;
  firstName: string;
  lastName: string;
  status: SubscriberStatus;
  hasLiveContracts: boolean;
  stratum: number;
  privacyRestricted: boolean;
  anonymizedAt: null;
  anonymizedRequestId: null;
  contactPending: boolean;
  createdAt: string;
  updatedAt: string;
};

type ContractFixture = {
  id: string;
  tenantId: string;
  quoteId: null;
  subscriberId: string;
  planId: string;
  planSnapshotJson: { name: string };
  status: ContractStatus;
  statusReasonCode: string | null;
  statusChangedAt: string | null;
  titularAnonymizedAt: null;
  alias: string;
  installationAddress: null;
  installationCity: null;
  installationDepartment: null;
  installationPostalCode: null;
  installationNotes: null;
  customerSegment: null;
  serviceUsage: null;
  installationStratum: null;
  stratumEvidenceMediaId: null;
  vatSnapshot: null;
  additionalProductIds: string[];
  additionalServiceIds: string[];
  paymentMethod: null;
  billingCycle: null;
  fiscalName: null;
  fiscalDocument: null;
  fiscalAddress: null;
  startDate: null;
  endDate: null;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
};

type PreviewRequest = {
  action: LifecycleAction;
  reasonCode: string;
  contractIds?: string[];
};

type LifecycleCommand = {
  reasonCode: string;
  contractIds?: string[];
};

const API_META = {
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
  nextCursor: null,
  capabilities: { randomAccess: true, sortableFields: [] },
};

const CONTRACT_ALPHA_ID = '00000000-0000-4000-8000-000000000011';
const CONTRACT_BETA_ID = '00000000-0000-4000-8000-000000000012';

function buildSubscriber(
  id: string,
  firstName: string,
  lastName: string,
  documentNumber: string,
  status: SubscriberStatus,
  hasLiveContracts: boolean,
): SubscriberFixture {
  return {
    id,
    personType: 'NATURAL',
    customerSegment: 'RESIDENTIAL',
    documentType: 'CC',
    documentNumber,
    firstName,
    lastName,
    status,
    hasLiveContracts,
    stratum: 3,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    contactPending: false,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
  };
}

function buildContract(
  id: string,
  subscriberId: string,
  alias: string,
  status: ContractStatus,
): ContractFixture {
  return {
    id,
    tenantId: 'tenant-synthetic',
    quoteId: null,
    subscriberId,
    planId: `plan-${id}`,
    planSnapshotJson: { name: alias },
    status,
    statusReasonCode: status === 'SUSPENDED' ? 'MORA' : null,
    statusChangedAt: status === 'SUSPENDED' ? '2026-10-19T10:00:00.000Z' : null,
    titularAnonymizedAt: null,
    alias,
    installationAddress: null,
    installationCity: null,
    installationDepartment: null,
    installationPostalCode: null,
    installationNotes: null,
    customerSegment: null,
    serviceUsage: null,
    installationStratum: null,
    stratumEvidenceMediaId: null,
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
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    deletedAt: null,
  };
}

async function fulfill(route: Route, data: unknown, total = 1): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data,
      meta: { ...API_META, total, totalPages: total ? 1 : 0 },
    }),
  });
}

async function installSyntheticPortalSession(
  page: Page,
  handleApiRequest: (route: Route, pathname: string) => Promise<void>,
): Promise<void> {
  const tokenPayload = Buffer.from(
    JSON.stringify({
      sub: 'qa-user',
      role: 'ADMIN',
      tenantId: 'tenant-synthetic',
      schemaName: 'tenant_synthetic',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');
  const accessToken = `eyJhbGciOiJSUzI1NiJ9.${tokenPayload}.synthetic`;

  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith('/auth/refresh')) {
      await fulfill(route, { accessToken });
      return;
    }
    if (pathname.endsWith('/auth/me')) {
      await fulfill(route, {
        sub: 'qa-user',
        role: 'ADMIN',
        tenantId: 'tenant-synthetic',
        schemaName: 'tenant_synthetic',
        type: 'tenant',
      });
      return;
    }
    if (pathname.endsWith('/access-control/me/effective-permissions')) {
      await fulfill(route, {
        effectivePermissions: ['crm.subscribers.read', 'crm.subscribers.manage', 'privacy.read'],
        isAdmin: true,
      });
      return;
    }
    if (pathname.endsWith('/users/qa-user')) {
      await fulfill(route, {
        id: 'qa-user',
        firstName: 'Usuario',
        lastName: 'Sintético',
        role: 'ADMIN',
      });
      return;
    }
    if (pathname.endsWith('/tenants/me')) {
      await fulfill(route, {
        id: 'tenant-synthetic',
        name: 'Tenant sintético',
        slug: 'tenant-synthetic',
        status: 'ACTIVE',
      });
      return;
    }

    await handleApiRequest(route, pathname);
  });

  await page.context().addCookies([
    {
      name: 'portalAccessToken',
      value: accessToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,
    },
  ]);
  await page.addInitScript(() =>
    localStorage.setItem('iwana.portal.tenant-slug', 'tenant-synthetic'),
  );
}

function buildSubscriber360(subscriber: SubscriberFixture, contracts: ContractFixture[] = []) {
  return {
    subscriber,
    contacts: [],
    contracts,
    quotes: [],
    habeasData: [],
    arcoRequests: [],
    privacyMarks: [],
    timelineSeed: [],
    expedienteSummary: null,
  };
}

test('la búsqueda exacta refleja hasLiveContracts y el portal bloquea la cancelación con servicios vivos', async ({
  page,
}) => {
  const prospect = buildSubscriber(
    'qa-prospect',
    'Prospecto',
    'Sintético',
    '0000000001',
    'PROSPECT',
    false,
  );
  const liveSubscriber = buildSubscriber(
    'qa-live',
    'Cliente',
    'Sintético',
    '0000000002',
    'ACTIVE',
    true,
  );
  let exactSearchPayload: unknown;
  let statusPatchCount = 0;

  await installSyntheticPortalSession(page, async (route, pathname) => {
    const method = route.request().method();
    if (pathname.endsWith('/crm/subscribers/search') && method === 'POST') {
      exactSearchPayload = route.request().postDataJSON();
      await fulfill(route, [prospect]);
      return;
    }
    if (pathname.endsWith('/crm/subscribers/qa-prospect/360')) {
      await fulfill(route, buildSubscriber360(prospect));
      return;
    }
    if (pathname.endsWith('/crm/subscribers/qa-live/360')) {
      await fulfill(
        route,
        buildSubscriber360(liveSubscriber, [
          buildContract(CONTRACT_ALPHA_ID, liveSubscriber.id, 'Servicio vivo Alfa', 'ACTIVE'),
        ]),
      );
      return;
    }
    if (pathname.endsWith('/crm/subscribers/qa-live/status') && method === 'PATCH') {
      statusPatchCount += 1;
    }
    await fulfill(route, []);
  });

  await page.goto('/dashboard/crm/subscribers?mode=document');
  const documentMode = page.getByRole('radio', { name: 'Documento', exact: true });
  await expect(documentMode).toBeVisible();
  await documentMode.click();
  await page.getByRole('searchbox').fill('0000000001');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();

  await expect(page.getByText('Coincidencia exacta · 1 resultado', { exact: true })).toBeVisible();
  await expect(page.getByText('Sin servicios vigentes', { exact: true })).toBeVisible();
  expect(exactSearchPayload).toEqual({ documentNumber: '0000000001' });

  await page.getByRole('link', { name: /Prospecto Sintético/u }).click();
  await expect(page.getByRole('heading', { name: 'Prospecto Sintético' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suspender servicios', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Cambiar estado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Suspendido', exact: true })).toHaveCount(0);

  await page.goto('/dashboard/crm/subscribers/qa-live');
  await expect(page.getByRole('heading', { name: 'Cliente Sintético' })).toBeVisible();
  await page.getByRole('button', { name: 'Más acciones', exact: true }).click();
  const cancelItem = page.getByRole('menuitem', { name: 'Cancelar suscriptor', exact: true });
  await expect(cancelItem).toBeDisabled();
  await expect(
    page.getByText('Termina primero todos los servicios vigentes para cancelar al suscriptor.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(statusPatchCount).toBe(0);
});

test('permite revisar la suspensión total y reactivar solo el servicio seleccionado', async ({
  page,
}) => {
  const subscriberId = 'qa-lifecycle';
  const state: { status: 'ACTIVE' | 'SUSPENDED'; contracts: ContractFixture[] } = {
    status: 'ACTIVE',
    contracts: [
      buildContract(CONTRACT_ALPHA_ID, subscriberId, 'Servicio hogar Alfa', 'ACTIVE'),
      buildContract(CONTRACT_BETA_ID, subscriberId, 'Servicio hogar Beta', 'ACTIVE'),
    ],
  };
  const previewRequests: PreviewRequest[] = [];
  const suspendCommands: LifecycleCommand[] = [];
  const reactivateCommands: LifecycleCommand[] = [];

  const hasLiveContracts = () =>
    state.contracts.some((contract) => contract.status !== 'TERMINATED');
  const subscriber360 = () =>
    buildSubscriber360(
      buildSubscriber(
        subscriberId,
        'Cliente',
        'Ciclo de Vida',
        '0000000010',
        state.status,
        hasLiveContracts(),
      ),
      state.contracts.map((contract) => ({ ...contract })),
    );

  await installSyntheticPortalSession(page, async (route, pathname) => {
    const method = route.request().method();
    if (pathname.endsWith(`/crm/subscribers/${subscriberId}/360`)) {
      await fulfill(route, subscriber360());
      return;
    }
    if (
      pathname.endsWith(`/crm/subscribers/${subscriberId}/services/preview`) &&
      method === 'POST'
    ) {
      const request = route.request().postDataJSON() as PreviewRequest;
      previewRequests.push(request);
      const requestedIds = request.contractIds ?? state.contracts.map((contract) => contract.id);
      const fromStatus = request.action === 'SUSPEND' ? 'ACTIVE' : 'SUSPENDED';
      const toStatus = request.action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
      await fulfill(route, {
        action: request.action,
        affectedContracts: requestedIds.map((id) => ({ id, fromStatus, toStatus })),
        subscriberStatus: {
          from: state.status,
          to: request.action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE',
        },
        hasLiveContracts: hasLiveContracts(),
        warnings: [],
      });
      return;
    }
    if (
      pathname.endsWith(`/crm/subscribers/${subscriberId}/services/suspend`) &&
      method === 'POST'
    ) {
      const command = route.request().postDataJSON() as LifecycleCommand;
      suspendCommands.push(command);
      const affectedIds = new Set(command.contractIds ?? []);
      state.contracts = state.contracts.map((contract) =>
        affectedIds.has(contract.id) ? { ...contract, status: 'SUSPENDED' } : contract,
      );
      state.status = 'SUSPENDED';
      await fulfill(route, { updated: affectedIds.size });
      return;
    }
    if (
      pathname.endsWith(`/crm/subscribers/${subscriberId}/services/reactivate`) &&
      method === 'POST'
    ) {
      const command = route.request().postDataJSON() as LifecycleCommand;
      reactivateCommands.push(command);
      const affectedIds = new Set(command.contractIds ?? []);
      state.contracts = state.contracts.map((contract) =>
        affectedIds.has(contract.id) ? { ...contract, status: 'ACTIVE' } : contract,
      );
      state.status = state.contracts.some((contract) => contract.status === 'ACTIVE')
        ? 'ACTIVE'
        : 'SUSPENDED';
      await fulfill(route, { updated: affectedIds.size });
      return;
    }
    await fulfill(route, []);
  });

  await page.goto(`/dashboard/crm/subscribers/${subscriberId}`);
  await expect(page.getByRole('heading', { name: 'Cliente Ciclo de Vida' })).toBeVisible();
  await page.getByRole('button', { name: 'Suspender servicios', exact: true }).click();

  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Suspender servicios' })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Motivo *' }).click();
  await page.getByRole('option', { name: 'Mora en el pago', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ver vista previa', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Revisa el cambio' })).toBeVisible();
  await expect(dialog.getByText('Se suspenderán 2 servicios.', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('El suscriptor quedará Suspendido.', { exact: true }),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Suspender servicios' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(suspendCommands).toHaveLength(0);

  await page.getByRole('button', { name: 'Suspender servicios', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Motivo *' }).click();
  await page.getByRole('option', { name: 'Mora en el pago', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ver vista previa', exact: true }).click();
  await expect(dialog.getByText('Se suspenderán 2 servicios.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Suspender 2 servicios', exact: true }).click();

  await expect(page.getByText('Servicios suspendidos', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reactivar servicios', exact: true }),
  ).toBeVisible();
  expect(state.status).toBe('SUSPENDED');
  expect(state.contracts.map((contract) => contract.status)).toEqual(['SUSPENDED', 'SUSPENDED']);
  expect(previewRequests.slice(0, 2)).toEqual([
    {
      action: 'SUSPEND',
      reasonCode: 'MORA',
      contractIds: [CONTRACT_ALPHA_ID, CONTRACT_BETA_ID],
    },
    {
      action: 'SUSPEND',
      reasonCode: 'MORA',
      contractIds: [CONTRACT_ALPHA_ID, CONTRACT_BETA_ID],
    },
  ]);
  expect(suspendCommands).toEqual([
    { reasonCode: 'MORA', contractIds: [CONTRACT_ALPHA_ID, CONTRACT_BETA_ID] },
  ]);

  await page.getByRole('button', { name: 'Reactivar servicios', exact: true }).click();
  dialog = page.getByRole('dialog');
  const betaCheckbox = dialog.getByRole('checkbox', { name: /Servicio hogar Beta/u });
  await expect(betaCheckbox).toBeChecked();
  await betaCheckbox.uncheck();
  await expect(dialog.getByRole('checkbox', { name: /Servicio hogar Alfa/u })).toBeChecked();
  await expect(betaCheckbox).not.toBeChecked();
  await dialog.getByRole('combobox', { name: 'Motivo *' }).click();
  await page.getByRole('option', { name: 'Pago registrado', exact: true }).click();
  await dialog.getByRole('button', { name: 'Ver vista previa', exact: true }).click();
  await expect(dialog.getByText('Se reactivarán 1 servicio.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('El suscriptor quedará Activo.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Reactivar 1 servicio', exact: true }).click();

  await expect(page.getByText('Servicios reactivados', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Suspender servicios', exact: true }),
  ).toBeVisible();
  expect(state.status).toBe('ACTIVE');
  expect(state.contracts.map((contract) => contract.status)).toEqual(['ACTIVE', 'SUSPENDED']);
  expect(previewRequests[2]).toEqual({
    action: 'REACTIVATE',
    reasonCode: 'PAGO_REGISTRADO',
    contractIds: [CONTRACT_ALPHA_ID],
  });
  expect(reactivateCommands).toEqual([
    { reasonCode: 'PAGO_REGISTRADO', contractIds: [CONTRACT_ALPHA_ID] },
  ]);
});
