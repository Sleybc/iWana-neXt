import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createSelfSignedCertificate } from '../apps/api/src/modules/migration/test/self-signed-certificate.ts';
import {
  REPO_ROOT,
  ProbeError,
  assertAllowed,
  classifyAddress,
  describeShape,
  parseArgs,
  probeRequest,
  resolveOutDir,
  runProbe,
  summaryTable,
  writeReport,
} from './import-sources-probe.mjs';

// Datos sintéticos con forma de PII: ninguno debe aparecer en el informe ni en la consola.
const PII = {
  nombre: 'Juana Pérez Gómez',
  cedula: '1032456789',
  email: 'juana.perez@correo-falso.test',
  telefono: '3001234567',
  ip: '192.168.77.10',
  mac: 'AA:BB:CC:DD:EE:01',
  sn: 'ZTEGC1234567',
  direccion: 'Calle 45 # 12-34',
  password: 'secreto-pppoe-123',
  cufe: 'cufe9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0',
};
const SECRETS = {
  WISPHUB_API_KEY: 'wh-key-sintetica.0001',
  UISP_APP_KEY: 'uisp-app-key-sintetica-0002',
  UISP_NMS_TOKEN: 'uisp-nms-token-sintetico-0003',
  SIIGO_USERNAME: 'api-usuario@siigo-falso.test',
  SIIGO_ACCESS_KEY: 'siigo-access-key-sintetica-0004',
};
const SIIGO_TOKEN = 'siigo-jwt-sintetico-0005';

const FAST = { siigoIntervalMs: 1, timeoutMs: 5_000, siigoTimeoutMs: 5_000 };

/** Servidor HTTP(S) falso en loopback que registra cada petición. */
async function startFake(handler, tls) {
  const requests = [];
  const listener = (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      requests.push({
        method: req.method,
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
        at: Date.now(),
      });
      const [status, body] = handler(req.method, url.pathname, url.searchParams, req.headers) ?? [
        404,
        { detail: 'no' },
      ];
      res.writeHead(status, { 'content-type': 'application/json', 'x-ratelimit-remaining': '99' });
      res.end(JSON.stringify(body));
    });
  };
  const server = tls
    ? createHttpsServer({ key: tls.keyPem, cert: tls.certPem }, listener)
    : createServer(listener);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `${tls ? 'https' : 'http'}://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  };
}

const client = (i) => ({
  id_servicio: i,
  nombre: PII.nombre,
  cedula: PII.cedula,
  email: PII.email,
  telefono: PII.telefono,
  ip: PII.ip,
  mac_cpe: PII.mac,
  sn_onu: PII.sn,
  direccion: PII.direccion,
  estado: 'Activo',
  fecha_corte: '05/11/2026',
  coordenadas: '4.6097,-74.0817',
  password_servicio: PII.password,
  password_cpe: PII.password,
  password_router_wifi: PII.password,
  ultimo_cambio: '2026-11-01T10:00:00',
});
const CLIENTS = Array.from({ length: 320 }, (_, i) => client(i + 1));

function wisphubHandler(method, path, q, headers) {
  if (headers.authorization !== `Api-Key ${SECRETS.WISPHUB_API_KEY}`) return [403, {}];
  const limit = Math.min(Number(q.get('limit') ?? 10), 300);
  const page = (list) => [
    200,
    {
      count: list.length,
      next: `http://x/?offset=${limit}&cedula=${PII.cedula}`,
      previous: null,
      results: list.slice(0, limit),
    },
  ];
  if (path === '/api/clientes/')
    return page(q.get('estado') === '2' ? CLIENTS.slice(0, 7) : CLIENTS);
  if (path === '/api/clientes/1/') return [200, client(1)];
  if (path === '/api/clientes/1/perfil/')
    return [
      200,
      {
        cedula: PII.cedula,
        tipo_identificacion: 'CC',
        email_facturacion: PII.email,
        saldo: '45000.00',
      },
    ];
  if (path === '/api/clientes/1/saldo/')
    return [200, { facturas_pendientes: [{ id_factura: 9, total: '45000.00' }] }];
  if (path === '/api/plan-internet/') return page([{ id: 4, nombre: 'Plan 20M' }]);
  if (path === '/api/plan-internet/queue/4/') return [403, { detail: 'sin permiso' }];
  if (path === '/api/plan-internet/pppoe/4/') return [200, { subida: '10M', bajada: '20M' }];
  if (path === '/api/facturas/') {
    const all = q.get('fecha_emision__range_0') ? 5400 : 120;
    return [
      200,
      {
        count: all,
        results: [
          {
            id_factura: 9,
            fecha_emision: '2015-02-01',
            cliente: PII.nombre,
            total: '45000.00',
            fecha_pago: null,
          },
        ],
      },
    ];
  }
  if (path === '/api/facturas/9/')
    return [
      200,
      {
        id_factura: 9,
        cliente: { nombre: PII.nombre, cedula: PII.cedula },
        forma_pago: 'Efectivo',
        fecha_pago: '2015-02-03',
      },
    ];
  if (path === '/api/facturas/sigma/')
    return [200, { count: 2, results: [{ cufe: PII.cufe, estado: 'Aceptada' }] }];
  if (path === '/api/router/')
    return [
      200,
      [{ id: 1, nombre: 'Mikrotik centro', ip: PII.ip, usuario: 'admin', password: PII.password }],
    ];
  return undefined;
}

