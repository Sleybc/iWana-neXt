import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
  .loadEnvFile;
if (loadEnvFile) {
  for (const filename of ['.env.development.local', '.env.development', '.env']) {
    const path = resolve(process.cwd(), filename);
    if (existsSync(path)) {
      try {
        loadEnvFile(path);
      } catch {
        // La precondición posterior falla sin revelar valores del fichero.
      }
    }
  }
}

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const API_BASE = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3000';
const API_PREFIX = `${API_BASE}/api/v1`;
const TENANT_SLUG = process.env['E2E_TENANT_SLUG'];
const EXECUTION_ORDER_ID = '2ab52cdf-1118-41ec-98c9-d9d5ab55d01a';
const ROUTER_NAME = 'qa-mod13-v1-20261023-router';
const NETWORK_NAME = 'qa-mod13-v1-20261023-network';

interface LoginResponse {
  accessToken?: string;
}

interface ProvisioningContext {
  executionOrder?: {
    id?: string;
    assignedTechnician?: { id?: string | null } | null;
  };
  provisioning?: { id?: string; status?: string; version?: number } | null;
}

interface TechnicianProvisioningView {
  executionOrderId: string;
  status: string | null;
  ip: string | null;
  certified: boolean;
  updatedAt: string | null;
}

interface RouterRecord {
  id: string;
  name: string;
  status: string;
  supportedControlMethods: string[];
}

interface NetworkRecord {
  id: string;
  routerId: string;
  name: string;
  status: string;
}

interface ProvisioningRecord {
  id: string;
  status: string;
  version: number;
}

interface ApiResult {
  status: number;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrap<T>(value: unknown): T {
  if (isRecord(value) && 'data' in value && value['data'] !== undefined) {
    return unwrap<T>(value['data']);
  }
  return value as T;
}

function findArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!isRecord(value)) return [];
  for (const key of ['data', 'items', 'rows']) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested as T[];
    if (isRecord(nested)) {
      const found = findArray<T>(nested);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function findCode(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value['code'] === 'string') return value['code'];
  for (const nested of Object.values(value)) {
    const code = findCode(nested);
    if (code) return code;
  }
  return undefined;
}

async function apiRequest(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { 'X-Tenant-Slug': TENANT_SLUG ?? '' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_PREFIX}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
}

async function login(email: string | undefined, password: string | undefined): Promise<string> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  expect(response.status).toBe(200);
  const token = unwrap<LoginResponse>(response.body).accessToken;
  expect(typeof token).toBe('string');
  return token as string;
}

