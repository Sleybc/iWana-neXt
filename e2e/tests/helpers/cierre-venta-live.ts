import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

// Helpers compartidos de los E2E vivos de Cierre de venta (fase 1 y fase 2).
// API y worker reales en el tenant de desarrollo (`E2E_TENANT_SLUG`); datos sintéticos.

export const API_PREFIX = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000') + '/api/v1';
export const TENANT_SLUG = process.env.E2E_TENANT_SLUG;
export const SITE_ID = process.env.E2E_MOD13_SITE_ID;
export const REQUIRED = {
  E2E_TENANT_SLUG: TENANT_SLUG,
  E2E_MOD13_SITE_ID: SITE_ID,
  E2E_TENANT_ADMIN_EMAIL: process.env.E2E_TENANT_ADMIN_EMAIL,
  E2E_TENANT_ADMIN_PASSWORD: process.env.E2E_TENANT_ADMIN_PASSWORD,
  E2E_NOC_EMAIL: process.env.E2E_NOC_EMAIL,
  E2E_NOC_PASSWORD: process.env.E2E_NOC_PASSWORD,
  E2E_TECH_EMAIL: process.env.E2E_TECH_EMAIL,
  E2E_TECH_PASSWORD: process.env.E2E_TECH_PASSWORD,
};
export const missingEnv = Object.entries(REQUIRED)
  .filter(([, value]) => !value?.trim())
  .map(([name]) => name);

export const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z',
  'base64',
);

export type Dict = Record<string, unknown>;
export type Session = { token: string; userId: string };
export type Order = { id: string; version: number; status: string };
export type Provisioning = {
  id: string;
  status: string;
  version: number;
  certifiedAt?: string | null;
};
export type Generation = {
  generationId: string;
  status: string;
  documentSha256: string | null;
  failureReason: string | null;
  missingOperatorFields: string[];
};
export type OperatorProfile = Dict & { equipmentIncidentReportChannel: string | null };

export function headers(token?: string): Record<string, string> {
  return {
    'X-Tenant-Slug': TENANT_SLUG!,
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  };
}

export function unwrap<T>(body: unknown): T {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const data = (body as { data?: unknown }).data;
    if (data !== undefined) return data as T;
  }
  return body as T;
}

export async function raw(
  page: Page,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  data?: unknown,
  extra: Record<string, string> = {},
) {
  return page.request.fetch(API_PREFIX + path, {
    method,
    headers: { ...headers(token), ...extra },
    ...(data !== undefined ? { data } : {}),
  });
}

export async function api<T>(
  page: Page,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  data?: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  const response = await raw(page, token, method, path, data, extra);
  const body: unknown = await response.json().catch(() => ({}));
  const code = (body as { code?: unknown })?.code;
  expect(
    response.ok(),
    `API ${method} ${path}: HTTP ${response.status()} code=${typeof code === 'string' ? code : '-'} ${response.ok() ? '' : JSON.stringify(body).slice(0, 300)}`,
  ).toBe(true);
  return unwrap<T>(body);
}

/**
 * Razón social/NIT en el perfil y una versión nueva y aprobada de CONTRATO_SERVICIO,
 * publicada desde la semilla vigente del repo (el worker renderiza el texto publicado).
 * Sin esto, en un tenant recién creado (R4.1) la generación falla con TEMPLATE_NOT_APPROVED.
 */
export async function publishApprovedContractTemplate(
  page: Page,
  adminToken: string,
  suffix: string,
): Promise<void> {
  await api(page, adminToken, 'PATCH', '/tenants/me/profile', {
    legalName: 'Operador Sintético QA S.A.S.',
    nit: '900000001',
  });
  const html = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../apps/worker/src/templates/contracts/contrato-servicio.base.html',
    ),
    'utf8',
  );
  await api(page, adminToken, 'POST', '/privacy/legal-texts', {
    type: 'CONTRATO_SERVICIO',
    version: 'qa-' + suffix.slice(0, 12),
    format: 'HTML',
    content: html,
    legalApprovalDeclaration: 'APROBADO_POR_ASESORIA_JURIDICA',
  });
}

/**
 * Datos del operador que exige la generación del contrato. En un tenant recién creado
 * (R4.1) faltan y la generación falla con OPERATOR_DATA_MISSING.
 */
