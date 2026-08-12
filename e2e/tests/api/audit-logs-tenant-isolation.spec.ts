import { expect, request, test } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import crypto from 'node:crypto';

type JsonObject = Record<string, unknown>;

const API_BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const API_PREFIX = `${API_BASE}/api/v1`;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable E2E requerida: ${name}`);
  }
  return value;
}

async function jsonObject(response: APIResponse): Promise<JsonObject> {
  const body: unknown = await response.json();
  return body !== null && typeof body === 'object' ? (body as JsonObject) : {};
}

function decodeJwtPayload(token: string): JsonObject {
  const segment = token.split('.')[1];
  if (!segment) {
    throw new Error('La respuesta de login no contiene un JWT válido.');
  }

  const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (payload === null || typeof payload !== 'object') {
    throw new Error('El JWT no contiene un payload válido.');
  }
  return payload as JsonObject;
}

async function tenantLogin(
  api: APIRequestContext,
  email: string,
  password: string,
  tenantSlug: string,
): Promise<{ token: string; tenantId: string }> {
  const response = await api.post(`${API_PREFIX}/auth/login`, {
    data: { email, password },
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  expect(response.status()).toBe(200);

  const body = await jsonObject(response);
  const data = body.data as JsonObject | undefined;
  const token = typeof data?.accessToken === 'string' ? data.accessToken : '';
  expect(token).toBeTruthy();

  const payload = decodeJwtPayload(token);
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : '';
  expect(tenantId).toBeTruthy();

  return { token, tenantId };
}

function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function findAuditEntry(
  api: APIRequestContext,
  token: string,
  entityId: string,
): Promise<'FOUND' | 'WAITING' | 'HTTP_ERROR'> {
  const response = await api.get(
    `${API_PREFIX}/audit-logs?entityType=User&entityId=${encodeURIComponent(entityId)}&limit=10`,
    { headers: bearer(token) },
  );
  if (response.status() !== 200) {
    return 'HTTP_ERROR';
  }

  const body = await jsonObject(response);
  const entries = Array.isArray(body.data) ? body.data : [];
  return entries.some(
    (entry) =>
      entry !== null && typeof entry === 'object' && (entry as JsonObject).entityId === entityId,
  )
    ? 'FOUND'
    : 'WAITING';
}

test.describe('Audit logs — aislamiento tenant con AUDITOR', () => {
  test('AUDITOR consulta solo tenant A aunque el header solicite tenant B', async () => {
    const tenantASlug = requiredEnv('E2E_TENANT_SLUG');
    const tenantBSlug = requiredEnv('E2E_OTHER_TENANT_SLUG');
    const auditorEmail = requiredEnv('E2E_AUDITOR_EMAIL');
    const auditorPassword = requiredEnv('E2E_AUDITOR_PASSWORD');
    const tenantBAdminToken = requiredEnv('E2E_OTHER_TENANT_ADMIN_TOKEN');
    const api = await request.newContext({ baseURL: API_BASE });

    try {
      const auditor = await tenantLogin(api, auditorEmail, auditorPassword, tenantASlug);

      const activityEmail = `audit-activity-${crypto.randomUUID()}@example.invalid`;
      const activityResponse = await api.post(`${API_PREFIX}/users`, {
        data: {
          email: activityEmail,
          role: 'SUPPORT',
          password: `E2eAudit-${crypto.randomUUID()}!`,
          firstName: 'E2E',
          lastName: 'Actividad B',
          jobTitle: 'Actividad sintética de aislamiento',
        },
        headers: bearer(tenantBAdminToken, {
          'Content-Type': 'application/json',
          'Idempotency-Key': `e2e-audit-${crypto.randomUUID()}`,
        }),
      });
      expect(activityResponse.status()).toBe(201);

      const activityBody = await jsonObject(activityResponse);
      const activityData = activityBody.data as JsonObject | undefined;
      const activityId = typeof activityData?.id === 'string' ? activityData.id : '';
      expect(activityId).toBeTruthy();

      await expect
        .poll(() => findAuditEntry(api, tenantBAdminToken, activityId), {
          timeout: 15_000,
          intervals: [250, 500, 1_000, 2_000],
          message: 'La actividad sintética del tenant B no quedó disponible en su audit log.',
        })
        .toBe('FOUND');

      const listResponse = await api.get(`${API_PREFIX}/audit-logs`, {
        headers: bearer(auditor.token, { 'X-Tenant-Slug': tenantBSlug }),
      });
      expect(listResponse.status()).toBe(200);

      const listBody = await jsonObject(listResponse);
      const entries = Array.isArray(listBody.data) ? listBody.data : [];
      expect(entries.length).toBeGreaterThan(0);
      expect(
        entries.every(
          (entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            (entry as JsonObject).tenantId === auditor.tenantId,
        ),
      ).toBe(true);
      expect(
        entries.some(
          (entry) =>
            entry !== null &&
            typeof entry === 'object' &&
            (entry as JsonObject).entityId === activityId,
        ),
      ).toBe(false);

      const exportResponse = await api.get(`${API_PREFIX}/audit-logs/export`, {
        headers: bearer(auditor.token, { 'X-Tenant-Slug': tenantBSlug }),
      });
      expect(exportResponse.status()).toBe(403);
    } finally {
      await api.dispose();
    }
  });
});
