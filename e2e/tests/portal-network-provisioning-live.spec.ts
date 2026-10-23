import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedPortalSession } from './helpers/portal-session';

const API_BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = API_BASE + '/api/v1';
const PORTAL_BASE = process.env.PORTAL_BASE_URL ?? 'http://127.0.0.1:3002';
const TEST_TENANT = 'srqa-mod11-r5-20261006';
const TENANT_SLUG = process.env.E2E_TENANT_SLUG;
const CPE_ITEM_NAME = 'CPE serializado sintético MOD13 V1';
const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z',
  'base64',
);

type Dict = Record<string, unknown>;
type ApiEnvelope<T> = { data?: T };
type Session = { token: string; userId: string };
type Plan = { id: string; name: string; isActive?: boolean };
type PlanProfile = { planId: string; pcqAddressList: string };
type Router = { id: string; name: string; status: string };
type Network = {
  id: string;
  routerId: string;
  name: string;
  cidr: string;
  status: string;
  occupancy: { total: number; reserved: number; active: number; free: number };
};
type Order = {
  id: string;
  number: string;
  version: number;
  status: string;
  result?: string;
  annulled?: boolean;
  allowedActions?: string[];
  template?: { version?: number; requirements?: unknown[] } | null;
  completion?: {
    progress: number;
    completed: number;
    total: number;
    requirements?: Array<{ requirementId: string; satisfied: boolean }>;
  };
};
type Provisioning = {
  id: string;
  status: string;
  ip: string | null;
  controlMethod: string;
  controlParams: Dict;
  releaseReason?: string | null;
  commercialActivation?: { status?: string; detail?: string | null };
};
type OrderContext = {
  executionOrder: { status: string; canCertify: boolean };
  subscriber: { id: string };
  plan: { planId: string; pcqAddressList: string | null } | null;
  cpe: { serialNumber: string; macAddress: string | null } | null;
  provisioning: Provisioning | null;
  suggestedQueueName: string;
};
type Evidence = {
  id: string;
  mediaAssetId: string;
  evidenceType: 'PHOTO' | 'SIGNATURE';
  requirementKey: string;
  status: string;
};

function requireEnv(value: string | undefined, key: string): string {
  if (!value?.trim()) throw new Error('Falta una variable E2E requerida: ' + key);
  return value;
}

function unwrap<T>(body: T | ApiEnvelope<T>): T {
  if (typeof body === 'object' && body !== null && 'data' in body && body.data !== undefined) {
    return body.data;
  }
  return body as T;
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'object' && value !== null && 'data' in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
  }
  throw new Error('La API no devolvió una lista con el contrato esperado.');
}

function safeCode(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'sin-codigo';
  const row = body as Dict;
  const nested = typeof row.data === 'object' && row.data !== null ? (row.data as Dict) : {};
  const code = row.code ?? nested.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,80}$/u.test(code) ? code : 'sin-codigo';
}

function tenantHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Tenant-Slug': requireEnv(TENANT_SLUG, 'E2E_TENANT_SLUG'),
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