export async function completeOperatorContractProfile(page: Page, adminToken: string) {
  const profile = await api<Record<string, unknown>>(
    page,
    adminToken,
    'GET',
    '/organization/contract-profile',
  );
  await api(page, adminToken, 'PUT', '/organization/contract-profile', {
    qualityAndCoverageUrl: 'https://operador-qa.example.invalid/calidad',
    customerServiceChannels: [{ kind: 'PHONE', value: '6010000000', label: 'Línea de atención' }],
    reconnectionFee: 15000,
    annualIncreaseCapPercent: 5,
    equipmentIncidentReportChannel: 'Línea 6010000000 o soporte@operador-qa.example.invalid',
    otherConditions: profile['otherConditions'] ?? null,
  });
}

/**
 * Suscriptor que la conversión creó para el expediente, o `null` si aún no existe.
 * Desde 7bebb5eb la búsqueda excluye a los prospectos, así que se lee del bootstrap
 * del expediente (mismo camino que portal-mod05-deuda-fiscal-live).
 */
export async function subscriberOfExpediente(
  page: Page,
  token: string,
  expedienteId: string,
): Promise<string | null> {
  const bootstrap = await api<{ subscriberSummary: { id: string } | null }>(
    page,
    token,
    'GET',
    `/crm/expedientes/${expedienteId}/bootstrap`,
  );
  return bootstrap.subscriberSummary?.id ?? null;
}

/**
 * Quien despacha y asigna la OT. Donde el NOC no supervisa la sede (R4.1, que separa
 * coordinador y NOC como la spec MOD13) se usa el coordinador de E2E_MOD13_COORDINATOR_*;
 * sin esas variables (tenant de desarrollo) despacha el mismo NOC.
 */
export async function loginDispatcher(page: Page, noc: Session): Promise<Session> {
  const email = process.env.E2E_MOD13_COORDINATOR_EMAIL?.trim();
  const password = process.env.E2E_MOD13_COORDINATOR_PASSWORD;
  return email && password ? login(page, email, password) : noc;
}

export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const data = (value as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as T[];
  throw new Error('La API no devolvió una lista.');
}

export async function login(page: Page, email: string, password: string): Promise<Session> {
  const response = await page.request.post(API_PREFIX + '/auth/login', {
    headers: { 'X-Tenant-Slug': TENANT_SLUG! },
    data: { email, password },
  });
  expect(response.status(), 'Inicio de sesión E2E').toBe(200);
  const token = ((await response.json()) as { data?: { accessToken?: string } }).data?.accessToken;
  expect(typeof token).toBe('string');
  const payload = JSON.parse(Buffer.from(token!.split('.')[1] ?? '', 'base64url').toString()) as {
    sub: string;
  };
  return { token: token!, userId: payload.sub };
}

/** Bogotá no tiene horario de verano: la fecha civil local del instante. */
export function tenantLocalDate(iso: string, timeZone = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

export async function uploadEvidence(
  page: Page,
  tech: Session,
  orderId: string,
  evidenceType: 'PHOTO' | 'SIGNATURE',
  requirementKey: string,
): Promise<{ id: string; mediaAssetId: string }> {
  const requestId = randomUUID();
  const boundary = '----iwanaCierre' + requestId.replace(/-/gu, '');
  const crlf = '\r\n';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="e-${requestId}.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
    ),
    JPG,
    Buffer.from(`${crlf}--${boundary}--${crlf}`),
  ]);
  const order = await api<Order>(page, tech.token, 'GET', '/tasks/execution-orders/' + orderId);
  const upload = await page.request.post(
    API_PREFIX + '/tasks/execution-orders/' + orderId + '/evidence-assets',
    {
      headers: {
        ...headers(tech.token),
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'If-Match': String(order.version),
        'Idempotency-Key': 'cierre-upload-' + requestId,
      },
      data: body,
    },
  );
  expect(upload.status(), 'Carga de evidencia').toBe(202);
  const mediaAssetId = unwrap<{ mediaAssetId: string }>(await upload.json()).mediaAssetId;
  // El análisis corre en el worker; las rutas /evidence tienen cuota de 10/min.
  await page.waitForTimeout(10_000);
  const current = await api<Order>(page, tech.token, 'GET', '/tasks/execution-orders/' + orderId);
  return api<{ id: string; mediaAssetId: string }>(
    page,
    tech.token,
    'POST',
    '/tasks/execution-orders/' + orderId + '/evidence',
    {
      mediaAssetId,
      evidenceType,
      requirementKey,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      capturedAt: new Date().toISOString(),
    },
    { 'If-Match': String(current.version), 'Idempotency-Key': 'cierre-reg-' + requestId },
  );
}

export async function drawSignature(canvas: Locator, page: Page) {
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(
      box.x + box.width * (0.15 + i * 0.05),
      box.y + box.height * (0.6 - Math.sin(i / 2) * 0.25),
      { steps: 3 },
    );
  }
  await page.mouse.up();
}
