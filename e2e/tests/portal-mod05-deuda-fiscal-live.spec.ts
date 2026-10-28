import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, test, type APIResponse, type Page } from '@playwright/test';

import { seedPortalSession } from './helpers/portal-session';

/**
 * MOD05 · Deuda de código · V1 (PROMPT-MOD05-DEUDA-CODIGO v1.0 §5 + delta v1.1).
 *
 * Corre contra la API real, el worker y el portal sobre el tenant ACTIVE de la
 * Fase 1b de privacidad (`E2E_PRIVACY_1B_TENANT_SLUG`), sembrado con
 * `e2e/scripts/seed-privacy-fase-1b-fixtures.mjs`. Todos los datos son
 * sintéticos (dominio `example.invalid`, documentos aleatorios).
 *
 * Las lecturas de base son de **solo lectura** (`BEGIN READ ONLY` + `ROLLBACK`)
 * y nunca devuelven valores: el SQL resuelve cada comprobación a un booleano o
 * a un conteo, para que ni el texto plano ni el cifrado ni el HMAC lleguen a
 * los logs, a las trazas o al informe.
 */

const API_PREFIX = '/api/v1';
const FIXTURE_PREFIX = 'E2E-MOD05-DEUDA';
const SCHEMA_PATTERN = /^tenant_[a-z][a-z0-9_]{0,54}$/u;
const missingLiveEnvironment = [
  !process.env.DB_NAME?.trim() ? 'DB_NAME' : null,
  !process.env.E2E_PRIVACY_1B_TENANT_SLUG?.trim() ? 'E2E_PRIVACY_1B_TENANT_SLUG' : null,
  !process.env.E2E_PRIVACY_ADMIN_PASSWORD?.trim() ? 'E2E_PRIVACY_ADMIN_PASSWORD' : null,
  !process.env.DB_USER?.trim() && !process.env.DB_MIGRATOR_USER?.trim()
    ? 'DB_USER o DB_MIGRATOR_USER'
    : null,
  !process.env.DB_PASSWORD?.trim() && !process.env.DB_MIGRATOR_PASSWORD?.trim()
    ? 'DB_PASSWORD o DB_MIGRATOR_PASSWORD'
    : null,
].filter((name): name is string => name !== null);
const MOD05_DEUDA_MIGRATIONS = [
  'SubscriberVatResponsibility1530000000000',
  'SubscriberLegalRepresentativeParty1540000000000',
  'FiscalDocumentEncryption1550000000000',
  'SubscriberExpedienteForeignKey1560000000000',
  'SubscriberFiscalCompleteness1570000000000',
] as const;
const ALL_MISSING = [
  'VAT_RESPONSIBILITY',
  'RUT_RESPONSIBILITIES',
  'NIT_VERIFICATION_DIGIT',
  'LEGAL_REPRESENTATIVE',
] as const;

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type JsonRecord = Record<string, unknown>;

interface Actor {
  id: string;
  token: string;
  role: string;
}

interface Session {
  tenantSlug: string;
  schemaName: string;
  planId: string;
  legalTextId: string;
  consentVersion: string;
  admin: Actor;
  tag: string;
}

interface RawResult {
  status: number;
  code: string | null;
  body: unknown;
}

interface ExpedienteFixture {
  id: string;
  email: string;
  nit: string | null;
  address: string;
  name: string;
  document: string | null;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} para el E2E de MOD05.`);
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
  return randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
}

function deriveFixturePassword(master: string, tenantSlug: string, purpose: string): string {
  const digest = createHmac('sha256', master)
    .update(`privacy-fase-1b:${purpose}:${tenantSlug}`)
    .digest('hex');
  return `Qa9-${digest}!zA`;
}

/** Mismos pesos DIAN que `calculateNitVerificationDigit` de la API. */
function nitVerificationDigit(nit: string): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const sum = [...nit]
    .reverse()
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index]!, 0);
  const remainder = sum % 11;
  return String(remainder < 2 ? remainder : 11 - remainder);
}

/** NIT sintético de 9 dígitos en el rango de personas jurídicas (9xxxxxxxx). */
function syntheticNit(): string {
  return `9${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}

function syntheticDocument(): string {
  return String(randomInt(1_000_000_000, 2_000_000_000));
}