function uispHandler(method, path, q, headers) {
  const crm = headers['x-auth-app-key'] === SECRETS.UISP_APP_KEY;
  const nms = headers['x-auth-token'] === SECRETS.UISP_NMS_TOKEN;
  if (path.startsWith('/nms/')) {
    if (!nms) return [401, {}];
    if (path === '/nms/api/v2.1/sites')
      return [
        200,
        [
          {
            id: 's1',
            identification: { name: PII.nombre },
            description: { address: PII.direccion },
          },
        ],
      ];
    if (path === '/nms/api/v2.1/devices')
      return [200, [{ identification: { mac: PII.mac, serialNumber: PII.sn }, ipAddress: PII.ip }]];
  }
  if (!crm) return [401, {}];
  const base = '/crm/api/v1.0';
  if (path === `${base}/version`) return [200, { version: '2.4.211' }];
  if (path === `${base}/scheduling/jobs`)
    return [
      200,
      [
        {
          id: 7,
          title: PII.nombre,
          address: PII.direccion,
          date: '2026-10-01T08:00:00+0000',
          status: 1,
        },
      ],
    ];
  if (path === `${base}/scheduling/jobs/7`)
    return [200, { id: 7, ticketId: 3, clientId: 22, description: PII.telefono, status: 1 }];
  if (path === `${base}/scheduling/jobs/attachments`)
    return [
      200,
      [{ id: 1, filename: `${PII.cedula}.pdf`, size: 1000, mimeType: 'application/pdf' }],
    ];
  if (path === `${base}/scheduling/jobs/tasks`) return [200, []];
  if (path === `${base}/custom-attributes`)
    return [200, [{ id: 1, name: 'Cédula', key: 'cedula', attributeType: 'client' }]];
  if (path === `${base}/clients`)
    return [
      200,
      Array.from({ length: Math.min(Number(q.get('limit')), 500) }, (_, i) => ({
        id: i,
        firstName: PII.nombre,
        companyTaxId: PII.cedula,
        contacts: [{ email: PII.email, phone: PII.telefono }],
      })),
    ];
  return undefined;
}

function siigoHandler(method, path, q, headers) {
  if (path === '/auth')
    return method === 'POST' ? [200, { access_token: SIIGO_TOKEN, expires_in: 86400 }] : [405, {}];
  if (headers.authorization !== `Bearer ${SIIGO_TOKEN}` || headers['partner-id'] !== 'iWanaNeXt')
    return [401, {}];
  if (path === '/v1/users')
    return [200, { results: [{ id: 1, username: PII.email, first_name: PII.nombre }] }];
  if (path === '/v1/document-types')
    return [
      200,
      [
        {
          id: 24446,
          code: 1,
          name: 'Factura electrónica',
          type: 'FV',
          prefix: 'FE',
          electronic_type: 'ElectronicInvoice',
        },
      ],
    ];
  if (path === '/v1/customers') {
    if (Number(q.get('page_size')) > 100)
      return [400, { Errors: [{ Code: 'invalid_page_size', Message: 'x' }] }];
    return [
      200,
      {
        pagination: { page: 1, page_size: 100, total_results: 870 },
        results: [
          {
            id: 'c-1',
            id_type: { code: '13', name: 'Cédula' },
            identification: PII.cedula,
            name: [PII.nombre],
            phones: [{ number: PII.telefono }],
            address: { address: PII.direccion },
            person_type: 'Person',
            active: q.get('active') !== 'false',
          },
        ],
      },
    ];
  }
  if (path === '/v1/invoices')
    return [
      200,
      {
        pagination: { total_results: 2 },
        results: [
          {
            id: 'inv-2018-a',
            date: '2018-03-04',
            name: 'FE-12',
            customer: { identification: PII.cedula },
          },
          { id: 'inv-2018-b', date: '2018-01-15' },
        ],
      },
    ];
  if (path === '/v1/invoices/inv-2018-a')
    return [
      200,
      {
        id: 'inv-2018-a',
        stamp: { status: 'Accepted', cufe: PII.cufe },
        customer: { identification: PII.cedula },
        total: 45000,
      },
    ];
  return undefined;
}

