import { expect, test } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const MOCK_TENANT_SLUG = 'isp-demo';
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-uuid-admin-test',
      email: 'hash-admin-test',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-test',
      schemaName: 'tenant_test_isp',
      jti: 'jti-test-1',
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fakesig';

const mockExpediente = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-uuid-test',
  status: 'NUEVO_POTENCIAL',
  previousStatus: null,
  assignedTo: 'advisor-uuid-1',
  dataConsentRevoked: true,
  statusChangedAt: '2026-03-26T12:00:00.000Z',
  discardReason: null,
  fullName: 'Empresa Demo SAS',
  documentType: 'NIT',
  documentNumberEncrypted: 'enc-documento-demo',
  personType: 'PERSONA_NATURAL',
  firstName: 'Laura',
  lastName: 'Perez',
  primaryContactName: null,
  primaryContactRole: null,
  documentNumber: '1012345678',
  phonePrimaryEncrypted: 'enc-telefono-demo',
  phoneSecondaryEncrypted: null,
  emailPrimaryEncrypted: null,
  acquisitionChannel: 'REFERRAL',
  sourceDetail: 'Aliado estratégico',
  source: 'Manual',
  address: 'Calle 10 # 20-30',
  municipality: 'Bogotá',
  department: 'Cundinamarca',
  interestedPlanId: 'plan-500',
  additionalProductIds: ['prod-router'],
  completenessCommercial: 70,
  completenessLegal: 50,
  completenessTechnical: 40,
  completenessOperational: 30,
  createdAt: '2026-03-26T10:00:00.000Z',
  updatedAt: '2026-03-26T12:00:00.000Z',
};

const convertedExpediente = {
  ...mockExpediente,
  id: '22222222-2222-4222-8222-222222222222',
  status: 'INSTALACION_AGENDADA' as const,
  fullName: 'Empresa convertida SAS',
  firstName: null,
  lastName: null,
};

const installationReadyExpediente = {
  ...mockExpediente,
  status: 'LISTO_PARA_INSTALACION',
  completenessOverall: 80,
  pipelineProgress: 80,
  latitude: '4.7110000',
  longitude: '-74.0721000',
};

const mockResponsibility = {
  currentResponsibleUserId: 'user-uuid-admin-test',
  currentResponsibleAssignedAt: '2026-03-26T10:30:00.000Z',
  currentResponsible: {
    userId: 'user-uuid-admin-test',
    name: 'Laura Pérez',
    role: 'ADMIN',
  },
  expedienteId: mockExpediente.id,
};

const mockAttribution = {
  id: 'attr-1',
  tenantId: 'tenant-uuid-test',
  expedienteId: mockExpediente.id,
  attributionRole: 'ORIGINATOR',
  actorId: 'user-uuid-admin-test',
  actorRole: 'ADMIN',
  actorName: 'Laura Pérez',
  acquisitionChannel: 'REFERRAL',
  notes: null,
  attributedAt: '2026-03-26T10:00:00.000Z',
  attributedBy: 'user-uuid-admin-test',
  revokedAt: null,
  revokedBy: null,
  revokedReason: null,
  createdAt: '2026-03-26T10:00:00.000Z',
};

const mockUsers = [
  {
    id: 'user-uuid-admin-test',
    firstName: 'Laura',
    lastName: 'Pérez',
    email: 'laura@iwana.co',
    role: 'ADMIN',
  },
  {
    id: 'user-uuid-advisor-1',
    firstName: 'Carlos',
    lastName: 'García',
    email: 'carlos@iwana.co',
    role: 'ADVISOR',
  },
];

async function setAuthSession(page: import('@playwright/test').Page) {
  await seedPortalSession(page, { token: MOCK_ACCESS_TOKEN, tenantSlug: MOCK_TENANT_SLUG });
}