async function api<T>(
  page: Page,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  data?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await page.request.fetch(API_PREFIX + path, {
    method,
    headers: { ...tenantHeaders(token), ...extraHeaders },
    ...(data !== undefined ? { data } : {}),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok()) {
    throw new Error(
      'API ' +
        method +
        ' ' +
        path +
        ' devolvió HTTP ' +
        response.status() +
        '; code=' +
        safeCode(body),
    );
  }
  return unwrap(body as T | ApiEnvelope<T>);
}

async function login(
  page: Page,
  email: string | undefined,
  password: string | undefined,
): Promise<Session> {
  const response = await page.request.post(API_PREFIX + '/auth/login', {
    headers: { 'X-Tenant-Slug': requireEnv(TENANT_SLUG, 'E2E_TENANT_SLUG') },
    data: {
      email: requireEnv(email, 'credencial E2E'),
      password: requireEnv(password, 'credencial E2E'),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: { accessToken?: string };
  };
  expect(
    response.status(),
    'El inicio de sesión E2E debe responder sin imprimir credenciales',
  ).toBe(200);
  const token = body.data?.accessToken;
  expect(typeof token).toBe('string');
  const tokenPayload = JSON.parse(
    Buffer.from(token!.split('.')[1] ?? '', 'base64url').toString(),
  ) as {
    sub?: string;
  };
  expect(tokenPayload.sub).toMatch(/^[0-9a-f-]{36}$/iu);
  return { token: token!, userId: tokenPayload.sub! };
}

function ipNumber(ip: string): number | null {
  const octets = ip.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return octets.reduce((value, part) => value * 256 + part, 0);
}

function rangeFor(cidr: string): [number, number] | null {
  const [ip, prefixValue] = cidr.split('/');
  const address = ip ? ipNumber(ip) : null;
  const prefix = Number(prefixValue);
  if (address === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const blockSize = 2 ** (32 - prefix);
  const start = Math.floor(address / blockSize) * blockSize;
  return [start, start + blockSize - 1];
}

function cidrContains(cidr: string, ip: string): boolean {
  const range = rangeFor(cidr);
  const value = ipNumber(ip);
  return Boolean(range && value !== null && range[0] <= value && value <= range[1]);
}

function chooseFreeCidr(networks: Network[]): string {
  const occupied = networks
    .map((network) => rangeFor(network.cidr))
    .filter((range): range is [number, number] => range !== null);
  const candidates = [
    ...Array.from({ length: 256 }, (_, index) => '10.252.' + index + '.0/24'),
    ...Array.from({ length: 256 }, (_, index) => '172.30.' + index + '.0/24'),
  ];
  const cidr = candidates.find((candidate) => {
    const candidateRange = rangeFor(candidate)!;
    return !occupied.some(([start, end]) => candidateRange[0] <= end && start <= candidateRange[1]);
  });
  if (!cidr) throw new Error('No se encontró un prefijo IPv4 libre para la fixture.');
  return cidr;
}

function ipAt(cidr: string, host: number): string {
  const octets = cidr.split('/')[0]!.split('.');
  octets[3] = String(host);
  return octets.join('.');
}

async function waitForInteractive(
  locator: Locator,
  eventName: 'onClick' | 'onChange' | 'onSubmit',
): Promise<void> {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  await expect
    .poll(
      () =>
        locator.evaluate((element, expectedEvent) => {
          const target =
            expectedEvent === 'onSubmit' && element instanceof HTMLButtonElement
              ? element.form
              : element;
          if (!target) return false;
          return Object.keys(target)
            .filter((key) => key.startsWith('__reactProps$'))
            .some((key) => {
              const props = (target as HTMLElement & Record<string, unknown>)[key];
              return (
                typeof props === 'object' &&
                props !== null &&
                typeof (props as Record<string, unknown>)[expectedEvent] === 'function'
              );
            });
        }, eventName),
      { message: 'Esperando que React conecte ' + eventName + ' antes del clic' },
    )
    .toBe(true);
}

async function selectPortalOption(
  page: Page,
  container: Locator,
  label: string,
  optionName: string,
): Promise<void> {
  const combobox = container.getByRole('combobox', { name: label });
  await waitForInteractive(combobox, 'onClick');
  await combobox.click();
  const option = page.getByRole('option', { name: optionName, exact: true });
  await waitForInteractive(option, 'onClick');
  await option.click();
}

async function selectFirstPortalOptionMatching(
  page: Page,
  container: Locator,
  label: string,
  optionName: RegExp,
): Promise<void> {
  const combobox = container.getByRole('combobox', { name: label });
  await waitForInteractive(combobox, 'onClick');
  await combobox.click();
  const option = page.getByRole('option').filter({ hasText: optionName }).first();
  await waitForInteractive(option, 'onClick');
  await option.click();
}

async function getOrder(page: Page, token: string, id: string): Promise<Order> {
  return api<Order>(page, token, 'GET', '/tasks/execution-orders/' + id);
}

async function createOrder(
  page: Page,
  noc: Session,
  technician: Session,
  siteId: string,
  subscriberId: string,
  label: string,
  suffix: string,
): Promise<Order> {
  const dispatched = await api<Order>(page, noc.token, 'POST', '/tasks/execution-orders/dispatch', {
    originContext: 'MANUAL',
    workType: 'INSTALLATION',
    organizationSiteId: siteId,
    customerDisplayLabel: label,
    serviceAddress: 'Dirección de prueba ' + suffix,
    municipality: 'Bogotá',
    sector: 'Sector de pruebas',
    workSummary: 'Instalación sintética MOD13 ' + suffix,
    subscriberId,
  });
  expect(dispatched.status).toBe('CREATED');
  expect(dispatched.id).toMatch(/^[0-9a-f-]{36}$/iu);

  const current = await getOrder(page, noc.token, dispatched.id);
  expect(current.status).toBe('CREATED');
  const assigned = await api<Order>(
    page,
    noc.token,
    'POST',
    '/tasks/execution-orders/' + current.id + '/assign',
    { assigneeType: 'TECHNICIAN', assigneeId: technician.userId },
    {
      'If-Match': String(current.version),
      'Idempotency-Key': 'mod13-ci2-assign-' + randomUUID(),
    },
  );
  expect(assigned.status).toBe('ASSIGNED');
  const persisted = await getOrder(page, technician.token, dispatched.id);
  expect(persisted.status).toBe('ASSIGNED');
  expect(persisted.allowedActions).toContain('START');
  return persisted;
}

async function startOrder(page: Page, tech: Session, order: Order): Promise<Order> {
  const started = await api<Order>(
    page,
    tech.token,
    'POST',
    '/tasks/execution-orders/' + order.id + '/start',
    {},
    {
      'If-Match': String(order.version),
      'Idempotency-Key': 'mod13-ci2-start-' + randomUUID(),
    },
  );
  expect(started.status).toBe('IN_PROGRESS');
  const persisted = await getOrder(page, tech.token, order.id);
  expect(persisted.status).toBe('IN_PROGRESS');
  return persisted;
}

async function getOrderVersion(page: Page, token: string, orderId: string): Promise<number> {
  const order = await getOrder(page, token, orderId);
  expect(Number.isInteger(order.version)).toBe(true);
  return order.version;
}

async function uploadAndRegisterEvidence(
  page: Page,
  token: string,
  orderId: string,
  evidenceType: 'PHOTO' | 'SIGNATURE',
  requirementKey: string,
  runId: string,
): Promise<Evidence> {
  const requestId = randomUUID();
  const boundary = '----iwanaMod13' + requestId.replace(/-/gu, '');
  const crlf = '\r\n';
  const header = Buffer.from(
    '--' +
      boundary +
      crlf +
      'Content-Disposition: form-data; name="file"; filename="evidence-' +
      runId +
      '.jpg"' +
      crlf +
      'Content-Type: image/jpeg' +
      crlf +
      crlf,
  );
  const body = Buffer.concat([header, JPG, Buffer.from(crlf + '--' + boundary + '--' + crlf)]);
  const upload = await page.request.post(
    API_PREFIX + '/tasks/execution-orders/' + orderId + '/evidence-assets',
    {
      headers: {
        ...tenantHeaders(token),
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'If-Match': String(await getOrderVersion(page, token, orderId)),
        'Idempotency-Key': 'mod13-ci2-upload-' + requestId,
      },
      data: body,
    },
  );
  const uploadBody = (await upload.json().catch(() => ({}))) as Dict;
  expect(upload.status(), 'La carga de evidencia debe pasar a análisis').toBe(202);
  const receipt = unwrap(uploadBody as { data?: Dict });
  const mediaAssetId = typeof receipt.mediaAssetId === 'string' ? receipt.mediaAssetId : '';
  expect(mediaAssetId).toMatch(/^[0-9a-f-]{36}$/iu);

  // El análisis corre en segundo plano. Esperar una ventana acotada evita
  // sondear rutas /evidence, que comparten una cuota operativa de diez/minuto.
  // La respuesta del registro confirma AVAILABLE; la lectura posterior usa
  // el detalle normal de la OT y verifica el requisito persistido.
  await page.waitForTimeout(10_000);
  const beforeRegister = await getOrder(page, token, orderId);
  expect(beforeRegister.status).toBe('IN_PROGRESS');

  const registered = await api<Evidence>(
    page,
    token,
    'POST',
    '/tasks/execution-orders/' + orderId + '/evidence',
    {
      mediaAssetId,
      evidenceType,
      requirementKey,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      capturedAt: new Date().toISOString(),
    },
    {
      'If-Match': String(beforeRegister.version),
      'Idempotency-Key': 'mod13-ci2-register-' + requestId,
    },
  );
  expect(registered).toMatchObject({
    mediaAssetId,
    evidenceType,
    requirementKey,
    status: 'AVAILABLE',
  });
  const persisted = await getOrder(page, token, orderId);
  expect(persisted.status).toBe('IN_PROGRESS');
  expect(persisted.completion?.requirements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ requirementId: requirementKey, satisfied: true }),
    ]),
  );
  return registered;
}

