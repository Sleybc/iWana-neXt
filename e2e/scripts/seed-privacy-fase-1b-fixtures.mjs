#!/usr/bin/env node

/**
 * Seed idempotente de actores sintéticos para el E2E Privacy Fase 1b.
 * Ejecutar desde la raíz: node e2e/scripts/seed-privacy-fase-1b-fixtures.mjs
 * R4.1 importa `seedPrivacyFase1bFixtures` contra su base efímera: ese camino
 * no lee ni escribe `.env.development.local` y devuelve las credenciales en memoria.
 * Nunca imprime contraseñas, tokens, correos ni payloads de API.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

function findWorkspaceRoot() {
  let current = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const ROOT = findWorkspaceRoot();
if (!ROOT) throw new Error('No se encontró la raíz del workspace.');
// Mutable: R4.1 lo fija al importar el seed, con el prefijo /api/v1 incluido.
let API = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const ENV_FILE = path.join(ROOT, '.env.development.local');
const MIGRATIONS = [
  'PrivacyErasureRecord1490000000000',
  'TitularAnonymizationMarker1500000000000',
  'SeedBlockedDataPermission1510000000000',
];
// MOD05 deuda de código (V1): la suite portal-mod05-deuda-fiscal-live exige 153–157.
const MOD05_DEUDA_MIGRATIONS = [
  'SubscriberVatResponsibility1530000000000',
  'SubscriberLegalRepresentativeParty1540000000000',
  'FiscalDocumentEncryption1550000000000',
  'SubscriberExpedienteForeignKey1560000000000',
  'SubscriberFiscalCompleteness1570000000000',
];
const ADMIN_PROFILE = 'Administrador general';
const PRIVACY_PROFILE = 'Oficial de protección de datos';
const BILLING_PROFILE = 'Facturación y cobro';
const ROLE_PROFILE = {
  SALES: 'Acceso estándar Comercial',
  TECHNICIAN: 'Acceso estándar Técnico',
  ACCOUNTANT: 'Acceso estándar Contable',
};

function loadWorkspaceEnv() {
  for (const filename of ['.env.development.local', '.env.development', '.env']) {
    const envPath = path.join(ROOT, filename);
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function randomPassword() {
  return `Qa9-${crypto.randomBytes(32).toString('hex')}!zA`;
}

function derivePassword(masterPassword, tenantSlug, purpose) {
  const digest = crypto
    .createHmac('sha256', masterPassword)
    .update(`privacy-fase-1b:${purpose}:${tenantSlug}`)
    .digest('hex');
  return `Qa9-${digest}!zA`;
}

function writeEnvVariables(variables) {
  const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const lines = current.split(/\r?\n/);
  const pending = new Map(Object.entries(variables));
  const result = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${value}`;
  });
  for (const [key, value] of pending) result.push(`${key}=${value}`);
  fs.writeFileSync(
    ENV_FILE,
    `${result
      .filter((line, index) => index < result.length - 1 || line)
      .join('\n')
      .replace(/\n+$/, '')}\n`,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );
  for (const [key, value] of Object.entries(variables)) process.env[key] = value;
}

async function api(route, options = {}) {
  const response = await fetch(`${API}${route}`, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    // Los errores se informan solo con estado y código, nunca con payloads.
  }
  return { response, body };
}

function tenantFromResponse(body, slug) {
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.find((row) => row?.slug === slug) ?? null;
}

async function platformSession(email, password) {
  assert(email && password, 'Faltan E2E_PLATFORM_* en el entorno local.');
  const { response, body } = await api('/auth/platform/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert(response.ok && body?.data?.accessToken, `Login de plataforma HTTP ${response.status}.`);
  return body.data.accessToken;
}

async function lookupTenant(headers, slug) {
  const result = await api(`/tenants?search=${encodeURIComponent(slug)}&limit=100`, { headers });
  assert(result.response.ok, `Consulta de tenant HTTP ${result.response.status}.`);
  return tenantFromResponse(result.body, slug);
}

async function loadOrCreateTenant(platformToken, slug, suffix) {
  const headers = { authorization: `Bearer ${platformToken}` };
  let tenant = await lookupTenant(headers, slug);
  let created = false;

  if (!tenant) {
    const result = await api('/tenants', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `E2E Privacy Fase 1b ${suffix}`,
        slug,
        contactEmail: `qa-contact-${suffix}@example.invalid`,
        adminEmail: `qa-bootstrap-${suffix}@example.invalid`,
        settings: { timezone: 'America/Bogota', currency: 'COP' },
      }),
    });
    if (result.response.status === 201) {
      tenant = result.body?.data ?? null;
      created = true;
    } else if (result.response.status === 409) {
      tenant = await lookupTenant(headers, slug);
    } else {
      throw new Error(`Alta de tenant HTTP ${result.response.status}.`);
    }
  }

  assert(
    tenant?.slug === slug && tenant?.id && tenant?.schemaName,
    'Identidad de tenant inválida.',
  );
  assert(
    /^tenant_[a-z][a-z0-9_]{0,54}$/.test(tenant.schemaName),
    'Schema de tenant fuera del formato permitido.',
  );

  if (!created && tenant.status === 'INACTIVE') {
    throw new Error('El tenant sintético existente está INACTIVE; no se reactiva.');
  }
  for (let attempt = 0; attempt < 120 && tenant.status !== 'ACTIVE'; attempt += 1) {
    assert(tenant.status !== 'PROVISIONING_FAILED', 'El aprovisionamiento del tenant falló.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    tenant = await lookupTenant(headers, slug);
    assert(tenant, 'El tenant desapareció durante el aprovisionamiento.');
  }
  assert(tenant.status === 'ACTIVE', `El tenant no llegó a ACTIVE (${tenant.status}).`);
  return tenant;
}

function tenantLoginHeaders(slug, token) {
  return {
    'content-type': 'application/json',
    'X-Tenant-Slug': slug,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function tenantLogin(email, password, slug) {
  const { response, body } = await api('/auth/login', {
    method: 'POST',
    headers: tenantLoginHeaders(slug),
    body: JSON.stringify({ email, password }),
  });
  assert(response.ok && body?.data?.accessToken, `Login tenant HTTP ${response.status}.`);
  assert(!body.data.mfaRequired && !body.data.mfaSetupRequired, 'MFA inesperado en actor E2E.');
  return body.data.accessToken;
}

async function verifyEffectivePermissions(slug, token, expected) {
  const { response, body } = await api('/access-control/me/effective-permissions', {
    headers: tenantLoginHeaders(slug, token),
  });
  assert(response.ok, `Permisos efectivos HTTP ${response.status}.`);
  const permissions = body?.data?.effectivePermissions;
  assert(Array.isArray(permissions), 'Respuesta de permisos efectivos inválida.');
  for (const permission of expected) {
    assert(permissions.includes(permission), `Falta permiso efectivo requerido: ${permission}.`);
  }
  return permissions;
}

async function ensurePublishedAuthorizationText(slug, token, suffix) {
  const headers = tenantLoginHeaders(slug, token);
  const current = await api('/privacy/legal-texts/current?type=AUTORIZACION', { headers });
  if (current.response.ok) return;
  assert(
    current.response.status === 404,
    `Consulta del texto de autorización HTTP ${current.response.status}.`,
  );

  const created = await api('/privacy/legal-texts', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'AUTORIZACION',
      version: `e2e-privacy-1b-${suffix}`,
      content: 'Texto de autorización sintético para la suite E2E de privacidad.',
    }),
  });
  assert(
    created.response.status === 201 || created.response.status === 409,
    `Publicación del texto de autorización HTTP ${created.response.status}.`,
  );

  const verified = await api('/privacy/legal-texts/current?type=AUTORIZACION', { headers });
  assert(
    verified.response.ok,
    `Verificación del texto de autorización HTTP ${verified.response.status}.`,
  );
}

async function ensureActiveCatalogPlan(slug, token, suffix) {
  const headers = tenantLoginHeaders(slug, token);
  const current = await api('/commercial/catalog?type=PLAN&isActive=true&limit=100', { headers });
  assert(current.response.ok, `Consulta del catálogo HTTP ${current.response.status}.`);
  const plans = current.body?.data?.data;
  if (Array.isArray(plans) && plans.some((plan) => plan?.type === 'PLAN' && plan?.isActive)) return;

  const created = await api('/commercial/catalog/plans', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `E2E Privacy Fase 1b ${suffix}`,
      vatConcept: 'INTERNET_ACCESS',
      description: 'Plan comercial sintético para pruebas E2E de privacidad.',
      downloadSpeedMbps: 100,
      uploadSpeedMbps: 20,
      technology: 'FIBER',
      networkType: 'FIXED',
    }),
  });
  assert(
    created.response.status === 201,
    `Alta del plan sintético HTTP ${created.response.status}.`,
  );
  assert(
    typeof created.body?.data?.id === 'string' && created.body.data.isActive === true,
    'El plan sintético no quedó disponible en el catálogo.',
  );
}

function userEmail(kind, suffix) {
  return `qa-privacy-${kind}-${suffix}@example.invalid`;
}

async function upsertUser(db, bcrypt, hashEmail, tenantId, fixture, password, resetPassword) {
  const passwordHash = await bcrypt.hash(password, 12);
  const emailHash = hashEmail(fixture.email);
  const result = await db.query(
    `INSERT INTO users (
       email, email_hmac, email_hash, password_hash, role, status, tenant_id,
       mfa_enabled, mfa_required, password_reset_required, email_verified,
       first_name, last_name, job_title, is_operational_resource
     ) VALUES ($1,$2,$2,$3,$4,'ACTIVE',$5,FALSE,FALSE,FALSE,TRUE,$6,$7,$8,$9)
     ON CONFLICT (email) DO UPDATE SET
       email_hmac=EXCLUDED.email_hmac, email_hash=EXCLUDED.email_hash,
       password_hash=CASE WHEN $10::boolean THEN EXCLUDED.password_hash ELSE users.password_hash END,
       role=EXCLUDED.role, status='ACTIVE', tenant_id=EXCLUDED.tenant_id,
       mfa_enabled=FALSE, mfa_required=FALSE, password_reset_required=FALSE,
       email_verified=TRUE, first_name=EXCLUDED.first_name,
       last_name=EXCLUDED.last_name, job_title=EXCLUDED.job_title,
       is_operational_resource=EXCLUDED.is_operational_resource,
       deleted_at=NULL, updated_at=NOW()
     RETURNING id`,
    [
      fixture.email,
      emailHash,
      passwordHash,
      fixture.role,
      tenantId,
      fixture.firstName,
      fixture.lastName,
      fixture.jobTitle,
      fixture.operational,
      resetPassword,
    ],
  );
  return result.rows[0].id;
}

async function systemProfile(db, tenantId, name, role) {
  const result = await db.query(
    `SELECT id, base_role_constraint FROM access_profiles
     WHERE tenant_id=$1 AND name=$2 AND deleted_at IS NULL AND is_active=TRUE`,
    [tenantId, name],
  );
  assert(result.rowCount === 1, `No está disponible el perfil requerido: ${name}.`);
  assert(result.rows[0].base_role_constraint === role, `Perfil incompatible: ${name}.`);
  return result.rows[0].id;
}

async function ensureCustomProfile(db, tenantId, name, role, permissionKeys) {
  let result = await db.query(
    `SELECT id, base_role_constraint FROM access_profiles
     WHERE tenant_id=$1 AND name=$2 AND deleted_at IS NULL`,
    [tenantId, name],
  );
  let profileId;
  if (result.rowCount === 0) {
    result = await db.query(
      `INSERT INTO access_profiles
         (tenant_id,name,description,base_role_constraint,scope_site_id,is_system,is_active)
       VALUES ($1,$2,'Perfil sintético E2E Privacy Fase 1b',$3,NULL,FALSE,TRUE)
       RETURNING id, base_role_constraint`,
      [tenantId, name, role],
    );
  }
  profileId = result.rows[0].id;
  assert(result.rows[0].base_role_constraint === role, `Perfil sintético incompatible: ${name}.`);

  const catalog = await db.query(
    `SELECT permission_key FROM access_permission_catalog
     WHERE tenant_id=$1 AND is_active=TRUE AND permission_key=ANY($2::text[])`,
    [tenantId, permissionKeys],
  );
  const available = new Set(catalog.rows.map((row) => row.permission_key));
  assert(
    permissionKeys.every((key) => available.has(key)),
    `Catálogo incompleto para perfil ${name}.`,
  );

  const current = await db.query(
    `SELECT permission_key FROM access_profile_permissions WHERE tenant_id=$1 AND profile_id=$2`,
    [tenantId, profileId],
  );
  const actual = current.rows.map((row) => row.permission_key).sort();
  const desired = [...permissionKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(desired)) {
    await db.query('DELETE FROM access_profile_permissions WHERE tenant_id=$1 AND profile_id=$2', [
      tenantId,
      profileId,
    ]);
    for (const permission of desired) {
      await db.query(
        `INSERT INTO access_profile_permissions (tenant_id,profile_id,permission_key)
         VALUES ($1,$2,$3) ON CONFLICT (tenant_id,profile_id,permission_key) DO NOTHING`,
        [tenantId, profileId, permission],
      );
    }
  }
  return profileId;
}

async function assignProfiles(db, tenantId, userId, profileIds) {
  const result = await db.query(
    `SELECT profile_id, valid_from, valid_to FROM user_access_profiles
     WHERE tenant_id=$1 AND user_id=$2 AND is_active=TRUE`,
    [tenantId, userId],
  );
  const current = result.rows
    .filter((row) => row.valid_from <= new Date().toISOString().slice(0, 10))
    .filter((row) => !row.valid_to || row.valid_to >= new Date().toISOString().slice(0, 10))
    .map((row) => row.profile_id)
    .sort();
  const desired = [...profileIds].sort();
  if (JSON.stringify(current) === JSON.stringify(desired)) return;

  await db.query(
    `UPDATE user_access_profiles SET is_active=FALSE, valid_to=COALESCE(valid_to,CURRENT_DATE)
     WHERE tenant_id=$1 AND user_id=$2 AND is_active=TRUE`,
    [tenantId, userId],
  );
  for (const profileId of desired) {
    await db.query(
      `INSERT INTO user_access_profiles (tenant_id,user_id,profile_id,valid_from,valid_to,is_active)
       VALUES ($1,$2,$3,CURRENT_DATE,NULL,TRUE)
       ON CONFLICT (tenant_id,user_id,profile_id) WHERE is_active=TRUE DO NOTHING`,
      [tenantId, userId, profileId],
    );
  }
}

async function seedUsersAndProfiles(tenant, slug, suffix, adminPassword) {
  const requireFromApi = createRequire(path.join(ROOT, 'apps/api/package.json'));
  const requireFromDb = createRequire(path.join(ROOT, 'packages/database/package.json'));
  const bcrypt = requireFromApi('bcryptjs');
  const { Client } = requireFromDb('pg');
  const hashKey = process.env.PII_HASH_KEY?.trim();
  assert(hashKey && /^[a-f0-9]{64}$/i.test(hashKey), 'PII_HASH_KEY no está configurada.');
  const hashEmail = (email) =>
    crypto
      .createHmac('sha256', Buffer.from(hashKey, 'hex'))
      .update(email.toLowerCase())
      .digest('hex');

  const db = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER || process.env.DB_MIGRATOR_USER,
    password: process.env.DB_PASSWORD || process.env.DB_MIGRATOR_PASSWORD,
    connectionTimeoutMillis: 5000,
  });
  await db.connect();
  let actorIds;
  try {
    const identity = await db.query(
      'SELECT id, slug, schema_name, status FROM public.tenants WHERE id=$1',
      [tenant.id],
    );
    assert(
      identity.rowCount === 1 &&
        identity.rows[0].slug === slug &&
        identity.rows[0].schema_name === tenant.schemaName &&
        identity.rows[0].status === 'ACTIVE',
      'La identidad ACTIVE del tenant no coincide con la API.',
    );
    const schema = `"${tenant.schemaName}"`;
    await db.query('BEGIN');
    await db.query(`SET LOCAL search_path TO ${schema}, public`);
    const migrations = await db.query(
      `SELECT name FROM ${schema}.typeorm_migrations WHERE name=ANY($1::text[])`,
      [MIGRATIONS],
    );
    const applied = new Set(migrations.rows.map((row) => row.name));
    assert(
      MIGRATIONS.every((name) => applied.has(name)),
      'El tenant no acredita migraciones 149–151.',
    );
    const mod05Migrations = await db.query(
      `SELECT name FROM ${schema}.typeorm_migrations WHERE name=ANY($1::text[])`,
      [MOD05_DEUDA_MIGRATIONS],
    );
    const mod05Applied = new Set(mod05Migrations.rows.map((row) => row.name));
    assert(
      MOD05_DEUDA_MIGRATIONS.every((name) => mod05Applied.has(name)),
      'El tenant no acredita migraciones 153–157 (MOD05 deuda de código).',
    );

    const tenantId = tenant.id;
    const profileNames = {
      admin: await systemProfile(db, tenantId, ADMIN_PROFILE, 'ADMIN'),
      privacy: await systemProfile(db, tenantId, PRIVACY_PROFILE, 'AUDITOR'),
      sales: await systemProfile(db, tenantId, ROLE_PROFILE.SALES, 'SALES'),
      technician: await systemProfile(db, tenantId, ROLE_PROFILE.TECHNICIAN, 'TECHNICIAN'),
      accountant: await systemProfile(db, tenantId, ROLE_PROFILE.ACCOUNTANT, 'ACCOUNTANT'),
      billing: await systemProfile(db, tenantId, BILLING_PROFILE, 'ACCOUNTANT'),
    };
    const runnerProfile = await ensureCustomProfile(
      db,
      tenantId,
      `E2E Privacy admin ${suffix}`,
      'ADMIN',
      ['privacy.read', 'privacy.manage'],
    );
    const blockedReadAdminProfile = await ensureCustomProfile(
      db,
      tenantId,
      `E2E Privacy blocked-data reader ${suffix}`,
      'ADMIN',
      ['crm.blocked_data.read'],
    );
    const crmPermissionKeys = [
      'crm.subscribers.read',
      'crm.subscribers.manage',
      'crm.expedientes.read',
      'crm.expedientes.manage',
      'commercial.catalog.read',
    ];
    const auditorCrmProfile = await ensureCustomProfile(
      db,
      tenantId,
      `E2E Privacy CRM ${suffix}`,
      'AUDITOR',
      crmPermissionKeys,
    );

    const runnerEmail = userEmail('runner', suffix);
    const blockedReadEmail = userEmail('blocked-reader', suffix);
    const fixtures = [
      {
        key: 'privacyAdmin',
        email: userEmail('admin', suffix),
        role: 'AUDITOR',
        password: adminPassword,
        resetPassword: true,
        firstName: 'QA',
        lastName: 'Privacidad',
        jobTitle: 'Oficial de protección de datos E2E',
        operational: false,
        profileIds: [profileNames.privacy, auditorCrmProfile],
      },
      {
        key: 'runner',
        email: runnerEmail,
        role: 'ADMIN',
        password: derivePassword(adminPassword, slug, 'runner'),
        resetPassword: true,
        firstName: 'QA',
        lastName: 'Admin de corrida',
        jobTitle: 'Administrador sintético E2E',
        operational: false,
        profileIds: [profileNames.admin, runnerProfile],
      },
      {
        key: 'blockedReader',
        email: blockedReadEmail,
        role: 'ADMIN',
        password: derivePassword(adminPassword, slug, 'blocked-reader'),
        resetPassword: true,
        firstName: 'QA',
        lastName: 'Lectura bloqueada',
        jobTitle: 'Actor sintético E2E',
        operational: false,
        profileIds: [profileNames.admin, blockedReadAdminProfile],
      },
      {
        key: 'sales',
        email: userEmail('sales', suffix),
        role: 'SALES',
        password: randomPassword(),
        resetPassword: false,
        firstName: 'QA',
        lastName: 'Comercial',
        jobTitle: 'Actor sintético E2E',
        operational: false,
        profileIds: [profileNames.sales],
      },
      {
        key: 'technician',
        email: userEmail('technician', suffix),
        role: 'TECHNICIAN',
        password: randomPassword(),
        resetPassword: false,
        firstName: 'QA',
        lastName: 'Técnico',
        jobTitle: 'Actor sintético E2E',
        operational: true,
        profileIds: [profileNames.technician],
      },
      {
        key: 'accountantBilling',
        email: userEmail('accountant-billing', suffix),
        role: 'ACCOUNTANT',
        password: randomPassword(),
        resetPassword: false,
        firstName: 'QA',
        lastName: 'Contable',
        jobTitle: 'Actor sintético E2E',
        operational: false,
        profileIds: [profileNames.accountant, profileNames.billing],
      },
      {
        key: 'accountantPlain',
        email: userEmail('accountant-plain', suffix),
        role: 'ACCOUNTANT',
        password: randomPassword(),
        resetPassword: false,
        firstName: 'QA',
        lastName: 'Contable',
        jobTitle: 'Actor sintético E2E',
        operational: false,
        profileIds: [profileNames.accountant],
      },
    ];

    actorIds = {};
    for (const fixture of fixtures) {
      const userId = await upsertUser(
        db,
        bcrypt,
        hashEmail,
        tenantId,
        fixture,
        fixture.password,
        fixture.resetPassword,
      );
      actorIds[fixture.key] = userId;
      await assignProfiles(db, tenantId, userId, fixture.profileIds);
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }

  const Redis = requireFromApi('ioredis');
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  await redis.connect();
  await redis.del(...Object.values(actorIds).map((id) => `access:perms:${tenant.id}:${id}`));
  await redis.quit();

  const privacyAdminToken = await tenantLogin(userEmail('admin', suffix), adminPassword, slug);
  const privacyAdminPermissions = await verifyEffectivePermissions(slug, privacyAdminToken, [
    'privacy.read',
    'privacy.manage',
    ...[
      'crm.subscribers.read',
      'crm.subscribers.manage',
      'crm.expedientes.read',
      'crm.expedientes.manage',
    ],
  ]);
  await ensurePublishedAuthorizationText(slug, privacyAdminToken, suffix);
  const runnerToken = await tenantLogin(
    userEmail('runner', suffix),
    derivePassword(adminPassword, slug, 'runner'),
    slug,
  );
  await verifyEffectivePermissions(slug, runnerToken, [
    'privacy.read',
    'privacy.manage',
    'users.manage',
    'commercial.catalog.manage',
  ]);
  await ensureActiveCatalogPlan(slug, runnerToken, suffix);
  const blockedReaderToken = await tenantLogin(
    userEmail('blocked-reader', suffix),
    derivePassword(adminPassword, slug, 'blocked-reader'),
    slug,
  );
  await verifyEffectivePermissions(slug, blockedReaderToken, ['crm.blocked_data.read']);

  return {
    tenantSlug: slug,
    tenantStatus: 'ACTIVE',
    migrations: [149, 150, 151, 153, 154, 155, 156, 157],
    authorizationText: 'published',
    catalogPlan: 'active',
    actorRoles: [
      'AUDITOR privacy admin',
      'ADMIN runner',
      'SALES',
      'TECHNICIAN',
      'ACCOUNTANT billing',
      'ACCOUNTANT standard',
    ],
    privacyAdminCrmPermissions: privacyAdminPermissions.filter((permission) =>
      permission.startsWith('crm.'),
    ),
    passwordsPrinted: false,
  };
}

function newTenantSlug() {
  return `e2e-privacy-1b-${crypto.randomBytes(4).toString('hex')}`;
}

function suffixOf(slug) {
  assert(
    /^e2e-privacy-1b-[a-z0-9]{8}$/.test(slug),
    'E2E_PRIVACY_1B_TENANT_SLUG tiene formato inválido.',
  );
  return slug.slice('e2e-privacy-1b-'.length);
}

/**
 * Camino de R4.1: crea el tenant y sus actores sobre la API y la base del
 * entorno efímero (DB_*, REDIS_* y PII_HASH_KEY del proceso). No toca archivos
 * ni imprime nada; el llamador entrega las credenciales solo a la suite.
 */
