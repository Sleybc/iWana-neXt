/** V4-R: comandos HTTP y coreografía real; ninguna solicitud se firma en el test.
 * pnpm exec playwright test e2e/tests/api/mod11-mod12-reverso.spec.ts --config e2e/playwright.api.config.ts --retries=0
 * DB_NAME debe ser i4_qa_20261006_a1. La infraestructura ausente falla el gate.
 */
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, openSync, writeFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type Row = Record<string, unknown>;
type Database = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
};
const fromDb = createRequire(`${process.cwd()}/packages/database/package.json`);
const fromApi = createRequire(`${process.cwd()}/apps/api/package.json`);
const API = `${process.env.API_BASE_URL ?? 'http://127.0.0.1:3000'}/api/v1`;
const PORTAL = process.env.PORTAL_BASE_URL ?? 'http://localhost:3002';
const SLUG = 'i4-qa-a-20261006-9d3098f4';
const run = randomUUID().slice(0, 8);
const password = randomBytes(32).toString('base64url');
let db: Database;
let api: APIRequestContext;
let tenantId: string;
let schema: string;
let siteId: string;
let supervisorId: string;
let technicianId: string;
let supervisorToken: string;
let supervisorEmail: string;
let technicianToken: string;
let outsideToken: string;
type RedisReadClient = {
  call(command: string, ...args: (string | number)[]): Promise<unknown>;
  quit(): Promise<void>;
};
function redisReader(readonly = true): RedisReadClient {
  const Redis = fromApi('ioredis');
  const credential = readFileSync(`${process.cwd()}/.claude/mcp-redis.local.env`, 'utf8').match(
    /^REDIS_PWD=(\S+)$/m,
  )?.[1];
  return new Redis({
    host: '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6380),
    db: Number(process.env.REDIS_DB ?? 0),
    username: readonly ? 'iwana_readonly' : undefined,
    password: readonly ? credential : process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 1,
  });
}
function responseEventId(id: string): string {
  const digest = createHash('sha1')
    .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update(`reversal:${id}`)
    .digest()
    .subarray(0, 16);
  digest[6] = ((digest[6] ?? 0) & 15) | 80;
  digest[8] = ((digest[8] ?? 0) & 63) | 128;
  const h = digest.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function restartQaWorker(): number {
  const secretPath = process.env.V4_SIGNING_KEY_PATH;
  expect(secretPath, 'Clave sintética local para reiniciar mismo stack').toBeTruthy();
  const output = openSync(join(tmpdir(), 'iwana-v4r-worker.log'), 'a');
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: join(process.cwd(), 'apps/worker'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DB_NAME: 'i4_qa_20261006_a1',
      INTERNAL_QUEUE_SIGNING_KEY: readFileSync(String(secretPath), 'utf8').trim(),
    },
    windowsHide: true,
    detached: true,
    stdio: ['ignore', output, output],
  });
  expect(child.pid).toBeTruthy();
  child.unref();
  writeFileSync(join(tmpdir(), 'iwana-v4r-worker.pid'), String(child.pid));
  return Number(child.pid);
}