async function setupCrmMocks(
  page: import('@playwright/test').Page,
  options: { installationReady?: boolean } = {},
) {
  let capturedExpedientesQuery = '';
  let capturedTechnicalPayload: Record<string, unknown> | null = null;
  let contactAttemptCreated = false;
  let consentRevoked = false;
  const capturedCommercialCatalogRequests: string[] = [];
  let capturedVisitRequestPayload: Record<string, unknown> | null = null;
  type MockDocumentSupportVersion = {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    uploadedBy: string;
    status: 'PENDING' | 'UPLOADED' | 'OBSERVED' | 'APPROVED' | 'REJECTED';
    note: string | null;
    downloadUrl: string;
  };
  type MockDocumentSupportItem = {
    key: string;
    label: string;
    hint: string;
    versions: MockDocumentSupportVersion[];
  };

  const buildDocumentSupportVersion = (
    overrides: Partial<MockDocumentSupportVersion>,
  ): MockDocumentSupportVersion => ({
    id: overrides.id ?? 'version-1',
    fileName: overrides.fileName ?? 'documento.pdf',
    mimeType: overrides.mimeType ?? 'application/pdf',
    sizeBytes: overrides.sizeBytes ?? 2048,
    uploadedAt: overrides.uploadedAt ?? '2026-03-26T12:00:00.000Z',
    uploadedBy: overrides.uploadedBy ?? 'Equipo operaciones',
    status: overrides.status ?? 'UPLOADED',
    note: overrides.note ?? null,
    downloadUrl: overrides.downloadUrl ?? 'https://example.test/documento.pdf',
  });

  const buildDocumentSupportPayload = (items: MockDocumentSupportItem[]) => {
    const uploadedCount = items.filter((item) => item.versions.length > 0).length;
    const approvedCount = items.filter((item) => item.versions[0]?.status === 'APPROVED').length;
    const blockStatus =
      items.length > 0 && approvedCount === items.length
        ? 'COMPLETO'
        : items.some((item) => ['OBSERVED', 'REJECTED'].includes(item.versions[0]?.status ?? ''))
          ? 'OBSERVADO'
          : uploadedCount > 0
            ? 'EN_REVISION'
            : 'PENDIENTE';

    return {
      data: {
        personType: mockExpediente.personType,
        items,
        summary: {
          requiredCount: items.length,
          uploadedCount,
          approvedCount,
          blockStatus,
        },
      },
    };
  };

  let documentSupportItems: MockDocumentSupportItem[] = [
    {
      key: 'cedula_ciudadania',
      label: 'Cédula de ciudadanía',
      hint: 'Documento principal del titular',
      versions: [
        buildDocumentSupportVersion({
          id: 'version-actual',
          fileName: 'documento-vigente.pdf',
          uploadedAt: '2026-03-26T12:00:00.000Z',
          status: 'UPLOADED',
          downloadUrl: 'https://example.test/documento-vigente.pdf',
        }),
        buildDocumentSupportVersion({
          id: 'version-previa',
          fileName: 'documento-anterior.pdf',
          uploadedAt: '2026-03-25T09:30:00.000Z',
          status: 'APPROVED',
          downloadUrl: 'https://example.test/documento-anterior.pdf',
        }),
      ],
    },
  ];

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const pathname = new URL(url).pathname;

    if (url.includes('/tenants/public-branding') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            displayName: 'ISP Demo',
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
        }),
      });
      return;
    }

    if (url.includes('/auth/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sub: 'user-uuid-admin-test',
            email: 'hash-admin-test',
            role: 'ADMIN',
            tenantId: 'tenant-uuid-test',
            schemaName: 'tenant_test_isp',
            jti: 'jti-test-1',
            type: 'tenant',
          },
        }),
      });
      return;
    }

    if (url.includes('/users/user-uuid-admin-test') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'user-uuid-admin-test',
            firstName: 'Laura',
            lastName: 'Pérez',
          },
        }),
      });
      return;
    }

    if (url.includes('/tenants/me') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'tenant-uuid-test',
            name: 'ISP Prueba Colombia',
            slug: MOCK_TENANT_SLUG,
            showTenantName: true,
            sealLightUrl: null,
            sealDarkUrl: null,
          },
        }),
      });
      return;
    }

    if (url.includes('/audit-logs') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog') && method === 'GET') {
      const type = new URL(url).searchParams.get('type');
      capturedCommercialCatalogRequests.push(type ?? 'UNKNOWN');

      if (type === 'PLAN') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'plan-500',
                type: 'PLAN',
                name: 'Plan Fibra 500',
                description: 'Plan principal residencial',
                taxClassificationId: null,
                retentionApplicable: false,
                isActive: true,
                technology: 'FTTH',
                installationRule: 'ON_DEMAND',
                downloadSpeedMbps: 500,
                uploadSpeedMbps: 500,
                currentPrice: '109900.00',
                installationFee: '0.00',
                createdAt: '2026-03-26T10:00:00.000Z',
                updatedAt: '2026-03-26T10:00:00.000Z',
              },
            ],
            meta: { total: 1 },
          }),
        });
        return;
      }

      if (type === 'PRODUCT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'prod-router',
                type: 'PRODUCT',
                name: 'Router WiFi 6',
                description: 'Equipo complementario',
                taxClassificationId: null,
                retentionApplicable: false,
                isActive: true,
                category: 'CPE',
                isLoan: true,
                requiresInventory: true,
                createdAt: '2026-03-26T10:00:00.000Z',
                updatedAt: '2026-03-26T10:00:00.000Z',
              },
            ],
            meta: { total: 1 },
          }),
        });
        return;
      }

      if (type === 'SERVICE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'srv-ip-publica',
                type: 'SERVICE',
                name: 'IP pública fija',
                description: 'Servicio complementario',
                taxClassificationId: null,
                retentionApplicable: false,
                isActive: true,
                chargeType: 'RECURRING',
                currentPrice: '25000.00',
                installationFee: '0.00',
                createdAt: '2026-03-26T10:00:00.000Z',
                updatedAt: '2026-03-26T10:00:00.000Z',
              },
            ],
            meta: { total: 1 },
          }),
        });
        return;
      }
    }

    if (pathname.endsWith('/commercial/catalog/plan-500') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'plan-500',
            type: 'PLAN',
            name: 'Plan Fibra 500',
            description: 'Plan principal residencial',
            taxClassificationId: null,
            retentionApplicable: false,
            isActive: true,
            technology: 'FTTH',
            installationRule: 'ON_DEMAND',
            downloadSpeedMbps: 500,
            uploadSpeedMbps: 500,
            currentPrice: '109900.00',
            installationFee: '0.00',
            createdAt: '2026-03-26T10:00:00.000Z',
            updatedAt: '2026-03-26T10:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/commercial/catalog/prod-router') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'prod-router',
            type: 'PRODUCT',
            name: 'Router WiFi 6',
            description: 'Equipo complementario',
            taxClassificationId: null,
            retentionApplicable: false,
            isActive: true,
            category: 'CPE',
            isLoan: true,
            requiresInventory: true,
            createdAt: '2026-03-26T10:00:00.000Z',
            updatedAt: '2026-03-26T10:00:00.000Z',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/crm/pipeline/summary') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            NUEVO_POTENCIAL: 1,
            CONTACTADO: 0,
            PENDIENTE_DATOS: 0,
            PRECALIFICADO: 0,
            VALIDANDO_COBERTURA: 0,
            VIABLE_COMERCIALMENTE: 0,
            EN_COTIZACION: 0,
            PENDIENTE_DECISION: 0,
            LISTO_PARA_INSTALACION: 0,
            INSTALACION_AGENDADA: 1,
            CLIENTE_ACTIVO: 0,
            DESCARTADO: 0,
          },
          total: 1,
        }),
      });
      return;
    }

    if (pathname.endsWith('/crm/expedientes') && method === 'GET') {
      const urlObj = new URL(url);
      capturedExpedientesQuery = urlObj.search;
      const view = urlObj.searchParams.get('view') ?? 'open';
      const expedientesByView: Record<string, (typeof mockExpediente)[]> = {
        open: [mockExpediente],
        converted: [convertedExpediente],
        archive: [],
        all: [mockExpediente, convertedExpediente],
      };
      const data = expedientesByView[view] ?? [mockExpediente];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data, total: data.length }),
      });
      return;
    }

    if (pathname.endsWith('/crm/expedientes') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockExpediente }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/timeline`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            changes: [
              {
                id: 'timeline-1',
                fromStatus: 'CONTACTADO',
                toStatus: 'NUEVO_POTENCIAL',
                changedAt: '2026-03-26T11:30:00.000Z',
                reason: null,
                actor: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
              },
            ],
            activities: [
              {
                id: 'activity-1',
                type: contactAttemptCreated ? 'CONTACT_ATTEMPT' : 'CREATED',
                occurredAt: '2026-03-26T11:40:00.000Z',
                actor: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
                sectionLabel: contactAttemptCreated ? 'Intento de contacto' : null,
                fromStatus: null,
                toStatus: null,
                reason: contactAttemptCreated ? 'Seguimiento inicial validado' : null,
              },
            ],
            metadata: {
              createdBy: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
              lastEditedBy: { userId: 'user-uuid-admin-test', name: 'Laura Pérez' },
              lastActivityAt: '2026-03-26T11:40:00.000Z',
            },
          },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/responsibility`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockResponsibility }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/responsibility/history`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'history-1',
              previousResponsible: {
                userId: 'user-uuid-advisor-1',
                name: 'Carlos García',
                role: 'ADVISOR',
              },
              newResponsible: {
                userId: 'user-uuid-admin-test',
                name: 'Laura Pérez',
                role: 'ADMIN',
              },
              changedByActor: {
                userId: 'user-uuid-admin-test',
                name: 'Laura Pérez',
                role: 'ADMIN',
              },
              changedAt: '2026-03-26T10:30:00.000Z',
              notes: 'Toma de caso inicial',
            },
          ],
          total: 1,
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/attribution`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockAttribution }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/attribution/history`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [mockAttribution] }),
      });
      return;
    }

    if (pathname.endsWith('/users') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            data: mockUsers,
            meta: { nextCursor: null, total: mockUsers.length },
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/users/search') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockUsers.map((user) => ({
            id: user.id,
            label: `${user.firstName} ${user.lastName}`,
            sublabel: user.email,
          })),
          total: mockUsers.length,
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/contact-attempts`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: contactAttemptCreated
            ? [
                {
                  id: 'attempt-1',
                  attemptedAt: '2026-03-26T11:40:00.000Z',
                  channel: 'TELEFONO',
                  result: 'EXITOSO',
                  durationMinutes: 5,
                  notes: 'Seguimiento inicial validado',
                  advisorId: 'user-uuid-admin-test',
                  actorName: 'Laura Pérez',
                },
              ]
            : [],
          total: contactAttemptCreated ? 1 : 0,
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/contact-attempts`) &&
      method === 'POST'
    ) {
      contactAttemptCreated = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'attempt-1',
            attemptedAt: '2026-03-26T11:40:00.000Z',
            channel: 'TELEFONO',
            result: 'EXITOSO',
            durationMinutes: 5,
            notes: 'Seguimiento inicial validado',
            advisorId: 'user-uuid-admin-test',
            actorName: 'Laura Pérez',
          },
        }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/consents`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'consent-1',
              consentType: 'TRATAMIENTO_DATOS',
              status: consentRevoked ? 'RECHAZADO' : 'ACEPTADO',
              channel: 'PRESENCIAL',
              obtainedAt: '2026-03-26T11:20:00.000Z',
              ipAddress: '10.0.0.1',
              legalTextVersion: 'Ley 1581 de 2012',
              evidenceRef: null,
            },
          ],
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/consents/consent-1/revoke`) &&
      method === 'PATCH'
    ) {
      consentRevoked = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'consent-1',
            consentType: 'TRATAMIENTO_DATOS',
            status: 'RECHAZADO',
            channel: 'PRESENCIAL',
            obtainedAt: '2026-03-26T11:20:00.000Z',
            ipAddress: '10.0.0.1',
            legalTextVersion: 'Ley 1581 de 2012',
            evidenceRef: null,
          },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/coverage-checks`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/document-supports`) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDocumentSupportPayload(documentSupportItems)),
      });
      return;
    }

    if (
      pathname.includes(`/crm/expedientes/${mockExpediente.id}/document-supports/`) &&
      method === 'DELETE'
    ) {
      const segments = pathname.split('/');
      const documentKey = decodeURIComponent(segments[segments.length - 2] ?? '');
      const versionId = decodeURIComponent(segments[segments.length - 1] ?? '');

      documentSupportItems = documentSupportItems.map((item) =>
        item.key === documentKey
          ? {
              ...item,
              versions: item.versions.filter((version) => version.id !== versionId),
            }
          : item,
      );

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildDocumentSupportPayload(documentSupportItems)),
      });
      return;
    }

    if (
      pathname.includes(`/crm/expedientes/${mockExpediente.id}/sections/`) &&
      method === 'PATCH'
    ) {
      if (
        pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/sections/technical_feasibility`)
      ) {
        const parsedBody = JSON.parse(route.request().postData() ?? '{}') as {
          data?: Record<string, unknown>;
        };
        capturedTechnicalPayload = parsedBody.data ?? null;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockExpediente }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/status`) && method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: mockExpediente,
          completeness: {
            commercial: 70,
            legal: 50,
            technical: 40,
            operational: 30,
            overall: 48,
          },
        }),
      });
      return;
    }

    if (
      pathname.endsWith(`/crm/expedientes/${mockExpediente.id}/reactivate`) &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockExpediente }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${convertedExpediente.id}`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ...convertedExpediente,
            subscriberSummary: {
              id: 'sub-1',
              status: 'PROSPECT',
              fullName: 'Empresa convertida SAS',
            },
          },
          completeness: {
            commercial: 80,
            legal: 60,
            technical: 50,
            operational: 40,
            overall: 58,
          },
        }),
      });
      return;
    }

    // Sub-endpoints del expediente convertido: respuestas mínimas válidas
    // (el test de conversión solo valida el banner, no los datos secundarios)
    if (pathname.includes(`/crm/expedientes/${convertedExpediente.id}/`) && method === 'GET') {
      const isTimeline = pathname.endsWith('/timeline');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isTimeline
            ? {
                data: {
                  changes: [],
                  activities: [],
                  metadata: {
                    createdBy: { userId: null, name: null },
                    lastEditedBy: { userId: null, name: null },
                    lastActivityAt: null,
                  },
                },
              }
            : { data: null },
        ),
      });
      return;
    }

    if (
      options.installationReady &&
      pathname.endsWith('/assurance/tickets/find-or-create-installation') &&
      method === 'POST'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ticket: { id: 'ticket-crm-001', code: 'TK-CRM-001' },
          created: true,
        }),
      });
      return;
    }

    if (
      options.installationReady &&
      pathname.endsWith('/wfm/visit-requests') &&
      method === 'POST'
    ) {
      capturedVisitRequestPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'vr-crm-001' }),
      });
      return;
    }

    if (
      options.installationReady &&
      pathname.endsWith('/wfm/visit-requests/vr-crm-001') &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'vr-crm-001',
          tenantId: MOCK_TENANT_SLUG,
          status: 'READY_TO_SCHEDULE',
          originContext: 'CRM',
          originRef: mockExpediente.id,
          originLabel: 'Cliente Empresa Demo SAS',
          workType: 'INSTALLATION',
          priority: 'NORMAL',
          title: 'Instalación para Empresa Demo SAS',
          description: null,
          requestedWindowStartAt: null,
          requestedWindowEndAt: null,
          slaDueAt: null,
          address: mockExpediente.address,
          municipality: mockExpediente.municipality,
          sector: null,
          latitude: 4.711,
          longitude: -74.0721,
          expedienteId: mockExpediente.id,
          subscriberId: null,
          ticketId: 'ticket-crm-001',
          contractId: null,
          scheduleEventId: null,
          workOrderId: null,
          requestedByUserId: 'user-uuid-admin-test',
          scheduledByUserId: null,
          scheduledAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancelReason: null,
          createdAt: '2026-03-26T12:00:00.000Z',
          updatedAt: '2026-03-26T12:00:00.000Z',
          deletedAt: null,
        }),
      });
      return;
    }

    if (pathname.endsWith(`/crm/expedientes/${mockExpediente.id}`) && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: options.installationReady ? installationReadyExpediente : mockExpediente,
          completeness: {
            commercial: 70,
            legal: 50,
            technical: 40,
            operational: 30,
            overall: options.installationReady ? 80 : 48,
            installationReadiness: options.installationReady
              ? {
                  status: 'READY_COMPLETE',
                  canTransition: true,
                  title: 'Listo para instalación',
                  message: 'La instalación puede coordinarse.',
                }
              : undefined,
            missingRequirements: [],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'E2E_UNMOCKED', message: route.request().url() }),
    });
  });

  return {
    getCapturedExpedientesQuery: () => capturedExpedientesQuery,
    getCapturedTechnicalPayload: () => capturedTechnicalPayload,
    getCapturedCommercialCatalogRequests: () => capturedCommercialCatalogRequests,
    getCapturedVisitRequestPayload: () => capturedVisitRequestPayload,
  };
}

