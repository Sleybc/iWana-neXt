#!/usr/bin/env node

/** Verifica CA-09 con API local real, PostgreSQL y un trazo sintético en canvas. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { FIXTURE_USERS } from './seed-mod11-r5-fixtures.mjs';

const ROOT = process.cwd();
const API = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const TENANT_SLUG = 'srqa-mod11-r5-20261006';
const TENANT_SCHEMA = 'tenant_srqa_mod11_r5_20261006';
const OUTPUT_DIR = path.join(ROOT, '.r5-work');
const SUMMARY = 'SRQA R5 CA09 backend real fixture';
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIAAwAAABAP/8QAFBEBAAAAAAAAAAAAAAAAAAAQAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAQAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQABPxCX/9oADAMBAAIAAwAAABAP/8QAFBEBAAAAAAAAAAAAAAAAAAAQAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAQAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQABPxCX/9k=',
  'base64',
);

function loadWorkspaceEnv() {
  for (const filename of ['.env.development.local', '.env.development', '.env']) {
    const envPath = path.join(ROOT, filename);
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(route, options = {}) {
  const response = await fetch(`${API}${route}`, options);
  let body = {};
  try {
    body = await response.json();
  } catch {
    // Preserve only status when an endpoint has no JSON body.
  }
  return { response, body };
}

function bearer(token, extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

async function tenantLogin(fixture) {
  const result = await api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Tenant-Slug': TENANT_SLUG },
    body: JSON.stringify({ email: fixture.email, password: fixture.password }),
  });
  assert(
    result.response.ok && result.body?.data?.accessToken,
    `Test login failed (${result.response.status}).`,
  );
  assert(
    !result.body.data.mfaRequired && !result.body.data.mfaSetupRequired,
    'Unexpected MFA challenge.',
  );
  return result.body.data.accessToken;
}

async function orderDetail(orderId, token) {
  const result = await api(`/tasks/execution-orders/${orderId}`, {
    headers: bearer(token),
  });
  assert(result.response.ok, `Order detail failed (${result.response.status}).`);
  return result.body?.data ?? result.body;
}

async function createOrder(nocToken, technicianId, db, tenantId) {
  const existing = await db.query(
    `SELECT id, execution_order_number, status, version
     FROM "${TENANT_SCHEMA}".execution_orders
     WHERE tenant_id=$1 AND work_summary=$2 AND is_annulled=FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, SUMMARY],
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    return {
      id: row.id,
      number: row.execution_order_number,
      status: row.status,
      version: Number(row.version),
    };
  }

  const start = new Date(Date.now() + 18 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  const event = await api('/wfm/events', {
    method: 'POST',
    headers: bearer(nocToken, { 'content-type': 'application/json' }),
    body: JSON.stringify({
      type: 'INSTALLATION',
      title: SUMMARY,
      description: 'OT sintética propia para verificar cierre CA-09 R5.',
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      assignedUserId: technicianId,
      address: 'Dirección sintética de prueba',
      municipality: 'Municipio QA',
      sector: 'Sector QA',
      workOrder: {
        type: 'INSTALLATION',
        priority: 'NORMAL',
        sourceContext: 'MANUAL',
        summary: SUMMARY,
      },
    }),
  });
  assert(
    [200, 201].includes(event.response.status),
    `WFM event creation failed (${event.response.status}; ${event.body?.code ?? event.body?.message ?? 'no detail'}).`,
  );
  const eventBody = event.body?.data ?? event.body;
  let id = eventBody.executionOrderId;
  if (!id && eventBody.id) {
    const detail = await api(`/wfm/events/${eventBody.id}`, { headers: bearer(nocToken) });
    assert(detail.response.ok, `WFM event detail failed (${detail.response.status}).`);
    id = (detail.body?.data ?? detail.body).executionOrderId;
  }
  assert(id, 'WFM did not return the linked execution order id.');
  const order = await orderDetail(id, await tenantLogin(FIXTURE_USERS.technician));
  return { id, number: order.number, status: order.status, version: Number(order.version) };
}

async function refreshOrder(orderId, techToken) {
  return orderDetail(orderId, techToken);
}

async function command(orderId, token, pathSuffix, body, version, key) {
  const result = await api(`/tasks/execution-orders/${orderId}/${pathSuffix}`, {
    method: 'POST',
    headers: bearer(token, {
      'content-type': 'application/json',
      'If-Match': String(version),
      'Idempotency-Key': key,
    }),
    body: JSON.stringify(body),
  });
  return result;
}

async function uploadPhoto(orderId, token, version, requirementKey, suffix, readToken) {
  const form = new FormData();
  form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), `r5-${suffix}.jpg`);
  const uploaded = await fetch(`${API}/tasks/execution-orders/${orderId}/evidence-assets`, {
    method: 'POST',
    headers: bearer(token, {
      'If-Match': String(version),
      'Idempotency-Key': `srqa-r5-${suffix}-${orderId}-${Date.now()}`,
    }),
    body: form,
  });
  let receipt = {};
  try {
    receipt = await uploaded.json();
  } catch {
    /* status below is authoritative */
  }
  assert(
    uploaded.status === 202 && receipt.mediaAssetId,
    `Photo upload failed (${uploaded.status}; ${receipt.code ?? receipt.message ?? receipt.error ?? receipt.response?.code ?? receipt.response?.message ?? 'no detail'}).`,
  );

  let status = receipt.status;
  for (let attempt = 0; attempt < 60 && status !== 'AVAILABLE'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const current = await api(
      `/tasks/execution-orders/${orderId}/evidence-assets/${receipt.mediaAssetId}`,
      {
        headers: bearer(readToken),
      },
    );
    assert(current.response.ok, `Evidence status lookup failed (${current.response.status}).`);
    status = (current.body?.data ?? current.body).status;
    assert(status !== 'REJECTED', 'Media analysis rejected a synthetic photo fixture.');
  }
  assert(status === 'AVAILABLE', `Photo asset did not become AVAILABLE (${status}).`);
  return { mediaAssetId: receipt.mediaAssetId, requirementKey };
}

