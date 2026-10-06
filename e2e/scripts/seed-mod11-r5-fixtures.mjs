#!/usr/bin/env node

/**
 * Seed aislado de SR-QA para R5/Mod11. No se debe ejecutar contra otro slug.
 * Las credenciales sintéticas viven aquí para el guion humano; no imprimirlas.
 * Uso: node e2e/scripts/seed-mod11-r5-fixtures.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const API = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const TENANT_SLUG = 'srqa-mod11-r5-20261006';
const TENANT_SCHEMA = 'tenant_srqa_mod11_r5_20261006';
const OUTPUT_DIR = path.join(ROOT, '.r5-work');

// Credenciales exclusivas del tenant de QA sintético. Mantenerlas fuera del informe.
export const FIXTURE_USERS = {
  technician: {
    email: 'qa.tecnico@srqa-mod11-r5-20261006.test',
    password: 'Mod11R5Tech!2026-Seed',
    role: 'TECHNICIAN',
    firstName: 'QA Técnico',
    lastName: 'R5',
    jobTitle: 'Técnico de prueba',
    operational: true,
  },
  supervisor: {
    email: 'qa.supervisor@srqa-mod11-r5-20261006.test',
    password: 'Mod11R5Sup!2026-Seed',
    role: 'NOC',
    firstName: 'QA Supervisor',
    lastName: 'R5',
    jobTitle: 'Supervisor de prueba',
    operational: false,
  },
};

function loadWorkspaceEnv() {
  for (const filename of ['.env.development.local', '.env.development', '.env']) {
    const envPath = path.join(ROOT, filename);
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
}

async function api(route, options = {}) {
  const response = await fetch(`${API}${route}`, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    // Leave response body empty; callers report status without leaking payloads.
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function platformSession() {
  const email = process.env.E2E_PLATFORM_EMAIL ?? process.env.PLATFORM_SUPER_ADMIN_EMAIL;
  const password = process.env.E2E_PLATFORM_PASSWORD ?? process.env.PLATFORM_SUPER_ADMIN_PASSWORD;
  assert(email && password, 'Platform test credentials are unavailable.');

  const { response, body } = await api('/auth/platform/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert(response.ok && body?.data?.accessToken, `Platform login failed (${response.status}).`);
  return body.data.accessToken;
}

async function loadOrCreateTenant(platformToken) {
  const headers = { authorization: `Bearer ${platformToken}` };
  const lookup = async () =>
    api(`/tenants?search=${encodeURIComponent(TENANT_SLUG)}&limit=100`, { headers });

  let result = await lookup();
  assert(result.response.ok, `Tenant lookup failed (${result.response.status}).`);
  let tenant = (result.body?.data ?? []).find((entry) => entry.slug === TENANT_SLUG);

  if (!tenant) {
    result = await api('/tenants', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'R5 QA Mod11 Test Tenant',
        slug: TENANT_SLUG,
        contactEmail: 'qa-contact@srqa-mod11-r5-20261006.test',
        adminEmail: 'qa-admin@srqa-mod11-r5-20261006.test',
        settings: { timezone: 'America/Bogota', currency: 'COP' },
      }),
    });
    assert(result.response.status === 201, `Tenant creation failed (${result.response.status}).`);
    tenant = result.body?.data;
  }

  assert(
    tenant?.slug === TENANT_SLUG && tenant?.schemaName === TENANT_SCHEMA && tenant?.id,
    'Tenant identity does not match the dedicated R5 QA fixture.',
  );

  for (let attempt = 0; attempt < 60 && tenant.status !== 'ACTIVE'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await lookup();
    assert(result.response.ok, `Tenant status lookup failed (${result.response.status}).`);
    tenant = (result.body?.data ?? []).find((entry) => entry.slug === TENANT_SLUG);
    assert(tenant?.status !== 'PROVISIONING_FAILED', 'Tenant provisioning failed.');
  }
  assert(tenant?.status === 'ACTIVE', `Tenant is not ACTIVE (${tenant?.status ?? 'missing'}).`);
  return tenant;
}

async function tenantSession(email, password) {
  const { response, body } = await api('/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Tenant-Slug': TENANT_SLUG,
    },
    body: JSON.stringify({ email, password }),
  });
  assert(response.ok && body?.data?.accessToken, `Tenant login failed (${response.status}).`);
  assert(
    !body.data.mfaRequired && !body.data.mfaSetupRequired,
    'Unexpected MFA setup for QA fixture.',
  );
  return body.data.accessToken;
}

async function createAssignedOrder(
  creatorToken,
  technicianToken,
  db,
  tenantId,
  technicianId,
  fixtureKey,
  offsetHours,
) {
  const summary = `SRQA R5 ${fixtureKey} fixture`;
  let executionOrderId = (
    await db.query(
      `SELECT id FROM "${TENANT_SCHEMA}".execution_orders
     WHERE tenant_id=$1 AND work_summary=$2 AND is_annulled=FALSE
     ORDER BY created_at LIMIT 1`,
      [tenantId, summary],
    )
  ).rows[0]?.id;

  if (!executionOrderId) {
    const starts = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
    const ends = new Date(starts.getTime() + 45 * 60 * 1000);
    const created = await api('/wfm/events', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${creatorToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'INSTALLATION',
        title: summary,
        description: 'Fixture local sintético para QA de consola OT.',
        scheduledStartAt: starts.toISOString(),
        scheduledEndAt: ends.toISOString(),
        assignedUserId: technicianId,
        address: 'Dirección sintética de prueba',
        municipality: 'Municipio QA',
        sector: 'Sector QA',
        workOrder: {
          type: 'INSTALLATION',
          priority: 'NORMAL',
          sourceContext: 'MANUAL',
          summary,
        },
      }),
    });
    assert(
      [200, 201].includes(created.response.status),
      `WFM event creation failed (${created.response.status}).`,
    );

    const event = created.body?.data ?? created.body;
    executionOrderId = event.executionOrderId;
    if (!executionOrderId && event.id) {
      const detail = await api(`/wfm/events/${event.id}`, {
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      assert(detail.response.ok, `WFM event lookup failed (${detail.response.status}).`);
      executionOrderId = (detail.body?.data ?? detail.body).executionOrderId;
    }
  }
  assert(executionOrderId, 'WFM event did not return its execution order id.');

  const orderResult = await api(`/tasks/execution-orders/${executionOrderId}`, {
    headers: { authorization: `Bearer ${technicianToken}` },
  });
  assert(
    orderResult.response.ok,
    `Execution order lookup failed (${orderResult.response.status}; ${orderResult.body?.code ?? orderResult.body?.error?.code ?? 'no-code'}).`,
  );
  const order = orderResult.body?.data ?? orderResult.body;
  const validStatus =
    fixtureKey === 'NVDA-BLOCKED'
      ? ['ASSIGNED', 'BLOCKED'].includes(order.status)
      : order.status === 'ASSIGNED';
  assert(validStatus, `Unexpected ${fixtureKey} order status (${order.status}).`);
  return {
    id: executionOrderId,
    number: String(order.number ?? order.executionOrderNumber ?? ''),
    version: Number(order.version),
    status: order.status,
  };
}

async function main() {
  loadWorkspaceEnv();
  const platformToken = await platformSession();
  const tenant = await loadOrCreateTenant(platformToken);
  const requireFromApi = createRequire(path.join(ROOT, 'apps/api/package.json'));
  const requireFromDb = createRequire(path.join(ROOT, 'packages/database/package.json'));
  const bcrypt = requireFromApi('bcryptjs');
  const { Client } = requireFromDb('pg');
  const hashKey = process.env.PII_HASH_KEY?.trim();
  assert(hashKey && /^[a-f0-9]{64}$/i.test(hashKey), 'PII_HASH_KEY is unavailable or invalid.');
  const hashEmail = (email) =>
    crypto
      .createHmac('sha256', Buffer.from(hashKey, 'hex'))
      .update(email.toLowerCase().trim())
      .digest('hex');

  const db = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  });
  await db.connect();

  let technicianId;
  let supervisorId;
  let itemId;
  try {
    const identity = await db.query(
      'SELECT id, slug, schema_name FROM public.tenants WHERE id = $1',
      [tenant.id],
    );
    assert(
      identity.rowCount === 1 &&
        identity.rows[0].slug === TENANT_SLUG &&
        identity.rows[0].schema_name === TENANT_SCHEMA,
      'Database tenant identity mismatch; refusing fixture writes.',
    );

    const schema = `"${TENANT_SCHEMA}"`;
    await db.query('BEGIN');
    const users = {};
    for (const [key, fixture] of Object.entries(FIXTURE_USERS)) {
      const passwordHash = await bcrypt.hash(fixture.password, 12);
      const emailHash = hashEmail(fixture.email);
      const result = await db.query(
        `INSERT INTO ${schema}.users (
           email, email_hmac, email_hash, password_hash, role, status, tenant_id,
           mfa_enabled, mfa_required, password_reset_required, email_verified,
           first_name, last_name, job_title, is_operational_resource
         ) VALUES ($1,$2,$2,$3,$4,'ACTIVE',$5,FALSE,FALSE,FALSE,TRUE,$6,$7,$8,$9)
         ON CONFLICT (email) DO UPDATE SET
           email_hmac=EXCLUDED.email_hmac, email_hash=EXCLUDED.email_hash,
           password_hash=EXCLUDED.password_hash, role=EXCLUDED.role,
           status='ACTIVE', tenant_id=EXCLUDED.tenant_id,
           mfa_enabled=FALSE, mfa_required=FALSE,
           password_reset_required=FALSE, email_verified=TRUE,
           first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
           job_title=EXCLUDED.job_title,
           is_operational_resource=EXCLUDED.is_operational_resource,
           deleted_at=NULL, updated_at=NOW()
         RETURNING id`,
        [
          fixture.email,
          emailHash,
          passwordHash,
          fixture.role,
          tenant.id,
          fixture.firstName,
          fixture.lastName,
          fixture.jobTitle,
          fixture.operational,
        ],
      );
      users[key] = result.rows[0].id;
    }
    technicianId = users.technician;
    supervisorId = users.supervisor;

    const permissionProfiles = [
      {
        key: 'technician',
        userId: technicianId,
        role: 'TECHNICIAN',
        name: 'SRQA R5 técnico consola',
        permissions: [
          'operations.execution_orders.read',
          'operations.execution_orders.execute',
          'inventory.stock.read',
        ],
      },
      {
        key: 'supervisor',
        userId: supervisorId,
        role: 'NOC',
        name: 'SRQA R5 supervisor solo lectura',
        permissions: ['operations.execution_orders.read', 'operations.execution_orders.supervise'],
      },
    ];
    for (const profile of permissionProfiles) {
      let saved = await db.query(
        `SELECT id FROM ${schema}.access_profiles
         WHERE tenant_id=$1 AND name=$2 AND deleted_at IS NULL`,
        [tenant.id, profile.name],
      );
      if (!saved.rowCount) {
        saved = await db.query(
          `INSERT INTO ${schema}.access_profiles
             (tenant_id,name,description,base_role_constraint,scope_site_id,is_system,is_active)
           VALUES ($1,$2,'Perfil de fixture aislado SR-QA R5',$3,NULL,FALSE,TRUE)
           RETURNING id`,
          [tenant.id, profile.name, profile.role],
        );
      }
      const profileId = saved.rows[0].id;
      for (const permission of profile.permissions) {
        await db.query(
          `INSERT INTO ${schema}.access_profile_permissions
             (tenant_id,profile_id,permission_key)
           VALUES ($1,$2,$3)
           ON CONFLICT (tenant_id,profile_id,permission_key) DO NOTHING`,
          [tenant.id, profileId, permission],
        );
      }
      const assignment = await db.query(
        `SELECT id FROM ${schema}.user_access_profiles
         WHERE tenant_id=$1 AND user_id=$2 AND profile_id=$3 AND is_active=TRUE
         FOR UPDATE`,
        [tenant.id, profile.userId, profileId],
      );
      if (!assignment.rowCount) {
        await db.query(
          `INSERT INTO ${schema}.user_access_profiles
             (tenant_id,user_id,profile_id,valid_from,is_active)
           VALUES ($1,$2,$3,CURRENT_DATE,TRUE)`,
          [tenant.id, profile.userId, profileId],
        );
      }
    }

    const category = await db.query(
      `INSERT INTO ${schema}.inventory_categories
         (tenant_id, code, code_prefix, name, status, sort_order)
       VALUES ($1, 'CPE', 'CPE', 'Equipo CPE de prueba R5', 'ACTIVE', 990)
       ON CONFLICT (tenant_id, code) DO UPDATE
         SET name=EXCLUDED.name, status='ACTIVE', updated_at=NOW()
       RETURNING id`,
      [tenant.id],
    );
    const item = await db.query(
      `INSERT INTO ${schema}.inventory_items
         (tenant_id, sku, name, category, category_id, tracking_mode,
          unit_of_measure, item_kind, status, purchasable, inventory_controlled,
          asset_controlled)
       VALUES ($1, 'SRQA-CPE-R5-001', 'CPE de prueba R5', 'CPE', $2,
               'CONSUMABLE', 'UNIT', 'STOCK', 'ACTIVE', FALSE, TRUE, FALSE)
       ON CONFLICT (tenant_id, sku) DO UPDATE SET
         name=EXCLUDED.name, category='CPE', category_id=EXCLUDED.category_id,
         tracking_mode='CONSUMABLE', unit_of_measure='UNIT', item_kind='STOCK',
         status='ACTIVE', inventory_controlled=TRUE, updated_at=NOW()
       RETURNING id`,
      [tenant.id, category.rows[0].id],
    );
    itemId = item.rows[0].id;

    let location = await db.query(
      `SELECT id FROM ${schema}.stock_locations
       WHERE tenant_id=$1 AND responsible_ref_id=$2
         AND type='MOBILE_TECHNICIAN' AND status='ACTIVE'
       FOR UPDATE`,
      [tenant.id, technicianId],
    );
    if (location.rowCount === 0) {
      location = await db.query(
        `INSERT INTO ${schema}.stock_locations
           (tenant_id, code, name, type, status, responsible_ref_id)
         VALUES ($1, 'SRQA-R5-TECH', 'Custodia QA R5',
                 'MOBILE_TECHNICIAN', 'ACTIVE', $2)
         RETURNING id`,
        [tenant.id, technicianId],
      );
    }
    const locationId = location.rows[0].id;
    const balance = await db.query(
      `SELECT id FROM ${schema}.stock_balances
       WHERE tenant_id=$1 AND item_id=$2 AND location_id=$3
         AND lot_id IS NULL AND condition='NEW'
       FOR UPDATE`,
      [tenant.id, itemId, locationId],
    );
    if (balance.rowCount) {
      await db.query(
        `UPDATE ${schema}.stock_balances
         SET quantity_on_hand=2, quantity_reserved=0, updated_at=NOW()
         WHERE id=$1`,
        [balance.rows[0].id],
      );
    } else {
      await db.query(
        `INSERT INTO ${schema}.stock_balances
           (tenant_id,item_id,location_id,condition,quantity_on_hand,quantity_reserved)
         VALUES ($1,$2,$3,'NEW',2,0)`,
        [tenant.id, itemId, locationId],
      );
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
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  await redis.connect();
  await redis.del(
    `access:perms:${tenant.id}:${technicianId}`,
    `access:perms:${tenant.id}:${supervisorId}`,
  );
  await redis.quit();

  const [nocToken, techToken] = await Promise.all([
    tenantSession(FIXTURE_USERS.supervisor.email, FIXTURE_USERS.supervisor.password),
    tenantSession(FIXTURE_USERS.technician.email, FIXTURE_USERS.technician.password),
  ]);
  const custody = await api(`/inventory/custody?responsibleRefId=${technicianId}`, {
    headers: { authorization: `Bearer ${techToken}` },
  });
  const custodyBody = custody.body?.data ?? custody.body;
  assert(custody.response.ok, `Technician custody API failed (${custody.response.status}).`);
  assert(
    custodyBody?.location?.responsibleRefId === technicianId &&
      custodyBody?.balances?.items?.some(
        (balance) =>
          balance.itemId === itemId &&
          Number(balance.quantityOnHand) - Number(balance.quantityReserved) > 0,
      ),
    'CPE test stock is not visible in technician custody through the API.',
  );
  const database = new (requireFromDb('pg').Client)({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  });
  await database.connect();
  try {
    const assigned = await createAssignedOrder(
      nocToken,
      techToken,
      database,
      tenant.id,
      technicianId,
      'NVDA-ASSIGNED',
      24,
    );
    const blocked = await createAssignedOrder(
      nocToken,
      techToken,
      database,
      tenant.id,
      technicianId,
      'NVDA-BLOCKED',
      27,
    );
    if (blocked.status !== 'BLOCKED') {
      const blockResponse = await api(`/tasks/execution-orders/${blocked.id}/block`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${techToken}`,
          'content-type': 'application/json',
          'If-Match': String(blocked.version),
          'Idempotency-Key': `srqa-r5-block-${blocked.id}`,
        },
        body: JSON.stringify({
          reasonCode: 'SIN_ACCESO',
          note: 'Fixture sintético para guion NVDA R5.',
        }),
      });
      assert(blockResponse.response.ok, `Block API failed (${blockResponse.response.status}).`);
    }
    const blockedResult = await api(`/tasks/execution-orders/${blocked.id}`, {
      headers: { authorization: `Bearer ${techToken}` },
    });
    assert(
      blockedResult.response.ok,
      `Blocked order lookup failed (${blockedResult.response.status}).`,
    );
    const blockedOrder = blockedResult.body?.data ?? blockedResult.body;
    assert(
      blockedOrder.status === 'BLOCKED',
      `Expected BLOCKED order, received ${blockedOrder.status}.`,
    );

    const templateVersions = await database.query(
      `SELECT id, template_version_number FROM "${TENANT_SCHEMA}".execution_orders
       WHERE tenant_id=$1 AND id = ANY($2::uuid[])`,
      [tenant.id, [assigned.id, blocked.id]],
    );
    assert(
      templateVersions.rowCount === 2 &&
        templateVersions.rows.every((row) => Number(row.template_version_number) === 2),
      'Expected both NVDA orders to snapshot template v2.',
    );

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'nvda-fixtures.json'),
      JSON.stringify(
        {
          tenantSlug: TENANT_SLUG,
          tenantSchema: TENANT_SCHEMA,
          technicianId,
          supervisorId,
          cpeItemId: itemId,
          assigned: {
            id: assigned.id,
            number: assigned.number,
            templateVersion: 2,
            status: assigned.status,
          },
          blocked: {
            id: blocked.id,
            number: blockedOrder.number ?? blocked.number,
            templateVersion: 2,
            status: blockedOrder.status,
          },
        },
        null,
        2,
      ),
    );

    process.stdout.write(
      `seed=complete tenant=ACTIVE technician=ready supervisor=ready CPE-custody=1 ` +
        `assigned=${assigned.number || assigned.id} v2/${assigned.status} ` +
        `blocked=${blockedOrder.number || blocked.id} v2/${blockedOrder.status}\n`,
    );
  } finally {
    await database.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`R5_SEED_FAILED ${error.message}\n`);
    process.exitCode = 1;
  });
}