export async function seedPrivacyFase1bFixtures({ apiBaseUrl, platformEmail, platformPassword }) {
  API = apiBaseUrl;
  const slug = newTenantSlug();
  const suffix = suffixOf(slug);
  const adminPassword = randomPassword();
  const platformToken = await platformSession(platformEmail, platformPassword);
  const tenant = await loadOrCreateTenant(platformToken, slug, suffix);
  await seedUsersAndProfiles(tenant, slug, suffix, adminPassword);
  return {
    E2E_PRIVACY_1B_TENANT_SLUG: slug,
    E2E_PRIVACY_ADMIN_EMAIL: userEmail('admin', suffix),
    E2E_PRIVACY_ADMIN_PASSWORD: adminPassword,
  };
}

async function main() {
  loadWorkspaceEnv();
  assert(process.env.DB_NAME === 'dbiw', 'El seed requiere DB_NAME=dbiw.');
  assert(Number(process.env.DB_PORT) === 5433, 'El seed requiere DB_PORT=5433.');
  const slug = process.env.E2E_PRIVACY_1B_TENANT_SLUG || newTenantSlug();
  const suffix = suffixOf(slug);
  writeEnvVariables({ E2E_PRIVACY_1B_TENANT_SLUG: slug });

  const platformToken = await platformSession(
    process.env.E2E_PLATFORM_EMAIL?.trim(),
    process.env.E2E_PLATFORM_PASSWORD,
  );
  const tenant = await loadOrCreateTenant(platformToken, slug, suffix);
  const adminEmail = userEmail('admin', suffix);
  const priorAdminPassword =
    process.env.E2E_PRIVACY_ADMIN_EMAIL === adminEmail
      ? process.env.E2E_PRIVACY_ADMIN_PASSWORD
      : undefined;
  const adminPassword = priorAdminPassword || randomPassword();
  writeEnvVariables({
    E2E_PRIVACY_1B_TENANT_SLUG: slug,
    E2E_PRIVACY_ADMIN_EMAIL: adminEmail,
    E2E_PRIVACY_ADMIN_PASSWORD: adminPassword,
  });

  const seeded = await seedUsersAndProfiles(tenant, slug, suffix, adminPassword);
  console.log(JSON.stringify({ result: 'ready', ...seeded }, null, 2));
}

// Solo la ejecución directa corre main(); importarlo desde R4.1 no siembra nada.
// En Windows la letra de unidad puede variar de caja entre argv y la URL.
const invokedDirectly =
  Boolean(process.argv[1]) &&
  pathToFileURL(path.resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedDirectly) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        result: 'failed',
        errorType: error?.constructor?.name ?? 'Error',
        errorCode: error?.code ?? null,
      }),
    );
    process.exitCode = 1;
  });
}
