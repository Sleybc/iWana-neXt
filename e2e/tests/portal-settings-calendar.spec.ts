import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

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
    code: 'NORTE',
    capabilities: [],
    isActive: true,
  },
];

const MOCK_SITE_DETAIL = {
  id: 'site-001',
  name: 'Sede Norte',
  code: 'NORTE',
  capabilities: [],
  isActive: true,
  siteType: 'OFFICE',
  address: 'Calle 10 # 1-20',
  municipality: null,
  department: null,
  isPrimary: true,
  businessHours: MOCK_COMPANY_HOURS,
  businessHoursResolved: MOCK_COMPANY_HOURS,
  businessHoursMode: 'BASE',
};

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
  await seedPortalSession(page, { token: buildAccessToken(), tenantSlug: MOCK_TENANT_SLUG });
}

function parseInputDate(value: string): Date | null {
  const [yearPart, monthPart, dayPart] = value.split('-');
  if (!yearPart || !monthPart || !dayPart) {
    return null;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function selectDateFromPicker(
  page: Page,
  scope: import('@playwright/test').Locator,
  triggerId: string,
  value: string,
) {
  const targetDate = parseInputDate(value);
  if (!targetDate) {
    throw new Error(`Fecha inválida para DatePicker: ${value}`);
  }

  const trigger = scope.locator(`#${triggerId}`).first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  const popover = page.locator('[data-state="open"][data-side]').last();
  await expect(popover).toBeVisible();

  const today = new Date();
  const monthDelta =
    (targetDate.getFullYear() - today.getFullYear()) * 12 +
    (targetDate.getMonth() - today.getMonth());

  if (monthDelta > 0) {
    for (let index = 0; index < monthDelta; index += 1) {
      await popover.getByRole('button', { name: /siguiente|next/i }).click();
    }
  }

  if (monthDelta < 0) {
    for (let index = 0; index < Math.abs(monthDelta); index += 1) {
      await popover.getByRole('button', { name: /anterior|previous/i }).click();
    }
  }

  const targetLabel = targetDate.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const escapedLabel = escapeRegExp(targetLabel);
  await popover.getByRole('button', { name: new RegExp(`\\b${escapedLabel}\\b`, 'i') }).click();
}

async function selectTimeFromPicker(page: Page, trigger: Locator, value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Hora inválida para TimeFieldSelect: ${value}`);
  }

  const [, hour, minute] = match;
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Selecciona una hora' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('listbox', { name: 'Hora' }).getByRole('option', { name: hour }).click();
  await dialog
    .getByRole('listbox', { name: 'Minutos' })
    .getByRole('option', { name: minute })
    .click();
  await expect(dialog).toBeHidden();
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

  await page.route('**/api/v1/access-control/me/effective-permissions', async (route) => {
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
  await page.route('**/api/v1/organization/business-hours/company', async (route) => {
    await assertTenantHeader(route);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_COMPANY_HOURS }),
    });
  });

  // Alias legacy conservado por specs antiguas
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

  await page.route('**/api/v1/organization/sites**', async (route) => {
    await assertTenantHeader(route);
    const url = route.request().url();
    if (/\/organization\/sites\/[^/?]+/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_SITE_DETAIL }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: MOCK_SITES,
        meta: { page: 1, limit: 100, total: MOCK_SITES.length, totalPages: 1 },
      }),
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

  await page.route('**/api/v1/organization/business-hours/exceptions**', async (route) => {
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
      body: JSON.stringify([]),
    });
  });

  // Usuarios para selector de eventualidades
  await page.route('**/api/v1/users*', async (route) => {
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
  await page.route('**/api/v1/wfm/operational-eventualities**', async (route) => {
    await assertTenantHeader(route);
    const url = route.request().url();
    const method = route.request().method();
    const pathname = new URL(url).pathname;

    if (pathname.endsWith('/status') && method === 'PATCH') {
      requestLog.eventualityStatusPatchCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { ...MOCK_EVENTUALITIES[0], status: 'confirmed' },
        }),
      });
      return;
    }

    if (/\/operational-eventualities\/[^/]+$/.test(pathname) && method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (method === 'POST') {
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
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: MOCK_EVENTUALITIES,
        meta: { page: 1, limit: 20, total: MOCK_EVENTUALITIES.length, totalPages: 1 },
      }),
    });
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

  test('ADMIN ve dos columnas independientes en desktop y conserva la lectura por columnas', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    await expect(page.getByRole('heading', { name: /calendario operativo/i })).toBeVisible({
      timeout: 10_000,
    });

    const shellGrid = page.getByTestId('calendar-shell-grid');
    const steps = ['1', '2', '3', '4'].map((step) => page.getByTestId(`calendar-step-${step}`));
    const organizationStep = steps[0]!;
    const siteStep = steps[1]!;
    const exceptionsStep = steps[2]!;
    const eventualitiesStep = steps[3]!;
    const organizationHeading = organizationStep.getByRole('heading', {
      name: 'Horario base de la empresa',
    });
    const exceptionsHeading = exceptionsStep.getByRole('heading', {
      name: 'Cierres por fecha y aperturas especiales',
    });
    const siteHeading = siteStep.getByRole('heading', { name: 'Horarios por sede' });
    const eventualitiesHeading = eventualitiesStep.getByRole('heading', {
      name: 'Cambios puntuales de disponibilidad',
    });

    await expect(shellGrid).toBeVisible({ timeout: 10_000 });
    await expect(organizationHeading).toBeVisible();
    await expect(exceptionsHeading).toBeVisible();
    await expect(siteHeading).toBeVisible();
    await expect(eventualitiesHeading).toBeVisible();

    const visualOrder = await shellGrid
      .locator('[data-testid^="calendar-step-"]')
      .evaluateAll((groups) =>
        groups
          .map((group) => ({
            id: group.getAttribute('data-testid'),
            rect: group.getBoundingClientRect(),
          }))
          .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left)
          .map((group) => group.id),
      );
    expect(visualOrder).toEqual([
      'calendar-step-1',
      'calendar-step-2',
      'calendar-step-3',
      'calendar-step-4',
    ]);

    const shellBox = await shellGrid.boundingBox();
    const organizationBox = await organizationStep.boundingBox();
    const siteBox = await siteStep.boundingBox();
    const exceptionsBox = await exceptionsStep.boundingBox();
    const eventualitiesBox = await eventualitiesStep.boundingBox();

    expect(shellBox).not.toBeNull();
    expect(organizationBox).not.toBeNull();
    expect(siteBox).not.toBeNull();
    expect(exceptionsBox).not.toBeNull();
    expect(eventualitiesBox).not.toBeNull();

    // Horario base de la empresa queda al lado izquierdo de la pantalla
    expect((organizationBox?.x ?? -1) < (siteBox?.x ?? -1)).toBe(true);
    // Cierres por fecha comparte columna con el horario base
    expect(Math.abs((exceptionsBox?.x ?? -1) - (organizationBox?.x ?? -1))).toBeLessThanOrEqual(2);
    // Cambios puntuales comparte columna con horarios por sede
    expect(Math.abs((eventualitiesBox?.x ?? -1) - (siteBox?.x ?? -1))).toBeLessThanOrEqual(2);
    // Horario base queda arriba de cierres
    expect((exceptionsBox?.y ?? -1) >= (organizationBox?.y ?? -1)).toBe(true);
    // Horarios por sede queda arriba de cambios puntuales
    expect((eventualitiesBox?.y ?? -1) >= (siteBox?.y ?? -1)).toBe(true);
    // Ambas columnas arrancan en la misma fila
    expect(Math.abs((siteBox?.y ?? -1) - (organizationBox?.y ?? -1))).toBeLessThanOrEqual(2);
    // Cada columna conserva únicamente su separación normal, sin vacío causado por la otra.
    expect(
      (exceptionsBox?.y ?? -1) - ((organizationBox?.y ?? -1) + (organizationBox?.height ?? 0)),
    ).toBeLessThanOrEqual(26);
    expect(
      (eventualitiesBox?.y ?? -1) - ((siteBox?.y ?? -1) + (siteBox?.height ?? 0)),
    ).toBeLessThanOrEqual(26);

    const organizationBefore = await organizationStep.boundingBox();
    const siteBefore = await siteStep.boundingBox();
    const exceptionsBefore = await exceptionsStep.boundingBox();
    const step4Before = await eventualitiesStep.boundingBox();
    await exceptionsStep.getByRole('button', { name: 'Registrar fecha especial' }).click();
    await expect(page.getByTestId('exception-form')).toBeVisible();
    // El click puede auto-desplazar la vista para exponer el botón; normalizamos el scroll
    // antes de comparar posiciones viewport-relativas.
    await page.evaluate(() => window.scrollTo(0, 0));

    const organizationAfter = await organizationStep.boundingBox();
    const siteAfter = await siteStep.boundingBox();
    const exceptionsAfter = await exceptionsStep.boundingBox();
    const step4After = await eventualitiesStep.boundingBox();
    expect(
      Math.abs((organizationAfter?.y ?? -1) - (organizationBefore?.y ?? -1)),
    ).toBeLessThanOrEqual(2);
    expect(Math.abs((siteAfter?.y ?? -1) - (siteBefore?.y ?? -1))).toBeLessThanOrEqual(2);
    expect((exceptionsAfter?.height ?? -1) > (exceptionsBefore?.height ?? -1)).toBe(true);
    // Cambios puntuales comparte fila con cierres: su posición vertical no cambia
    expect(Math.abs((step4After?.y ?? -1) - (step4Before?.y ?? -1))).toBeLessThanOrEqual(2);

    const focusOrder: string[] = [];
    await page
      .getByTestId('calendar-step-1')
      .locator('button:visible, input:visible, select:visible, textarea:visible, a:visible')
      .first()
      .focus();
    for (let index = 0; index < 180 && focusOrder.length < 4; index += 1) {
      const activeStep = await page.evaluate(
        () =>
          document.activeElement?.closest<HTMLElement>('[data-testid^="calendar-step-"]')?.dataset
            .testid,
      );
      if (activeStep && focusOrder.at(-1) !== activeStep) focusOrder.push(activeStep);
      if (focusOrder.length < 4) await page.keyboard.press('Tab');
    }
    expect(focusOrder).toEqual([
      'calendar-step-1',
      'calendar-step-3',
      'calendar-step-2',
      'calendar-step-4',
    ]);
  });

  test('ADMIN ve un selector de hora compacto sin columnas sobredimensionadas', async ({
    page,
  }) => {
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    const mondayStart = page.getByTestId('calendar-step-1').getByTestId('bh-opens-monday');
    await expect(mondayStart).toBeVisible({ timeout: 10_000 });

    await expect(mondayStart).toHaveAttribute('type', 'button');
    await expect(mondayStart).toHaveText(/07:00/);

    const triggerBox = await mondayStart.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(triggerBox?.width ?? 0).toBeLessThanOrEqual(96);

    await mondayStart.click();
    const dialog = page.getByRole('dialog', { name: 'Selecciona una hora' });
    await expect(dialog).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox?.width ?? 0).toBeLessThanOrEqual(192);
    expect(dialogBox?.height ?? 0).toBeLessThanOrEqual(200);

    await expect(
      page
        .getByTestId('calendar-step-1')
        .getByTestId('bh-layout-desktop')
        .getByText('Abierto', { exact: true }),
    ).toBeVisible();
  });

  test('la vista mobile mantiene el editor semanal usable y los formularios secundarios cerrados por defecto', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    await expect(page.getByTestId('bh-layout-mobile').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('exception-form')).not.toBeVisible();
    await expect(page.getByTestId('eventuality-form')).not.toBeVisible();

    const steps = ['1', '2', '3', '4'].map((step) => page.getByTestId(`calendar-step-${step}`));
    const boxes = await Promise.all(steps.map((step) => step.boundingBox()));
    expect(boxes.every((box) => box !== null)).toBe(true);
    expect((boxes[0]?.y ?? -1) < (boxes[1]?.y ?? -1)).toBe(true);
    expect((boxes[1]?.y ?? -1) < (boxes[2]?.y ?? -1)).toBe(true);
    expect((boxes[2]?.y ?? -1) < (boxes[3]?.y ?? -1)).toBe(true);
  });

  test('ADMIN ve la tabla de eventualidades con datos existentes', async ({ page }) => {
    await setAdminSession(page);
    await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    // Esperar a que cargue la tabla de eventualidades
    await expect(page.getByTestId('eventualities-table')).toBeVisible({ timeout: 10_000 });

    // La eventualidad de fixture debe aparecer
    const eventualitiesTable = page.getByTestId('eventualities-table');
    await expect(eventualitiesTable.getByText('Disponibilidad extra')).toBeVisible();
    await expect(eventualitiesTable.getByText('Carlos Técnico')).toBeVisible();
  });

  test('ADMIN puede registrar una nueva eventualidad operativa', async ({ page }) => {
    await setAdminSession(page);
    const requestLog = await setupCalendarMocks(page);

    await page.goto('/dashboard/settings/calendar');

    // Esperar botón de registrar
    await expect(page.getByTestId('add-eventuality-btn')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('add-eventuality-btn').click();

    const eventualityForm = page.getByTestId('eventuality-form');

    // Llenar formulario
    await eventualityForm.getByRole('combobox', { name: 'Tipo de ajuste *' }).click();
    await page.getByRole('option', { name: 'Disponibilidad extra' }).click();

    await eventualityForm.getByRole('combobox', { name: 'Persona afectada *' }).click();
    await page.getByRole('option', { name: 'Carlos Técnico' }).click();

    await selectDateFromPicker(page, eventualityForm, 'eventuality-starts-at-id', '2026-05-25');
    await selectTimeFromPicker(
      page,
      eventualityForm.getByTestId('eventuality-starts-at-time'),
      '07:00',
    );

    await selectDateFromPicker(page, eventualityForm, 'eventuality-ends-at-id', '2026-05-25');
    await selectTimeFromPicker(
      page,
      eventualityForm.getByTestId('eventuality-ends-at-time'),
      '09:00',
    );

    await page.getByTestId('eventuality-reason').fill('Refuerzo de emergencia');

    await page.getByTestId('save-eventuality-btn').click();

    // Verificar que se hizo la llamada al API
    await expect(page.getByText('Cambio puntual registrado.')).toBeVisible({ timeout: 5_000 });
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
    await expect(
      page.getByRole('heading', { name: 'Cambios puntuales de disponibilidad' }),
    ).toBeVisible({ timeout: 10_000 });

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
    await expect(
      page.getByRole('heading', { name: 'Cambios puntuales de disponibilidad' }),
    ).toBeVisible({ timeout: 10_000 });

    expect(requestLog.legacyOperatingSiteRequests).toBe(0);
  });
});
