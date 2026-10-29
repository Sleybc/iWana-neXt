import { expect, test, type Page, type Route } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-admin-uuid-001',
      email: 'sha256:admin-hash-ficticio',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-001',
      schemaName: 'tenant_prueba',
      jti: 'jti-test-001',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const TENANT = 'tenant-prueba';
const PARTY_ID = '11111111-1111-4111-8111-111111111111';
const SUBSCRIBER_ID = '22222222-2222-4222-8222-222222222222';
const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const LEGAL_TEXT_ID = '66666666-6666-4666-8666-666666666666';
const SHA256 = 'a'.repeat(64);

type MockRequestDetail = {
  request: {
    id: string;
    partyId: string | null;
    requesterKind: 'TITULAR';
    kind: 'CONSULTA' | 'SUPLANTACION';
    right: 'CONOCER';
    purpose: null;
    status: 'RADICADA' | 'EN_TRAMITE' | 'RESUELTA' | 'NO_PROCEDENTE';
    receivedAt: string;
    completeAt: string | null;
    dueAt: string;
    impersonationComplaintDueAt: string | null;
    suspendedContractIds: string[];
    extendedUntil: string | null;
    infoRequiredAt: string | null;
    desistAt: string | null;
    responseText: string | null;
    responseChannel: 'EMAIL' | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    transferredTo: string | null;
    legalBasis: 'SOLICITANTE_NO_LEGITIMADO' | null;
    identityStatus: 'PENDIENTE' | 'VERIFICADA';
    identityVerificationMethod: 'DOCUMENTO_PRESENCIAL' | null;
    identityVerifiedAt: string | null;
    hasRequesterEvidence: boolean;
    requester: { name: string; documentType: 'CC'; document: string; contact: string } | null;
  };
  events: Array<{
    id: string;
    fromStatus: 'RADICADA' | 'EN_TRAMITE' | null;
    toStatus: 'RADICADA' | 'EN_TRAMITE' | 'RESUELTA';
    reason: string | null;
    occurredAt: string;
  }>;
  tasks: [];
};

function makeDetail(kind: 'CONSULTA' | 'SUPLANTACION' = 'CONSULTA'): MockRequestDetail {
  return {
    request: {
      id: REQUEST_ID,
      partyId: kind === 'SUPLANTACION' ? PARTY_ID : null,
      requesterKind: 'TITULAR',
      kind,
      right: 'CONOCER',
      purpose: null,
      status: 'RADICADA',
      receivedAt: '2026-10-14T14:00:00.000Z',
      completeAt: null,
      dueAt: '2026-10-28',
      transferDueAt: '2026-10-16',
      transferredLate: null,
      erasedAt: null,
      erasureCategories: [],
      impersonationComplaintDueAt: null,
      suspendedContractIds: [],
      extendedUntil: null,
      infoRequiredAt: null,
      desistAt: null,
      responseText: null,
      responseChannel: null,
      resolvedAt: null,
      resolvedBy: null,
      transferredTo: null,
      legalBasis: null,
      identityStatus: 'PENDIENTE',
      identityVerificationMethod: null,
      identityVerifiedAt: null,
      hasRequesterEvidence: false,
      requester: null,
    },
    events: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        fromStatus: null,
        toStatus: 'RADICADA',
        reason: null,
        occurredAt: '2026-10-14T14:00:00.000Z',
      },
    ],
    tasks: [],
  };
}

function makeSummary(kind: 'CONSULTA' | 'SUPLANTACION' = 'CONSULTA') {
  return {
    id: REQUEST_ID,
    kind,
    right: 'CONOCER',
    purpose: null,
    status: 'RADICADA',
    receivedAt: '2026-10-14T14:00:00.000Z',
    dueAt: '2026-10-28',
    extendedUntil: null,
    isOverdue: false,
    transferDueAt: '2026-10-16',
    transferredLate: null,
    erasedAt: null,
    erasureCategories: [],
  };
}