test.describe('CRM expedientes - cierre Sprint 02', () => {
  test('CRM permite crear, listar y abrir detalle del expediente', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard/crm/expedientes');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('CRM operativo', { exact: true })).toBeVisible();
    await expect(page.getByText('Pipeline de oportunidades', { exact: true })).toBeVisible();
    await expect(page.getByText('Empresa Demo SAS')).toBeVisible();
    await page.getByRole('link', { name: /empresa demo sas/i }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/crm/expedientes/${mockExpediente.id}`));
    await expect(page.getByRole('heading', { name: /empresa demo sas/i })).toBeVisible();
    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Número de documento' })).toHaveValue(
      '1012345678',
    );
  });

  test('admin coordina una instalación desde el detalle CRM', async ({ page }) => {
    const mocks = await setupCrmMocks(page, { installationReady: true });
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);

    await page.getByRole('button', { name: 'Coordinar visita de instalación' }).first().click();

    await expect(page).toHaveURL(
      /\/dashboard\/scheduling\/agenda\?source=pending-visits&visitRequestId=vr-crm-001/,
    );
    expect(mocks.getCapturedVisitRequestPayload()).toMatchObject({
      originContext: 'CRM',
      expedienteId: mockExpediente.id,
      workType: 'INSTALLATION',
      latitude: 4.711,
      longitude: -74.0721,
    });
  });

  test('CRM oculta PII en listados y mantiene detalle operativo', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard/crm/expedientes');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('900123456')).toHaveCount(0);
    await page.getByRole('link', { name: /empresa demo sas/i }).click();
    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Número de documento' })).toHaveValue(
      '1012345678',
    );
    await page.getByRole('button', { name: 'Vista general' }).click();
    await expect(
      page.getByText(/consentimiento de tratamiento de datos fue revocado/i),
    ).toBeVisible();
  });

  test('CRM refleja el hardening visual cuando el consentimiento ya fue revocado', async ({
    page,
  }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/consentimiento de tratamiento de datos fue revocado/i),
    ).toBeVisible();
    await expect(page.getByText(/datos protegidos y consentimientos/i)).toHaveCount(0);
  });

  test('CRM envía filtros de búsqueda y documento exacto al backend', async ({ page }) => {
    const mocks = await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard/crm/expedientes');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Buscar por nombre del potencial...').fill('Empresa Demo');
    await page.getByLabel('Documento exacto').fill('900123456');
    await page.getByLabel('Documento exacto').press('Tab');
    await page.waitForTimeout(300);

    expect(mocks.getCapturedExpedientesQuery()).toContain('search=Empresa+Demo');
    expect(mocks.getCapturedExpedientesQuery()).toContain('documentNumber=900123456');
  });

  test('CRM permite registrar intento de contacto y lo refleja en timeline', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByText('Seguimiento', { exact: true }).click();
    await page.getByRole('button', { name: /registrar contacto/i }).click();
    await page.getByLabel('Duración \(minutos\)').fill('5');
    await page.getByLabel('Notas').fill('Seguimiento inicial validado');
    await page.getByRole('button', { name: /registrar contacto/i }).click();

    await expect(page.getByText(/intento de contacto registrado correctamente/i)).toBeVisible();
    await expect(page.getByText(/seguimiento inicial validado/i).first()).toBeVisible();
    await expect(page.getByText(/bitácora de actividad/i)).toBeVisible();
  });

  test('CRM guarda viabilidad tecnica estructurada con candidatas y recomendada', async ({
    page,
  }) => {
    const mocks = await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();
    await page.getByText('Viabilidad técnica', { exact: true }).scrollIntoViewIfNeeded();
    await page.locator('#technical-feasibility').click();
    await page.getByRole('option', { name: 'Viable', exact: true }).click();
    await page.getByText('Fibra óptica', { exact: true }).click();
    await page.locator('#technical-technicalConfidence').click();
    await page.getByRole('option', { name: 'Alta', exact: true }).click();
    await page.locator('#technical-evaluationSource').click();
    await page.getByRole('option', { name: 'Visita técnica', exact: true }).click();
    await page
      .getByLabel('Observación técnica')
      .fill('Solución viable con ajuste menor de acometida.');

    await page
      .getByRole('button', { name: /guardar cambios/i })
      .last()
      .click();
    await expect(page.getByText(/sección actualizada correctamente/i)).toBeVisible();

    expect(mocks.getCapturedTechnicalPayload()).toMatchObject({
      feasibility: 'VIABLE',
      candidateTechnologies: ['FIBER'],
      availableTechnology: 'FIBER',
      technicalConfidence: 'HIGH',
      evaluationSource: 'TECHNICAL_SITE_VISIT',
      technicalObservations: 'Solución viable con ajuste menor de acometida.',
    });
  });

  test('CRM permite eliminar un soporte cargado por error y reactivar la versión previa', async ({
    page,
  }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /soportes documentales/i }).click();
    await expect(page.getByText('Soportes requeridos para persona natural')).toBeVisible();
    await expect(page.getByText('documento-vigente.pdf')).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('documento-vigente.pdf');
      await dialog.accept();
    });

    await page
      .getByRole('button', { name: 'Eliminar versión actual de Cédula de ciudadanía' })
      .click();

    await expect(page.getByText('documento-anterior.pdf')).toBeVisible();
    await expect(page.getByText('documento-vigente.pdf')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /ver historial \(1\)/i })).toBeVisible();
  });

  test('CRM detalle carga plan y productos adicionales desde CommercialModule', async ({
    page,
  }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Vista general', { exact: true })).toBeVisible();
    await page.getByText('Seguimiento', { exact: true }).click();

    await expect(page.getByText('Plan Fibra 500')).toBeVisible();
    await expect(page.getByText('Router WiFi 6')).toBeVisible();
  });

  test('identificacion muestra campos correctos para persona natural en modo lectura', async ({
    page,
  }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Nombres')).toBeVisible();
    await expect(page.getByLabel('Nombres')).toHaveValue('Laura');
    await expect(page.getByLabel('Apellidos')).toBeVisible();
    await expect(page.getByLabel('Apellidos')).toHaveValue('Perez');
    await expect(page.getByRole('combobox', { name: 'Tipo de documento' })).toContainText('NIT');
  });

  test('identificacion muestra campos correctos para persona juridica en modo lectura', async ({
    page,
  }) => {
    const original = { ...mockExpediente };
    (mockExpediente as any).personType = 'PERSONA_JURIDICA';
    (mockExpediente as any).companyName = 'Empresa Test SAS';
    (mockExpediente as any).primaryContactName = 'Juan Rodriguez';
    (mockExpediente as any).primaryContactRole = 'Gerente comercial';
    (mockExpediente as any).firstName = null;
    (mockExpediente as any).lastName = null;

    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto(`/dashboard/crm/expedientes/${mockExpediente.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Gestión' }).click();
    await expect(page.getByText('Secciones de la oportunidad', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Tipo de persona' })).toContainText(
      'Persona jurídica',
    );
    await expect(page.getByLabel('Razón social')).toBeVisible();
    await expect(page.getByLabel('Nombre del contacto principal')).toBeVisible();
    await expect(page.getByLabel('Cargo del contacto')).toBeVisible();

    Object.assign(mockExpediente, original);
  });

  test('permite navegar entre bandejas y ver banner de conversión en detalle', async ({ page }) => {
    await setupCrmMocks(page);
    await setAuthSession(page);
    await page.goto('/dashboard/crm/expedientes');

    // Esperar a que carguen las pestañas de la lista operativa
    await expect(page.getByRole('button', { name: /abiertas/i })).toBeVisible();
    await expect(page.getByText('Empresa Demo SAS')).toBeVisible();

    // Navegar a Convertidas
    await page.getByRole('button', { name: /convertidas/i }).click();
    await expect(page.getByText('Empresa convertida SAS')).toBeVisible();

    // Abrir detalle del expediente convertido
    await page.getByRole('link', { name: /empresa convertida sas/i }).click();

    // Banner de conversión visible
    await expect(page.getByText('Este expediente ya fue convertido a suscriptor.')).toBeVisible();

    // CTA hacia el suscriptor
    await expect(page.getByRole('link', { name: 'Ir al suscriptor' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir al suscriptor' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/sub-1',
    );
  });
});
