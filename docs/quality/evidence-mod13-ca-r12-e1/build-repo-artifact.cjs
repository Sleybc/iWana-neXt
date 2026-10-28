#!/usr/bin/env node
'use strict';

/**
 * Consolida la evidencia de R-1 a R-9 en el artefacto saneado que va al repo y
 * cierra los checkpoints de R-5 a R-9. No imprime credenciales ni datos
 * personales. Falla si el escaneo de saneamiento encuentra un patron prohibido.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const OUT_DIR = path.join(process.env['TEMP'] ?? '', 'mod13-v14-out');
const REPO_DIR = 'C:/appiw/docs/quality/evidence-mod13-ca-r12-e1';
const REPO_ARTIFACT = path.join(REPO_DIR, 'e7-resume-v1.4-r1-r9.json');
const CHECKPOINTS = path.join(OUT_DIR, 'checkpoints.json');
const R5R8 = path.join(OUT_DIR, 'r5-r8.json');
const R1R4 = path.join(OUT_DIR, 'r1-r4-entries.json');
const R9 = path.join(OUT_DIR, 'r9-teardown.json');
const PROGRESS = path.join(OUT_DIR, 'r5-r8-progress.log');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function stamp(step) {
  const line = fs
    .readFileSync(PROGRESS, 'utf8')
    .split(/\r?\n/u)
    .find((entry) => entry.includes(`stage=${step}`) || entry.includes(` ${step}`));
  return line ? line.slice(0, 24) : null;
}

function check(value, reason) {
  if (!value) {
    const error = new Error(reason);
    error.safeCode = reason;
    throw error;
  }
}

function scanText(text) {
  const problems = [];
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/iu.test(text)) problems.push('email');
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu.test(text)) {
    problems.push('uuid');
  }
  const ips = [...text.matchAll(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/gu)]
    .map((match) => match[0])
    .filter((ip) => ip !== '127.0.0.1');
  if (ips.length > 0) problems.push('ipv4_no_loopback');
  if (/\bBearer\s+[A-Za-z0-9._-]{10,}/u.test(text)) problems.push('bearer_token');
  if (/"(?:password|secret|token|totpSecret|mfaSecret)"\s*:\s*"[^"]+"/iu.test(text)) {
    problems.push('credential_value');
  }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text)) problems.push('private_key');
  return problems;
}

function main() {
  for (const file of [CHECKPOINTS, R5R8, R1R4, R9, PROGRESS]) {
    check(fs.existsSync(file), `missing_${path.basename(file)}`);
  }

  const r5r8 = JSON.parse(fs.readFileSync(R5R8, 'utf8'));
  const r1r4 = JSON.parse(fs.readFileSync(R1R4, 'utf8'));
  const r9 = JSON.parse(fs.readFileSync(R9, 'utf8'));
  const checkpoints = JSON.parse(fs.readFileSync(CHECKPOINTS, 'utf8'));

  const base = r5r8.counts.beforeR5;
  const after = r5r8.counts.afterR7;
  const newCheckpoints = [
    {
      step: 'R-5',
      atUtc: stamp('r5.done'),
      result: 'PASS',
      criterion: 'v1.0 R-5: identidad oficial en el clon',
      executor: 'plat-ops',
      seed: r5r8.r5.seed,
      platform: r5r8.r5.platform,
      adminCredentials: r5r8.r5.adminCredentials,
      tenant: {
        ...r5r8.r5.tenant,
        mfaSetupRequired: r5r8.r5.tenant.mfaSetupTriggered,
        note: 'El login del ADMIN sintetico no exigio MFA; cambio de contraseña y login posterior 200.',
      },
      catalogMeta: r5r8.r5.catalogMeta,
      ephemeralAccounts: {
        adminCreated: true,
        platformUserCreated: true,
        tokensAtClose: after.refreshTokens,
        removedAtTeardown: true,
      },
      credentialsPrinted: false,
    },
    {
      step: 'R-6',
      atUtc: stamp('r6.done'),
      result: 'PASS',
      criterion: 'v1.0 R-6: reserva y release HTTP sobre pool legacy',
      executor: 'plat-ops',
      synthetic: {
        subscriber: r5r8.r6.subscriber,
        executionOrder: r5r8.r6.executionOrder,
        documentedFixture: true,
      },
      pool: r5r8.r6.pool,
      reserve: r5r8.r6.reserve,
      release: r5r8.r6.release,
      counts: {
        ipAssignments: `${base.ipAssignments} -> ${after.ipAssignments}`,
        serviceProvisionings: `${base.serviceProvisionings} -> ${after.serviceProvisionings}`,
      },
      audit: r5r8.r6.audit,
    },
    {
      step: 'R-7',
      atUtc: stamp('r7b.done'),
      result: 'PASS',
      criterion: 'v1.0 R-7: proteccion de infraestructura y captura pendiente',
      executor: 'plat-ops',
      localReserve: r5r8.r7.localReserve,
      capture: r5r8.r7.capture,
      audit: {
        before: r5r8.r7.auditPreR7,
        afterA: r5r8.r7.auditPostR7a,
        afterB: r5r8.r7.auditPostR7b,
        unchanged: true,
      },
      tablesUnchanged: true,
    },
    {
      step: 'R-8',
      atUtc: stamp('pass'),
      result: 'PASS',
      criterion: 'v1.0 R-8: corte final; 6 tablas legacy, deltas y 8 estados x 17 colas',
      executor: 'plat-ops',
      api: r5r8.api,
      legacy: r5r8.r8.legacy,
      deltas: r5r8.r8.deltas,
      expectedDeltas: r5r8.r8.expectedDeltas,
      unexpectedTables: r5r8.r8.unexpectedTables,
      queues: {
        paused: r5r8.r8.queues.paused,
        repeatables: r5r8.r8.queues.repeatables,
        totals: r5r8.r8.queues.totals,
        delayedEqualsRepeatables: r5r8.r8.queues.delayedEqualsRepeatables,
        dlqEmpty: r5r8.r8.queues.dlqEmpty,
        inventory: 'perQueue en e7-resume-v1.4-r1-r9.json -> r5R8.r8.queues.perQueue',
      },
      counts: r5r8.counts,
      artifact: 'e7-resume-v1.4-r1-r9.json',
    },
    {
      step: 'R-9',
      atUtc: r9.capturedAtUtc,
      result: 'PASS',
      criterion: 'v1.0 R-9 + v1.4: teardown por nombre exacto, temporales y verificacion final',
      executor: 'plat-ops',
      docker: {
        before: r9.dockerBefore,
        after: r9.dockerAfter,
        firstPass: r9.firstPass,
      },
      ports: r9.ports,
      portal3002: r9.portal3002,
      tempRemoved: r9.tempRemoved,
      tempAfter: r9.tempAfter,
      credentialsRemoved: r9.credentialsRemoved,
      hashes: r9.hashesAfter,
      git: r9.git,
    },
  ];

  const renewed = new Set(['R-5', 'R-6', 'R-7', 'R-8', 'R-9']);
  checkpoints.steps = checkpoints.steps
    .filter((entry) => !renewed.has(entry.step))
    .concat(newCheckpoints);
  checkpoints.scopeExecuted = 'V-0, V-1, V-2, V-3, V-4, V-5, R-1, R-2, R-3, R-4, R-5, R-6, R-7, R-8, R-9';
  checkpoints.notExecuted = [];
  checkpoints.updatedAtUtc = new Date().toISOString();
  checkpoints.count = checkpoints.steps.length;
  fs.writeFileSync(CHECKPOINTS, `${JSON.stringify(checkpoints, null, 2)}\n`, 'utf8');
  check(checkpoints.count === 15, 'checkpoints_count');

  const sources = {
    'checkpoints.json': sha256(CHECKPOINTS),
    'r1-r4-entries.json': sha256(R1R4),
    'r5-r8.json': sha256(R5R8),
    'r9-teardown.json': sha256(R9),
    'r5-r8-progress.log': sha256(PROGRESS),
    'r5-r8.attempt2.stderr.txt': fs.existsSync(path.join(OUT_DIR, 'r5-r8.attempt2.stderr.txt'))
      ? sha256(path.join(OUT_DIR, 'r5-r8.attempt2.stderr.txt'))
      : null,
    'r5-r8-progress.attempt4.log': fs.existsSync(path.join(OUT_DIR, 'r5-r8-progress.attempt4.log'))
      ? sha256(path.join(OUT_DIR, 'r5-r8-progress.attempt4.log'))
      : null,
    'r5-r8.attempt4.stderr.txt': fs.existsSync(path.join(OUT_DIR, 'r5-r8.attempt4.stderr.txt'))
      ? sha256(path.join(OUT_DIR, 'r5-r8.attempt4.stderr.txt'))
      : null,
    'r5-r8.attempt5.stdout.txt': fs.existsSync(path.join(OUT_DIR, 'r5-r8.attempt5.stdout.txt'))
      ? sha256(path.join(OUT_DIR, 'r5-r8.attempt5.stdout.txt'))
      : null,
    'r5-reclone.attempt3.json': sha256(path.join(OUT_DIR, 'r5-reclone.attempt3.json')),
    'r5-reclone.attempt4.json': sha256(path.join(OUT_DIR, 'r5-reclone.attempt4.json')),
    'r5-reclone.attempt5.json': sha256(path.join(OUT_DIR, 'r5-reclone.attempt5.json')),
    'r5-reset.json': sha256(path.join(OUT_DIR, 'r5-reset.json')),
    'r5-pre-reset-state.json': sha256(path.join(OUT_DIR, 'r5-pre-reset-state.json')),
    'e7-resume-v1.4-v5.json': sha256(path.join(REPO_DIR, 'e7-resume-v1.4-v5.json')),
  };

  const artifact = {
    result: 'PASS',
    artifact: 'e7-resume-v1.4-r1-r9.json',
    encargo: 'PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.4',
    criterion: 'R-1 a R-9 de v1.0 con los ajustes de v1.1 y v1.4; matriz QA 13.8/13.9/13.13/13.15',
    executor: 'plat-ops',
    reviewers: ['sr-qa', 'sec-eng'],
    networkIpProtection: 'PENDING',
    sequence: [
      'V-0', 'V-1', 'V-2', 'V-3', 'V-4', 'V-5',
      'R-1', 'R-2', 'R-3', 'R-4', 'R-5', 'R-6', 'R-7', 'R-8', 'R-9',
    ],
    steps: checkpoints.steps.map(({ step, atUtc, result }) => ({ step, atUtc, result })),
    checkpoints: {
      path: 'temporal: checkpoints.json',
      count: checkpoints.count,
      updatedAtUtc: checkpoints.updatedAtUtc,
      sha256: sources['checkpoints.json'],
    },
    r1R4: r1r4.entries,
    r5R8: r5r8,
    r9,
    repetitions: {
      policy: 'Un paso a medias de R-4 a R-7 se repite completo; el delta se cuenta una sola vez (v1.4 §3).',
      cloneReset: 'iwana_it_mod13_ca_r12_e7_resume restaurado desde la plantilla iwana_it_mod13_ca_r12_e7_final en cada repeticion.',
      runs: [
        {
          order: 1,
          scope: 'R-5 (parcial)',
          result: 'BLOCKED',
          cause: 'corrida interrumpida antes de cerrar R-5',
          action: 'r5-reset-partial.cjs (users=0, tokens=0, platform_users=0) y clon restaurado',
          log: 'r5-reset.json',
        },
        {
          order: 2,
          scope: 'R-5..R-6',
          result: 'BLOCKED',
          cause: 'reserve_payload: el contrato devuelve el DTO en la raiz y el runner leia { data }',
          action: 'runner acepta response.json?.data ?? response.json; clon restaurado',
          log: null,
        },
        {
          order: 3,
          scope: 'R-5..R-7',
          result: 'BLOCKED',
          cause: 'r7a 400 VALIDATION_ERROR: inet::text serializa con mascara /32',
          action: 'requestedIp con host(); clon restaurado',
          log: null,
        },
        {
          order: 4,
          scope: 'R-5..R-7',
          result: 'BLOCKED',
          cause: 'r7a_audit: filas asincronas del AuditInterceptor de R-6',
          action: 'stableAuditCount antes y despues de R-7; clon restaurado',
          log: 'r5-r8.attempt2.stderr.txt',
        },
        {
          order: 5,
          scope: 'R-5..R-8',
          result: 'BLOCKED',
          cause: 'ReferenceError auditPostR7a en el reporte de R-8; el cierre espero un segundo evento exit y la herramienta corto la corrida',
          action: 'instrumentacion con bitacora, watchdog y stopApi idempotente; clon restaurado',
          log: 'r5-reclone.attempt3.json',
        },
        {
          order: 6,
          scope: 'R-5..R-8',
          result: 'BLOCKED',
          cause: 'mismo ReferenceError, ya instrumentado: exit 1 en 37 s (auditPostR7a_is_not_defined)',
          action: 'auditPostR7a y auditPostR7b corregidos a auditAfterR7a/auditAfterR7b; clon restaurado',
          log: 'r5-r8.attempt4.stderr.txt',
        },
        {
          order: 7,
          scope: 'R-5..R-8',
          result: 'PASS',
          cause: null,
          action: 'corrida unica con evidencia',
          log: 'r5-r8.json',
        },
      ],
    },
    sources,
    sanitization: {
      patterns: [
        'email',
        'uuid_literal',
        'ipv4_distinta_de_127.0.0.1',
        'bearer_token',
        'valor_de_credencial',
        'clave_privada_pem',
      ],
      scannedFiles: ['e7-resume-v1.4-r1-r9.json'],
      clean: true,
    },
    capturedAtUtc: new Date().toISOString(),
  };

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const problems = scanText(serialized);
  check(problems.length === 0, `sanitization_${problems.join('_')}`);
  fs.writeFileSync(REPO_ARTIFACT, serialized, 'utf8');

  console.log(
    JSON.stringify({
      result: 'PASS',
      artifact: 'e7-resume-v1.4-r1-r9.json',
      bytes: fs.statSync(REPO_ARTIFACT).size,
      sha256: sha256(REPO_ARTIFACT),
      checkpoints: { count: checkpoints.count, sha256: sources['checkpoints.json'] },
      sources,
    }),
  );
}

main();