function adminoltCsv(dir) {
  const file = join(dir, 'onus.csv');
  writeFileSync(
    file,
    [
      '﻿ID;Nombre;SN;Estado;OLT;External ID;Chasis;Slot;Puerto;ONU ID',
      `1;"${PII.nombre}";${PII.sn};Online;OLT-1;1;0;1;3;12`,
      `2;"${PII.nombre}";ZTEGC7654321;Offline;OLT-1;;0;1;;`,
    ].join('\r\n'),
  );
  return file;
}

function assertNoLeak(text) {
  for (const [k, v] of Object.entries({ ...PII, ...SECRETS, SIIGO_TOKEN }))
    assert.ok(!text.includes(v), `fuga de ${k}`);
  assert.ok(!/password_/u.test(text), 'aparece un campo password_*');
}

test('solo lectura: método o ruta fuera de lista se rechaza antes de abrir el socket', async () => {
  const fake = await startFake(() => [200, {}]);
  try {
    const conn = (source, path = '/api/') => ({
      source,
      base: new URL(path, fake.url),
      headers: {},
      timeoutMs: 2000,
      maxBytes: 1024,
      pin: null,
      budget: { calls: 0, max: 30 },
      state: { lastAt: 0, errorStreak: 0, aborted: false },
    });
    const cases = [
      [conn('wisphub'), 'POST', '/clientes/', 'METODO_NO_PERMITIDO'],
      [conn('wisphub'), 'PUT', '/clientes/1/', 'METODO_NO_PERMITIDO'],
      [conn('wisphub'), 'DELETE', '/clientes/1/', 'METODO_NO_PERMITIDO'],
      [conn('wisphub'), 'PATCH', '/clientes/1/', 'METODO_NO_PERMITIDO'],
      [conn('wisphub'), 'GET', '/clientes/1/activar/', 'RUTA_NO_PERMITIDA'],
      [conn('wisphub'), 'GET', '/staff/', 'RUTA_NO_PERMITIDA'],
      [conn('wisphub'), 'GET', '/clientes/1/../../admin/', 'RUTA_NO_PERMITIDA'],
      [
        conn('uisp', '/'),
        'GET',
        '/crm/api/v1.0/scheduling/jobs/attachments/1/file',
        'RUTA_NO_PERMITIDA',
      ],
      [conn('uisp', '/'), 'DELETE', '/crm/api/v1.0/clients', 'METODO_NO_PERMITIDO'],
      [conn('siigo', '/'), 'POST', '/v1/invoices', 'RUTA_NO_PERMITIDA'],
      [conn('siigo', '/'), 'PUT', '/v1/customers', 'METODO_NO_PERMITIDO'],
      [conn('adminolt', '/'), 'GET', '/api/onus/authorized/', 'FUENTE_NO_PERMITIDA'],
    ];
    for (const [c, method, path, code] of cases) {
      await assert.rejects(
        probeRequest(c, method, path),
        (e) => e instanceof ProbeError && e.code === code,
        `${method} ${path}`,
      );
    }
    await assert.rejects(probeRequest(conn('wisphub'), 'GET', '/clientes/', { cedula: '1' }), {
      code: 'PARAMETRO_NO_PERMITIDO',
    });
    await assert.rejects(probeRequest(conn('wisphub'), 'GET', '//evil.test/clientes/'), {
      code: 'RUTA_NO_PERMITIDA',
    });
    assert.throws(
      () =>
        assertAllowed(
          'wisphub',
          'GET',
          new URL('/api/', fake.url),
          new URL('http://evil.test/api/clientes/'),
        ),
      { code: 'DESTINO_NO_PERMITIDO' },
    );
    assert.equal(fake.requests.length, 0, 'ninguna petición rechazada llegó al servidor');
    const ok = await probeRequest(conn('wisphub'), 'GET', '/clientes/', { limit: 1 });
    assert.equal(ok.status, 200);
    assert.equal(fake.requests.length, 1);
  } finally {
    await fake.close();
  }
});