async function sql(query: string, params: unknown[] = []): Promise<Row[]> {
  return (await db.query(query, params)).rows;
}
async function login(email: string): Promise<string> {
  const result = await api.post(`${API}/auth/login`, {
    headers: { 'X-Tenant-Slug': SLUG },
    data: { email, password },
  });
  expect(result.status(), 'Login de usuario sintético').toBe(200);
  const body = await result.json();
  expect(body.data?.accessToken, 'Sesión completa sin MFA pendiente').toBeTruthy();
  return body.data.accessToken;
}
function headers(token = supervisorToken) {
  return { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': SLUG };
}
async function get(orderId: string, suffix = '', token = supervisorToken): Promise<Row> {
  const result = await api.get(`${API}/tasks/execution-orders/${orderId}${suffix}`, {
    headers: headers(token),
  });
  expect(result.status()).toBe(200);
  const body = await result.json();
  return body.data ?? body;
}
type Fixture = {
  order: string;
  usage: string;
  original: string;
  item: string;
  source: string;
  destination: string;
  asset?: string;
  loan?: string;
  inventoryRequest: string;
};

async function fixture(
  options: { serial?: boolean; terminal?: boolean; rejection?: string; usageStatus?: string } = {},
): Promise<Fixture> {
  const f: Fixture = {
    order: randomUUID(),
    usage: randomUUID(),
    original: randomUUID(),
    item: randomUUID(),
    source: randomUUID(),
    destination: randomUUID(),
    inventoryRequest: randomUUID(),
  };
  const custodyId = randomUUID();
  const category = (await sql("SELECT id FROM inventory_categories WHERE code='CPE' LIMIT 1"))[0];
  expect(category, 'Catálogo sintético CPE').toBeTruthy();
  await sql(
    `INSERT INTO inventory_items (id,tenant_id,sku,name,category,category_id,tracking_mode,unit_of_measure,item_kind,status,purchasable,inventory_controlled,asset_controlled)
    VALUES ($1,$2,$3,'Equipo sintético reverso','CPE',$4,$5,'UNIT','STOCK','ACTIVE',false,true,$6)`,
    [
      f.item,
      tenantId,
      `RV-${run}-${f.item.slice(0, 8)}`,
      category.id,
      options.serial ? 'SERIALIZED' : 'CONSUMABLE',
      !!options.serial,
    ],
  );
  await sql(
    `INSERT INTO stock_locations (id,tenant_id,code,name,type,status,responsible_ref_id) VALUES
    ($1,$2,$3,'Custodia sintética','MOBILE_TECHNICIAN',$4,$5),($6,$2,$7,'Destino sintético','CUSTOMER_SITE','ACTIVE',NULL)`,
    [
      f.source,
      tenantId,
      `RVS-${f.source.slice(0, 8)}`,
      options.rejection === 'REVERSAL_CUSTODY_INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      custodyId,
      f.destination,
      `RVD-${f.destination.slice(0, 8)}`,
    ],
  );
  const subscriber = randomUUID();
  const originalContext =
    options.rejection === 'REVERSAL_ORIGINAL_NOT_FOUND' ? randomUUID() : f.order;
  await sql(
    `INSERT INTO stock_movements (id,tenant_id,movement_number,origin,origin_context,origin_ref_id,idempotency_key,actor_user_id,is_reversal)
    VALUES ($1,$2,$3,'EXECUTION_ORDER','tasks.execution-order',$4,$5,$6,false)`,
    [
      f.original,
      tenantId,
      `RV-${f.original.slice(0, 20)}`,
      originalContext,
      `rv-orig-${f.original}`,
      technicianId,
    ],
  );
  if (options.serial) {
    f.asset = randomUUID();
    f.loan = randomUUID();
    const moved = options.rejection === 'REVERSAL_ASSET_MOVED';
    await sql(
      `INSERT INTO serialized_assets (id,tenant_id,inventory_item_id,serial_number,normalized_serial_number,current_status,current_location_id,current_responsible_type,current_responsible_ref_id,subscriber_ref_id)
      VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9)`,
      [
        f.asset,
        tenantId,
        f.item,
        `RV-${f.asset}`,
        moved ? 'ASSIGNED_TO_TECHNICIAN' : 'INSTALLED_COMODATO',
        moved ? f.source : f.destination,
        moved ? 'TECHNICIAN' : 'CUSTOMER',
        moved ? custodyId : subscriber,
        subscriber,
      ],
    );
    await sql(
      `INSERT INTO asset_lifecycle_events (tenant_id,serialized_asset_id,event_type,from_status,to_status,location_id,responsible_ref_id,actor_user_id,stock_movement_id)
      VALUES ($1,$2,'INSTALLED','ASSIGNED_TO_TECHNICIAN','INSTALLED_COMODATO',$3,$4,$5,$6)`,
      [tenantId, f.asset, f.destination, subscriber, technicianId, f.original],
    );
    await sql(
      `INSERT INTO asset_loan_assignments (id,tenant_id,serialized_asset_id,subscriber_ref_id,installed_at,execution_order_ref_id,stock_movement_id,removed_at)
      VALUES ($1,$2,$3,$4,now(),$5,$6,$7)`,
      [
        f.loan,
        tenantId,
        f.asset,
        subscriber,
        f.order,
        f.original,
        options.rejection === 'REVERSAL_LOAN_MISMATCH' ? new Date() : null,
      ],
    );
  }
  await sql(
    `INSERT INTO stock_movement_lines (tenant_id,movement_id,item_id,location_id,serialized_asset_id,quantity,unit_cost)
    VALUES ($1,$2,$3,$4,$5,-1,1),($1,$2,$3,$6,$5,1,1)`,
    [tenantId, f.original, f.item, f.source, f.asset ?? null, f.destination],
  );
  await sql(
    `INSERT INTO stock_balances (tenant_id,item_id,location_id,lot_id,condition,quantity_on_hand,quantity_reserved)
    VALUES ($1,$2,$3,NULL,'NEW',0,0),($1,$2,$4,NULL,'NEW',1,0)`,
    [tenantId, f.item, f.source, f.destination],
  );
  // Snapshot v2 congelado; el seed únicamente prepara estado previo al comando.
  const changes = {
    id: f.order,
    execution_order_number: `RV-${run}-${f.order.slice(0, 8)}`,
    organization_site_id: siteId,
    assigned_technician_id: technicianId,
    schedule_event_id: null,
    visit_request_id: null,
    origin_ref_id: null,
    task_id: null,
    ticket_id: null,
    subscriber_id: subscriber,
    version: 1,
    status: options.terminal ? 'COMPLETED' : 'IN_PROGRESS',
    result: options.terminal ? 'EXECUTED' : null,
    closed_at: options.terminal ? new Date().toISOString() : null,
    template_version_number: 2,
    template_requirements_snapshot: [
      {
        key: 'rv-material',
        kind: 'MATERIAL',
        label: 'Equipo sintético',
        required: true,
        itemCategory: 'CPE',
        finalDisposition: 'INSTALLED_AT_CUSTOMER',
      },
    ],
  };
  await sql(
    `INSERT INTO execution_orders SELECT (jsonb_populate_record(NULL::execution_orders,to_jsonb(e)||$1::jsonb)).* FROM execution_orders e WHERE tenant_id=$2 AND template_version_number=2 LIMIT 1`,
    [JSON.stringify(changes), tenantId],
  );
  await sql(
    `INSERT INTO execution_order_item_usage (id,execution_order_id,tenant_id,item_id,requirement_key,technician_custody_id,quantity,serial_number,action,final_disposition,stock_movement_id,inventory_request_id,movement_status,actor_user_id)
    VALUES ($1,$2,$3,$4,'rv-material',$5,1,$6,'INSTALL','INSTALLED_AT_CUSTOMER',$7,$8,$9,$10)`,
    [
      f.usage,
      f.order,
      tenantId,
      f.item,
      custodyId,
      f.asset ? `RV-${f.asset}` : null,
      f.original,
      f.inventoryRequest,
      options.usageStatus ?? 'CONFIRMED',
      technicianId,
    ],
  );
  await sql(
    `INSERT INTO inventory_execution_request_receipts (id,tenant_id,request_id,execution_order_id,aggregate_version,outcome,stock_movement_id,kind)
    VALUES ($1,$2,$3,$4,1,'CONFIRMED',$5,'CONSUMPTION')`,
    [randomUUID(), tenantId, f.inventoryRequest, f.order, f.original],
  );
  return f;
}
async function reverse(
  f: Fixture,
  options: { token?: string; reason?: string; key?: string } = {},
) {
  const detail = await get(f.order);
  return api.post(`${API}/tasks/execution-orders/${f.order}/item-usage/${f.usage}/reversal`, {
    headers: {
      ...headers(options.token),
      'If-Match': String(detail.version),
      'Idempotency-Key': options.key ?? randomUUID(),
    },
    data: { reason: options.reason ?? `Corrección operativa sintética RV ${run}` },
  });
}
async function decided(f: Fixture, outcome = 'CONFIRMED', reason?: string): Promise<Row> {
  await expect
    .poll(
      async () =>
        (
          await sql(
            'SELECT status FROM execution_order_item_usage_reversals WHERE item_usage_id=$1 ORDER BY requested_at DESC LIMIT 1',
            [f.usage],
          )
        )[0]?.status,
      { timeout: 60_000, intervals: [250, 500, 1000] },
    )
    .toBe(outcome);
  const reversal = (
    await sql(
      'SELECT * FROM execution_order_item_usage_reversals WHERE item_usage_id=$1 ORDER BY requested_at DESC LIMIT 1',
      [f.usage],
    )
  )[0];
  const receipt = (
    await sql(
      "SELECT * FROM inventory_execution_request_receipts WHERE kind='REVERSAL' AND request_id=$1",
      [reversal.reversal_request_id],
    )
  )[0];
  expect(receipt?.outcome).toBe(outcome);
  if (reason) {
    expect(receipt.reason_code).toBe(reason);
    expect(reversal.rejection_reason_code).toBe(reason);
  }
  const usages = await get(f.order, '/item-usage');
  const line = (Array.isArray(usages) ? usages : (usages.items ?? usages.data)) as Row[];
  expect((line.find((u) => u.id === f.usage)?.reversal as Row)?.status).toBe(outcome);
  const outbox = await sql(
    "SELECT event_type,payload,published_at FROM execution_order_outbox_events WHERE aggregate_id=$1 AND event_type='InventoryConsumptionReversalRequestedV1'",
    [f.order],
  );
  expect(outbox.length).toBeGreaterThan(0);
  expect(
    outbox.some((e) => e.published_at !== null),
    'MOD11 → relay → cola autenticada → MOD12 → proyección',
  ).toBe(true);
  return reversal;
}
async function portal(page: Page, f: Fixture) {
  await page.goto(`${PORTAL}/auth/login`);
  // La sesión del portal usa cookie httpOnly: login real por su proxy (ADR-081).
  const session = await page.request.post(`${PORTAL}/api/v1/auth/login`, {
    headers: { 'X-Tenant-Slug': SLUG },
    data: { email: supervisorEmail, password },
  });
  expect(session.status()).toBe(200);
  await page.evaluate((slug) => localStorage.setItem('iwana.portal.tenant-slug', slug), SLUG);
  await page.goto(`${PORTAL}/dashboard/operations/execution-orders?executionOrderId=${f.order}`);
}

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.describe('MOD11 ↔ MOD12 reverso con stack vivo (V4-R)', () => {
  test.beforeAll(async () => {
    expect(process.env.DB_NAME, 'Base sintética explícita; nunca default').toBe(
      'i4_qa_20261006_a1',
    );
    const Client = fromDb('pg').Client;
    db = new Client({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5433),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    await db.connect();
    const tenant = (
      await sql("SELECT id,schema_name FROM public.tenants WHERE slug=$1 AND status='ACTIVE'", [
        SLUG,
      ])
    )[0];
    expect(tenant).toBeTruthy();
    tenantId = String(tenant.id);
    schema = String(tenant.schema_name);
    expect(schema).toMatch(/^tenant_i4_qa_a_/);
    await sql(`SET search_path TO "${schema}",public`);
    api = await request.newContext();
    expect((await api.get(`${API}/health`)).ok()).toBe(true);
    expect((await api.get(PORTAL)).ok(), 'Portal vivo').toBe(true);
    siteId = String(
      (
        await sql(
          "INSERT INTO organization_sites (tenant_id,name,code,site_type) VALUES($1,'Sede QA reverso',$2,'MIXED') RETURNING id",
          [tenantId, `RV-${run}`],
        )
      )[0].id,
    );
    for (const [key, role] of [
      ['supervisor', 'NOC'],
      ['outside', 'NOC'],
      ['technician', 'TECHNICIAN'],
    ]) {
      const email = `rv-${run}-${key}@qa.invalid`;
      const id = randomUUID();
      const hash = await fromApi('bcryptjs').hash(password, 12);
      const hmac = createHmac('sha256', Buffer.from(String(process.env.PII_HASH_KEY), 'hex'))
        .update(email.toLowerCase())
        .digest('hex');
      await sql(
        `INSERT INTO users (id,email,email_hmac,email_hash,password_hash,role,status,tenant_id,mfa_enabled,mfa_required,password_reset_required,email_verified,first_name,last_name,is_operational_resource)
        VALUES($1,$2,$3,$3,$4,$5,'ACTIVE',$6,false,false,false,true,'QA','Reverso',true)`,
        [id, email, hmac, hash, role, tenantId],
      );
      const profile = String(
        (
          await sql(
            `INSERT INTO access_profiles (tenant_id,name,description,base_role_constraint,is_system,is_active) VALUES($1,$2,'Fixture V4-R',$3,false,true) RETURNING id`,
            [tenantId, `RV-${run}-${key}`, role],
          )
        )[0].id,
      );
      for (const permission of [
        'operations.execution_orders.read',
        role === 'NOC'
          ? 'operations.execution_orders.supervise'
          : 'operations.execution_orders.execute',
        'inventory.stock.read',
      ])
        await sql(
          'INSERT INTO access_profile_permissions (tenant_id,profile_id,permission_key) VALUES($1,$2,$3)',
          [tenantId, profile, permission],
        );
      await sql(
        'INSERT INTO user_access_profiles (tenant_id,user_id,profile_id,valid_from,is_active) VALUES($1,$2,$3,CURRENT_DATE,true)',
        [tenantId, id, profile],
      );
      if (key === 'supervisor') {
        supervisorId = id;
        supervisorEmail = email;
        await sql(
          "INSERT INTO organization_site_assignments (tenant_id,site_id,user_id,assignment_type) VALUES($1,$2,$3,'SUPERVISOR')",
          [tenantId, siteId, id],
        );
      }
      if (key === 'technician') {
        technicianId = id;
        await sql(
          "INSERT INTO organization_site_assignments (tenant_id,site_id,user_id,assignment_type) VALUES($1,$2,$3,'HOME_SITE')",
          [tenantId, siteId, id],
        );
      }
      if (key === 'outside') {
        const other = String(
          (
            await sql(
              "INSERT INTO organization_sites (tenant_id,name,code,site_type) VALUES($1,'Otra sede QA',$2,'MIXED') RETURNING id",
              [tenantId, `RV-O-${run}`],
            )
          )[0].id,
        );
        await sql(
          "INSERT INTO organization_site_assignments (tenant_id,site_id,user_id,assignment_type) VALUES($1,$2,$3,'SUPERVISOR')",
          [tenantId, other, id],
        );
      }
      const token = await login(email);
      if (key === 'supervisor') supervisorToken = token;
      else if (key === 'outside') outsideToken = token;
      else technicianToken = token;
    }
  });
  test.afterAll(async () => {
    await api?.dispose();
    await db?.end();
  });

  test('RA-01 serial, comodato ligado y movimiento enlazado', async () => {
    const f = await fixture({ serial: true });
    expect((await reverse(f)).status()).toBe(202);
    const r = await decided(f);
    expect(
      (
        await sql('SELECT current_status,current_location_id FROM serialized_assets WHERE id=$1', [
          f.asset,
        ])
      )[0],
    ).toMatchObject({ current_status: 'ASSIGNED_TO_TECHNICIAN', current_location_id: f.source });
    expect(
      (await sql('SELECT removed_at FROM asset_loan_assignments WHERE id=$1', [f.loan]))[0]
        .removed_at,
    ).not.toBeNull();
    expect(
      (
        await sql('SELECT reversed_by_movement_id FROM stock_movements WHERE id=$1', [f.original])
      )[0].reversed_by_movement_id,
    ).toBe(r.stock_movement_id);
  });
  test('RA-02 saldo por cantidad vuelve a custodia', async () => {
    const f = await fixture();
    const balances = () =>
      sql(
        'SELECT location_id,quantity_on_hand FROM stock_balances WHERE item_id=$1 ORDER BY location_id',
        [f.item],
      );
    const before = await balances();
    expect(Number(before.find((r) => r.location_id === f.source)?.quantity_on_hand)).toBe(0);
    expect(Number(before.find((r) => r.location_id === f.destination)?.quantity_on_hand)).toBe(1);
    expect((await reverse(f)).status()).toBe(202);
    await decided(f);
    const after = await balances();
    expect(Number(after.find((r) => r.location_id === f.source)?.quantity_on_hand)).toBe(1);
    expect(Number(after.find((r) => r.location_id === f.destination)?.quantity_on_hand)).toBe(0);
  });
  test('RA-03 original y recibo inmutables', async () => {
    const f = await fixture();
    const read = () =>
      sql(
        `SELECT to_jsonb(u) AS usage,(SELECT to_jsonb(m)-'reversed_by_movement_id'-'updated_at' FROM stock_movements m WHERE id=$2) AS original,(SELECT jsonb_agg(l ORDER BY id) FROM stock_movement_lines l WHERE movement_id=$2) AS lines,(SELECT to_jsonb(r) FROM inventory_execution_request_receipts r WHERE request_id=$3 AND kind='CONSUMPTION') AS receipt FROM execution_order_item_usage u WHERE id=$1`,
        [f.usage, f.original, f.inventoryRequest],
      );
    const before = await read();
    expect((await reverse(f)).status()).toBe(202);
    await decided(f);
    expect.soft(await read()).toEqual(before);
    expect(
      (
        await sql('SELECT reversed_by_movement_id FROM stock_movements WHERE id=$1', [f.original])
      )[0].reversed_by_movement_id,
    ).toBe(
      (
        await sql(
          'SELECT stock_movement_id FROM execution_order_item_usage_reversals WHERE item_usage_id=$1',
          [f.usage],
        )
      )[0].stock_movement_id,
    );
  });
  test('RA-04 terminal preserva resultado/cierre y muestra marca real', async ({ page }) => {
    const f = await fixture({ serial: true, terminal: true });
    await sql(
      "INSERT INTO execution_order_evidence (execution_order_id,tenant_id,evidence_type,file_name,notes,actor_user_id) VALUES ($1,$2,'PHOTO','qa-reverso.jpg','Evidencia sintética de cierre',$3)",
      [f.order, tenantId, supervisorId],
    );
    const evidenceBefore = await sql(
      'SELECT * FROM execution_order_evidence WHERE execution_order_id=$1 ORDER BY id',
      [f.order],
    );
    const read = () =>
      sql(
        'SELECT status,result,closed_at,close_notes,template_requirements_snapshot FROM execution_orders WHERE id=$1',
        [f.order],
      );
    const before = await read();
    expect((await reverse(f)).status()).toBe(202);
    await decided(f);
    expect(await read()).toEqual(before);
    expect(
      await sql('SELECT * FROM execution_order_evidence WHERE execution_order_id=$1 ORDER BY id', [
        f.order,
      ]),
    ).toEqual(evidenceBefore);
    await portal(page, f);
    await expect(page.getByText('Corrección posterior al cierre.', { exact: true })).toBeVisible();
  });
  test('RA-05 técnico y supervisor fuera de sede denegados', async () => {
    const f = await fixture();
    expect((await reverse(f, { token: technicianToken })).status()).toBe(403);
    expect.soft((await reverse(f, { token: outsideToken })).status()).toBe(404);
    expect((await get(f.order, '', technicianToken)).allowedActions).not.toContain(
      'REVERSE_ITEM_USAGE',
    );
  });
  test('RA-06 motivo obligatorio y PII conocida responde 400', async () => {
    const f = await fixture();
    expect.soft((await reverse(f, { reason: '' })).status()).toBe(400);
    expect.soft((await reverse(f, { reason: 'Llamar al 3001234567' })).status()).toBe(400);
  });
  test('RA-07 carrera HTTP, 409 y replay idempotente', async () => {
    const f = await fixture();
    const keys = [randomUUID(), randomUUID()];
    const results = await Promise.all(keys.map((key) => reverse(f, { key })));
    expect(results.map((r) => r.status()).sort()).toEqual([202, 409]);
    await decided(f);
    const winningKey = keys[results.findIndex((r) => r.status() === 202)];
    expect(winningKey).toBeTruthy();
    expect((await reverse(f, { key: winningKey })).status()).toBe(202);
    expect((await reverse(f)).status()).toBe(409);
    expect(
      (
        await sql(
          "SELECT count(*) FROM inventory_execution_request_receipts WHERE execution_order_id=$1 AND kind='REVERSAL'",
          [f.order],
        )
      )[0].count,
    ).toBe('1');
  });
  for (const reason of [
    'REVERSAL_ORIGINAL_NOT_FOUND',
    'REVERSAL_CUSTODY_INACTIVE',
    'REVERSAL_ASSET_MOVED',
    'REVERSAL_LOAN_MISMATCH',
  ])
    test(`RA-08 ${reason}: HTTP → outbox/cola → recibo → REJECTED`, async () => {
      const f = await fixture({
        serial: reason.includes('ASSET') || reason.includes('LOAN'),
        rejection: reason,
      });
      expect((await reverse(f)).status()).toBe(202);
      const r = await decided(f, 'REJECTED', reason);
      expect(r.request_attempts).toBe(1);
    });
  test('RA-09 MATERIAL vuelve pendiente en progreso y cierre', async () => {
    for (const terminal of [false, true]) {
      const f = await fixture({ terminal });
      const before = await get(f.order);
      const material = (detail: Row) =>
        ((detail.completion as Row).requirements as Row[]).find((r) => r.kind === 'MATERIAL');
      expect(material(before)?.satisfied).toBe(true);
      expect((await reverse(f)).status()).toBe(202);
      await decided(f);
      const after = await get(f.order);
      expect(material(after)?.satisfied).toBe(false);
      if (!terminal) {
        const res = await api.post(`${API}/tasks/execution-orders/${f.order}/close`, {
          headers: {
            ...headers(technicianToken),
            'If-Match': String(after.version),
            'Idempotency-Key': randomUUID(),
          },
          data: { result: 'EXECUTED', summary: 'Cierre sintético' },
        });
        expect(res.status()).toBe(422);
        const error = await res.json();
        expect(JSON.stringify(error)).toContain('CLOSURE_GATE_INCOMPLETE');
        expect(JSON.stringify(error)).toContain('Equipo sintético');
      } else
        expect(
          (await sql('SELECT result FROM execution_orders WHERE id=$1', [f.order]))[0].result,
        ).toBe('EXECUTED');
    }
  });
  test('RA-10 consumos PENDING y REJECTED no ofrecen reverso', async () => {
    for (const usageStatus of ['PENDING', 'REJECTED']) {
      const f = await fixture({ usageStatus });
      expect((await get(f.order)).allowedActions).not.toContain('REVERSE_ITEM_USAGE');
      expect((await reverse(f)).status()).toBe(409);
    }
  });
  test('RA-12 nuevo reverso tras resolver custodia rechazada', async () => {
    const f = await fixture({ rejection: 'REVERSAL_CUSTODY_INACTIVE' });
    expect((await reverse(f)).status()).toBe(202);
    await decided(f, 'REJECTED', 'REVERSAL_CUSTODY_INACTIVE');
    await sql("UPDATE stock_locations SET status='ACTIVE' WHERE id=$1", [f.source]);
    expect((await reverse(f)).status()).toBe(202);
    await decided(f);
    expect(
      (
        await sql(
          'SELECT count(*) FROM execution_order_item_usage_reversals WHERE item_usage_id=$1',
          [f.usage],
        )
      )[0].count,
    ).toBe('2');
  });
  test('RA-08 consola: copy del rechazo con datos reales', async ({ page }) => {
    const f = await fixture({ serial: true, rejection: 'REVERSAL_LOAN_MISMATCH' });
    expect((await reverse(f)).status()).toBe(202);
    await decided(f, 'REJECTED', 'REVERSAL_LOAN_MISMATCH');
    await portal(page, f);
    await expect(
      page.getByText(
        'Qué pasó: El préstamo del equipo al cliente no está abierto como se esperaba.',
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Qué hacer: Revisa el estado del préstamo en el inventario antes de corregir la orden.',
        {
          exact: true,
        },
      ),
    ).toBeVisible();
  });
  test('RA-11 y RA-13 fallo real: DLQ API, retención y diagnóstico sin motivo', async () => {
    test.setTimeout(300_000);
    expect(process.env.V4_RV5_GO, 'R-V5 previo a inspección').toBe('true');
    const workerPid = Number(process.env.V4_WORKER_PID);
    expect(Number.isInteger(workerPid) && workerPid > 0, 'PID worker propio').toBe(true);
    const apiLogPath = process.env.V4_API_LOG_PATH;
    expect(apiLogPath, 'Log API local requerido para RA-13').toBeTruthy();
    // V4-R3 precondición single-worker (Adenda 3 §V4-R3.3): si hay más de un
    // proceso worker con conexiones a Redis, falla de inmediato con
    // EXPECTED_SINGLE_WORKER en vez de esperar los 220 s del poll DLQ.
    {
      let workerRedisPids: number[] = [];
      let detectionFailed = false;
      try {
        const out = execSync(
          `powershell -NoProfile -Command "$api = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess); ` +
            `$conns = Get-NetTCPConnection -RemotePort 6380 -State Established -ErrorAction SilentlyContinue | Group-Object OwningProcess; ` +
            `foreach ($g in $conns) { if ($api -contains [int]$g.Name) { continue }; ` +
            `$cmd = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $g.Name) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CommandLine); ` +
            `if ($cmd -match 'dist/main') { $g.Name } }"`,
          { encoding: 'utf8', timeout: 20_000 },
        );
        workerRedisPids = String(out)
          .split(/\s+/)
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0);
      } catch {
        detectionFailed = true;
      }
      expect(
        detectionFailed,
        'EXPECTED_SINGLE_WORKER: no se pudo inventariar workers con Redis',
      ).toBe(false);
      expect(
        workerRedisPids.length,
        `EXPECTED_SINGLE_WORKER: hay ${workerRedisPids.length} procesos worker con conexiones a Redis [${workerRedisPids.join(',')}] (V4_WORKER_PID=${workerPid}); se exige exactamente 1 — detén los huérfanos (o arranca el QA) antes de RA-11`,
      ).toBe(1);
    }
    const workerLogPath = join(tmpdir(), 'iwana-v4r-worker.log');
    const apiLogOffset = readFileSync(String(apiLogPath)).length;
    const workerLogOffset = readFileSync(workerLogPath).length;
    const logSince = (path: string, offset: number) =>
      readFileSync(path).subarray(offset).toString('utf8').replace(/\0/g, '');
    const f = await fixture();
    // La referencia heredada provoca QueryFailedError en MOD12, tras firma/cotejo.
    await sql(
      "UPDATE execution_order_item_usage SET stock_movement_id='legacy-invalid-reference' WHERE id=$1",
      [f.usage],
    );
    const reason = 'Motivo operativo sintético único RV ' + randomUUID();
    expect((await reverse(f, { reason })).status()).toBe(202);
    const outbox = (
      await sql(
        "SELECT event_id,payload FROM execution_order_outbox_events WHERE aggregate_id=$1 AND event_type='InventoryConsumptionReversalRequestedV1'",
        [f.order],
      )
    )[0];
    const reversal = (
      await sql(
        'SELECT reversal_request_id FROM execution_order_item_usage_reversals WHERE item_usage_id=$1',
        [f.usage],
      )
    )[0];
    expect(JSON.stringify(outbox.payload)).not.toContain(reason);
    expect(JSON.stringify(outbox.payload)).not.toContain('reason');
    const readonly = redisReader();
    const projection = redisReader(false);
    const sourceKey = 'bull:inventory-execution-requests:' + outbox.event_id;
    const dlqKey = 'bull:operations-execution-dlq:dlq-' + outbox.event_id;
    let stopped = false;
    try {
      await expect
        .poll(() => readonly.call('EXISTS', sourceKey), {
          timeout: 30_000,
          intervals: [25, 50, 100],
        })
        .toBe(1);
      // Solo proyección booleana en servidor; no se trae job.data al cliente.
      expect(
        await projection.call(
          'EVAL_RO',
          "local d=cjson.decode(redis.call('HGET',KEYS[1],'data')); local o=cjson.decode(redis.call('HGET',KEYS[1],'opts')); return {d.signature and 1 or 0,string.find(redis.call('HGET',KEYS[1],'data'),ARGV[1],1,true) and 1 or 0,o.removeOnFail.age}",
          1,
          sourceKey,
          reason,
        ),
      ).toEqual([1, 0, 86400]);
      process.kill(workerPid);
      stopped = true;
      await expect
        .poll(() => readonly.call('EXISTS', dlqKey), {
          timeout: 220_000,
          intervals: [500, 1000, 2000],
        })
        .toBe(1);
      expect(
        await projection.call(
          'EVAL_RO',
          "local raw=redis.call('HGET',KEYS[1],'data'); local d=cjson.decode(raw); local o=cjson.decode(redis.call('HGET',KEYS[1],'opts')); return {d.reversalRequestId==ARGV[2] and 1 or 0,string.find(raw,ARGV[1],1,true) and 1 or 0,d.envelope and 1 or 0,d.reason and 1 or 0,o.removeOnFail.age,o.removeOnComplete and 1 or 0}",
          1,
          dlqKey,
          reason,
          String(reversal.reversal_request_id),
        ),
      ).toEqual([1, 0, 0, 0, 2592000, 1]);
      // El consumidor completa el origen después de mover el diagnóstico a DLQ.
      expect(await readonly.call('EXISTS', sourceKey)).toBe(0);
      expect(
        (
          await sql(
            "SELECT count(*) FROM inventory_execution_request_receipts WHERE kind='REVERSAL' AND request_id=$1",
            [reversal.reversal_request_id],
          )
        )[0].count,
      ).toBe('0');
    } finally {
      await readonly.quit();
      await projection.quit();
      if (stopped) restartQaWorker();
    }
    await expect
      .poll(() => logSince(workerLogPath, workerLogOffset).includes(String(outbox.event_id)), {
        timeout: 30_000,
      })
      .toBe(true);
    const apiLog = logSince(String(apiLogPath), apiLogOffset);
    const workerLog = logSince(workerLogPath, workerLogOffset);
    // Booleanos evitan imprimir logs, payloads o credenciales si falla el assertion.
    expect(
      /TYPEORM_QUERY_ERROR operation=(?:SELECT|INSERT|UPDATE|DELETE) sqlstate=22P02\b/.test(apiLog),
      'Log API saneado conserva operación y SQLSTATE del fallo real',
    ).toBe(true);
    expect(
      apiLog.includes('legacy-invalid-reference'),
      'Parámetro sintético ausente del log API',
    ).toBe(false);
    expect(/PARAMETERS\s*:/i.test(apiLog), 'Parámetros TypeORM ausentes del log API').toBe(false);
    expect(
      /invalid input syntax for type uuid/i.test(apiLog),
      'Mensaje crudo PostgreSQL ausente del log API',
    ).toBe(false);
    expect(
      /query(?: failed)?:\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(apiLog),
      'Texto de consulta TypeORM ausente del log API',
    ).toBe(false);
    expect(apiLog.includes(reason), 'Motivo ausente del log API de esta corrida').toBe(false);
    expect(workerLog.includes(reason), 'Motivo ausente del log worker de esta corrida').toBe(false);
  });
  test('RA-14 pérdida de respuesta: permiso readonly y decisión humana', async () => {
    const recoveryRequestId = process.env.V4_RA14_REQUEST_ID;
    if (recoveryRequestId) {
      test.setTimeout(20 * 60_000);
      expect(recoveryRequestId).toMatch(/^[0-9a-f-]{36}$/);
      const previous = (
        await sql(
          'SELECT r.*,u.stock_movement_id AS original_id FROM execution_order_item_usage_reversals r JOIN execution_order_item_usage u ON u.id=r.item_usage_id WHERE r.reversal_request_id=$1 AND r.tenant_id=$2',
          [recoveryRequestId, tenantId],
        )
      )[0];
      expect(previous, 'Escenario de pérdida aprobado del tenant de QA').toBeTruthy();
      const reader = redisReader();
      try {
        expect(
          await reader.call(
            'EXISTS',
            `bull:operations-execution-events:inventory-response-${responseEventId(recoveryRequestId)}`,
          ),
        ).toBe(0);
      } finally {
        await reader.quit();
      }
      const currentWorkerPid = Number(readFileSync(join(tmpdir(), 'iwana-v4r-worker.pid'), 'utf8'));
      expect(() => process.kill(currentWorkerPid, 0), 'Worker propio vivo para D7').not.toThrow();
      await expect
        .poll(
          async () =>
            (
              await sql(
                'SELECT status FROM execution_order_item_usage_reversals WHERE reversal_request_id=$1',
                [recoveryRequestId],
              )
            )[0].status,
          { timeout: 19 * 60_000, intervals: [1000, 5000, 10000] },
        )
        .toBe('CONFIRMED');
      const recovered = (
        await sql(
          'SELECT * FROM execution_order_item_usage_reversals WHERE reversal_request_id=$1',
          [recoveryRequestId],
        )
      )[0];
      expect(Number(recovered.request_attempts)).toBeGreaterThanOrEqual(2);
      expect(
        (
          await sql(
            "SELECT count(*) FROM inventory_execution_request_receipts WHERE kind='REVERSAL' AND request_id=$1",
            [recoveryRequestId],
          )
        )[0].count,
      ).toBe('1');
      expect(
        (
          await sql(
            "SELECT count(*) FROM stock_movements WHERE origin='EXECUTION_ORDER_REVERSAL' AND origin_ref_id=$1",
            [previous.original_id],
          )
        )[0].count,
      ).toBe('1');
      expect(
        (
          await sql('SELECT reversed_by_movement_id FROM stock_movements WHERE id=$1', [
            previous.original_id,
          ])
        )[0].reversed_by_movement_id,
      ).toBe(recovered.stock_movement_id);
      const emitted = await sql(
        "SELECT event_id FROM execution_order_outbox_events WHERE aggregate_id=$1 AND event_type='InventoryConsumptionReversalRequestedV1' AND payload->>'reversalRequestId'=$2",
        [previous.execution_order_id, recoveryRequestId],
      );
      expect(new Set(emitted.map((row) => row.event_id)).size).toBeGreaterThanOrEqual(2);
      const order = (
        await sql('SELECT organization_site_id FROM execution_orders WHERE id=$1', [
          previous.execution_order_id,
        ])
      )[0];
      await sql(
        "INSERT INTO organization_site_assignments (tenant_id,user_id,site_id,assignment_type) VALUES ($1,$2,$3,'SUPERVISOR') ON CONFLICT DO NOTHING",
        [tenantId, supervisorId, order.organization_site_id],
      );
      const projection = await get(String(previous.execution_order_id), '/item-usage');
      expect(
        (projection as unknown as Row[]).find((row) => row.id === previous.item_usage_id)?.reversal,
      ).toMatchObject({ status: 'CONFIRMED' });
      return;
    }
    const workerPid = Number(process.env.V4_WORKER_PID);
    expect(
      Number.isInteger(workerPid) && workerPid > 0,
      'PID del worker de QA iniciado por esta sesión',
    ).toBe(true);
    const f = await fixture();
    expect((await reverse(f)).status()).toBe(202);
    const Client = fromDb('pg').Client;
    const blocker: Database = new Client({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5433),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    await blocker.connect();
    await blocker.query('BEGIN');
    await blocker.query(`SET LOCAL search_path TO "${schema}",public`);
    const decidedRow = (
      await blocker.query(
        'SELECT * FROM execution_order_item_usage_reversals WHERE item_usage_id=$1 FOR UPDATE',
        [f.usage],
      )
    ).rows[0];
    expect(decidedRow.status).toBe('PENDING');
    try {
      await expect
        .poll(
          async () =>
            (
              await sql(
                "SELECT outcome FROM inventory_execution_request_receipts WHERE kind='REVERSAL' AND request_id=$1",
                [decidedRow.reversal_request_id],
              )
            )[0]?.outcome,
          { timeout: 60_000, intervals: [25, 50, 100] },
        )
        .toBe('CONFIRMED');
      process.kill(workerPid);
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
    }
    const key = `bull:operations-execution-events:inventory-response-${responseEventId(String(decidedRow.reversal_request_id))}`;
    writeFileSync(
      join(tmpdir(), 'iwana-v4r-ra14-prepared.json'),
      JSON.stringify(
        {
          tenant: SLUG,
          tenantId,
          order: f.order,
          request: decidedRow.reversal_request_id,
          job: `inventory-response-${responseEventId(String(decidedRow.reversal_request_id))}`,
          queue: 'operations-execution-events',
          deletionAuthorized: false,
        },
        null,
        2,
      ),
    );
    const readonly = redisReader();
    try {
      expect(await readonly.call('EXISTS', key), 'Respuesta exacta conservada').toBe(1);
      expect(
        (
          await sql('SELECT status FROM execution_order_item_usage_reversals WHERE id=$1', [
            decidedRow.id,
          ])
        )[0].status,
      ).toBe('PENDING');
      await expect
        .poll(() => readonly.call('EXISTS', `${key}:lock`), {
          timeout: 65_000,
          intervals: [500, 1000],
        })
        .toBe(0);
      const credential = readFileSync(`${process.cwd()}/.claude/mcp-redis.local.env`, 'utf8').match(
        /^REDIS_PWD=(\S+)$/m,
      )?.[1];
      const Queue = fromApi('bullmq').Queue;
      const queue = new Queue('operations-execution-events', {
        connection: {
          host: '127.0.0.1',
          port: Number(process.env.REDIS_PORT ?? 6380),
          db: Number(process.env.REDIS_DB ?? 0),
          username: 'iwana_readonly',
          password: credential,
          maxRetriesPerRequest: 1,
        },
      });
      try {
        await queue.remove(
          `inventory-response-${responseEventId(String(decidedRow.reversal_request_id))}`,
        );
      } finally {
        await queue.close();
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('NOPERM'))
        throw new Error(
          `RA-14 requiere decisión del usuario: iwana_readonly devuelve NOPERM para Queue.remove ${key}; tenant=${tenantId}, order=${f.order}, reversalRequest=${decidedRow.reversal_request_id}. Worker detenido, MOD12 CONFIRMED, MOD11 PENDING, respuesta existe sin lock. No se borró respuesta ni se usó admin. Autorizar la eliminación atómica de solo esa respuesta y reiniciar el worker para observar D7.`,
        );
      throw error;
    } finally {
      await readonly.quit();
    }
    throw new Error(
      'RA-14 no puede cerrar sin detener el worker tras recibo MOD12, retirar solo esa respuesta y observar D7 con un único movimiento.',
    );
  });
});