async function createCommercialFixture(
  page: Page,
  admin: Session,
  plan: Plan,
  suffix: string,
): Promise<{ expedienteId: string; subscriberId: string; contractId: string; email: string }> {
  const email = 'mod13-' + suffix + '@example.invalid';
  const fullName = 'Titular sintético ' + suffix;
  const expediente = await api<{ id: string }>(page, admin.token, 'POST', '/crm/expedientes', {
    fullName,
    acquisitionChannel: 'WEB',
    customerSegment: 'RESIDENTIAL',
    sourceDetail: 'Fixture E2E MOD13 ' + suffix,
  });
  expect(expediente.id).toMatch(/^[0-9a-f-]{36}$/iu);
  const updateSection = (section: string, data: Dict) =>
    api<Dict>(
      page,
      admin.token,
      'PATCH',
      '/crm/expedientes/' + expediente.id + '/sections/' + section,
      {
        data,
      },
    );

  await updateSection('identification', {
    personType: 'PERSONA_NATURAL',
    documentType: 'CC',
    documentNumber: 'QA-' + suffix,
    firstName: 'Titular',
    lastName: suffix,
  });
  await updateSection('contact', {
    phonePrimary: '+570000000000',
    emailPrimary: email,
    altContactName: 'Contacto sintético',
    altContactPhone: '+570000000001',
  });
  await updateSection('location', {
    address: 'Carrera de prueba 999',
    municipality: 'Bogotá',
    department: 'Cundinamarca',
    postalCode: '110111',
    stratum: 3,
    neighborhood: 'Sector de pruebas',
    latitude: 4.711,
    longitude: -74.072,
  });
  await updateSection('commercial_interest', {
    acquisitionChannel: 'WEB',
    sourceDetail: 'Fixture E2E MOD13 ' + suffix,
    interestedPlanId: plan.id,
  });
  await updateSection('technical_feasibility', {
    feasibility: 'VIABLE',
    candidateTechnologies: ['FIBER'],
    availableTechnology: 'FIBER',
    technicalConfidence: 'HIGH',
    evaluationSource: 'TECHNICAL_SITE_VISIT',
  });
  await updateSection('legal_consent', {
    identityVerified: 'VERIFIED',
    legalComplianceStatus: 'APPROVED',
  });
  const legalText = await api<{ version?: string }>(
    page,
    admin.token,
    'GET',
    '/privacy/legal-texts/current?type=AUTORIZACION',
  );
  expect(typeof legalText.version).toBe('string');
  await api<Dict>(page, admin.token, 'POST', '/crm/expedientes/' + expediente.id + '/consents', {
    consentType: 'TRATAMIENTO_DATOS',
    status: 'ACEPTADO',
    channel: 'TELEFONO',
    legalTextVersion: legalText.version,
    evidenceRef: 'mod13-ci2:' + suffix,
  });

  for (const targetStatus of [
    'PRECALIFICADO',
    'VALIDANDO_COBERTURA',
    'EN_COTIZACION',
    'LISTO_PARA_INSTALACION',
  ]) {
    await api<Dict>(page, admin.token, 'PATCH', '/crm/expedientes/' + expediente.id + '/status', {
      targetStatus,
    });
  }

  const findSubscriber = async (): Promise<string | null> => {
    const results = await api<unknown>(page, admin.token, 'POST', '/crm/subscribers/search', {
      email,
    });
    const rows = asList<Dict>(results);
    return typeof rows[0]?.id === 'string' ? (rows[0].id as string) : null;
  };
  await expect
    .poll(findSubscriber, { timeout: 30_000, intervals: [500, 1_000, 2_000] })
    .not.toBeNull();
  const subscriberId = await findSubscriber();
  if (!subscriberId)
    throw new Error('La conversión del expediente no creó el suscriptor esperado.');

  await api<Dict>(page, admin.token, 'PATCH', '/crm/subscribers/' + subscriberId, {
    vatResponsibility: 'NO_RESPONSABLE',
    rutResponsibilities: ['R-99-PN'],
  });
  const contract = await api<{ id: string; status?: string }>(
    page,
    admin.token,
    'POST',
    '/crm/subscribers/' + subscriberId + '/contracts',
    {
      subscriberId,
      planId: plan.id,
      planSnapshotJson: { id: plan.id, name: plan.name, vatConcept: 'INTERNET_ACCESS' },
      alias: 'Servicio MOD13 ' + suffix,
      serviceUsage: 'RESIDENTIAL',
      installationStratum: 3,
      customerSegment: 'RESIDENTIAL',
      installationAddress: 'Carrera de prueba 999',
      installationCity: 'Bogotá',
      installationDepartment: 'Cundinamarca',
      installationPostalCode: '110111',
    },
  );
  expect(contract.id).toMatch(/^[0-9a-f-]{36}$/iu);
  const activeContract = await api<{ id: string; status: string }>(
    page,
    admin.token,
    'POST',
    '/crm/contracts/' + contract.id + '/activate',
    {},
  );
  expect(activeContract.status).toBe('ACTIVE');
  const subscriber = await api<{ id: string; status: string }>(
    page,
    admin.token,
    'GET',
    '/crm/subscribers/' + subscriberId,
  );
  expect(subscriber.status).toBe('PROSPECT');
  return { expedienteId: expediente.id, subscriberId, contractId: contract.id, email };
}