describeWithDb('MOD13 — cableado real de NetworkModule contra API y PostgreSQL', () => {
  let nocToken: string;
  let technicianToken: string;
  let router: RouterRecord;
  let network: NetworkRecord;
  let controlParams: Record<string, string>;
  let provisioningId: string | undefined;
  let provisioningVersion: number | undefined;
  let released = false;

  beforeAll(async () => {
    expect(TENANT_SLUG).toBe('srqa-mod11-r5-20261006');
    const health = await fetch(`${API_PREFIX}/health`);
    expect(health.status).toBe(200);
    nocToken = await login(process.env['E2E_NOC_EMAIL'], process.env['E2E_NOC_PASSWORD']);
    technicianToken = await login(process.env['E2E_TECH_EMAIL'], process.env['E2E_TECH_PASSWORD']);

    const context = await apiRequest(`/network/provisioning/orders/${EXECUTION_ORDER_ID}/context`, {
      token: nocToken,
    });
    expect(context.status).toBe(200);
    const current = unwrap<ProvisioningContext>(context.body).provisioning;
    if (current?.status === 'RESERVED' || current?.status === 'CERTIFIED') {
      throw new Error(
        '[BLOQUEO] La OT FX-v1 ya tiene una reserva activa; se conserva sin cambios.',
      );
    }

    const routers = await apiRequest('/network/routers?page=1&limit=100', { token: nocToken });
    const networks = await apiRequest('/network/ipv4-networks?page=1&limit=100', {
      token: nocToken,
    });
    expect(routers.status).toBe(200);
    expect(networks.status).toBe(200);
    const selectedRouter = findArray<RouterRecord>(routers.body).find(
      (item) => item.name === ROUTER_NAME && item.status === 'ACTIVE',
    );
    const selectedNetwork = findArray<NetworkRecord>(networks.body).find(
      (item) => item.name === NETWORK_NAME && item.status === 'ACTIVE',
    );
    expect(selectedRouter).toBeDefined();
    expect(selectedNetwork).toBeDefined();
    expect(selectedNetwork?.routerId).toBe(selectedRouter?.id);
    router = selectedRouter as RouterRecord;
    network = selectedNetwork as NetworkRecord;
    const method = router.supportedControlMethods.includes('SIMPLE_QUEUE_STATIC_IP')
      ? 'SIMPLE_QUEUE_STATIC_IP'
      : router.supportedControlMethods[0];
    expect(method).toBeTruthy();
    controlParams =
      method === 'PCQ_ADDRESS_LIST'
        ? { method, addressList: 'subscribers' }
        : { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'mod13-wiring-qa' };
  }, 90_000);

  afterAll(async () => {
    if (!released && provisioningId && provisioningVersion !== undefined && nocToken) {
      const context = await apiRequest(
        `/network/provisioning/orders/${EXECUTION_ORDER_ID}/context`,
        { token: nocToken },
      );
      if (context.status === 200) {
        const current = unwrap<ProvisioningContext>(context.body).provisioning;
        if (current?.id === provisioningId && current.status === 'RESERVED') {
          await apiRequest(`/network/provisioning/${provisioningId}/release`, {
            method: 'POST',
            token: nocToken,
            body: { version: current.version, reason: 'Limpieza de prueba de cableado' },
          });
        }
      }
    }
  });

  it('context: proyecta al NOC el contexto real de la OT', async () => {
    const response = await apiRequest(
      `/network/provisioning/orders/${EXECUTION_ORDER_ID}/context`,
      { token: nocToken },
    );
    expect(response.status).toBe(200);
    const context = unwrap<ProvisioningContext>(response.body);
    expect(context.executionOrder?.id).toBe(EXECUTION_ORDER_ID);
    expect(context.executionOrder?.assignedTechnician?.id).toBeTruthy();
  });

  it('context: entrega al técnico solo la proyección reducida', async () => {
    const response = await apiRequest(
      `/network/provisioning/orders/${EXECUTION_ORDER_ID}/context`,
      { token: technicianToken },
    );
    expect(response.status).toBe(200);
    const context = unwrap<TechnicianProvisioningView>(response.body);
    expect(Object.keys(context).sort()).toEqual(
      ['certified', 'executionOrderId', 'ip', 'status', 'updatedAt'].sort(),
    );
    expect(context.executionOrderId).toBe(EXECUTION_ORDER_ID);
  });

  it('reserve: persiste servicio y asignación IP con los puertos reales', async () => {
    const response = await apiRequest('/network/provisioning/reserve', {
      method: 'POST',
      token: nocToken,
      body: {
        executionOrderId: EXECUTION_ORDER_ID,
        routerId: router.id,
        ipv4NetworkId: network.id,
        controlParams,
      },
    });
    expect(response.status).toBe(201);
    const service = unwrap<ProvisioningRecord>(response.body);
    expect(service.id).toEqual(expect.any(String));
    expect(service.status).toBe('RESERVED');
    provisioningId = service.id;
    provisioningVersion = service.version;
  });

  it('certify: consulta evidencia mediante el puerto real de OT', async () => {
    expect(provisioningId).toBeTruthy();
    const response = await apiRequest(`/network/provisioning/${provisioningId}/certify`, {
      method: 'POST',
      token: nocToken,
      body: { evidenceId: randomUUID(), version: provisioningVersion },
    });
    expect(response.status).toBe(422);
    expect(findCode(response.body)).toBe('PROVISIONING_EVIDENCE_REQUIRED');
  });

  it('release: libera la reserva real usando el puerto de lectura de OT', async () => {
    expect(provisioningId).toBeTruthy();
    const response = await apiRequest(`/network/provisioning/${provisioningId}/release`, {
      method: 'POST',
      token: nocToken,
      body: { version: provisioningVersion, reason: 'Limpieza de prueba de cableado' },
    });
    expect(response.status).toBe(200);
    expect(unwrap<ProvisioningRecord>(response.body).status).toBe('RELEASED');
    released = true;
  });

  it('regularize: rechaza una OT abierta mediante el puerto real de tasks', async () => {
    const response = await apiRequest('/network/provisioning/regularize', {
      method: 'POST',
      token: nocToken,
      body: {
        executionOrderId: EXECUTION_ORDER_ID,
        routerId: router.id,
        ipv4NetworkId: network.id,
        controlParams,
        reason: 'La OT sigue abierta en la prueba',
      },
    });
    expect(response.status).toBe(422);
    expect(findCode(response.body)).toBe('PROVISIONING_ORDER_NOT_ELIGIBLE');
  });
});