function subscriber360() {
  return {
    subscriber: {
      id: SUBSCRIBER_ID,
      tenantId: 'tenant-uuid-001',
      userId: null,
      partyId: PARTY_ID,
      personType: 'NATURAL',
      customerSegment: 'RESIDENTIAL',
      documentType: 'CC',
      documentNumber: 'DOC-PRUEBA-001',
      firstName: 'Persona',
      lastName: 'Prueba',
      stratum: 3,
      birthDate: null,
      nit: null,
      nitVerificationDigit: null,
      businessName: null,
      commercialName: null,
      legalRepresentativeId: null,
      altContactName: null,
      email: 'persona@example.test',
      phone: null,
      altContactPhone: null,
      whatsapp: null,
      vatTreatment: 'EXCLUDED',
      taxRegime: 'SIMPLIFIED',
      address: 'Dirección de prueba',
      neighborhood: null,
      city: 'Bogotá',
      department: 'Cundinamarca',
      postalCode: null,
      latitude: null,
      longitude: null,
      coverageNodeId: null,
      expedienteId: null,
      convertedAt: null,
      activatedAt: null,
      manualOverrideReason: null,
      status: 'ACTIVE',
      externalId: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    },
    contacts: [],
    contracts: [
      {
        id: CONTRACT_ID,
        alias: 'Servicio principal',
        status: 'ACTIVE',
        planSnapshotJson: { name: 'Internet hogar' },
      },
    ],
    quotes: [],
    habeasData: [],
    arcoRequests: [],
    privacyMarks: [],
    expedienteSummary: null,
    timelineSeed: [],
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSession(page: Page) {
  await seedPortalSession(page, { token: MOCK_TOKEN, tenantSlug: TENANT });
}

async function setupMocks(
  page: Page,
  options: {
    effectivePermissions?: string[];
    legalTexts?: Array<Record<string, unknown>>;
    purposeSettings?: Array<Record<string, unknown>>;
  } = {},
) {
  let detail = makeDetail();
  let requestKind: 'CONSULTA' | 'SUPLANTACION' = 'CONSULTA';
  let submittedPayload: Record<string, unknown> | null = null;
  let completed = false;
  let resolved = false;
  let verified = false;
  let rejectedPayload: Record<string, unknown> | null = null;
  const legalTexts = [...(options.legalTexts ?? [])];
  const purposeSettings = options.purposeSettings ?? [
    { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
    { purpose: 'CONTACTO_COMERCIAL', enabled: true },
    { purpose: 'REPORTE_CENTRALES_RIESGO', enabled: true },
    { purpose: 'DATOS_BIOMETRICOS', enabled: true },
  ];
  let createdLegalText: Record<string, unknown> | null = null;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();

    if (pathname.endsWith('/tenants/public-branding') && method === 'GET') {
      return json(route, {
        data: {
          displayName: 'Tenant Prueba',
          showTenantName: true,
          logoLightUrl: null,
          logoDarkUrl: null,
          sealLightUrl: null,
          sealDarkUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          loginBackgroundLightUrl: null,
          loginBackgroundDarkUrl: null,
        },
      });
    }
    if (pathname.endsWith('/auth/me') && method === 'GET') {
      return json(route, {
        data: {
          sub: USER_ID,
          email: 'sha256:admin-hash-ficticio',
          role: 'ADMIN',
          tenantId: 'tenant-uuid-001',
          schemaName: 'tenant_prueba',
          jti: 'privacy-e2e',
          type: 'tenant',
          passwordResetRequired: false,
        },
      });
    }
    if (pathname.endsWith(`/users/${USER_ID}`) && method === 'GET') {
      return json(route, {
        data: {
          id: USER_ID,
          email: 'admin@example.test',
          role: 'ADMIN',
          status: 'ACTIVE',
          tenantId: 'tenant-uuid-001',
          mfaEnabled: true,
          mfaRequired: false,
          emailVerified: true,
          passwordResetRequired: false,
          firstName: 'Agente',
          lastName: 'Prueba',
          phone: null,
          jobTitle: 'Administración',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
        },
      });
    }
    if (pathname.endsWith('/tenants/me') && method === 'GET') {
      return json(route, {
        data: {
          id: 'tenant-uuid-001',
          name: 'Tenant Prueba',
          slug: TENANT,
          status: 'ACTIVE',
          contactEmail: 'admin@example.test',
          showTenantName: true,
        },
      });
    }
    if (pathname.endsWith('/tenants/me/summary') && method === 'GET') {
      return json(route, {
        data: {
          id: 'tenant-uuid-001',
          slug: TENANT,
          displayName: 'Tenant Prueba',
          status: 'ACTIVE',
        },
      });
    }
    if (pathname.endsWith('/access-control/me/effective-permissions') && method === 'GET') {
      return json(route, {
        data: {
          userId: USER_ID,
          role: 'ADMIN',
          effectivePermissions: options.effectivePermissions ?? [
            'privacy.read',
            'privacy.manage',
            'crm.subscribers.read',
            'crm.subscribers.manage',
          ],
          recoveryPermissions: [],
          profileSources: [],
        },
      });
    }
    if (pathname.endsWith('/notifications') && method === 'GET')
      return json(route, { data: [], meta: { nextCursor: null, total: 0 } });
    if (pathname.includes('/audit-logs') && method === 'GET')
      return json(route, { data: [], meta: { nextCursor: null, total: 0 } });

    if (pathname.endsWith('/privacy/requests') && method === 'GET') {
      const rows = submittedPayload ? [makeSummary(requestKind)] : [];
      return json(route, { data: rows, meta: { nextCursor: null, total: rows.length, limit: 20 } });
    }
    if (pathname.endsWith('/privacy/requests') && method === 'POST') {
      submittedPayload = request.postDataJSON() as Record<string, unknown>;
      requestKind = submittedPayload.kind === 'SUPLANTACION' ? 'SUPLANTACION' : 'CONSULTA';
      detail = makeDetail(requestKind);
      if (requestKind === 'SUPLANTACION') {
        detail.request.suspendedContractIds = [CONTRACT_ID];
      }
      return json(
        route,
        {
          data: {
            request: { id: REQUEST_ID, status: 'RADICADA', dueAt: '2026-10-28' },
            suspendedContractIds: requestKind === 'SUPLANTACION' ? [CONTRACT_ID] : [],
            tasks: [],
          },
        },
        201,
      );
    }
    if (pathname.endsWith(`/privacy/requests/${REQUEST_ID}`) && method === 'GET')
      return json(route, { data: detail });
    if (pathname.endsWith(`/privacy/requests/${REQUEST_ID}/verify-identity`) && method === 'POST') {
      verified = true;
      detail.request.identityStatus = 'VERIFICADA';
      detail.request.identityVerificationMethod = 'DOCUMENTO_PRESENCIAL';
      detail.request.identityVerifiedAt = '2026-10-14T14:10:00.000Z';
      detail.request.requester = {
        name: 'Persona Prueba',
        documentType: 'CC',
        document: 'DOC-PRUEBA-001',
        contact: 'persona@example.test',
      };
      return json(route, { data: detail });
    }
    if (pathname.endsWith(`/privacy/requests/${REQUEST_ID}/complete`) && method === 'POST') {
      completed = true;
      detail.request.status = 'EN_TRAMITE';
      return json(route, { data: detail });
    }
    if (pathname.endsWith(`/privacy/requests/${REQUEST_ID}/resolve`) && method === 'POST') {
      resolved = true;
      detail.request.status = 'RESUELTA';
      detail.request.resolvedAt = '2026-10-14T14:20:00.000Z';
      detail.request.responseText = 'Respuesta de prueba registrada.';
      detail.request.responseChannel = 'EMAIL';
      return json(route, { data: detail });
    }
    if (pathname.endsWith(`/privacy/requests/${REQUEST_ID}/reject`) && method === 'POST') {
      rejectedPayload = request.postDataJSON() as Record<string, unknown>;
      detail.request.status = 'NO_PROCEDENTE';
      detail.request.legalBasis = 'SOLICITANTE_NO_LEGITIMADO';
      return json(route, { data: detail });
    }
    if (pathname.endsWith('/privacy/legal-texts') && method === 'GET') {
      return json(route, { data: legalTexts });
    }
    if (pathname.endsWith('/privacy/legal-texts') && method === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      createdLegalText = {
        id: LEGAL_TEXT_ID,
        type: payload.type,
        version: payload.version,
        content: payload.content,
        format: payload.format,
        sha256: SHA256,
        publishedAt: '2026-10-29T12:00:00.000Z',
        url: payload.url ?? null,
        isCurrent: true,
      };
      legalTexts.unshift(createdLegalText);
      return json(route, { data: createdLegalText }, 201);
    }
    if (pathname.endsWith('/privacy/purposes') && method === 'GET') {
      return json(route, { data: purposeSettings });
    }
    if (pathname.endsWith('/privacy/legal-texts/current') && method === 'GET') {
      return json(route, {
        data: {
          id: LEGAL_TEXT_ID,
          type: 'AUTORIZACION',
          version: '2.0',
          content: 'Texto legal de prueba.',
          sha256: SHA256,
          publishedAt: '2026-10-01T12:00:00.000Z',
          url: null,
          isCurrent: true,
        },
      });
    }
    if (pathname.endsWith(`/crm/subscribers/${SUBSCRIBER_ID}/360`) && method === 'GET') {
      return json(route, { data: subscriber360() });
    }
    if (pathname.endsWith(`/privacy/parties/${PARTY_ID}/authorizations`) && method === 'GET')
      return json(route, { data: [] });

    return json(route, { data: [], meta: { nextCursor: null, total: 0 } });
  });
  return {
    getSubmittedPayload: () => submittedPayload,
    didComplete: () => completed,
    didResolve: () => resolved,
    didVerify: () => verified,
    getRejectedPayload: () => rejectedPayload,
    getCreatedLegalText: () => createdLegalText,
  };
}

test.describe('Privacidad en el portal', () => {
  test('CA-LT-11: confirma la publicación, abre el peek y copia la huella completa', async ({
    page,
  }) => {
    await seedSession(page);
    const mocks = await setupMocks(page, {
      purposeSettings: [
        { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
        { purpose: 'CONTACTO_COMERCIAL', enabled: false },
      ],
    });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/dashboard/privacy?view=legal');

    await expect(page.getByRole('heading', { name: 'Textos legales' })).toBeVisible();
    await page.getByRole('button', { name: 'Crear nueva versión' }).click();
    await page.getByLabel('Tipo').selectOption('POLITICA_TRATAMIENTO');
    await page.getByLabel('Versión').fill('1.0-prueba');
    await page
      .getByLabel('Contenido')
      .fill('# Política sintética\n\n| Campo | Valor |\n| --- | --- |\n| Ejemplo | Prueba |');
    await page.getByLabel('Formato').selectOption('MARKDOWN');
    await expect(page.getByRole('table')).toBeVisible();

    let confirmationMessage = '';
    page.once('dialog', async (dialog) => {
      confirmationMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Publicar versión' }).click();
    expect(confirmationMessage).toContain('No se puede editar ni eliminar después');
    await expect.poll(mocks.getCreatedLegalText).toMatchObject({
      type: 'POLITICA_TRATAMIENTO',
      version: '1.0-prueba',
      format: 'MARKDOWN',
      sha256: SHA256,
    });

    await page
      .getByRole('button', { name: /Política de tratamiento de datos · versión 1.0-prueba/ })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('table')).toBeVisible();
    await expect(page.getByText(`Huella: ${SHA256}`)).toBeVisible();
    await page.getByRole('button', { name: 'Copiar huella' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(SHA256);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toHaveLength(64);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', {
        name: /Política de tratamiento de datos · versión 1.0-prueba/,
      }),
    ).toBeFocused();
  });

  test('CA-LT-12: privacy.read permite consultar el listado sin permisos de gestión', async ({
    page,
  }) => {
    await seedSession(page);
    await setupMocks(page, {
      effectivePermissions: ['privacy.read'],
      legalTexts: [
        {
          id: LEGAL_TEXT_ID,
          type: 'POLITICA_TRATAMIENTO',
          version: '1.0-prueba',
          content: 'Política sintética.',
          format: 'PLAIN',
          sha256: SHA256,
          publishedAt: '2026-10-29T12:00:00.000Z',
          url: null,
          isCurrent: true,
        },
      ],
    });
    await page.goto('/dashboard/privacy?view=legal');

    await expect(page.getByRole('heading', { name: 'Textos legales' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Política de tratamiento de datos · versión 1.0-prueba/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear nueva versión' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Finalidades que declara tu política' }),
    ).toHaveCount(0);
  });

  test('radica, verifica identidad, completa y resuelve una consulta contra el contrato compartido', async ({
    page,
  }) => {
    await seedSession(page);
    const mocks = await setupMocks(page);
    await page.goto('/dashboard/privacy');

    await expect(page.getByRole('heading', { name: 'Privacidad' })).toBeVisible();
    await page.getByRole('button', { name: 'Radicar solicitud' }).click();
    await page.getByLabel('Nombre completo').fill('Persona Prueba');
    await page.getByLabel('Número de documento').fill('DOC-PRUEBA-001');
    await page.getByLabel('Correo o dirección para responder').fill('persona@example.test');
    await expect(page.getByLabel('Método')).toHaveValue('');
    await page.getByRole('button', { name: 'Registrar solicitud' }).click();

    await expect(page.getByRole('heading', { name: 'Identidad de quien solicita' })).toBeVisible();
    await expect(page.getByText('Pendiente de verificación')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver evidencia' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Verificar identidad' }).click();
    await page.getByLabel('Método de verificación').selectOption('DOCUMENTO_PRESENCIAL');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect.poll(mocks.didVerify).toBe(true);
    await expect(page.getByText('Verificada el:')).toBeVisible();

    await page.getByRole('button', { name: 'Registrar información recibida' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await page.getByRole('button', { name: 'Responder y cerrar' }).click();
    await page.getByRole('textbox', { name: 'Respuesta' }).fill('Respuesta de prueba registrada.');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/Estado:\s*Respondida/)).toBeVisible();
    const submitted = mocks.getSubmittedPayload();
    expect(submitted).not.toBeNull();
    expect(submitted).toMatchObject({
      kind: 'CONSULTA',
      requesterName: 'Persona Prueba',
      requesterDocument: 'DOC-PRUEBA-001',
    });
    expect(submitted).not.toHaveProperty('partyId');
    expect(mocks.didComplete()).toBe(true);
    expect(mocks.didResolve()).toBe(true);
  });

  test('radica una suplantación desde la ficha 360° con la persona y contratos vinculados', async ({
    page,
  }) => {
    await seedSession(page);
    const mocks = await setupMocks(page);
    await page.goto(`/dashboard/crm/subscribers/${SUBSCRIBER_ID}`);
    await expect(page.getByRole('heading', { name: 'Persona Prueba' })).toBeVisible();
    await page.getByRole('tab', { name: 'Cumplimiento' }).click();
    await page.getByRole('button', { name: 'Radicar solicitud' }).click();
    await page.getByLabel('Tipo de solicitud').selectOption('SUPLANTACION');
    await page
      .getByLabel('Confirmo que la solicitud corresponde a la persona de esta ficha.')
      .check();
    await page.getByLabel('Método').selectOption('DOCUMENTO_PRESENCIAL');
    await page.getByLabel('Servicio principal · Activo').check();
    await page.getByRole('button', { name: 'Registrar solicitud' }).click();

    await expect.poll(mocks.getSubmittedPayload).not.toBeNull();
    await expect(
      page.getByText('1 contrato impugnado fue confirmado como suspendido.'),
    ).toBeVisible();
    expect(mocks.getSubmittedPayload()).toMatchObject({
      kind: 'SUPLANTACION',
      partyId: PARTY_ID,
      identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
      disputedContractIds: [CONTRACT_ID],
    });
  });

  test('CA-53: con identidad pendiente permite trasladar y limita la no procedencia a falta de legitimación', async ({
    page,
  }) => {
    await seedSession(page);
    const mocks = await setupMocks(page);
    await page.goto('/dashboard/privacy');
    await page.getByRole('button', { name: 'Radicar solicitud' }).click();
    await page.getByLabel('Nombre completo').fill('Persona Prueba');
    await page.getByLabel('Número de documento').fill('DOC-PRUEBA-001');
    await page.getByLabel('Correo o dirección para responder').fill('persona@example.test');
    await page.getByRole('button', { name: 'Registrar solicitud' }).click();

    await expect(page.getByText('Pendiente de verificación')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trasladar' })).toBeVisible();
    await page.getByRole('button', { name: 'Indicar que no procede' }).click();

    const legalBasis = page.getByLabel('Motivo por el que no procede');
    await expect(legalBasis.locator('option')).toHaveCount(1);
    await expect(legalBasis).toHaveValue('SOLICITANTE_NO_LEGITIMADO');
    await expect(page.getByText(/Con la identidad pendiente, solo se puede indicar/)).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Respuesta' })
      .fill('No se acreditó legitimación para este trámite.');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect.poll(mocks.getRejectedPayload).not.toBeNull();
    expect(mocks.getRejectedPayload()).toMatchObject({
      legalBasis: 'SOLICITANTE_NO_LEGITIMADO',
      responseText: 'No se acreditó legitimación para este trámite.',
    });
  });
});