async function createRouterAndNetwork(
  page: Page,
  noc: Session,
  siteId: string,
  suffix: string,
): Promise<{ router: Router; network: Network }> {
  const currentNetworks = asList<Network>(
    await api<unknown>(page, noc.token, 'GET', '/network/ipv4-networks?limit=100'),
  );
  const cidr = chooseFreeCidr(currentNetworks);
  const router = await api<Router>(page, noc.token, 'POST', '/network/routers', {
    name: 'mod13-ci2-router-' + suffix,
    managementHost: 'mod13-ci2-' + suffix + '.router.invalid',
    organizationSiteId: siteId,
    supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP', 'PCQ_ADDRESS_LIST'],
  });
  expect(router.status).toBe('ACTIVE');
  const network = await api<Network>(page, noc.token, 'POST', '/network/ipv4-networks', {
    routerId: router.id,
    name: 'mod13-ci2-network-' + suffix,
    cidr,
    gateway: ipAt(cidr, 1),
    assignableFrom: ipAt(cidr, 10),
    assignableTo: ipAt(cidr, 250),
    excludedIps: [ipAt(cidr, 10)],
    defaultControlMethod: 'PCQ_ADDRESS_LIST',
  });
  expect(network.status).toBe('ACTIVE');
  expect(network.routerId).toBe(router.id);
  expect(network.cidr).toBe(cidr);
  expect(network.occupancy.free).toBeGreaterThan(0);
  return { router, network };
}

async function networkById(
  page: Page,
  noc: Session,
  routerId: string,
  networkId: string,
): Promise<Network> {
  const networks = asList<Network>(
    await api<unknown>(
      page,
      noc.token,
      'GET',
      '/network/ipv4-networks?routerId=' + encodeURIComponent(routerId) + '&limit=100',
    ),
  );
  const network = networks.find((item) => item.id === networkId);
  if (!network) throw new Error('La red de la corrida dejó de aparecer en el catálogo.');
  return network;
}

async function getOrderContext(page: Page, token: string, orderId: string): Promise<OrderContext> {
  return api<OrderContext>(
    page,
    token,
    'GET',
    '/network/provisioning/orders/' + orderId + '/context',
  );
}

