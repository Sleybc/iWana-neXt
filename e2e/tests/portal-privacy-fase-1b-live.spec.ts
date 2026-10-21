import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type APIResponse, type Page } from '@playwright/test';

import { seedPortalSession } from './helpers/portal-session';

const API_PREFIX = '/api/v1';
const FIXTURE_PREFIX = 'E2E-PRIVACY-FASE-1B';
const BLOCKED_DATA_PERMISSION = 'crm.blocked_data.read';
const missingLiveEnvironment = [
  !process.env.E2E_PRIVACY_1B_TENANT_SLUG?.trim() ? 'E2E_PRIVACY_1B_TENANT_SLUG' : null,
  !process.env.E2E_PRIVACY_ADMIN_EMAIL?.trim() ? 'E2E_PRIVACY_ADMIN_EMAIL' : null,
  !process.env.E2E_PRIVACY_ADMIN_PASSWORD?.trim() ? 'E2E_PRIVACY_ADMIN_PASSWORD' : null,
].filter((name): name is string => name !== null);

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type JsonRecord = Record<string, unknown>;

interface Actor {
  id: string;
  email: string;
  password: string;
  token: string;
  role: string;
}

interface TestSession {
  tenantSlug: string;
  planId: string;
  admin: Actor;
  blockedReaderAdmin: Actor;
  tag: string;
  createdActors: Actor[];
}

interface ProspectFixture {
  id: string;
  name: string;
  email: string;
  document: string;
  address: string;
  consentVersion: string;
}

interface PartyFixture extends ProspectFixture {
  partyId: string;
  subscriberId: string;
  contractId: string;
}

interface PrivacyRequestFixture {
  id: string;
}

interface ApiResult<T> {
  status: number;
  code: string | null;
  body: T | null;
}