async function drawSyntheticSignature() {
  const { chromium } = createRequire(path.join(ROOT, 'package.json'))('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 480 } });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#eef2f7">
      <canvas id="signature" aria-label="Área de firma" width="1000" height="400"
        style="display:block;width:800px;height:320px;margin:40px;background:white;border:1px solid #888;touch-action:none"></canvas>
      <script>
        const canvas=document.querySelector('#signature'); const ctx=canvas.getContext('2d');
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle='#14243a'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.lineJoin='round';
        let drawing=false;
        canvas.addEventListener('pointerdown',e=>{drawing=true;const r=canvas.getBoundingClientRect();ctx.beginPath();ctx.moveTo((e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height)});
        canvas.addEventListener('pointermove',e=>{if(!drawing)return;const r=canvas.getBoundingClientRect();ctx.lineTo((e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height);ctx.stroke()});
        for(const name of ['pointerup','pointercancel','pointerleave']) canvas.addEventListener(name,()=>drawing=false);
      </script></body></html>`);
    const canvas = page.locator('canvas#signature');
    const box = await canvas.boundingBox();
    assert(box, 'Signature canvas is not visible in the browser.');
    const strokes = [
      [
        [0.14, 0.62],
        [0.18, 0.46],
        [0.2, 0.67],
        [0.23, 0.41],
        [0.26, 0.64],
        [0.31, 0.58],
      ],
      [
        [0.35, 0.65],
        [0.39, 0.36],
        [0.43, 0.62],
        [0.48, 0.52],
        [0.53, 0.62],
        [0.58, 0.43],
      ],
      [
        [0.61, 0.6],
        [0.66, 0.48],
        [0.7, 0.63],
        [0.75, 0.45],
        [0.8, 0.61],
        [0.84, 0.5],
      ],
    ];
    for (const stroke of strokes) {
      await page.mouse.move(box.x + box.width * stroke[0][0], box.y + box.height * stroke[0][1]);
      await page.mouse.down();
      for (const [x, y] of stroke.slice(1)) {
        await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 4 });
      }
      await page.mouse.up();
    }
    const dataUrl = await canvas.evaluate((element) => element.toDataURL('image/png'));
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  } finally {
    await browser.close();
  }
}

async function uploadSignature(orderId, token, version, readToken) {
  const png = await drawSyntheticSignature();
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'r5-customer-signature.png');
  const response = await fetch(`${API}/tasks/execution-orders/${orderId}/evidence-assets`, {
    method: 'POST',
    headers: bearer(token, {
      'If-Match': String(version),
      'Idempotency-Key': `srqa-r5-canvas-signature-${orderId}-${Date.now()}`,
    }),
    body: form,
  });
  let receipt = {};
  try {
    receipt = await response.json();
  } catch {
    /* status below is authoritative */
  }
  assert(
    response.status === 202 && receipt.mediaAssetId,
    `Canvas signature upload failed (${response.status}; ${receipt.code ?? receipt.message ?? receipt.error ?? receipt.response?.code ?? receipt.response?.message ?? 'no detail'}).`,
  );
  let status = receipt.status;
  for (let attempt = 0; attempt < 60 && status !== 'AVAILABLE'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const current = await api(
      `/tasks/execution-orders/${orderId}/evidence-assets/${receipt.mediaAssetId}`,
      {
        headers: bearer(readToken),
      },
    );
    assert(current.response.ok, `Signature status lookup failed (${current.response.status}).`);
    status = (current.body?.data ?? current.body).status;
    assert(status !== 'REJECTED', 'Media analysis rejected the canvas signature.');
  }
  assert(status === 'AVAILABLE', `Canvas signature did not become AVAILABLE (${status}).`);
  return receipt.mediaAssetId;
}

async function registerEvidence(
  orderId,
  token,
  orderVersion,
  mediaAssetId,
  evidenceType,
  requirementKey,
) {
  const now = new Date();
  const registered = await api(`/tasks/execution-orders/${orderId}/evidence`, {
    method: 'POST',
    headers: bearer(token, {
      'content-type': 'application/json',
      'If-Match': String(orderVersion),
      'Idempotency-Key': `srqa-r5-register-${requirementKey}-${orderId}`,
    }),
    body: JSON.stringify({
      mediaAssetId,
      evidenceType,
      requirementKey,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      capturedAt: now.toISOString(),
    }),
  });
  assert(
    registered.response.status === 201,
    `Evidence registration failed (${registered.response.status}).`,
  );
  const data = registered.body?.data ?? registered.body;
  assert(
    data.evidenceType === evidenceType && data.requirementKey === requirementKey,
    'Evidence contract mismatch.',
  );
  return data;
}

async function main() {
  loadWorkspaceEnv();
  const fixtures = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'nvda-fixtures.json'), 'utf8'));
  assert(fixtures.tenantSchema === TENANT_SCHEMA, 'Unexpected QA tenant schema.');
  const [nocToken, techToken] = await Promise.all([
    tenantLogin(FIXTURE_USERS.supervisor),
    tenantLogin(FIXTURE_USERS.technician),
  ]);
  const { Client } = createRequire(path.join(ROOT, 'packages/database/package.json'))('pg');
  const db = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  });
  await db.connect();

  try {
    const identity = await db.query(
      'SELECT id FROM public.tenants WHERE slug=$1 AND schema_name=$2',
      [TENANT_SLUG, TENANT_SCHEMA],
    );
    assert(identity.rowCount === 1, 'QA tenant identity check failed.');
    const tenantId = identity.rows[0].id;
    let order = await createOrder(nocToken, fixtures.technicianId, db, tenantId);
    assert(
      ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(order.status),
      `CA-09 order is not executable (${order.status}).`,
    );
    assert(Number(order.version) >= 1, 'CA-09 order has no version.');
    const orderId = order.id;
    const orderNumber = order.number;
    fs.mkdirSync(path.join(ROOT, '.r5-work'), { recursive: true });
    fs.writeFileSync(
      path.join(ROOT, '.r5-work', 'ca09-fixture.json'),
      JSON.stringify(
        {
          tenantSlug: TENANT_SLUG,
          tenantSchema: TENANT_SCHEMA,
          id: orderId,
          number: orderNumber,
          status: order.status,
        },
        null,
        2,
      ),
    );

    if (order.status === 'ASSIGNED') {
      const started = await command(
        orderId,
        techToken,
        'start',
        { note: 'Inicio controlado para CA-09 R5.' },
        order.version,
        `srqa-r5-start-${orderId}`,
      );
      assert(started.response.status === 200, `Start command failed (${started.response.status}).`);
      order = await refreshOrder(orderId, techToken);
    }

    const usagePage = async () => {
      const result = await api(`/tasks/execution-orders/${orderId}/item-usage?limit=25`, {
        headers: bearer(nocToken),
      });
      assert(result.response.ok, `Item usage lookup failed (${result.response.status}).`);
      return result.body?.data ?? result.body;
    };
    let usages = await usagePage();
    let usage = Array.isArray(usages)
      ? usages.find((entry) => entry.requirementKey === 'installed-equipment')
      : null;
    if (!usage) {
      const used = await command(
        orderId,
        techToken,
        'item-usage',
        {
          itemId: fixtures.cpeItemId,
          quantity: 1,
          technicianCustodyId: fixtures.technicianId,
          requirementKey: 'installed-equipment',
          action: 'INSTALL',
          finalDisposition: 'INSTALLED_AT_CUSTOMER',
        },
        order.version,
        `srqa-r5-cpe-${orderId}`,
      );
      assert(used.response.status === 202, `CPE item usage failed (${used.response.status}).`);
      order = await refreshOrder(orderId, techToken);
    }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      usages = await usagePage();
      usage = Array.isArray(usages)
        ? usages.find((entry) => entry.requirementKey === 'installed-equipment')
        : null;
      if (usage && usage.movementStatus !== 'PENDING') break;
      assert(usage?.movementStatus !== 'REJECTED', 'CPE stock movement was rejected.');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(
      usage && usage.movementStatus !== 'REJECTED',
      `CPE item usage is ${usage?.movementStatus ?? 'missing'}.`,
    );

    for (const [key, suffix] of [
      ['service-test', 'service-test'],
      ['work-photo', 'work-photo'],
    ]) {
      const currentEvidence = await api(`/tasks/execution-orders/${orderId}/evidences?limit=25`, {
        headers: bearer(nocToken),
      });
      assert(
        currentEvidence.response.ok,
        `Evidence list failed (${currentEvidence.response.status}).`,
      );
      const evidence = currentEvidence.body?.data ?? currentEvidence.body;
      if (
        Array.isArray(evidence) &&
        evidence.some((item) => item.requirementKey === key && item.assetStatus === 'AVAILABLE')
      )
        continue;
      order = await refreshOrder(orderId, techToken);
      const uploaded = await uploadPhoto(orderId, techToken, order.version, key, suffix, nocToken);
      order = await refreshOrder(orderId, techToken);
      await registerEvidence(
        orderId,
        techToken,
        order.version,
        uploaded.mediaAssetId,
        'PHOTO',
        key,
      );
      order = await refreshOrder(orderId, techToken);
    }

    const existingSignatureList = await api(
      `/tasks/execution-orders/${orderId}/evidences?limit=25`,
      { headers: bearer(nocToken) },
    );
    assert(
      existingSignatureList.response.ok,
      `Signature evidence lookup failed (${existingSignatureList.response.status}).`,
    );
    const existingEvidence = existingSignatureList.body?.data ?? existingSignatureList.body;
    let signatureEvidence = Array.isArray(existingEvidence)
      ? existingEvidence.find(
          (item) =>
            item.evidenceType === 'SIGNATURE' &&
            item.requirementKey === 'CUSTOMER_SIGNATURE' &&
            item.assetStatus === 'AVAILABLE',
        )
      : null;

    if (!signatureEvidence) {
      order = await refreshOrder(orderId, techToken);
      const signatureAssetId = await uploadSignature(orderId, techToken, order.version, nocToken);
      order = await refreshOrder(orderId, techToken);
      signatureEvidence = await registerEvidence(
        orderId,
        techToken,
        order.version,
        signatureAssetId,
        'SIGNATURE',
        'CUSTOMER_SIGNATURE',
      );
      order = await refreshOrder(orderId, techToken);
    }

    let closeResponseStatus = null;
    if (order.status !== 'COMPLETED') {
      const closeResult = await command(
        orderId,
        techToken,
        'close',
        {
          result: 'EXECUTED',
          summary: 'Instalación sintética completada para CA-09 R5.',
          closeNotes: 'Evidencia sintética registrada en una OT propia de QA.',
          customerAcceptance: { artifactId: signatureEvidence.mediaAssetId, method: 'SIGNATURE' },
        },
        order.version,
        `srqa-r5-close-${orderId}`,
      );
      assert(
        closeResult.response.status === 200,
        `close() was not accepted (${closeResult.response.status}).`,
      );
      closeResponseStatus = closeResult.response.status;
      const body = closeResult.body?.data ?? closeResult.body;
      assert(
        body.status === 'COMPLETED' && body.result === 'EXECUTED',
        'close() returned a different terminal state.',
      );
    }

    const apiFinal = await orderDetail(orderId, techToken);
    assert(
      apiFinal.status === 'COMPLETED' && apiFinal.result === 'EXECUTED',
      'API did not return a completed execution order.',
    );
    const sqlOrder = await db.query(
      `SELECT execution_order_number, status, result, template_version_number, closed_at
       FROM "${TENANT_SCHEMA}".execution_orders
       WHERE tenant_id=$1 AND id=$2`,
      [tenantId, orderId],
    );
    const sqlEvidence = await db.query(
      `SELECT evidence_type, requirement_key, asset_status, media_asset_id
       FROM "${TENANT_SCHEMA}".execution_order_evidence
       WHERE tenant_id=$1 AND execution_order_id=$2 AND requirement_key='CUSTOMER_SIGNATURE'
         AND media_asset_id=$3`,
      [tenantId, orderId, signatureEvidence.mediaAssetId],
    );
    assert(
      sqlOrder.rowCount === 1 &&
        sqlOrder.rows[0].status === 'COMPLETED' &&
        sqlOrder.rows[0].result === 'EXECUTED' &&
        Number(sqlOrder.rows[0].template_version_number) === 2 &&
        sqlOrder.rows[0].closed_at,
      'SQL did not confirm the completed v2 order.',
    );
    assert(
      sqlEvidence.rowCount === 1 &&
        sqlEvidence.rows[0].evidence_type === 'SIGNATURE' &&
        sqlEvidence.rows[0].requirement_key === 'CUSTOMER_SIGNATURE' &&
        sqlEvidence.rows[0].asset_status === 'AVAILABLE' &&
        sqlEvidence.rows[0].media_asset_id === signatureEvidence.mediaAssetId,
      'SQL did not confirm AVAILABLE SIGNATURE evidence linked to CUSTOMER_SIGNATURE.',
    );

    const result = {
      tenantSlug: TENANT_SLUG,
      tenantSchema: TENANT_SCHEMA,
      executionOrderId: orderId,
      executionOrderNumber: sqlOrder.rows[0].execution_order_number,
      templateVersion: Number(sqlOrder.rows[0].template_version_number),
      apiStatus: apiFinal.status,
      apiResult: apiFinal.result,
      sqlStatus: sqlOrder.rows[0].status,
      sqlResult: sqlOrder.rows[0].result,
      signatureEvidence: sqlEvidence.rows[0].evidence_type,
      requirementKey: sqlEvidence.rows[0].requirement_key,
      assetStatus: sqlEvidence.rows[0].asset_status,
      mediaAssetId: sqlEvidence.rows[0].media_asset_id,
      closeResponseStatus,
      closeAccepted: true,
    };
    fs.writeFileSync(
      path.join(ROOT, '.r5-work', 'ca09-result.json'),
      JSON.stringify(result, null, 2),
    );
    process.stdout.write(
      `CA-09=PASS order=${result.executionOrderNumber} v2 close=${closeResponseStatus === 200 ? 'HTTP200' : 'already-COMPLETED'} ` +
        `API+SQL=verified evidence=SIGNATURE/CUSTOMER_SIGNATURE/AVAILABLE canvas=drawn\n`,
    );
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadWorkspaceEnv();
  main().catch((error) => {
    process.stderr.write(`CA09_FAILED ${error.message}\n`);
    process.exitCode = 1;
  });
}
