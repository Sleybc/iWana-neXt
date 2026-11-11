import { randomUUID } from 'node:crypto';
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
