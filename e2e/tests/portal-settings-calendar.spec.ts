import { expect, test, type Page } from '@playwright/test';

// ─── Constantes ──────────────────────────────────────────────────────────────

const MOCK_TENANT_SLUG = 'isp-calendar-demo';
const MOCK_TENANT_ID = 'tenant-calendar-demo';
const MOCK_SCHEMA_NAME = 'tenant_calendar_demo';
const MOCK_USER_ID = 'user-admin-calendar';

const MOCK_PUBLIC_BRANDING = {
  displayName: 'ISP Calendar Demo',
  showTenantName: true,
  logoLightUrl: null,
  logoDarkUrl: null,
  sealLightUrl: null,
  sealDarkUrl: null,
  faviconLightUrl: null,
  faviconDarkUrl: null,
  loginBackgroundLightUrl: null,
  loginBackgroundDarkUrl: null,
};

const MOCK_USERS = [
  {
    id: 'tech-001',
    email: 'tecnico@isp-calendar-demo.test',
    role: 'TECHNICIAN',
    status: 'ACTIVE',
    tenantId: MOCK_TENANT_ID,
    mfaEnabled: false,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Carlos',
    lastName: 'Técnico',
    phone: null,
    jobTitle: 'Técnico de campo',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  },
];

const MOCK_COMPANY_HOURS = [
  { weekday: 'MONDAY', isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'TUESDAY', isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'WEDNESDAY', isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'THURSDAY', isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'FRIDAY', isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: 'SATURDAY', isOpen: false, opensAt: null, closesAt: null },
  { weekday: 'SUNDAY', isOpen: false, opensAt: null, closesAt: null },
];

const MOCK_SITES = [
  {
    id: 'site-001',
    name: 'Sede Norte',
    address: 'Calle 10 # 1-20',
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    isActive: true,
    useCompanyHours: true,
  },
];

const MOCK_EXCEPTIONS = [
  {
    id: 'exc-001',
    name: 'Día de Fundación',
    exceptionDate: '2026-08-07',
    isOpen: false,
    isRecurring: true,
    opensAt: null,
    closesAt: null,
    organizationSiteId: null,
  },
];

const MOCK_OPERATING_HOURS = {
  startTime: '07:00',
  endTime: '17:00',
  timezone: 'America/Bogota',
  days: MOCK_COMPANY_HOURS,
};