let sessionForCleanup: TestSession | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} para el E2E de privacidad.`);
  return value;
}

function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function unwrapData<T>(value: unknown): T {
  const object = record(value);
  return (Object.prototype.hasOwnProperty.call(object, 'data') ? object['data'] : value) as T;
}

function syntheticTag(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
}

function deriveFixturePassword(
  masterPassword: string,
  tenantSlug: string,
  purpose: string,
): string {
  const digest = createHmac('sha256', masterPassword)
    .update(`privacy-fase-1b:${purpose}:${tenantSlug}`)
    .digest('hex');
  return `Qa9-${digest}!zA`;
}

function baseHeaders(tenantSlug: string, token?: string): Record<string, string> {
  return {
    'X-Tenant-Slug': tenantSlug,
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseApiResponse(response: APIResponse): Promise<{
  body: unknown;
  code: string | null;
}> {
  const parsed: unknown = await response.json().catch(() => null);
  const responseBody = record(parsed);
  const errorObject = record(responseBody['error']);
  const codeValue = responseBody['code'] ?? errorObject['code'];
  return {
    body: parsed,
    code: typeof codeValue === 'string' ? codeValue : null,
  };
}

async function apiResult<T>(
  page: Page,
  session: Pick<TestSession, 'tenantSlug'>,
  actor: Pick<Actor, 'token'> | null,
  method: HttpMethod,
  route: string,
  data?: unknown,
): Promise<ApiResult<T>> {
  const response = await page.request.fetch(`${API_PREFIX}${route}`, {
    method,
    headers: baseHeaders(session.tenantSlug, actor?.token),
    ...(data !== undefined ? { data } : {}),
  });
  const parsed = await parseApiResponse(response);
  return {
    status: response.status(),
    code: parsed.code,
    body: response.ok() ? unwrapData<T>(parsed.body) : null,
  };
}

async function api<T>(
  page: Page,
  session: Pick<TestSession, 'tenantSlug'>,
  actor: Pick<Actor, 'token'>,
  method: HttpMethod,
  route: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const response = await page.request.fetch(`${API_PREFIX}${route}`, {
    method,
    headers: { ...baseHeaders(session.tenantSlug, actor.token), ...extraHeaders },
    ...(data !== undefined ? { data } : {}),
  });
  const parsed = await parseApiResponse(response);
  expect(
    response.ok(),
    `API ${method} ${route}: HTTP ${response.status()} (${parsed.code ?? 'sin código'})`,
  ).toBe(true);
  return unwrapData<T>(parsed.body);
}

async function login(
  page: Page,
  tenantSlug: string,
  email: string,
  password: string,
): Promise<Actor> {
  const response = await page.request.post(`${API_PREFIX}/auth/login`, {
    headers: baseHeaders(tenantSlug),
    data: { email, password },
  });
  const parsed = await parseApiResponse(response);
  expect(
    response.ok(),
    `Login sintético: HTTP ${response.status()} (${parsed.code ?? 'sin código'})`,
  ).toBe(true);
  const payload = record(unwrapData<unknown>(parsed.body));
  const token = payload['accessToken'];
  if (typeof token !== 'string' || !token) {
    throw new Error('El inicio de sesión no devolvió un token de acceso completo.');
  }
  const user = record(await api(page, { tenantSlug }, { token }, 'GET', '/users/me'));
  return {
    id: String(user['id'] ?? ''),
    email,
    password,
    token,
    role: String(user['role'] ?? ''),
  };
}

async function createSession(page: Page): Promise<TestSession> {
  const tenantSlug = requiredEnv('E2E_PRIVACY_1B_TENANT_SLUG');
  const privacyAdminEmail = requiredEnv('E2E_PRIVACY_ADMIN_EMAIL');
  const privacyAdminPassword = requiredEnv('E2E_PRIVACY_ADMIN_PASSWORD');
  const privacyAdmin = await login(page, tenantSlug, privacyAdminEmail, privacyAdminPassword);
  expect(privacyAdmin.role, 'El actor privacy debe tener el perfil de auditoría compatible.').toBe(
    'AUDITOR',
  );
  const privacyPermissions = await api<{ effectivePermissions: string[] }>(
    page,
    { tenantSlug },
    privacyAdmin,
    'GET',
    '/access-control/me/effective-permissions',
  );
  for (const permission of [
    'privacy.manage',
    'privacy.read',
    'crm.subscribers.read',
    'crm.subscribers.manage',
    'crm.expedientes.read',
    'crm.expedientes.manage',
  ]) {
    expect(privacyPermissions.effectivePermissions).toContain(permission);
  }

  const suffix = tenantSlug.slice('e2e-privacy-1b-'.length);
  const admin = await login(
    page,
    tenantSlug,
    `qa-privacy-runner-${suffix}@example.invalid`,
    deriveFixturePassword(privacyAdminPassword, tenantSlug, 'runner'),
  );
  const blockedReaderAdmin = await login(
    page,
    tenantSlug,
    `qa-privacy-blocked-reader-${suffix}@example.invalid`,
    deriveFixturePassword(privacyAdminPassword, tenantSlug, 'blocked-reader'),
  );
  const session: TestSession = {
    tenantSlug,
    planId: '',
    admin,
    blockedReaderAdmin,
    tag: syntheticTag(),
    createdActors: [],
  };
  sessionForCleanup = session;
  expect(admin.role, 'El actor E2E de gestión debe tener rol ADMIN.').toBe('ADMIN');
  expect(blockedReaderAdmin.role, 'El actor de lectura bloqueada debe tener rol ADMIN.').toBe(
    'ADMIN',
  );
  const permissions = await api<{ effectivePermissions: string[] }>(
    page,
    session,
    admin,
    'GET',
    '/access-control/me/effective-permissions',
  );
  expect(permissions.effectivePermissions).toContain('privacy.manage');
  expect(permissions.effectivePermissions).toContain('privacy.read');
  const blockedReaderPermissions = await api<{ effectivePermissions: string[] }>(
    page,
    session,
    blockedReaderAdmin,
    'GET',
    '/access-control/me/effective-permissions',
  );
  expect(blockedReaderPermissions.effectivePermissions).toContain('crm.blocked_data.read');
  expect(blockedReaderPermissions.effectivePermissions).toContain('privacy.read');
  const catalog = record(
    await api<JsonRecord>(
      page,
      session,
      admin,
      'GET',
      '/commercial/catalog?type=PLAN&isActive=true&limit=100',
    ),
  );
  const activePlans = Array.isArray(catalog['data']) ? catalog['data'].map(record) : [];
  const planId = activePlans.find((plan) => plan['type'] === 'PLAN' && plan['isActive'] === true)?.[
    'id'
  ];
  if (typeof planId !== 'string') {
    throw new Error('El seed E2E no dejó un plan activo para el fixture sintético.');
  }
  session.planId = planId;
  await seedPortalSession(page, { token: admin.token, tenantSlug });
  return session;
}

async function deleteCreatedActors(page: Page, session: TestSession): Promise<void> {
  for (const actor of session.createdActors.reverse()) {
    const response = await page.request.delete(`${API_PREFIX}/users/${actor.id}`, {
      headers: baseHeaders(session.tenantSlug, session.admin.token),
    });
    expect(response.status(), 'El usuario sintético debe poder darse de baja.').toBe(204);
  }
}

async function createRoleActor(
  page: Page,
  session: TestSession,
  role: 'SALES' | 'TECHNICIAN' | 'ACCOUNTANT',
  label: string,
): Promise<Actor> {
  const suffix = `${session.tag}-${label}`;
  const email = `qa-${suffix.toLowerCase()}@example.invalid`;
  const password = `Qv9!${randomUUID().replaceAll('-', '')}zA`;
  const roleProfileName = {
    SALES: 'Acceso estándar Comercial',
    TECHNICIAN: 'Acceso estándar Técnico',
    ACCOUNTANT: 'Acceso estándar Contable',
  }[role];
  const created = await api<{ id: string }>(
    page,
    session,
    session.admin,
    'POST',
    '/users',
    {
      email,
      role,
      password,
      firstName: 'Usuario',
      lastName: `Sintético ${suffix}`,
      jobTitle: 'Fixture de privacidad',
      mfaRequired: false,
      isOperationalResource: false,
    },
    { 'Idempotency-Key': `${FIXTURE_PREFIX}-${suffix}` },
  );
  const actorIndex =
    session.createdActors.push({
      id: created.id,
      email,
      password,
      token: '',
      role,
    }) - 1;
  const profiles = await api<Array<JsonRecord>>(
    page,
    session,
    session.admin,
    'GET',
    '/access-control/profiles',
  );
  const roleProfile = profiles.find((profile) => profile['name'] === roleProfileName);
  if (typeof roleProfile?.['id'] !== 'string') {
    throw new Error(`No está disponible el perfil sintético de ${role}.`);
  }
  await api(page, session, session.admin, 'PUT', `/access-control/users/${created.id}/profiles`, {
    profileIds: [roleProfile['id']],
  });
  const actor = await login(page, session.tenantSlug, email, password);
  if (actor.id !== created.id || actor.role !== role) {
    throw new Error('El usuario sintético no conserva el rol solicitado.');
  }
  session.createdActors[actorIndex] = actor;
  return actor;
}

async function assignBillingProfile(
  page: Page,
  session: TestSession,
  accountant: Actor,
): Promise<void> {
  const profiles = await api<Array<JsonRecord>>(
    page,
    session,
    session.admin,
    'GET',
    '/access-control/profiles',
  );
  const standard = profiles.find((profile) => profile['name'] === 'Acceso estándar Contable');
  const billing = profiles.find((profile) => profile['name'] === 'Facturación y cobro');
  if (typeof standard?.['id'] !== 'string' || typeof billing?.['id'] !== 'string') {
    throw new Error('No está disponible el perfil sintético de facturación y cobro (tenant 151).');
  }
  const permissions = Array.isArray(billing['permissions']) ? billing['permissions'] : [];
  if (!permissions.includes(BLOCKED_DATA_PERMISSION)) {
    throw new Error(
      'El perfil de facturación no declara el permiso de lectura de datos bloqueados.',
    );
  }
  await api(
    page,
    session,
    session.admin,
    'PUT',
    `/access-control/users/${accountant.id}/profiles`,
    {
      profileIds: [standard['id'], billing['id']],
    },
  );
}

async function publishedConsentVersion(page: Page, session: TestSession): Promise<string> {
  const legalText = record(
    await api<JsonRecord>(
      page,
      session,
      session.admin,
      'GET',
      '/privacy/legal-texts/current?type=AUTORIZACION',
    ),
  );
  const version = legalText['version'];
  if (typeof version !== 'string' || !version) {
    throw new Error('No se encontró una versión publicada del texto de autorización.');
  }
  return version;
}

async function createProspect(
  page: Page,
  session: TestSession,
  consentVersion: string,
): Promise<ProspectFixture> {
  const suffix = `${session.tag}-${syntheticTag()}`;
  const name = `Titular Sintético ${suffix}`;
  const email = `qa-${suffix.toLowerCase()}@example.invalid`;
  const document = BigInt(`0x${randomUUID().replaceAll('-', '')}`)
    .toString()
    .slice(0, 12);
  const address = `Dirección de prueba ${suffix}`;
  const expediente = await api<{ id: string }>(
    page,
    session,
    session.admin,
    'POST',
    '/crm/expedientes',
    {
      fullName: name,
      acquisitionChannel: 'WEB',
      customerSegment: 'RESIDENTIAL',
      sourceDetail: `${FIXTURE_PREFIX} ${suffix}`,
    },
  );

  const patchSection = (section: string, data: JsonRecord) =>
    api(
      page,
      session,
      session.admin,
      'PATCH',
      `/crm/expedientes/${expediente.id}/sections/${section}`,
      { data },
    );

  await patchSection('identification', {
    personType: 'PERSONA_NATURAL',
    documentType: 'CC',
    documentNumber: document,
    firstName: 'Titular',
    lastName: `Sintético ${suffix}`,
  });
  await patchSection('contact', {
    phonePrimary: '+570000000000',
    emailPrimary: email,
    altContactName: 'Contacto de prueba',
    altContactPhone: '+570000000001',
  });
  await patchSection('location', {
    address,
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    postalCode: '110111',
    stratum: 3,
    neighborhood: 'Sector de prueba',
    latitude: 4.711,
    longitude: -74.072,
  });
  await patchSection('commercial_interest', {
    acquisitionChannel: 'WEB',
    sourceDetail: `${FIXTURE_PREFIX} ${suffix}`,
    interestedPlanId: session.planId,
  });
  await patchSection('technical_feasibility', {
    feasibility: 'VIABLE',
    candidateTechnologies: ['FIBER'],
    availableTechnology: 'FIBER',
    technicalConfidence: 'HIGH',
    evaluationSource: 'TECHNICAL_SITE_VISIT',
  });
  await patchSection('legal_consent', {
    identityVerified: 'VERIFIED',
    legalComplianceStatus: 'APPROVED',
  });
  await api(page, session, session.admin, 'POST', `/crm/expedientes/${expediente.id}/consents`, {
    consentType: 'TRATAMIENTO_DATOS',
    status: 'ACCEPTED',
    channel: 'TELEFONO',
    legalTextVersion: consentVersion,
    evidenceRef: `${FIXTURE_PREFIX}:${suffix}`,
  });

  return { id: expediente.id, name, email, document, address, consentVersion };
}

async function convertToParty(
  page: Page,
  session: TestSession,
  prospect: ProspectFixture,
): Promise<PartyFixture> {
  for (const targetStatus of [
    'PRECALIFICADO',
    'VALIDANDO_COBERTURA',
    'EN_COTIZACION',
    'LISTO_PARA_INSTALACION',
  ]) {
    await api(page, session, session.admin, 'PATCH', `/crm/expedientes/${prospect.id}/status`, {
      targetStatus,
    });
  }

  const findSubscriber = async (): Promise<string | null> => {
    const results = await api<Array<JsonRecord>>(
      page,
      session,
      session.admin,
      'POST',
      '/crm/subscribers/search',
      { email: prospect.email },
    );
    const id = results[0]?.['id'];
    return typeof id === 'string' ? id : null;
  };
  await expect.poll(findSubscriber, { timeout: 25_000 }).not.toBeNull();
  const subscriberId = await findSubscriber();
  if (!subscriberId) throw new Error('La conversión sintética no produjo un suscriptor.');

  const profile = record(
    await api<JsonRecord>(
      page,
      session,
      session.admin,
      'GET',
      `/crm/subscribers/${subscriberId}/360`,
    ),
  );
  const subscriber = record(profile['subscriber']);
  const partyId = subscriber['partyId'];
  if (typeof partyId !== 'string') {
    throw new Error('La conversión sintética no vinculó un titular.');
  }

  // D-M05 (MOD05 deuda de código, delta v1.1): la conversión no infiere datos
  // fiscales y el alta de contrato exige completitud. Persona natural: IVA y RUT.
  await api(page, session, session.admin, 'PATCH', `/crm/subscribers/${subscriberId}`, {
    vatResponsibility: 'NO_RESPONSABLE',
    rutResponsibilities: ['R-99-PN'],
  });

  const planId = session.planId;
  const plan = record(
    await api<JsonRecord>(page, session, session.admin, 'GET', `/commercial/catalog/${planId}`),
  );
  const contract = await api<{ id: string }>(
    page,
    session,
    session.admin,
    'POST',
    `/crm/subscribers/${subscriberId}/contracts`,
    {
      subscriberId,
      planId,
      planSnapshotJson: {
        id: planId,
        name: String(plan['name'] ?? 'Plan sintético'),
        vatConcept: 'INTERNET_ACCESS',
      },
      alias: 'Servicio sintético E2E',
      serviceUsage: 'RESIDENTIAL',
      installationStratum: 3,
      customerSegment: 'RESIDENTIAL',
      installationAddress: prospect.address,
      installationCity: 'Bogotá',
      installationDepartment: 'Cundinamarca',
      installationPostalCode: '110111',
    },
  );
  await api(page, session, session.admin, 'POST', `/crm/contracts/${contract.id}/activate`);

  return { ...prospect, partyId, subscriberId, contractId: contract.id };
}

async function filePrivacyRequest(
  page: Page,
  session: TestSession,
  fixture: ProspectFixture,
  partyId?: string,
  receivedAt?: string,
  complete = true,
): Promise<PrivacyRequestFixture> {
  const created = await api<{ request: { id: string } }>(
    page,
    session,
    session.admin,
    'POST',
    '/privacy/requests',
    {
      kind: 'CONSULTA',
      right: 'SUPRIMIR',
      requesterKind: 'TITULAR',
      requesterName: fixture.name,
      requesterDocumentType: 'CC',
      requesterDocument: fixture.document,
      requesterContact: fixture.email,
      ...(partyId ? { partyId } : {}),
      ...(receivedAt ? { receivedAt } : {}),
    },
  );
  const id = created.request?.id;
  if (typeof id !== 'string') throw new Error('No se pudo radicar la solicitud sintética.');
  await api(page, session, session.admin, 'POST', `/privacy/requests/${id}/verify-identity`, {
    identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
  });
  if (complete) {
    await api(page, session, session.admin, 'POST', `/privacy/requests/${id}/complete`, {});
  }
  return { id };
}

async function uploadSyntheticDocument(
  page: Page,
  session: TestSession,
  fixture: ProspectFixture,
): Promise<string> {
  const response = await page.request.post(
    `${API_PREFIX}/crm/expedientes/${fixture.id}/document-supports/identity_document/upload`,
    {
      headers: baseHeaders(session.tenantSlug, session.admin.token),
      multipart: {
        file: {
          name: `synthetic-${session.tag}.pdf`,
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
        },
      },
    },
  );
  const parsed = await parseApiResponse(response);
  expect(
    response.ok(),
    `Carga del soporte sintético: HTTP ${response.status()} (${parsed.code ?? 'sin código'})`,
  ).toBe(true);
  const payload = record(unwrapData<unknown>(parsed.body));
  const items = Array.isArray(payload['items']) ? payload['items'] : [];
  const item = items.map(record).find((candidate) => candidate['key'] === 'identity_document');
  const versions = item && Array.isArray(item['versions']) ? item['versions'] : [];
  const versionId = record(versions[0])['id'];
  if (typeof versionId !== 'string')
    throw new Error('La carga no devolvió versión del soporte sintético.');
  return versionId;
}

async function findOpenInstallationSlot(
  page: Page,
  session: TestSession,
  technicianId: string,
  offset: number,
): Promise<{ start: string; end: string } | null> {
  const todayUtc = new Date();
  const date = new Date(todayUtc.getTime() + offset * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const window = record(
    await api<JsonRecord>(page, session, session.admin, 'POST', '/wfm/operating-window/resolve', {
      dateLocal: date,
      technicianId,
    }),
  );
  const startTime = window['startTime'];
  const endTime = window['endTime'];
  if (window['status'] !== 'OPEN' || typeof startTime !== 'string' || typeof endTime !== 'string') {
    return null;
  }
  const toMinutes = (time: string) => {
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/u.exec(time);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes - startMinutes < 60) return null;
  const startHour = String(Math.floor(startMinutes / 60)).padStart(2, '0');
  const startMinute = String(startMinutes % 60).padStart(2, '0');
  const finishMinutes = startMinutes + 60;
  const endHour = String(Math.floor(finishMinutes / 60)).padStart(2, '0');
  const finishMinute = String(finishMinutes % 60).padStart(2, '0');
  return {
    start: `${date}T${startHour}:${startMinute}:00-05:00`,
    end: `${date}T${endHour}:${finishMinute}:00-05:00`,
  };
}

async function createVisitAndOrder(
  page: Page,
  session: TestSession,
  fixture: ProspectFixture,
): Promise<{ visitId: string; eventId: string; workOrderId: string; executionOrderId: string }> {
  const assignees = await api<Array<JsonRecord>>(
    page,
    session,
    session.admin,
    'GET',
    '/wfm/eligible-assignees',
  );
  const technicianIds = assignees
    .filter((assignee) => assignee['isOperationalResource'] === true)
    .map((assignee) => assignee['id'])
    .filter((id): id is string => typeof id === 'string');
  if (technicianIds.length === 0) {
    throw new Error('No hay una persona operativa agendable para el fixture WFM.');
  }
  const visit = record(
    await api<JsonRecord>(page, session, session.admin, 'POST', '/wfm/visit-requests', {
      originContext: 'CRM',
      originRef: fixture.id,
      originLabel: `${FIXTURE_PREFIX} ${session.tag}`,
      workType: 'INSTALLATION',
      title: `Instalación sintética ${session.tag}`,
      description: 'Trabajo sintético de verificación de anonimización.',
      address: fixture.address,
      municipality: 'Bogotá',
      sector: 'Sector de prueba',
      latitude: 4.711,
      longitude: -74.072,
      expedienteId: fixture.id,
    }),
  );
  const visitId = visit['id'];
  if (typeof visitId !== 'string') throw new Error('No se creó la solicitud sintética de visita.');
  let scheduled: JsonRecord | null = null;
  for (const technicianId of technicianIds) {
    for (let offset = 1; offset <= 30 && !scheduled; offset += 1) {
      const slot = await findOpenInstallationSlot(page, session, technicianId, offset);
      if (!slot) continue;
      const result = await apiResult<JsonRecord>(
        page,
        session,
        session.admin,
        'POST',
        `/wfm/visit-requests/${visitId}/schedule`,
        {
          scheduledStartAt: slot.start,
          scheduledEndAt: slot.end,
          assignedUserId: technicianId,
          createWorkOrder: true,
          workOrderSummary: `Orden sintética ${session.tag}`,
        },
      );
      if (result.status >= 200 && result.status < 300 && result.body) {
        scheduled = record(result.body);
        break;
      }
      if (result.status !== 400) {
        throw new Error(`No se pudo agendar el fixture WFM (HTTP ${result.status}).`);
      }
    }
    if (scheduled) break;
  }
  if (!scheduled) {
    throw new Error('No se encontró una ventana sin conflictos para el fixture WFM.');
  }
  const scheduleEventId = scheduled['scheduleEventId'];
  const workOrderId = scheduled['workOrderId'];
  const executionOrderId = scheduled['executionOrderId'];
  if (
    typeof scheduleEventId !== 'string' ||
    typeof workOrderId !== 'string' ||
    typeof executionOrderId !== 'string'
  ) {
    throw new Error(
      'La agenda sintética no produjo evento, orden de trabajo y orden de ejecución.',
    );
  }
  return { visitId, eventId: scheduleEventId, workOrderId, executionOrderId };
}

async function findAuditEntries(
  page: Page,
  session: TestSession,
  expedienteId: string,
): Promise<Array<JsonRecord>> {
  const query = new URLSearchParams({
    entityType: 'ExpedienteRecord',
    entityId: expedienteId,
    limit: '100',
  });
  return api<Array<JsonRecord>>(
    page,
    session,
    session.admin,
    'GET',
    `/audit-logs?${query.toString()}`,
  );
}

const blockedSubresources = [
  { name: 'timeline', path: '/timeline', auditAction: 'LIST_ACCESS' },
  { name: 'soportes documentales', path: '/document-supports', auditAction: 'LIST_ACCESS' },
  {
    name: 'archivo de soporte',
    path: '/document-supports/identity_document/{versionId}/file',
    auditAction: 'RECORD_ACCESS',
  },
  { name: 'intentos de contacto', path: '/contact-attempts', auditAction: 'LIST_ACCESS' },
  { name: 'consentimientos', path: '/consents', auditAction: 'LIST_ACCESS' },
  { name: 'verificaciones de cobertura', path: '/coverage-checks', auditAction: 'LIST_ACCESS' },
] as const;

test.describe('Privacidad fase 1b contra API real de un tenant', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );

  test.setTimeout(180_000);

  test.afterEach(async ({ page }) => {
    const session = sessionForCleanup;
    sessionForCleanup = null;
    if (session?.createdActors.length) await deleteCreatedActors(page, session);
  });

  test('prospecto: SUPRIMIR, vista previa, resolver y anonimizar expediente, visita y órdenes', async ({
    page,
  }) => {
    const session = await createSession(page);
    const consentVersion = await publishedConsentVersion(page, session);
    const prospect = await createProspect(page, session, consentVersion);
    const work = await createVisitAndOrder(page, session, prospect);
    const request = await filePrivacyRequest(page, session, prospect);

    const preview = await api<{
      eligible: boolean;
      blockers: string[];
      candidateExpedienteIds: string[];
      categories: string[];
    }>(page, session, session.admin, 'GET', `/privacy/requests/${request.id}/erasure-preview`);
    expect(preview.eligible).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.candidateExpedienteIds).toEqual([prospect.id]);
    expect(preview.categories).toContain('OPERACION_CAMPO');

    await api(page, session, session.admin, 'POST', `/privacy/requests/${request.id}/resolve`, {
      responseText: 'Solicitud sintética resuelta conforme al procedimiento.',
      responseChannel: 'EMAIL',
      erasure: { confirm: true, expedienteIds: preview.candidateExpedienteIds },
    });

    const resolvedRequest = record(
      await api<JsonRecord>(page, session, session.admin, 'GET', `/privacy/requests/${request.id}`),
    );
    const requestDetail = record(resolvedRequest['request']);
    const requestEvents = Array.isArray(resolvedRequest['events'])
      ? resolvedRequest['events'].map(record)
      : [];
    expect(requestDetail['status']).toBe('RESUELTA');
    expect(requestDetail['identityStatus']).toBe('VERIFICADA');
    expect(requestEvents.some((event) => event['toStatus'] === 'RESUELTA')).toBe(true);

    const bootstrap = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/crm/expedientes/${prospect.id}/bootstrap`,
      ),
    );
    const expediente = record(bootstrap['expediente']);
    expect(expediente['anonymizedAt']).toBeTruthy();
    expect(expediente['fullName']).not.toBe(prospect.name);
    expect(expediente['documentNumber']).not.toBe(prospect.document);

    const visit = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/wfm/visit-requests/${work.visitId}`,
      ),
    );
    // Anexo A del runbook (D1 Fase 1b): el título queda con el marcador y la
    // dirección pasa a NULL en visitas, eventos y órdenes de ejecución.
    expect(visit['title']).toBe('ANONIMIZADO');
    expect(visit['address']).toBeNull();
    expect(visit['customerDisplayName']).not.toBe(prospect.name);
    const scheduleEvent = record(
      await api<JsonRecord>(page, session, session.admin, 'GET', `/wfm/events/${work.eventId}`),
    );
    expect(scheduleEvent['title']).toBe('ANONIMIZADO');
    expect(scheduleEvent['address']).toBeNull();
    const workOrder = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/wfm/work-orders/${work.workOrderId}`,
      ),
    );
    expect(workOrder['summary']).toBe('ANONIMIZADO');
    const executionOrder = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/tasks/execution-orders/${work.executionOrderId}`,
      ),
    );
    // `ExecutionOrderDetail` no publica la etiqueta del cliente ni la dirección
    // de servicio (solo `site`, la sede del operador): se verifica que el
    // detalle exista y no exponga el nombre del titular.
    expect(executionOrder['id']).toBe(work.executionOrderId);
    expect(JSON.stringify(executionOrder)).not.toContain(prospect.name);
    expect(JSON.stringify(executionOrder)).not.toContain(prospect.address);

    const retainedConsents = await api<Array<JsonRecord>>(
      page,
      session,
      session.admin,
      'GET',
      `/crm/expedientes/${prospect.id}/consents`,
    );
    // La lectura devuelve el valor canónico de `ConsentStatus`; 'ACCEPTED' solo
    // se admite como alias heredado al crear.
    expect(retainedConsents.some((consent) => consent['status'] === 'ACEPTADO')).toBe(true);
    await page.goto(`/dashboard/crm/expedientes/${prospect.id}`);
    await expect(page.getByRole('heading', { name: 'Anonimizado' })).toBeVisible();
    await expect(page.getByText(/Titular anonimizado/u)).toBeVisible();
  });

  test('ex suscriptor dentro de retención: rechazo legal, listado redactado, búsqueda excluida y seis subrecursos', async ({
    page,
  }) => {
    const session = await createSession(page);
    const consentVersion = await publishedConsentVersion(page, session);
    const prospect = await createProspect(page, session, consentVersion);
    const party = await convertToParty(page, session, prospect);
    await api(
      page,
      session,
      session.admin,
      'POST',
      `/crm/contracts/${party.contractId}/terminate`,
      {
        reasonCode: 'SOLICITUD_TITULAR',
      },
    );
    const documentVersionId = await uploadSyntheticDocument(page, session, party);
    const request = await filePrivacyRequest(page, session, party, party.partyId);

    await api(page, session, session.admin, 'POST', `/privacy/requests/${request.id}/reject`, {
      responseText: 'Solicitud sintética no procedente por deber legal de conservación.',
      responseChannel: 'EMAIL',
      legalBasis: 'DEBER_LEGAL_CONSERVACION',
    });

    const sales = await createRoleActor(page, session, 'SALES', 'sales');
    const technician = await createRoleActor(page, session, 'TECHNICIAN', 'technician');
    const accountant = await createRoleActor(page, session, 'ACCOUNTANT', 'accountant-no-profile');
    const billingAccountant = await createRoleActor(
      page,
      session,
      'ACCOUNTANT',
      'accountant-billing',
    );
    await assignBillingProfile(page, session, billingAccountant);

    const list = await api<Array<JsonRecord>>(
      page,
      session,
      sales,
      'GET',
      '/crm/subscribers?limit=100',
    );
    const listed = list.find((row) => row['id'] === party.subscriberId);
    expect(listed).toBeDefined();
    expect(listed).toMatchObject({
      privacyRestricted: true,
      firstName: null,
      lastName: null,
      documentNumber: null,
      email: null,
    });

    for (const search of [{ documentNumber: party.document }, { search: party.name }]) {
      const result = await api<Array<JsonRecord>>(
        page,
        session,
        sales,
        'POST',
        '/crm/subscribers/search',
        search,
      );
      expect(result.some((row) => row['id'] === party.subscriberId)).toBe(false);
    }

    for (const actor of [sales, billingAccountant]) {
      const beforeMutation = record(
        await api<JsonRecord>(
          page,
          session,
          session.admin,
          'GET',
          `/crm/subscribers/${party.subscriberId}`,
        ),
      );
      const mutation = await apiResult(
        page,
        session,
        actor,
        'PATCH',
        `/crm/subscribers/${party.subscriberId}`,
        { city: 'Municipio sintético no aplicado' },
      );
      if (actor === billingAccountant) {
        expect(
          mutation.status,
          'La lectura de datos bloqueados no concede permisos de escritura',
        ).toBe(403);
        expect(mutation.code).toBe('FORBIDDEN');
      } else {
        expect(mutation.status, `${actor.role} no puede modificar un titular bloqueado`).toBe(409);
        expect(mutation.code).toBe('PRIVACY_DATA_BLOCKED');
      }
      const afterMutation = record(
        await api<JsonRecord>(
          page,
          session,
          session.admin,
          'GET',
          `/crm/subscribers/${party.subscriberId}`,
        ),
      );
      expect(afterMutation['city']).toBe(beforeMutation['city']);
      expect(afterMutation['status']).toBe(beforeMutation['status']);
    }

    const subscriberBeforeTransition = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/crm/subscribers/${party.subscriberId}`,
      ),
    );
    const statusTransition = await apiResult(
      page,
      session,
      session.blockedReaderAdmin,
      'PATCH',
      `/crm/subscribers/${party.subscriberId}/status`,
      { targetStatus: 'SUSPENDED', reason: 'Transición sintética R10 v1.4.' },
    );
    expect(statusTransition.status).toBe(409);
    expect(statusTransition.code).toBe('PRIVACY_DATA_BLOCKED');
    const subscriberAfterTransition = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/crm/subscribers/${party.subscriberId}`,
      ),
    );
    expect(subscriberAfterTransition['status']).toBe(subscriberBeforeTransition['status']);

    const contractBeforeArchive = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/crm/contracts/${party.contractId}`,
      ),
    );
    const archiveContract = await apiResult(
      page,
      session,
      session.blockedReaderAdmin,
      'POST',
      `/crm/contracts/${party.contractId}/archive`,
    );
    expect(archiveContract.status).toBe(409);
    expect(archiveContract.code).toBe('PRIVACY_DATA_BLOCKED');
    const contractAfterArchive = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/crm/contracts/${party.contractId}`,
      ),
    );
    expect(contractAfterArchive['status']).toBe(contractBeforeArchive['status']);

    const requestPath = (path: string) =>
      path.replace('{versionId}', documentVersionId).replace('{expedienteId}', party.id);
    const unauthorizedActors = [sales, technician, accountant];
    for (const actor of unauthorizedActors) {
      for (const route of blockedSubresources) {
        const result = await apiResult(
          page,
          session,
          actor,
          'GET',
          `/crm/expedientes/${party.id}${requestPath(route.path)}`,
        );
        expect(result.status, `${actor.role} sin permiso especial — ${route.name}`).toBe(403);
        expect(result.code).toBe('PRIVACY_DATA_BLOCKED');
      }
    }

    for (const { actor, grantedBy } of [
      { actor: billingAccountant, grantedBy: 'CRM_BLOCKED_DATA_READ' },
      { actor: session.admin, grantedBy: 'PRIVACY_READ' },
    ]) {
      for (const route of blockedSubresources) {
        const result = await apiResult(
          page,
          session,
          actor,
          'GET',
          `/crm/expedientes/${party.id}${requestPath(route.path)}`,
        );
        expect(result.status, `${grantedBy} — ${route.name}`).toBe(200);
      }
    }

    const auditEntries = await findAuditEntries(page, session, party.id);
    for (const grantedBy of ['CRM_BLOCKED_DATA_READ', 'PRIVACY_READ']) {
      const auditedReads = auditEntries.filter((entry) => {
        const value = record(entry['newValue']);
        return value['grantedBy'] === grantedBy && value['privacyMark'] === 'DATOS_BLOQUEADOS';
      });
      expect(auditedReads).toHaveLength(blockedSubresources.length);
      expect(auditedReads.filter((entry) => entry['action'] === 'LIST_ACCESS')).toHaveLength(5);
      expect(auditedReads.filter((entry) => entry['action'] === 'RECORD_ACCESS')).toHaveLength(1);
    }

    const billing360 = record(
      await api<JsonRecord>(
        page,
        session,
        billingAccountant,
        'GET',
        `/crm/subscribers/${party.subscriberId}/360`,
      ),
    );
    expect(record(billing360['subscriber'])).toMatchObject({
      privacyRestricted: false,
      firstName: 'Titular',
      documentNumber: party.document,
    });
    for (const actor of [sales, technician, accountant]) {
      const view = record(
        await api<JsonRecord>(
          page,
          session,
          actor,
          'GET',
          `/crm/subscribers/${party.subscriberId}/360`,
        ),
      );
      expect(record(view['subscriber'])).toMatchObject({
        privacyRestricted: true,
        firstName: null,
        documentNumber: null,
        email: null,
      });
    }
    const billingAudit = await api<Array<JsonRecord>>(
      page,
      session,
      session.admin,
      'GET',
      `/audit-logs?entityType=Subscriber&entityId=${party.subscriberId}&limit=100`,
    );
    expect(
      billingAudit.some(
        (entry) => record(entry['newValue'])['grantedBy'] === 'CRM_BLOCKED_DATA_READ',
      ),
    ).toBe(true);
  });

  test('contrato vigente: rechazo por deber contractual sin marca de bloqueo', async ({ page }) => {
    const session = await createSession(page);
    const consentVersion = await publishedConsentVersion(page, session);
    const prospect = await createProspect(page, session, consentVersion);
    const party = await convertToParty(page, session, prospect);
    const request = await filePrivacyRequest(page, session, party, party.partyId);

    await api(page, session, session.admin, 'POST', `/privacy/requests/${request.id}/reject`, {
      responseText: 'Solicitud sintética no procedente por deber contractual vigente.',
      responseChannel: 'EMAIL',
      legalBasis: 'DEBER_CONTRACTUAL',
    });

    const sales = await createRoleActor(page, session, 'SALES', 'sales');
    const subscriber = record(
      await api<JsonRecord>(page, session, sales, 'GET', `/crm/subscribers/${party.subscriberId}`),
    );
    expect(subscriber['privacyRestricted']).toBe(false);
    expect(subscriber['firstName']).toBe('Titular');
    const timeline = await apiResult(
      page,
      session,
      sales,
      'GET',
      `/crm/expedientes/${party.id}/timeline`,
    );
    expect(timeline.status).toBe(200);
  });

  test('traslado fuera de plazo: muestra la insignia “Traslado extemporáneo”', async ({ page }) => {
    const session = await createSession(page);
    const consentVersion = await publishedConsentVersion(page, session);
    const prospect = await createProspect(page, session, consentVersion);
    const daysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const request = await filePrivacyRequest(page, session, prospect, undefined, daysAgo, false);
    await api(page, session, session.admin, 'POST', `/privacy/requests/${request.id}/transfer`, {
      transferredTo: `Entidad de prueba ${session.tag}`,
      reason: 'Traslado sintético para verificar el plazo legal.',
      channel: 'EMAIL',
    });
    await page.goto(`/dashboard/privacy?requestId=${request.id}`);
    await expect(page.getByText('Traslado extemporáneo', { exact: true })).toBeVisible();
  });
});