async function reserveThroughPortal(
  page: Page,
  noc: Session,
  order: Order,
  router: Router,
  network: Network,
  pcqAddressList: string,
): Promise<Provisioning> {
  await seedPortalSession(page, {
    token: noc.token,
    tenantSlug: requireEnv(TENANT_SLUG, 'E2E_TENANT_SLUG'),
  });
  await page.goto(
    '/dashboard/operations/execution-orders?executionOrderId=' + encodeURIComponent(order.id),
    { waitUntil: 'domcontentloaded' },
  );
  const panel = page.locator('#execution-order-provisioning');
  await expect(panel).toBeVisible();
  const context = await getOrderContext(page, noc.token, order.id);
  expect(context.executionOrder.status).toBe('IN_PROGRESS');
  expect(context.plan?.pcqAddressList).toBe(pcqAddressList);
  expect(context.provisioning).toBeNull();

  await selectPortalOption(page, panel, 'Router', router.name);
  await selectPortalOption(page, panel, 'Red IPv4', network.name + ' · ' + network.cidr);
  const automaticIp = panel.getByRole('radio', { name: 'Asignar automáticamente' });
  await waitForInteractive(automaticIp, 'onChange');
  await expect(automaticIp).toBeChecked();
  await selectPortalOption(page, panel, 'Método de control', 'Lista de direcciones PCQ');
  const parameter = panel.getByLabel('Lista de direcciones PCQ');
  await expect(parameter).toHaveValue(pcqAddressList);

  const reserveButton = panel.getByRole('button', { name: 'Reservar dirección IP', exact: true });
  await waitForInteractive(reserveButton, 'onClick');
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/network/provisioning/reserve') &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await reserveButton.click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as Provisioning | ApiEnvelope<Provisioning>;
  const service = unwrap(body);
  expect(service.status).toBe('RESERVED');
  expect(service.controlMethod).toBe('PCQ_ADDRESS_LIST');
  expect(service.controlParams).toEqual({
    method: 'PCQ_ADDRESS_LIST',
    addressList: pcqAddressList,
  });
  expect(typeof service.ip).toBe('string');
  expect(cidrContains(network.cidr, service.ip!)).toBe(true);
  return service;
}

async function createAndTransferCpe(
  page: Page,
  admin: Session,
  tech: Session,
  suffix: string,
): Promise<{ serial: string; assetId: string }> {
  const items = asList<Dict>(
    await api<unknown>(page, admin.token, 'GET', '/inventory/items?limit=100'),
  );
  const item = items.find(
    (candidate) => candidate.name === CPE_ITEM_NAME && candidate.trackingMode === 'SERIALIZED',
  );
  expect(item?.id).toMatch(/^[0-9a-f-]{36}$/iu);
  const locations = asList<Dict>(
    await api<unknown>(page, admin.token, 'GET', '/inventory/locations?limit=100'),
  );
  const warehouse = locations.find(
    (location) => location.type === 'MAIN_WAREHOUSE' && location.status === 'ACTIVE',
  );
  const technicianLocation = locations.find(
    (location) =>
      location.type === 'MOBILE_TECHNICIAN' &&
      location.status === 'ACTIVE' &&
      location.responsibleRefId === tech.userId,
  );
  expect(warehouse?.id).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(technicianLocation?.id).toMatch(/^[0-9a-f-]{36}$/iu);
  const suppliers = asList<Dict>(
    await api<unknown>(page, admin.token, 'GET', '/purchasing/suppliers?limit=100'),
  );
  const supplier = suppliers.find((candidate) => candidate.status === 'ACTIVE');
  expect(supplier?.partyRefId).toMatch(/^[0-9a-f-]{36}$/iu);
  const serial = 'MOD13-CI2-' + suffix;
  const purchase = await api<{
    lines?: Array<{ itemId?: string; lotId?: string | null; serializedAssetId?: string | null }>;
  }>(page, admin.token, 'POST', '/inventory/counter-purchases', {
    partyRefId: supplier!.partyRefId,
    invoiceNumber: 'MOD13-CI2-' + suffix,
    destinationLocationId: warehouse!.id,
    idempotencyKey: 'mod13-ci2-purchase-' + randomUUID(),
    lines: [
      {
        itemId: item!.id,
        quantityReceived: 1,
        unitCost: 1,
        serialNumbers: [serial],
        condition: 'NEW',
      },
    ],
  });
  const purchasedLine = purchase.lines?.find((line) => line.serializedAssetId);
  const assetId = purchasedLine?.serializedAssetId ?? '';
  const lotId = purchasedLine?.lotId ?? '';
  expect(assetId).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(lotId).toMatch(/^[0-9a-f-]{36}$/iu);
  const transfer = await api<Dict>(page, admin.token, 'POST', '/inventory/transfers', {
    itemId: item!.id,
    sourceLocationId: warehouse!.id,
    destinationLocationId: technicianLocation!.id,
    lotId,
    quantity: 1,
    serializedAssetId: assetId,
    serialNumber: serial,
    condition: 'NEW',
    handoffReference: 'MOD13-CI2-' + suffix,
    handoffNotes: 'Custodia de prueba para OT de instalación.',
    idempotencyKey: 'mod13-ci2-transfer-' + randomUUID(),
  });
  expect(transfer).toBeTruthy();
  const assets = asList<Dict>(
    await api<unknown>(
      page,
      admin.token,
      'GET',
      '/inventory/assets?serialNumber=' + encodeURIComponent(serial) + '&limit=100',
    ),
  );
  expect(assets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: assetId,
        serialNumber: serial,
        currentStatus: 'ASSIGNED_TO_TECHNICIAN',
        currentLocationId: technicianLocation!.id,
      }),
    ]),
  );
  return { serial, assetId };
}