test('tope de llamadas por fuente', async () => {
  const fake = await startFake(() => [200, {}]);
  try {
    const conn = {
      source: 'wisphub',
      base: new URL('/api/', fake.url),
      headers: {},
      timeoutMs: 2000,
      maxBytes: 1024,
      pin: null,
      budget: { calls: 0, max: 2 },
      state: { lastAt: 0, errorStreak: 0, aborted: false },
    };
    await probeRequest(conn, 'GET', '/router/');
    await probeRequest(conn, 'GET', '/router/');
    await assert.rejects(probeRequest(conn, 'GET', '/router/'), { code: 'TOPE_DE_LLAMADAS' });
    assert.equal(fake.requests.length, 2);
  } finally {
    await fake.close();
  }
});

test('corrida completa: V2–V9 con hallazgos y sin PII ni credenciales en el informe', async () => {
  const [wh, uisp, siigo] = await Promise.all([
    startFake(wisphubHandler),
    startFake(uispHandler),
    startFake(siigoHandler),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'sonda-test-'));
  try {
    const env = {
      ...SECRETS,
      WISPHUB_BASE_URL: `${wh.url}/api/`,
      UISP_BASE_URL: uisp.url,
      SIIGO_BASE_URL: siigo.url,
    };
    const { report, secrets } = await runProbe({
      env,
      adminoltCsv: adminoltCsv(dir),
      options: FAST,
    });
    const v = report.verificaciones;
    assert.deepEqual(Object.fromEntries(Object.entries(v).map(([k, e]) => [k, e.estado])), {
      V1: 'NO EJECUTADO',
      V2: 'OK',
      V3: 'OK',
      V4: 'OK',
      V5: 'OK',
      V6: 'OK',
      V7: 'OK',
      V8: 'OK',
      V9: 'OK',
    });
    assert.equal(v.V2.hallazgos.devueltosConLimit500, 300);
    assert.deepEqual(v.V2.hallazgos.estabilidadLimit300, {
      lectura1: 300,
      lectura2: 300,
      enComun: 300,
      mismoConjunto: true,
      mismoOrden: true,
    });
    assert.equal(v.V2.hallazgos.suspendidos, 7);
    assert.deepEqual(v.V3.hallazgos, { queue: 403, pppoe: 200, algunoDa403: true });
    assert.equal(v.V4.hallazgos.facturasConRango, 5400);
    assert.equal(v.V4.hallazgos.facturasSinRango, 120);
    assert.deepEqual(v.V5.hallazgos.categorias, ['loopback']);
    assert.equal(v.V5.hallazgos.bloqueadaPorGuardiaSsrf, true);
    assert.equal(v.V6.hallazgos.ticketIdEnJob, true);
    assert.equal(v.V6.hallazgos.devueltosConLimit1000, 500);
    assert.deepEqual(v.V6.hallazgos.atributosDeCliente, [{ nombre: 'Cédula', clave: 'cedula' }]);
    assert.deepEqual(v.V8.hallazgos.tiene, {
      chasis: true,
      slot: true,
      puerto: true,
      onuId: true,
      senal: false,
      externalId: true,
      sn: true,
    });
    assert.equal(v.V8.hallazgos.columnas.find((c) => c.nombre === 'Puerto').vaciosPct, 50);
    assert.deepEqual(v.V9.hallazgos.prefijosFV, ['FE']);
    assert.equal(v.V9.hallazgos.pageSize101.estado, 400);
    assert.equal(v.V9.hallazgos.anioMasAntiguoEncontrado, 2018);
    assert.equal(v.V9.hallazgos.facturaTieneCufe, true);

    // Formatos por patrón y enumerados de la lista blanca.
    const detail = report.llamadas.find((c) => c.etiqueta === 'cliente detalle').forma.campos;
    assert.deepEqual(detail.fecha_corte.patrones, { 'dd/dd/dddd': 1 });
    assert.deepEqual(detail.coordenadas.patrones, { 'd.dddd,-dd.dddd': 1 });
    assert.deepEqual(detail.estado.valores, { Activo: 1 });
    assert.equal(detail.nombre.valores, undefined);
    assert.ok(
      report.llamadas.find((c) => c.etiqueta === 'clientes limit=2').forma.descartados >= 6,
    );
    assert.deepEqual(
      report.llamadas.find((c) => c.etiqueta === 'invoice detalle').forma.campos['stamp.status']
        .valores,
      { Accepted: 1 },
    );
    assert.equal(report.llamadas[0].cabecerasEnviadas.Authorization, '[REDACTADO]');
    assert.equal(report.llamadas[0].cabeceras['x-ratelimit-remaining'], '99');

    // Solo GET (más POST /auth de Siigo) llegó a los servidores; ningún binario descargado.
    for (const r of [...wh.requests, ...uisp.requests]) assert.equal(r.method, 'GET');
    assert.deepEqual(
      siigo.requests.filter((r) => r.method !== 'GET').map((r) => r.path),
      ['/auth'],
    );
    assert.ok(!uisp.requests.some((r) => r.path.endsWith('/file')));

    const file = writeReport(report, dir, secrets);
    const text = readFileSync(file, 'utf8');
    assertNoLeak(text);
    assertNoLeak(summaryTable(report, file));
  } finally {
    await Promise.all([wh.close(), uisp.close(), siigo.close()]);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Siigo: ritmo mínimo entre peticiones y corte tras 5 errores seguidos', async () => {
  const paced = await startFake(siigoHandler);
  try {
    await runProbe({
      env: { ...SECRETS, SIIGO_BASE_URL: paced.url },
      only: ['siigo'],
      options: { ...FAST, siigoIntervalMs: 100 },
    });
    const gaps = paced.requests.slice(1).map((r, i) => r.at - paced.requests[i].at);
    assert.ok(
      gaps.every((g) => g >= 80),
      `separaciones ${gaps.join(',')}`,
    );
  } finally {
    await paced.close();
  }
  const failing = await startFake((method, path) =>
    path === '/auth' ? [200, { access_token: SIIGO_TOKEN }] : [500, {}],
  );
  try {
    const { report } = await runProbe({
      env: { ...SECRETS, SIIGO_BASE_URL: failing.url },
      only: ['siigo'],
      options: FAST,
    });
    assert.equal(failing.requests.length, 1 + 5);
    assert.equal(report.verificaciones.V9.estado, 'FALLA');
    assert.match(report.fuentes.siigo, /interrumpida/u);
  } finally {
    await failing.close();
  }
});

test('fuentes sin variables o fuera de --only quedan NO EJECUTADO sin llamadas', async () => {
  const fake = await startFake(wisphubHandler);
  try {
    const { report } = await runProbe({
      env: {
        WISPHUB_BASE_URL: `${fake.url}/api/`,
        WISPHUB_API_KEY: SECRETS.WISPHUB_API_KEY,
        UISP_BASE_URL: 'http://127.0.0.1:9',
      },
      only: ['uisp', 'siigo'],
    });
    assert.equal(fake.requests.length, 0);
    assert.match(report.fuentes.wisphub, /--only/u);
    assert.match(report.fuentes.uisp, /UISP_APP_KEY/u);
    assert.ok(Object.values(report.verificaciones).every((e) => e.estado === 'NO EJECUTADO'));
  } finally {
    await fake.close();
  }
});

test('UISP con certificado autofirmado: huella fijada, huella distinta y huella presentada', async () => {
  const cert = createSelfSignedCertificate();
  const fake = await startFake(uispHandler, cert);
  try {
    const env = { UISP_BASE_URL: fake.url, UISP_APP_KEY: SECRETS.UISP_APP_KEY };
    const pinned = await runProbe({
      env: { ...env, UISP_TLS_SHA256: cert.sha256.toUpperCase().match(/../gu).join(':') },
      only: ['uisp'],
      options: FAST,
    });
    assert.equal(pinned.report.verificaciones.V6.estado, 'OK');
    const sent = fake.requests.length;
    assert.ok(sent > 0);

    const wrong = await runProbe({
      env: { ...env, UISP_TLS_SHA256: 'ab'.repeat(32) },
      only: ['uisp'],
      options: FAST,
    });
    assert.equal(wrong.report.verificaciones.V5.estado, 'FALLA');
    assert.equal(wrong.report.llamadas[0].error, 'CERTIFICADO_NO_COINCIDE');

    const unpinned = await runProbe({ env, only: ['uisp'], options: FAST });
    assert.equal(unpinned.report.llamadas[0].error, 'CERTIFICADO_NO_CONFIABLE');
    assert.equal(unpinned.report.verificaciones.V5.hallazgos.huellaPresentada, cert.sha256);
    assert.equal(
      fake.requests.length,
      sent,
      'con huella distinta o sin huella no se envió ninguna petición',
    );
  } finally {
    await fake.close();
  }
});

test('anonimización: forma sin valores y descarte de contraseñas', () => {
  const shape = describeShape({
    results: [{ nombre: PII.nombre, password_cpe: PII.password, type: PII.email, [PII.email]: 1 }],
  });
  const text = JSON.stringify(shape);
  assertNoLeak(text);
  assert.equal(shape.descartados, 1);
  assert.equal(shape.campos['results[].type'].valoresOmitidos, 1);
  assert.ok(shape.campos['results[].{clave}']);
  assert.equal(classifyAddress('100.64.1.1'), 'cgnat');
  assert.equal(classifyAddress('10.1.1.1'), 'privada');
  assert.equal(classifyAddress('8.8.8.8'), 'publica');
});

test('argumentos y salida: sin eco de argumentos, rechaza rutas del repo y directorios no vacíos', () => {
  assert.throws(
    () => parseArgs([`--api-key=${SECRETS.WISPHUB_API_KEY}`]),
    (e) => e.code === 'ARGUMENTO_DESCONOCIDO' && !e.message.includes(SECRETS.WISPHUB_API_KEY),
  );
  assert.throws(() => parseArgs(['--only', 'wisphub,kafka']), { code: 'FUENTE_DESCONOCIDA' });
  assert.deepEqual(parseArgs(['--only', 'wisphub,uisp']).only, ['wisphub', 'uisp']);
  assert.throws(() => resolveOutDir(join(REPO_ROOT, 'tmp-sonda')), {
    code: 'SALIDA_DENTRO_DEL_REPO',
  });
  assert.throws(() => resolveOutDir(REPO_ROOT), { code: 'SALIDA_DENTRO_DEL_REPO' });
  const dir = resolveOutDir(null);
  try {
    assert.ok(dir.startsWith(tmpdir()));
    writeFileSync(join(dir, 'x'), '');
    assert.throws(() => resolveOutDir(dir), { code: 'SALIDA_NO_VACIA' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.throws(() => writeReport({ k: SECRETS.UISP_APP_KEY }, tmpdir(), [SECRETS.UISP_APP_KEY]), {
    code: 'FUGA_DE_SECRETO_EN_INFORME',
  });
});

test('CLI: tabla resumen e informe en --out, sin PII ni credenciales en la consola', async () => {
  const fake = await startFake(wisphubHandler);
  const out = join(mkdtempSync(join(tmpdir(), 'sonda-cli-')), 'informe');
  try {
    const script = fileURLToPath(new URL('./import-sources-probe.mjs', import.meta.url));
    const env = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WISPHUB_BASE_URL: `${fake.url}/api/`,
      WISPHUB_API_KEY: SECRETS.WISPHUB_API_KEY,
    };
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [script, '--only', 'wisphub', '--out', out],
      { env },
    );
    assert.match(stdout, /V2 +WispHub +OK/u);
    assert.match(stdout, /V9 +Siigo +NO EJECUTADO/u);
    assert.ok(stdout.includes(join(out, 'informe-sonda-fuentes.json')));
    assertNoLeak(stdout + stderr + readFileSync(join(out, 'informe-sonda-fuentes.json'), 'utf8'));
  } finally {
    await fake.close();
    rmSync(join(out, '..'), { recursive: true, force: true });
  }
});