const MOCK_EVENTUALITIES = [
  {
    id: 'ev-001',
    tenantId: MOCK_TENANT_ID,
    userId: 'tech-001',
    organizationSiteId: null,
    type: 'extra_availability',
    status: 'pending',
    startsAt: '2026-05-24T07:00:00.000Z',
    endsAt: '2026-05-24T09:00:00.000Z',
    reason: 'Refuerzo matutino',
    origin: null,
    requiresHrReview: false,
    createdById: MOCK_USER_ID,
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAccessToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: MOCK_USER_ID,
      email: 'hash-admin-calendar',
      role: 'ADMIN',
      tenantId: MOCK_TENANT_ID,
      schemaName: MOCK_SCHEMA_NAME,
      jti: 'jti-admin-calendar',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');

  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

async function setAdminSession(page: Page) {
  await page.goto('/auth/login');
  await page.evaluate(
    ({ token, slug }) => {
      localStorage.setItem('iwana.portal.access-token', token);
      localStorage.setItem('iwana.portal.tenant-slug', slug);
    },
    { token: buildAccessToken(), slug: MOCK_TENANT_SLUG },
  );
}

async function setupCalendarMocks(page: Page) {
  const requestLog = {
    legacyOperatingSiteRequests: 0,
    eventualityCreateCalls: 0,
    eventualityStatusPatchCalls: 0,
  };

  const assertTenantHeader = async (
    route: Parameters<Page['route']>[1] extends infer T
      ? T extends (route: infer R, ...args: never[]) => unknown
        ? R
        : never
      : never,
  ) => {
    const headers = await route.request().allHeaders();
    expect(headers['x-tenant-slug']).toBe(MOCK_TENANT_SLUG);
  };

  // Auth / identity
  await page.route('**/api/v1/auth/me', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          sub: MOCK_USER_ID,
          email: 'hash-admin-calendar',
          role: 'ADMIN',
          tenantId: MOCK_TENANT_ID,
          schemaName: MOCK_SCHEMA_NAME,
          type: 'tenant',
          passwordResetRequired: false,
        },
      }),
    });
  });

  await page.route('**/api/v1/tenants/public-branding*', async (route) => {
    const slug = new URL(route.request().url()).searchParams.get('slug');
    await route.fulfill({
      status: slug === MOCK_TENANT_SLUG ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(
        slug === MOCK_TENANT_SLUG
          ? { data: MOCK_PUBLIC_BRANDING }
          : { code: 'TENANT_NOT_FOUND', message: 'Tenant no encontrado' },
      ),
    });
  });

  await page.route(`**/api/v1/users/${MOCK_USER_ID}`, async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: MOCK_USER_ID,
          email: 'admin@isp-calendar-demo.test',
          role: 'ADMIN',
          status: 'ACTIVE',
          tenantId: MOCK_TENANT_ID,
          mfaEnabled: true,
          mfaRequired: false,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Ana',
          lastName: 'Admin',
          phone: null,
          jobTitle: 'Administración',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        },
      }),
    });
  });

  await page.route('**/api/v1/access-control/users/*/effective-permissions', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          userId: MOCK_USER_ID,
          role: 'ADMIN',
          effectivePermissions: ['settings.read'],
          recoveryPermissions: [],
          profileSources: [],
        },
      }),
    });
  });

  // Tenant info
  await page.route('**/api/v1/tenants/me', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          id: MOCK_TENANT_ID,
          name: 'ISP Calendar Demo',
          slug: MOCK_TENANT_SLUG,
          status: 'ACTIVE',
          contactEmail: 'admin@isp-calendar-demo.test',
          legalName: 'ISP Calendar Demo S.A.S.',
          nit: '900000001',
          nitDv: '1',
          city: 'Bogotá',
          department: 'Cundinamarca',
          countryCode: 'CO',
          phone: '+573001112233',
          website: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          logoLightUrl: null,
          logoLightAssetId: null,
          logoDarkUrl: null,
          logoDarkAssetId: null,
          sealLightUrl: null,
          sealLightAssetId: null,
          sealDarkUrl: null,
          sealDarkAssetId: null,
          faviconLightUrl: null,
          faviconLightAssetId: null,
          faviconDarkUrl: null,
          faviconDarkAssetId: null,
          loginBackgroundLightUrl: null,
          loginBackgroundLightAssetId: null,
          loginBackgroundDarkUrl: null,
          loginBackgroundDarkAssetId: null,
        },
      }),
    });
  });

  await page.route('**/api/v1/tenants/me/settings', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          timezone: 'America/Bogota',
          currency: 'COP',
          language: 'es-CO',
          country: 'CO',
          features: { billing: false, mfa_required_all: false },
        },
      }),
    });
  });

  // Settings registry
  await page.route('**/api/v1/configuration/settings-sections', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            key: 'calendar',
            label: 'Calendario operativo y jornadas',
            description:
              'Administra el horario base, horarios por sede, festivos y eventualidades operativas.',
            ownerModule: 'MOD00 / MOD09',
            status: 'AVAILABLE',
            route: '/dashboard/settings/calendar',
            requiredPermissions: ['settings.read'],
          },
          {
            key: 'organization',
            label: 'Organización',
            description: 'Perfil, sedes y configuración del tenant.',
            ownerModule: 'MOD00',
            status: 'AVAILABLE',
            route: '/dashboard/settings/organization',
            requiredPermissions: ['settings.read'],
          },
          {
            key: 'field_operations',
            label: 'Operación de campo',
            description: 'Configuración técnica WFM.',
            ownerModule: 'MOD09',
            status: 'AVAILABLE',
            route: '/dashboard/settings/field-operations',
            requiredPermissions: ['settings.read'],
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/audit-logs*', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  // Calendar — organización horarios
  await page.route('**/api/v1/organization/company-hours', async (route) => {
    await assertTenantHeader(route);
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_COMPANY_HOURS }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_COMPANY_HOURS }),
      });
    }
  });

  await page.route('**/api/v1/organization/sites', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_SITES }),
    });
  });

  await page.route('**/api/v1/organization/sites/*/business-hours', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_COMPANY_HOURS }),
    });
  });

  await page.route('**/api/v1/organization/business-hours/exceptions', async (route) => {
    await assertTenantHeader(route);
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'exc-new',
            ...body,
            organizationSiteId: null,
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_EXCEPTIONS }),
      });
    }
  });

  await page.route('**/api/v1/organization/business-hours/exceptions/*', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({ status: 204, body: '' });
  });

  // WFM — ventana técnica (operating hours manager)
  await page.route('**/api/v1/wfm/business-hours/company', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_COMPANY_HOURS),
    });
  });

  await page.route('**/api/v1/wfm/operating-sites/*/business-hours', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_COMPANY_HOURS),
    });
  });

  await page.route('**/api/v1/wfm/dispatch-sites', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/wfm/technicians/business-hours*', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/v1/wfm/holiday-blackouts', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_OPERATING_HOURS),
    });
  });

  // Usuarios para selector de eventualidades
  await page.route('**/api/v1/users?*', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          data: MOCK_USERS,
          meta: { nextCursor: null, total: MOCK_USERS.length },
        },
      }),
    });
  });

  // Eventualidades operativas
  await page.route('**/api/v1/wfm/operational-eventualities', async (route) => {
    await assertTenantHeader(route);
    if (route.request().method() === 'POST') {
      requestLog.eventualityCreateCalls += 1;
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'ev-new',
            tenantId: MOCK_TENANT_ID,
            userId: body['userId'],
            organizationSiteId: null,
            type: body['type'],
            status: 'pending',
            startsAt: body['startsAt'],
            endsAt: body['endsAt'],
            reason: body['reason'] ?? null,
            origin: body['origin'] ?? null,
            requiresHrReview: body['requiresHrReview'] ?? false,
            createdById: MOCK_USER_ID,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EVENTUALITIES),
      });
    }
  });

  await page.route('**/api/v1/wfm/operational-eventualities/*/status', async (route) => {
    await assertTenantHeader(route);
    requestLog.eventualityStatusPatchCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { ...MOCK_EVENTUALITIES[0], status: 'confirmed' },
      }),
    });
  });

  await page.route('**/api/v1/wfm/operational-eventualities/*', async (route) => {
    await assertTenantHeader(route);
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
    } else {
      await route.fulfill({ status: 404, body: '' });
    }
  });

  // Bloquear endpoint legacy
  await page.route('**/api/v1/wfm/operating-sites', async (route) => {
    requestLog.legacyOperatingSiteRequests += 1;
    await route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Legacy operating-sites endpoint not expected' }),
    });
  });

  return requestLog;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('portal-settings-calendar', () => {
  test('ADMIN navega desde /dashboard/settings a Calendario operativo y jornadas', async ({
    page,
  }) => {
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings');

    await expect(page.getByText('Calendario operativo y jornadas')).toBeVisible({
      timeout: 10_000,
    });

    const calendarLink = page
      .getByRole('link', { name: /calendario operativo y jornadas/i })
      .first();
    await calendarLink.click();

    await expect(page).toHaveURL(/\/dashboard\/settings\/calendar/, { timeout: 10_000 });
  });

  test('ADMIN ve los paneles principales en /dashboard/settings/calendar', async ({ page }) => {
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    // Título de la página
    await expect(page.getByRole('heading', { name: /calendario operativo/i })).toBeVisible({
      timeout: 10_000,
    });

    // Paneles principales visibles
    await expect(page.getByText('Horario base empresa')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Eventualidades operativas')).toBeVisible({ timeout: 10_000 });
  });

  test('ADMIN ve la tabla de eventualidades con datos existentes', async ({ page }) => {
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    // Esperar a que cargue la tabla de eventualidades
    await expect(page.getByTestId('eventualities-table')).toBeVisible({ timeout: 10_000 });

    // La eventualidad de fixture debe aparecer
    await expect(page.getByText('Disponibilidad extra')).toBeVisible();
    await expect(page.getByText('Refuerzo matutino')).toBeVisible();
  });

  test('ADMIN puede registrar una nueva eventualidad operativa', async ({ page }) => {
    await setAdminSession(page);
    const requestLog = await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    // Esperar botón de registrar
    await expect(page.getByTestId('add-eventuality-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('add-eventuality-btn').click();

    // Llenar formulario
    await page.getByTestId('eventuality-type-select').selectOption('extra_availability');
    await page.getByTestId('eventuality-user-select').selectOption('tech-001');
    await page.getByTestId('eventuality-starts-at').fill('2026-05-25T07:00');
    await page.getByTestId('eventuality-ends-at').fill('2026-05-25T09:00');
    await page.getByTestId('eventuality-reason').fill('Refuerzo de emergencia');

    await page.getByTestId('save-eventuality-btn').click();

    // Verificar que se hizo la llamada al API
    await expect(page.getByText('Eventualidad registrada.')).toBeVisible({ timeout: 5_000 });
    expect(requestLog.eventualityCreateCalls).toBe(1);
  });

  test('ADMIN puede confirmar una eventualidad pendiente', async ({ page }) => {
    await setAdminSession(page);
    const requestLog = await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    await expect(page.getByTestId('confirm-eventuality-ev-001')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('confirm-eventuality-ev-001').click();

    await expect(async () => {
      expect(requestLog.eventualityStatusPatchCalls).toBe(1);
    }).toPass({ timeout: 5_000 });
  });

  test('no aparecen flujos de licencias, incapacidades, vacaciones ni permisos', async ({
    page,
  }) => {
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    // Esperar carga de la página
    await expect(page.getByText('Eventualidades operativas')).toBeVisible({ timeout: 10_000 });

    // Estos términos NO deben aparecer en el calendario operativo
    await expect(page.getByText(/licencia/i)).not.toBeVisible();
    await expect(page.getByText(/incapacidad/i)).not.toBeVisible();
    await expect(page.getByText(/vacacion/i)).not.toBeVisible();
    await expect(page.getByText(/permiso personal/i)).not.toBeVisible();
  });

  test('el endpoint legacy operating-sites no se llama desde /calendar', async ({ page }) => {
    await setAdminSession(page);
    const requestLog = await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    // Esperar carga completa
    await expect(page.getByText('Eventualidades operativas')).toBeVisible({ timeout: 10_000 });

    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
  });
});