async function registerCpeThroughPortal(
  page: Page,
  tech: Session,
  order: Order,
  serial: string,
): Promise<void> {
  await seedPortalSession(page, {
    token: tech.token,
    tenantSlug: requireEnv(TENANT_SLUG, 'E2E_TENANT_SLUG'),
  });
  await page.goto(
    '/dashboard/operations/execution-orders?executionOrderId=' + encodeURIComponent(order.id),
    { waitUntil: 'domcontentloaded' },
  );
  const start = page.getByRole('button', { name: 'Iniciar ejecución', exact: true });
  await waitForInteractive(start, 'onClick');
  const startPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/tasks/execution-orders/' + order.id + '/start') &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await start.click();
  expect((await startPromise).status()).toBe(200);
  const persistedStartedOrder = await getOrder(page, tech.token, order.id);
  expect(persistedStartedOrder.status).toBe('IN_PROGRESS');

  const trigger = page.getByRole('button', {
    name: /^Registrar equipos instalados en el sitio del cliente para /u,
  });
  await waitForInteractive(trigger, 'onClick');
  await trigger.click();
  const region = page.getByRole('region', {
    name: 'Registrar equipos instalados en el sitio del cliente',
  });
  await expect(region).toBeVisible();
  const cpeRadio = region.getByRole('radio', { name: new RegExp(serial) });
  await waitForInteractive(cpeRadio, 'onChange');
  await cpeRadio.click();
  const register = region.getByRole('button', { name: 'Registrar equipo', exact: true });
  await waitForInteractive(register, 'onClick');
  const usagePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/tasks/execution-orders/' + order.id + '/item-usage') &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await register.click();
  expect((await usagePromise).status()).toBe(202);
  await expect(region.getByRole('status').filter({ hasText: 'Equipo registrado' })).toBeVisible();
}