/** Busca la lista `missing` en cualquier nivel del cuerpo de error. */
function findMissing(body: unknown, depth = 0): string[] | null {
  if (depth > 4) return null;
  const object = record(body);
  if (Array.isArray(object['missing'])) return object['missing'].map(String);
  for (const value of Object.values(object)) {
    const nested = findMissing(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function findCode(body: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  const object = record(body);
  if (typeof object['code'] === 'string') return object['code'];
  for (const value of Object.values(object)) {
    const nested = findCode(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/** Claves de `details.fieldErrors` del 400 de Zod (sin valores). */
function fieldErrorKeys(body: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  const object = record(body);
  const fieldErrors = record(object['fieldErrors']);
  if (Object.keys(fieldErrors).length > 0) return Object.keys(fieldErrors).sort();
  for (const value of Object.values(object)) {
    const nested = fieldErrorKeys(value, depth + 1);
    if (nested.length > 0) return nested;
  }
  return [];
}

/** Propiedades que el ValidationPipe global rechaza («property X should not exist»). */
function rejectedProperties(body: unknown): string[] {
  const object = record(body);
  const messages = [object['message'], record(object['error'])['message']].flat();
  return messages
    .filter((message): message is string => typeof message === 'string')
    .map((message) => /^property (\w+) should not exist$/u.exec(message)?.[1])
    .filter((name): name is string => Boolean(name));
}

function baseHeaders(tenantSlug: string, token?: string): Record<string, string> {
  return {
    'X-Tenant-Slug': tenantSlug,
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseBody(response: APIResponse): Promise<unknown> {
  return response.json().catch(() => null);
}

async function raw(
  page: Page,
  session: Pick<Session, 'tenantSlug'>,
  actor: Pick<Actor, 'token'>,
  method: HttpMethod,
  route: string,
  data?: unknown,
): Promise<RawResult> {
  const response = await page.request.fetch(`${API_PREFIX}${route}`, {
    method,
    headers: baseHeaders(session.tenantSlug, actor.token),
    ...(data !== undefined ? { data } : {}),
  });
  const body = await parseBody(response);
  return { status: response.status(), code: findCode(body), body };
}

async function api<T>(
  page: Page,
  session: Pick<Session, 'tenantSlug'>,
  actor: Pick<Actor, 'token'>,
  method: HttpMethod,
  route: string,
  data?: unknown,
): Promise<T> {
  const result = await raw(page, session, actor, method, route, data);
  expect(
    result.status >= 200 && result.status < 300,
    `API ${method} ${route}: HTTP ${result.status} (${result.code ?? 'sin código'})`,
  ).toBe(true);
  return unwrapData<T>(result.body);
}

// ── Base de datos de solo lectura ─────────────────────────────────────────────

interface PgQueryResult {
  rows: JsonRecord[];
  rowCount: number | null;
}
interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<PgQueryResult>;
  end(): Promise<void>;
}
type PgClientConstructor = new (config: JsonRecord) => PgClient;

function workspaceRoot(): string {
  let current = process.cwd();
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error('No se encontró la raíz del workspace.');
    current = parent;
  }
}

function pgClient(): PgClient {
  const requireFromDb = createRequire(join(workspaceRoot(), 'packages/database/package.json'));
  const { Client } = requireFromDb('pg') as { Client: PgClientConstructor };
  expect(process.env.DB_NAME, 'La suite solo lee la base de desarrollo dbiw.').toBe('dbiw');
  return new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER || process.env.DB_MIGRATOR_USER,
    password: process.env.DB_PASSWORD || process.env.DB_MIGRATOR_PASSWORD,
    connectionTimeoutMillis: 5000,
  });
}

/**
 * Ejecuta consultas en una transacción `READ ONLY` con `search_path` del tenant
 * y siempre hace ROLLBACK. Las consultas deben devolver booleanos o conteos.
 */
async function readOnly<T>(
  schemaName: string | null,
  run: (query: (sql: string, params?: unknown[]) => Promise<JsonRecord[]>) => Promise<T>,
): Promise<T> {
  const client = pgClient();
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    if (schemaName) {
      expect(schemaName).toMatch(SCHEMA_PATTERN);
      await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
    }
    return await run(async (sql, params) => (await client.query(sql, params)).rows);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}

// ── Sesión y fixtures ─────────────────────────────────────────────────────────

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
  expect(response.ok(), `Login sintético: HTTP ${response.status()}`).toBe(true);
  const payload = record(unwrapData<unknown>(await parseBody(response)));
  const token = payload['accessToken'];
  if (typeof token !== 'string' || !token) throw new Error('El login no devolvió token de acceso.');
  const user = record(await api(page, { tenantSlug }, { token }, 'GET', '/users/me'));
  return { id: String(user['id'] ?? ''), token, role: String(user['role'] ?? '') };
}

async function createSession(page: Page): Promise<Session> {
  const tenantSlug = requiredEnv('E2E_PRIVACY_1B_TENANT_SLUG');
  const master = requiredEnv('E2E_PRIVACY_ADMIN_PASSWORD');
  const suffix = tenantSlug.slice('e2e-privacy-1b-'.length);
  const admin = await login(
    page,
    tenantSlug,
    `qa-privacy-runner-${suffix}@example.invalid`,
    deriveFixturePassword(master, tenantSlug, 'runner'),
  );
  expect(admin.role, 'El actor de corrida debe ser ADMIN.').toBe('ADMIN');

  const schemaName = await readOnly(null, async (query) => {
    const rows = await query('SELECT schema_name, status FROM public.tenants WHERE slug = $1', [
      tenantSlug,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['status'], 'El tenant de la suite debe estar ACTIVE.').toBe('ACTIVE');
    return String(rows[0]!['schema_name']);
  });

  const catalog = record(
    await api<JsonRecord>(
      page,
      { tenantSlug },
      admin,
      'GET',
      '/commercial/catalog?type=PLAN&isActive=true&limit=100',
    ),
  );
  const plans = Array.isArray(catalog['data']) ? catalog['data'].map(record) : [];
  const planId = plans.find((plan) => plan['type'] === 'PLAN' && plan['isActive'] === true)?.['id'];
  if (typeof planId !== 'string') throw new Error('El seed no dejó un plan activo.');

  const legalText = record(
    await api<JsonRecord>(
      page,
      { tenantSlug },
      admin,
      'GET',
      '/privacy/legal-texts/current?type=AUTORIZACION',
    ),
  );
  if (typeof legalText['id'] !== 'string' || typeof legalText['version'] !== 'string') {
    throw new Error('No hay texto de autorización publicado en el tenant.');
  }

  await seedPortalSession(page, { token: admin.token, tenantSlug });
  return {
    tenantSlug,
    schemaName,
    planId,
    legalTextId: legalText['id'],
    consentVersion: legalText['version'],
    admin,
    tag: syntheticTag(),
  };
}

function juridicaPayload(session: Session, overrides: JsonRecord): JsonRecord {
  const tag = `${session.tag}-${syntheticTag()}`;
  return {
    personType: 'JURIDICA',
    customerSegment: 'PYME',
    nit: syntheticNit(),
    businessName: `Empresa Sintética ${tag}`,
    email: `qa-mod05-${tag.toLowerCase()}@example.invalid`,
    address: `Dirección de prueba ${tag}`,
    city: 'Bogotá',
    department: 'Cundinamarca',
    vatResponsibility: 'RESPONSABLE',
    rutResponsibilities: ['O-13', 'O-23'],
    legalRepresentative: {
      fullName: `Representante Sintético ${tag}`,
      documentType: 'CC',
      documentNumber: syntheticDocument(),
    },
    authorizations: [
      { purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId: session.legalTextId },
    ],
    authorizationChannel: 'PRESENCIAL',
    ...overrides,
  };
}

/**
 * Expediente sintético listo para convertir. Si `nit` viene, es persona jurídica
 * con el NIT **sin** dígito de verificación (el expediente no lo captura).
 */
async function createExpediente(
  page: Page,
  session: Session,
  kind: 'NATURAL' | 'JURIDICA',
): Promise<ExpedienteFixture> {
  const tag = `${session.tag}-${syntheticTag()}`;
  const email = `qa-mod05-${tag.toLowerCase()}@example.invalid`;
  const address = `Dirección de prueba ${tag}`;
  const nit = kind === 'JURIDICA' ? syntheticNit() : null;
  const document = kind === 'NATURAL' ? syntheticDocument() : null;
  const name = kind === 'JURIDICA' ? `Empresa Sintética ${tag}` : `Titular Sintético ${tag}`;
  const expediente = await api<{ id: string }>(
    page,
    session,
    session.admin,
    'POST',
    '/crm/expedientes',
    {
      fullName: name,
      acquisitionChannel: 'WEB',
      customerSegment: kind === 'JURIDICA' ? 'PYME' : 'RESIDENTIAL',
      sourceDetail: `${FIXTURE_PREFIX} ${tag}`,
    },
  );
  const patchSection = (section: string, data: JsonRecord) =>
    api(
      page,
      session,
      session.admin,
      'PATCH',
      `/crm/expedientes/${expediente.id}/sections/${section}`,
      {
        data,
      },
    );

  await patchSection(
    'identification',
    kind === 'JURIDICA'
      ? {
          personType: 'PERSONA_JURIDICA',
          documentType: 'NIT',
          documentNumber: nit,
          companyName: `Empresa Sintética ${tag}`,
          primaryContactName: 'Contacto de prueba',
          primaryContactRole: 'Gerente',
        }
      : {
          personType: 'PERSONA_NATURAL',
          documentType: 'CC',
          documentNumber: document,
          firstName: 'Titular',
          lastName: `Sintético ${tag}`,
        },
  );
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
    sourceDetail: `${FIXTURE_PREFIX} ${tag}`,
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
    legalTextVersion: session.consentVersion,
    evidenceRef: `${FIXTURE_PREFIX}:${tag}`,
  });
  return { id: expediente.id, email, nit, address, name, document };
}

/** Lleva el expediente a LISTO_PARA_INSTALACION y espera el suscriptor convertido. */
async function convertExpediente(
  page: Page,
  session: Session,
  expediente: ExpedienteFixture,
): Promise<string> {
  for (const targetStatus of [
    'PRECALIFICADO',
    'VALIDANDO_COBERTURA',
    'EN_COTIZACION',
    'LISTO_PARA_INSTALACION',
  ]) {
    await api(page, session, session.admin, 'PATCH', `/crm/expedientes/${expediente.id}/status`, {
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
      {
        email: expediente.email,
      },
    );
    const id = results[0]?.['id'];
    return typeof id === 'string' ? id : null;
  };
  await expect.poll(findSubscriber, { timeout: 25_000 }).not.toBeNull();
  const subscriberId = await findSubscriber();
  if (!subscriberId) throw new Error('La conversión sintética no produjo un suscriptor.');
  return subscriberId;
}

async function subscriberDetail(page: Page, session: Session, id: string): Promise<JsonRecord> {
  return record(
    await api<JsonRecord>(page, session, session.admin, 'GET', `/crm/subscribers/${id}`),
  );
}

function contractPayload(
  session: Session,
  subscriberId: string,
  address: string,
  extra: JsonRecord = {},
) {
  return {
    subscriberId,
    planId: session.planId,
    planSnapshotJson: { id: session.planId, name: 'Plan sintético', vatConcept: 'INTERNET_ACCESS' },
    alias: `Servicio sintético ${session.tag}`,
    serviceUsage: 'NON_RESIDENTIAL',
    customerSegment: 'PYME',
    installationAddress: address,
    installationCity: 'Bogotá',
    installationDepartment: 'Cundinamarca',
    installationPostalCode: '110111',
    ...extra,
  };
}

/** Prospecto jurídico convertido, completado y con un contrato con documento fiscal. */
async function contractedJuridica(
  page: Page,
  session: Session,
): Promise<{ subscriberId: string; contractId: string; fiscalDocument: string; nit: string }> {
  const expediente = await createExpediente(page, session, 'JURIDICA');
  const subscriberId = await convertExpediente(page, session, expediente);
  const nit = expediente.nit!;
  const fiscalDocument = `${nit}-${nitVerificationDigit(nit)}`;
  await api(page, session, session.admin, 'PATCH', `/crm/subscribers/${subscriberId}`, {
    vatResponsibility: 'RESPONSABLE',
    rutResponsibilities: ['O-13'],
    nit,
    nitVerificationDigit: nitVerificationDigit(nit),
    legalRepresentative: {
      fullName: `Representante Sintético ${session.tag}`,
      documentType: 'CC',
      documentNumber: syntheticDocument(),
    },
  });
  const contract = record(
    await api<JsonRecord>(
      page,
      session,
      session.admin,
      'POST',
      `/crm/subscribers/${subscriberId}/contracts`,
      contractPayload(session, subscriberId, expediente.address, {
        fiscalName: `Empresa Sintética ${session.tag}`,
        fiscalDocument,
      }),
    ),
  );
  return { subscriberId, contractId: String(contract['id']), fiscalDocument, nit };
}

/** Estado de almacenamiento del documento fiscal de un contrato (solo booleanos). */
async function contractFiscalStorage(
  session: Session,
  contractId: string,
): Promise<JsonRecord | null> {
  return readOnly(session.schemaName, async (query) => {
    const rows = await query(
      `SELECT fiscal_document IS NULL AS plaintext_null,
              fiscal_document_encrypted IS NOT NULL AS encrypted_present,
              fiscal_document_hmac IS NOT NULL AS hmac_present
         FROM contracts WHERE id = $1::uuid`,
      [contractId],
    );
    return rows[0] ?? null;
  });
}

const REPRESENTATIVE_OK = {
  tax_regime_null: true,
  points_to_party: true,
  legacy_uuid_null: true,
  distinct_party: true,
  representative_type: 'NATURAL',
  has_role: true,
  company_is_customer: true,
};

/** R4 en base (solo lectura): el representante es un Party NATURAL con el rol activo. */
async function representativeEvidence(
  session: Session,
  subscriberId: string,
  partyId: string,
): Promise<JsonRecord | null> {
  return readOnly(session.schemaName, async (query) => {
    const rows = await query(
      `SELECT
          s.tax_regime IS NULL AS tax_regime_null,
          s.legal_representative_party_id = $2::uuid AS points_to_party,
          s.legal_representative_id IS NULL AS legacy_uuid_null,
          s.party_id <> s.legal_representative_party_id AS distinct_party,
          p.party_type::text AS representative_type,
          EXISTS (SELECT 1 FROM party_role r WHERE r.party_id = p.id
                   AND r.role = 'LEGAL_REPRESENTATIVE' AND r.status = 'ACTIVE') AS has_role,
          EXISTS (SELECT 1 FROM party_role r WHERE r.party_id = s.party_id
                   AND r.role = 'CUSTOMER') AS company_is_customer
         FROM subscribers s JOIN party p ON p.id = s.legal_representative_party_id
        WHERE s.id = $1::uuid`,
      [subscriberId, partyId],
    );
    return rows[0] ?? null;
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('MOD05 deuda fiscal contra API real de un tenant', () => {
  test.skip(
    missingLiveEnvironment.length > 0,
    `Entorno E2E real omitido; faltan variables: ${missingLiveEnvironment.join(', ')}.`,
  );

  test.setTimeout(180_000);

  test('precondición: el tenant acredita las migraciones 153 a 157 y el rol LEGAL_REPRESENTATIVE', async ({
    page,
  }) => {
    const session = await createSession(page);
    const evidence = await readOnly(session.schemaName, async (query) => {
      const applied = await query(
        'SELECT count(*)::int AS n FROM typeorm_migrations WHERE name = ANY($1::text[])',
        [MOD05_DEUDA_MIGRATIONS],
      );
      const columns = await query(
        `SELECT count(*)::int AS n FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND NOT a.attisdropped AND (
            (c.relname = 'subscribers' AND a.attname IN ('vat_responsibility','rut_responsibilities','legal_representative_party_id'))
            OR (c.relname IN ('contracts','expediente_records') AND a.attname IN ('fiscal_document_encrypted','fiscal_document_hmac')))`,
        [session.schemaName],
      );
      const vatNullable = await query(
        `SELECT NOT a.attnotnull AS ok FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = 'subscribers' AND a.attname = 'vat_responsibility'`,
        [session.schemaName],
      );
      const check = await query(
        `SELECT convalidated FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace
          WHERE n.nspname = $1 AND co.conname = 'ck_subscribers_fiscal_complete_when_active'`,
        [session.schemaName],
      );
      const role = await query(
        `SELECT count(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = $1 AND t.typname = 'party_role_type' AND e.enumlabel = 'LEGAL_REPRESENTATIVE'`,
        [session.schemaName],
      );
      return {
        applied: applied[0]!['n'],
        columns: columns[0]!['n'],
        vatNullable: vatNullable[0]!['ok'],
        check: check.map((row) => row['convalidated']),
        role: role[0]!['n'],
      };
    });
    expect(evidence).toEqual({
      applied: MOD05_DEUDA_MIGRATIONS.length,
      columns: 7,
      vatNullable: true,
      check: [false],
      role: 1,
    });
  });

  test('alta jurídica: el esquema rechaza la falta de DV, RUT, IVA y representante (R1, R3, R4)', async ({
    page,
  }) => {
    const session = await createSession(page);
    const nit = syntheticNit();
    const correctDv = nitVerificationDigit(nit);

    // Cada rechazo se atribuye a su campo (fieldErrors), no a un 400 genérico.
    const cases: Array<{ name: string; payload: JsonRecord; field: string }> = [];
    cases.push({
      name: 'sin DV',
      payload: juridicaPayload(session, { nit }),
      field: 'nitVerificationDigit',
    });
    cases.push({
      name: 'DV no numérico',
      payload: juridicaPayload(session, { nit, nitVerificationDigit: 'X' }),
      field: 'nitVerificationDigit',
    });
    const noRepresentative = juridicaPayload(session, { nit, nitVerificationDigit: correctDv });
    delete noRepresentative['legalRepresentative'];
    cases.push({
      name: 'sin representante',
      payload: noRepresentative,
      field: 'legalRepresentative',
    });
    const legacyRepresentative = juridicaPayload(session, {
      nit,
      nitVerificationDigit: correctDv,
      legalRepresentativeId: randomUUID(),
    });
    delete legacyRepresentative['legalRepresentative'];
    cases.push({
      name: 'representante como UUID libre (contrato anterior)',
      payload: legacyRepresentative,
      field: 'legalRepresentativeId',
    });
    const noRut = juridicaPayload(session, { nit, nitVerificationDigit: correctDv });
    delete noRut['rutResponsibilities'];
    cases.push({ name: 'sin RUT', payload: noRut, field: 'rutResponsibilities' });
    cases.push({
      name: 'RUT vacío',
      payload: juridicaPayload(session, {
        nit,
        nitVerificationDigit: correctDv,
        rutResponsibilities: [],
      }),
      field: 'rutResponsibilities',
    });
    cases.push({
      name: 'RUT fuera del catálogo',
      payload: juridicaPayload(session, {
        nit,
        nitVerificationDigit: correctDv,
        rutResponsibilities: ['O-99'],
      }),
      field: 'rutResponsibilities',
    });
    cases.push({
      name: 'RUT repetido',
      payload: juridicaPayload(session, {
        nit,
        nitVerificationDigit: correctDv,
        rutResponsibilities: ['O-13', 'O-13'],
      }),
      field: 'rutResponsibilities',
    });
    const noVat = juridicaPayload(session, { nit, nitVerificationDigit: correctDv });
    delete noVat['vatResponsibility'];
    cases.push({ name: 'sin responsabilidad de IVA', payload: noVat, field: 'vatResponsibility' });

    for (const item of cases) {
      const result = await raw(
        page,
        session,
        session.admin,
        'POST',
        '/crm/subscribers',
        item.payload,
      );
      expect(result.status, `Alta jurídica ${item.name}`).toBe(400);
      // El 400 nombra el campo: en fieldErrors (Zod) o en el mensaje del
      // ValidationPipe global (propiedad no permitida). Nunca se lee un valor.
      const blamed = [...fieldErrorKeys(result.body), ...rejectedProperties(result.body)];
      expect(blamed, `Alta jurídica ${item.name}`).toContain(item.field);
    }

    const leftovers = await api<Array<JsonRecord>>(
      page,
      session,
      session.admin,
      'POST',
      '/crm/subscribers/search',
      { nit },
    );
    expect(leftovers, 'Ningún rechazo deja suscriptor').toHaveLength(0);
  });

  test('alta jurídica: con DV, RUT y representante → alta y Party LEGAL_REPRESENTATIVE; DV erróneo → 400 (R3, R4)', async ({
    page,
  }) => {
    const session = await createSession(page);
    const nit = syntheticNit();
    const correctDv = nitVerificationDigit(nit);

    // Alta válida (criterio de aceptación principal del caso 1).
    const valid = juridicaPayload(session, { nit, nitVerificationDigit: correctDv });
    const representative = record(valid['legalRepresentative']);
    const createdResult = await raw(
      page,
      session,
      session.admin,
      'POST',
      '/crm/subscribers',
      valid,
    );
    expect(
      createdResult.status,
      `Alta jurídica válida: HTTP ${createdResult.status} (${createdResult.code ?? 'sin código'}; campos: ${fieldErrorKeys(createdResult.body).join(',') || 'ninguno'})`,
    ).toBe(201);
    const created = record(unwrapData<unknown>(createdResult.body));
    const subscriberId = String(created['id']);
    expect(created).toMatchObject({
      personType: 'JURIDICA',
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['O-13', 'O-23'],
      taxRegime: null,
      nitVerificationDigit: correctDv,
    });
    expect(created).not.toHaveProperty('legalRepresentativeId');
    const legal = record(created['legalRepresentative']);
    expect(typeof legal['partyId']).toBe('string');
    expect(legal['displayName']).toBe(representative['fullName']);
    expect(JSON.stringify(created)).not.toContain(String(representative['documentNumber']));
    expect((await subscriberDetail(page, session, subscriberId))['fiscalCompleteness']).toEqual({
      complete: true,
      missing: [],
    });
    expect(await representativeEvidence(session, subscriberId, String(legal['partyId']))).toEqual(
      REPRESENTATIVE_OK,
    );

    // DV erróneo con el resto del alta válido → 400 atribuido al DV, no a otro campo.
    const otherNit = syntheticNit();
    const wrongDv = String((Number(nitVerificationDigit(otherNit)) + 1) % 10);
    const badDv = await raw(
      page,
      session,
      session.admin,
      'POST',
      '/crm/subscribers',
      juridicaPayload(session, { nit: otherNit, nitVerificationDigit: wrongDv }),
    );
    expect(badDv.status).toBe(400);
    expect(fieldErrorKeys(badDv.body), 'El 400 no debe venir de otro campo').toEqual([]);

    // Deduplicación por HMAC: el mismo representante en otra empresa reutiliza el Party.
    const second = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'POST',
        '/crm/subscribers',
        juridicaPayload(session, {
          nit: otherNit,
          nitVerificationDigit: nitVerificationDigit(otherNit),
          legalRepresentative: representative,
        }),
      ),
    );
    expect(record(second['legalRepresentative'])['partyId']).toBe(legal['partyId']);

    await page.goto(`/dashboard/crm/subscribers/${subscriberId}`);
    await expect(page.getByText('Gran contribuyente · Agente de retención de IVA')).toBeVisible();
    await expect(page.getByText('Faltan datos fiscales para activar o contratar')).toHaveCount(0);
  });

  test('conversión desde expediente: PROSPECT sin datos fiscales, aviso, contrato bloqueado; completar y activar contrato → ACTIVE', async ({
    page,
  }) => {
    const session = await createSession(page);
    const expediente = await createExpediente(page, session, 'JURIDICA');
    const subscriberId = await convertExpediente(page, session, expediente);

    // R1′, R3′, R4′, R14, R15: la conversión no infiere nada.
    const prospect = await subscriberDetail(page, session, subscriberId);
    expect(prospect).toMatchObject({
      status: 'PROSPECT',
      personType: 'JURIDICA',
      expedienteId: expediente.id,
      vatResponsibility: null,
      rutResponsibilities: [],
      legalRepresentative: null,
      taxRegime: null,
    });
    expect(prospect['fiscalCompleteness']).toEqual({ complete: false, missing: [...ALL_MISSING] });

    const prospectDb = await readOnly(session.schemaName, async (query) => {
      const rows = await query(
        `SELECT s.tax_regime IS NULL AS tax_regime_null,
                s.vat_responsibility IS NULL AS vat_null,
                cardinality(s.rut_responsibilities) AS rut_count,
                s.legal_representative_party_id IS NULL AS representative_null,
                s.expediente_id = $2::uuid AS linked_expediente,
                EXISTS (SELECT 1 FROM pg_constraint co
                         WHERE co.conname = 'fk_subscribers_expediente_id'
                           AND co.conrelid = 'subscribers'::regclass) AS expediente_fk
           FROM subscribers s WHERE s.id = $1::uuid`,
        [subscriberId, expediente.id],
      );
      return rows[0] ?? null;
    });
    expect(prospectDb).toEqual({
      tax_regime_null: true,
      vat_null: true,
      rut_count: 0,
      representative_null: true,
      linked_expediente: true,
      expediente_fk: true,
    });

    // Pantalla: el aviso «Faltan datos fiscales…» con los cuatro faltantes.
    await page.goto(`/dashboard/crm/subscribers/${subscriberId}`);
    const notice = page.getByText('Faltan datos fiscales para activar o contratar');
    await expect(notice).toBeVisible();
    for (const label of [
      'Responsabilidad de IVA',
      'Responsabilidades del RUT',
      'Dígito de verificación del NIT',
      'Representante legal',
    ]) {
      await expect(page.getByRole('listitem').filter({ hasText: label })).toBeVisible();
    }
    await expect(page.getByText('Responsabilidades del RUT pendientes de completar')).toBeVisible();

    // El estado del suscriptor es derivado; sin datos fiscales se bloquea el alta del contrato.
    const incompleteContract = await raw(
      page,
      session,
      session.admin,
      'POST',
      `/crm/subscribers/${subscriberId}/contracts`,
      contractPayload(session, subscriberId, expediente.address, {
        fiscalName: `Empresa Sintética ${session.tag}`,
        fiscalDocument: `${expediente.nit!}-${nitVerificationDigit(expediente.nit!)}`,
      }),
    );
    expect(incompleteContract.status).toBe(422);
    expect(incompleteContract.code).toBe('SUBSCRIBER_FISCAL_DATA_INCOMPLETE');
    expect(findMissing(incompleteContract.body)).toEqual([...ALL_MISSING]);
    expect(JSON.stringify(incompleteContract.body)).not.toContain(expediente.nit!);
    expect(JSON.stringify(incompleteContract.body)).not.toContain(expediente.email);
    expect((await subscriberDetail(page, session, subscriberId))['status']).toBe('PROSPECT');

    // Completar por partes: con IVA y RUT siguen faltando DV y representante.
    await api(page, session, session.admin, 'PATCH', `/crm/subscribers/${subscriberId}`, {
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['O-15'],
    });
    const partialContract = await raw(
      page,
      session,
      session.admin,
      'POST',
      `/crm/subscribers/${subscriberId}/contracts`,
      contractPayload(session, subscriberId, expediente.address, {
        fiscalName: `Empresa Sintética ${session.tag}`,
        fiscalDocument: `${expediente.nit!}-${nitVerificationDigit(expediente.nit!)}`,
      }),
    );
    expect(partialContract.status).toBe(422);
    expect(partialContract.code).toBe('SUBSCRIBER_FISCAL_DATA_INCOMPLETE');
    expect(findMissing(partialContract.body)).toEqual([
      'NIT_VERIFICATION_DIGIT',
      'LEGAL_REPRESENTATIVE',
    ]);

    // R3 en edición: un DV que no coincide con el NIT → 400 y no se guarda.
    const wrongDv = String((Number(nitVerificationDigit(expediente.nit!)) + 1) % 10);
    const badEdit = await raw(
      page,
      session,
      session.admin,
      'PATCH',
      `/crm/subscribers/${subscriberId}`,
      { nit: expediente.nit, nitVerificationDigit: wrongDv },
    );
    expect(badEdit.status, 'Edición con DV erróneo').toBe(400);
    expect(
      record(await subscriberDetail(page, session, subscriberId))['fiscalCompleteness'],
    ).toEqual({ complete: false, missing: ['NIT_VERIFICATION_DIGIT', 'LEGAL_REPRESENTATIVE'] });

    await api(page, session, session.admin, 'PATCH', `/crm/subscribers/${subscriberId}`, {
      nit: expediente.nit,
      nitVerificationDigit: nitVerificationDigit(expediente.nit!),
      legalRepresentative: {
        fullName: `Representante Sintético ${session.tag}`,
        documentType: 'CC',
        documentNumber: syntheticDocument(),
      },
    });
    const completed = await subscriberDetail(page, session, subscriberId);
    expect(completed['fiscalCompleteness']).toEqual({ complete: true, missing: [] });
    // R4 por edición (§2.3): el representante es un Party con el rol LEGAL_REPRESENTATIVE.
    const completedRepresentative = record(completed['legalRepresentative']);
    expect(completedRepresentative['displayName']).toBe(`Representante Sintético ${session.tag}`);
    const representativeDb = await representativeEvidence(
      session,
      subscriberId,
      String(completedRepresentative['partyId']),
    );
    expect(representativeDb).toEqual({ ...REPRESENTATIVE_OK, tax_regime_null: true });

    const derivedStatusAttempt = await raw(
      page,
      session,
      session.admin,
      'PATCH',
      `/crm/subscribers/${subscriberId}/status`,
      {
        targetStatus: 'ACTIVE',
        reason: 'El estado solo cambia por el ciclo de vida del contrato.',
      },
    );
    expect(derivedStatusAttempt.status).toBe(409);
    expect(derivedStatusAttempt.code).toBe('SUBSCRIBER_STATUS_DERIVED');

    const contract = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'POST',
        `/crm/subscribers/${subscriberId}/contracts`,
        contractPayload(session, subscriberId, expediente.address, {
          fiscalName: `Empresa Sintética ${session.tag}`,
          fiscalDocument: `${expediente.nit!}-${nitVerificationDigit(expediente.nit!)}`,
        }),
      ),
    );
    const activatedContract = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'POST',
        `/crm/contracts/${contract['id']}/activate`,
      ),
    );
    expect(activatedContract['status']).toBe('ACTIVE');

    // Pantalla: tras completar y activar, el aviso desaparece.
    await page.reload();
    await expect(page.getByText('Autorretenedor', { exact: true })).toBeVisible();
    await expect(page.getByText('Faltan datos fiscales para activar o contratar')).toHaveCount(0);
  });

  test('contrato: sin completitud → 422; con completitud → 201 y el documento fiscal queda solo cifrado mientras la pantalla lo muestra', async ({
    page,
  }) => {
    const session = await createSession(page);
    const expediente = await createExpediente(page, session, 'JURIDICA');
    const subscriberId = await convertExpediente(page, session, expediente);
    const fiscalDocument = `${expediente.nit!}-${nitVerificationDigit(expediente.nit!)}`;

    // R13: alta de contrato directa y desde el expediente sin completitud → 422.
    const direct = await raw(
      page,
      session,
      session.admin,
      'POST',
      `/crm/subscribers/${subscriberId}/contracts`,
      contractPayload(session, subscriberId, expediente.address, { fiscalDocument }),
    );
    expect(direct.status).toBe(422);
    expect(direct.code).toBe('SUBSCRIBER_FISCAL_DATA_INCOMPLETE');
    expect(findMissing(direct.body)).toEqual([...ALL_MISSING]);
    expect(JSON.stringify(direct.body)).not.toContain(expediente.nit!);
    const fromExpediente = await raw(
      page,
      session,
      session.admin,
      'POST',
      `/crm/subscribers/${subscriberId}/contracts/from-expediente`,
      { expedienteId: expediente.id },
    );
    expect(fromExpediente.status).toBe(422);
    expect(fromExpediente.code).toBe('SUBSCRIBER_FISCAL_DATA_INCOMPLETE');
    const contractsBefore = await readOnly(session.schemaName, async (query) => {
      const rows = await query(
        'SELECT count(*)::int AS n FROM contracts WHERE subscriber_id = $1::uuid',
        [subscriberId],
      );
      return rows[0]!['n'];
    });
    expect(contractsBefore, 'Un 422 no deja contratos a medias').toBe(0);

    // R5 en expedientes: el documento fiscal de facturación se guarda solo cifrado.
    await api(
      page,
      session,
      session.admin,
      'PATCH',
      `/crm/expedientes/${expediente.id}/sections/billing`,
      {
        data: { fiscalName: `Empresa Sintética ${session.tag}`, fiscalDocument },
      },
    );

    // Completar los datos fiscales.
    await api(page, session, session.admin, 'PATCH', `/crm/subscribers/${subscriberId}`, {
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['O-13'],
      nit: expediente.nit,
      nitVerificationDigit: nitVerificationDigit(expediente.nit!),
      legalRepresentative: {
        fullName: `Representante Sintético ${session.tag}`,
        documentType: 'CC',
        documentNumber: syntheticDocument(),
      },
    });

    const contract = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'POST',
        `/crm/subscribers/${subscriberId}/contracts`,
        contractPayload(session, subscriberId, expediente.address, {
          fiscalName: `Empresa Sintética ${session.tag}`,
          fiscalDocument,
        }),
      ),
    );
    const contractId = String(contract['id']);
    // R7: la lectura descifra; el DTO conserva su forma.
    expect(contract['fiscalDocument']).toBe(fiscalDocument);
    const readBack = record(
      await api<JsonRecord>(page, session, session.admin, 'GET', `/crm/contracts/${contractId}`),
    );
    expect(readBack['fiscalDocument']).toBe(fiscalDocument);
    expect(readBack).not.toHaveProperty('fiscalDocumentEncrypted');
    expect(readBack).not.toHaveProperty('fiscalDocumentHmac');

    // Base (solo lectura): sin texto plano; cifrado distinto del valor; HMAC de 64 hex.
    const storage = await readOnly(session.schemaName, async (query) => {
      const shape = (table: 'contracts' | 'expediente_records') =>
        query(
          `SELECT fiscal_document IS NULL AS plaintext_null,
                  fiscal_document_encrypted IS NOT NULL AS encrypted_present,
                  strpos(fiscal_document_encrypted, $2) = 0 AS ciphertext_hides_value,
                  fiscal_document_hmac ~ '^[0-9a-f]{64}$' AS hmac_shape,
                  strpos(fiscal_document_hmac, $2) = 0 AS hmac_hides_value
             FROM ${table} WHERE id = $1::uuid`,
          [table === 'contracts' ? contractId : expediente.id, expediente.nit],
        );
      const [contractRow] = await shape('contracts');
      const [expedienteRow] = await shape('expediente_records');
      return { contract: contractRow ?? null, expediente: expedienteRow ?? null };
    });
    const encryptedOnly = {
      plaintext_null: true,
      encrypted_present: true,
      ciphertext_hides_value: true,
      hmac_shape: true,
      hmac_hides_value: true,
    };
    expect(storage).toEqual({ contract: encryptedOnly, expediente: encryptedOnly });

    // Pantalla: el detalle del contrato muestra el documento fiscal descifrado.
    await page.goto(`/dashboard/crm/subscribers/${subscriberId}`);
    await page.getByRole('tab', { name: 'Servicios' }).click();
    await page
      .getByRole('button', { name: /Ver detalle/u })
      .first()
      .click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Documento fiscal', { exact: true })).toBeVisible();
    await expect(drawer.getByText(fiscalDocument, { exact: true })).toBeVisible();
  });

  test('contrato: editar otro campo desde la pantalla conserva el documento fiscal cifrado (R5, R7)', async ({
    page,
  }) => {
    const session = await createSession(page);
    const fixture = await contractedJuridica(page, session);
    expect(await contractFiscalStorage(session, fixture.contractId)).toEqual({
      plaintext_null: true,
      encrypted_present: true,
      hmac_present: true,
    });

    await page.goto(`/dashboard/crm/subscribers/${fixture.subscriberId}`);
    await page.getByRole('tab', { name: 'Servicios' }).click();
    await page
      .getByRole('button', { name: /Ver detalle/u })
      .first()
      .click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Editar contrato' }).click();
    await drawer.getByPlaceholder('Alias del servicio').fill(`Alias editado ${session.tag}`);
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        response.url().includes(`/crm/contracts/${fixture.contractId}`),
    );
    await drawer.getByRole('button', { name: 'Guardar cambios' }).click();
    expect((await saved).status()).toBe(200);

    // El cambio de alias se aplicó y el documento fiscal sigue intacto.
    const after = record(
      await api<JsonRecord>(
        page,
        session,
        session.admin,
        'GET',
        `/crm/contracts/${fixture.contractId}`,
      ),
    );
    expect(after['alias']).toBe(`Alias editado ${session.tag}`);
    expect(
      after['fiscalDocument'],
      'La edición desde la pantalla no debe borrar el documento fiscal',
    ).toBe(fixture.fiscalDocument);
    expect(await contractFiscalStorage(session, fixture.contractId)).toEqual({
      plaintext_null: true,
      encrypted_present: true,
      hmac_present: true,
    });
  });

  test('supresión: anonimizar un prospecto anula el documento fiscal cifrado y su HMAC (R8)', async ({
    page,
  }) => {
    const session = await createSession(page);
    const expediente = await createExpediente(page, session, 'NATURAL');
    await api(
      page,
      session,
      session.admin,
      'PATCH',
      `/crm/expedientes/${expediente.id}/sections/billing`,
      { data: { fiscalName: expediente.name, fiscalDocument: expediente.document } },
    );
    const storage = (id: string) =>
      readOnly(session.schemaName, async (query) => {
        const rows = await query(
          `SELECT fiscal_document IS NULL AS plaintext_null,
                  fiscal_document_encrypted IS NULL AS encrypted_null,
                  fiscal_document_hmac IS NULL AS hmac_null,
                  anonymized_at IS NOT NULL AS anonymized
             FROM expediente_records WHERE id = $1::uuid`,
          [id],
        );
        return rows[0] ?? null;
      });
    expect(await storage(expediente.id)).toEqual({
      plaintext_null: true,
      encrypted_null: false,
      hmac_null: false,
      anonymized: false,
    });

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
        requesterName: expediente.name,
        requesterDocumentType: 'CC',
        requesterDocument: expediente.document,
        requesterContact: expediente.email,
      },
    );
    const requestId = created.request.id;
    await api(
      page,
      session,
      session.admin,
      'POST',
      `/privacy/requests/${requestId}/verify-identity`,
      {
        identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
      },
    );
    await api(page, session, session.admin, 'POST', `/privacy/requests/${requestId}/complete`, {});
    const preview = await api<{
      eligible: boolean;
      candidateExpedienteIds: string[];
      categories: string[];
    }>(page, session, session.admin, 'GET', `/privacy/requests/${requestId}/erasure-preview`);
    expect(preview.eligible).toBe(true);
    expect(preview.candidateExpedienteIds).toEqual([expediente.id]);
    await api(page, session, session.admin, 'POST', `/privacy/requests/${requestId}/resolve`, {
      responseText: 'Solicitud sintética resuelta conforme al procedimiento.',
      responseChannel: 'EMAIL',
      erasure: { confirm: true, expedienteIds: preview.candidateExpedienteIds },
    });

    expect(await storage(expediente.id)).toEqual({
      plaintext_null: true,
      encrypted_null: true,
      hmac_null: true,
      anonymized: true,
    });
  });

  test('suscriptor heredado: la 153 mapeó el régimen y la pantalla muestra el RUT «pendientes de completar»', async ({
    page,
  }) => {
    const session = await createSession(page);
    const legacy = await readOnly(session.schemaName, async (query) => {
      const mapping = await query(
        `SELECT count(*) FILTER (WHERE tax_regime IS NOT NULL)::int AS legacy_rows,
                count(*) FILTER (WHERE (tax_regime = 'SIMPLIFIED' AND vat_responsibility IS DISTINCT FROM 'NO_RESPONSABLE')
                                    OR (tax_regime = 'COMMON' AND vat_responsibility IS DISTINCT FROM 'RESPONSABLE'))::int AS mismatched
           FROM subscribers WHERE deleted_at IS NULL`,
      );
      const candidate = await query(
        `SELECT id FROM subscribers
          WHERE deleted_at IS NULL AND anonymized_at IS NULL AND tax_regime IS NOT NULL
            AND cardinality(rut_responsibilities) = 0 AND person_type = 'NATURAL'
          ORDER BY created_at DESC LIMIT 1`,
      );
      return {
        legacyRows: Number(mapping[0]!['legacy_rows']),
        mismatched: Number(mapping[0]!['mismatched']),
        candidateId: candidate[0] ? String(candidate[0]['id']) : null,
      };
    });
    // Un tenant recién migrado (R4.1) no puede tener filas anteriores a la 153;
    // ahí el mapeo lo cubre subscriber-deuda-153-156.integration.spec.ts.
    test.skip(
      legacy.legacyRows === 0,
      'Tenant sin filas anteriores a la 153 (base recién migrada); el mapeo lo cubre la prueba de integración de la migración.',
    );
    expect(legacy.mismatched, 'R2: SIMPLIFIED → NO_RESPONSABLE y COMMON → RESPONSABLE').toBe(0);
    expect(legacy.candidateId).not.toBeNull();

    const detail = await subscriberDetail(page, session, legacy.candidateId!);
    expect(detail['rutResponsibilities']).toEqual([]);
    expect(detail['fiscalCompleteness']).toEqual({
      complete: false,
      missing: ['RUT_RESPONSIBILITIES'],
    });

    await page.goto(`/dashboard/crm/subscribers/${legacy.candidateId!}`);
    await expect(page.getByText('Responsabilidades del RUT pendientes de completar')).toBeVisible();
    await expect(page.getByText('No responsable').first()).toBeVisible();
  });
});