test.describe('MOD13 · aprovisionamiento de red en tenant de prueba', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(360_000);

  test('recorre una instalación completa y libera la IP al anular otra OT', async ({
    page,
    browser,
  }) => {
    expect(TENANT_SLUG, 'El spec solo puede operar en el tenant de pruebas autorizado').toBe(
      TEST_TENANT,
    );
    const health = await page.request.get(API_PREFIX + '/health');
    expect(health.status()).toBe(200);
    const portalLogin = await page.request.get(PORTAL_BASE + '/auth/login');
    expect(portalLogin.status()).toBe(200);

    const noc = await login(page, process.env.E2E_NOC_EMAIL, process.env.E2E_NOC_PASSWORD);
    const tech = await login(page, process.env.E2E_TECH_EMAIL, process.env.E2E_TECH_PASSWORD);
    const admin = await login(
      page,
      process.env.E2E_TENANT_ADMIN_EMAIL,
      process.env.E2E_TENANT_ADMIN_PASSWORD,
    );
    expect(noc.userId).not.toBe(tech.userId);
    expect(admin.userId).not.toBe(tech.userId);
    const siteId = requireEnv(process.env.E2E_MOD13_SITE_ID, 'E2E_MOD13_SITE_ID');
    expect(siteId).toMatch(/^[0-9a-f-]{36}$/iu);

    const settings = await api<{ enforceProvisioningOnInstallClose: boolean }>(
      page,
      noc.token,
      'GET',
      '/network/settings',
    );
    expect(settings.enforceProvisioningOnInstallClose).toBe(true);
    const commercialPlans = asList<Plan>(
      await api<unknown>(
        page,
        admin.token,
        'GET',
        '/commercial/catalog?type=PLAN&isActive=true&limit=100',
      ),
    );
    const profiles = asList<PlanProfile>(
      await api<unknown>(page, noc.token, 'GET', '/network/plan-profiles'),
    );
    const eligibleProfiles = profiles.filter((profile) =>
      /^[A-Za-z0-9._-]{1,64}$/u.test(profile.pcqAddressList),
    );
    expect(eligibleProfiles).toHaveLength(1);
    const profile = eligibleProfiles[0]!;
    const plan = commercialPlans.find((candidate) => candidate.id === profile.planId);
    expect(plan?.isActive).toBe(true);

    const runId = randomUUID().replace(/-/gu, '').slice(0, 12).toLowerCase();
    const suffix = Date.now().toString(36) + runId;
    const commercial = await createCommercialFixture(page, admin, plan!, suffix);
    const cpe = await createAndTransferCpe(page, admin, tech, suffix);
    const { router, network } = await createRouterAndNetwork(page, noc, siteId, suffix);

    const mainOrder = await createOrder(
      page,
      noc,
      tech,
      siteId,
      commercial.subscriberId,
      'Titular sintético ' + suffix,
      suffix + '-main',
    );
    const currentMain = await getOrder(page, noc.token, mainOrder.id);
    expect(currentMain.status).toBe('ASSIGNED');
    expect(currentMain.template?.version).toBe(3);
    expect(currentMain.template?.requirements?.length).toBeGreaterThan(0);

    await registerCpeThroughPortal(page, tech, currentMain, cpe.serial);
    await expect
      .poll(
        async () => {
          const context = await getOrderContext(page, noc.token, currentMain.id);
          return context.cpe?.serialNumber ?? null;
        },
        { timeout: 90_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe(cpe.serial);

    // Detener consultas del drawer mientras se cargan evidencias por API;
    // cada ruta de evidencia comparte una cuota de diez por actor y minuto.
    await page.goto('about:blank');
    const servicePhoto = await uploadAndRegisterEvidence(
      page,
      tech.token,
      currentMain.id,
      'PHOTO',
      'service-test',
      suffix,
    );
    await uploadAndRegisterEvidence(
      page,
      tech.token,
      currentMain.id,
      'PHOTO',
      'work-photo',
      suffix,
    );
    const signature = await uploadAndRegisterEvidence(
      page,
      tech.token,
      currentMain.id,
      'SIGNATURE',
      'CUSTOMER_SIGNATURE',
      suffix,
    );

    const reservation = await reserveThroughPortal(
      page,
      noc,
      currentMain,
      router,
      network,
      profile.pcqAddressList,
    );
    const reservedContext = await getOrderContext(page, noc.token, currentMain.id);
    expect(reservedContext.provisioning?.id).toBe(reservation.id);
    expect(reservedContext.provisioning?.status).toBe('RESERVED');
    expect(reservedContext.provisioning?.ip).toBe(reservation.ip);
    expect(reservedContext.cpe?.serialNumber).toBe(cpe.serial);

    const prematureClose = await page.request.post(
      API_PREFIX + '/tasks/execution-orders/' + currentMain.id + '/close',
      {
        headers: {
          ...tenantHeaders(tech.token),
          'If-Match': String(await getOrderVersion(page, tech.token, currentMain.id)),
          'Idempotency-Key': 'mod13-ci2-premature-close-' + randomUUID(),
        },
        data: {
          result: 'EXECUTED',
          summary: 'Comprobación de cierre antes de la certificación.',
          customerAcceptance: { artifactId: signature.mediaAssetId, method: 'SIGNATURE' },
        },
      },
    );
    const prematureBody = (await prematureClose.json().catch(() => ({}))) as Dict;
    expect(prematureClose.status()).toBe(422);
    expect(prematureBody.code).toBe('CLOSURE_GATE_INCOMPLETE');
    expect(prematureBody.missingRequirements).toContain('Aprovisionamiento certificado');

    await seedPortalSession(page, {
      token: noc.token,
      tenantSlug: requireEnv(TENANT_SLUG, 'E2E_TENANT_SLUG'),
    });
    await page.goto(
      '/dashboard/operations/execution-orders?executionOrderId=' +
        encodeURIComponent(currentMain.id),
      { waitUntil: 'domcontentloaded' },
    );
    const nocPanel = page.locator('#execution-order-provisioning');
    await expect(nocPanel).toBeVisible();
    const certificationEvidence = nocPanel.getByRole('combobox', {
      name: 'Foto o documento para certificar',
    });
    await waitForInteractive(certificationEvidence, 'onClick');
    await certificationEvidence.click();
    const photoOption = page
      .getByRole('option')
      .filter({ hasText: /^Foto ·/u })
      .first();
    await waitForInteractive(photoOption, 'onClick');
    await photoOption.click();
    const certify = nocPanel.getByRole('button', {
      name: 'Certificar aprovisionamiento',
      exact: true,
    });
    await waitForInteractive(certify, 'onClick');
    const certifyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/network/provisioning/' + reservation.id + '/certify') &&
        response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await certify.click();
    expect((await certifyResponsePromise).status()).toBe(200);
    const certifiedContext = await getOrderContext(page, noc.token, currentMain.id);
    expect(certifiedContext.provisioning?.status).toBe('CERTIFIED');
    expect(certifiedContext.provisioning?.certificationEvidenceId).toBe(servicePhoto.id);

    const closingPage = await browser.newPage({ baseURL: PORTAL_BASE });
    await seedPortalSession(closingPage, {
      token: tech.token,
      tenantSlug: requireEnv(TENANT_SLUG, 'E2E_TENANT_SLUG'),
    });
    await closingPage.goto(
      '/dashboard/operations/execution-orders?executionOrderId=' +
        encodeURIComponent(currentMain.id),
      { waitUntil: 'domcontentloaded' },
    );
    const orderAfterCert = await getOrder(closingPage, tech.token, currentMain.id);
    expect(orderAfterCert.status).toBe('IN_PROGRESS');
    expect(orderAfterCert.allowedActions).toContain('CLOSE');
    const closePanel = closingPage
      .getByRole('heading', { name: 'Cierre', exact: true })
      .locator('xpath=..');
    await selectPortalOption(closingPage, closePanel, 'Resultado', 'Ejecutada');
    await selectFirstPortalOptionMatching(
      closingPage,
      closePanel,
      'Referencia de evidencia',
      /^Firma del cliente ·/u,
    );
    await selectPortalOption(closingPage, closePanel, 'Forma de aceptación', 'Firma');
    const summary = closingPage.getByLabel('Resumen de cierre');
    await waitForInteractive(summary, 'onChange');
    await summary.fill('Instalación sintética completada y validada.');
    const closeButton = closingPage.getByRole('button', { name: 'Cerrar OT', exact: true });
    await waitForInteractive(closeButton, 'onClick');
    await closeButton.click();
    const confirmClose = closingPage.getByRole('button', { name: 'Confirmar cierre', exact: true });
    await waitForInteractive(confirmClose, 'onClick');
    const closeResponsePromise = closingPage.waitForResponse(
      (response) =>
        response.url().includes('/tasks/execution-orders/' + currentMain.id + '/close') &&
        response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await confirmClose.click();
    expect((await closeResponsePromise).status()).toBe(200);

    await expect
      .poll(
        async () => {
          const context = await getOrderContext(closingPage, noc.token, currentMain.id);
          return context.provisioning?.status ?? null;
        },
        { timeout: 120_000, intervals: [500, 1_000, 2_000, 4_000] },
      )
      .toBe('ACTIVE');
    const activeOrder = await getOrder(closingPage, tech.token, currentMain.id);
    expect(activeOrder.status).toBe('COMPLETED');
    expect(activeOrder.result).toBe('EXECUTED');
    const activeContext = await getOrderContext(closingPage, noc.token, currentMain.id);
    expect(activeContext.provisioning?.commercialActivation?.status).toBe('DONE');
    const activeSubscriber = await api<{ status: string }>(
      closingPage,
      admin.token,
      'GET',
      '/crm/subscribers/' + commercial.subscriberId,
    );
    expect(activeSubscriber.status).toBe('ACTIVE');
    const installedAssets = asList<Dict>(
      await api<unknown>(
        closingPage,
        admin.token,
        'GET',
        '/inventory/assets?serialNumber=' + encodeURIComponent(cpe.serial) + '&limit=100',
      ),
    );
    expect(installedAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: cpe.assetId, currentStatus: 'INSTALLED_COMODATO' }),
      ]),
    );
    const loans = asList<Dict>(
      await api<unknown>(
        closingPage,
        admin.token,
        'GET',
        '/inventory/loans?status=abierto&serializedAssetId=' + cpe.assetId + '&limit=100',
      ),
    );
    expect(loans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          executionOrderRefId: currentMain.id,
          serializedAssetId: cpe.assetId,
        }),
      ]),
    );

    const secondOrder = await createOrder(
      closingPage,
      noc,
      tech,
      siteId,
      commercial.subscriberId,
      'Titular sintético ' + suffix,
      suffix + '-cancel',
    );
    const secondInProgress = await startOrder(closingPage, tech, secondOrder);
    const networkBeforeSecond = await networkById(closingPage, noc, router.id, network.id);
    const secondReservation = await api<Provisioning>(
      closingPage,
      noc.token,
      'POST',
      '/network/provisioning/reserve',
      {
        executionOrderId: secondInProgress.id,
        routerId: router.id,
        ipv4NetworkId: network.id,
        controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: profile.pcqAddressList },
      },
    );
    expect(secondReservation.status).toBe('RESERVED');
    expect(secondReservation.ip).not.toBe(reservation.ip);
    const occupiedNetwork = await networkById(closingPage, noc, router.id, network.id);
    expect(occupiedNetwork.occupancy.reserved).toBe(networkBeforeSecond.occupancy.reserved + 1);
    expect(occupiedNetwork.occupancy.free).toBe(networkBeforeSecond.occupancy.free - 1);

    const annulled = await api<Order>(
      closingPage,
      noc.token,
      'POST',
      '/tasks/execution-orders/' + secondInProgress.id + '/annul',
      { reason: 'OT sintética anulada para comprobar la liberación de IP.' },
      {
        'If-Match': String(await getOrderVersion(closingPage, noc.token, secondInProgress.id)),
        'Idempotency-Key': 'mod13-ci2-annul-' + randomUUID(),
      },
    );
    expect(annulled.status).toBe('CANCELLED');
    await expect
      .poll(
        async () => {
          const context = await getOrderContext(closingPage, noc.token, secondInProgress.id);
          return context.provisioning?.status ?? null;
        },
        { timeout: 120_000, intervals: [500, 1_000, 2_000, 4_000] },
      )
      .toBe('RELEASED');
    const releasedContext = await getOrderContext(closingPage, noc.token, secondInProgress.id);
    expect(releasedContext.provisioning?.id).toBe(secondReservation.id);
    expect(releasedContext.provisioning?.releaseReason).toBe('ANNULLED');
    const releasedNetwork = await networkById(closingPage, noc, router.id, network.id);
    expect(releasedNetwork.occupancy.reserved).toBe(networkBeforeSecond.occupancy.reserved);
    expect(releasedNetwork.occupancy.free).toBe(networkBeforeSecond.occupancy.free);
    const finalSecondOrder = await getOrder(closingPage, noc.token, secondInProgress.id);
    expect(finalSecondOrder.status).toBe('CANCELLED');
    expect(finalSecondOrder.annulled).toBe(true);

    await closingPage.close();
  });
});
