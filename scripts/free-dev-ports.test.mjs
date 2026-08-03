import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDevPids,
  findRepoWatcherPids,
  formatPidDiagnostic,
  getProtectedPids,
  normalizeForMatching,
  planDevPortCleanup,
} from './free-dev-ports.mjs';

test('getProtectedPids protege el proceso actual y toda su cadena de ancestros', () => {
  const entries = [
    { pid: 10, ppid: 1, command: 'bash' },
    { pid: 20, ppid: 10, command: 'pnpm dev' },
    { pid: 30, ppid: 20, command: 'node scripts/dev.mjs' },
    { pid: 40, ppid: 30, command: 'node scripts/free-dev-ports.mjs' },
    { pid: 50, ppid: 1, command: 'orphan watcher' },
  ];

  const protectedPids = getProtectedPids(entries, 40, 30);

  assert.deepEqual(
    [...protectedPids].sort((left, right) => left - right),
    [1, 10, 20, 30, 40],
  );
});

test('findRepoWatcherPids conserva watchers residuales fuera del arbol protegido', () => {
  const entries = [
    { pid: 20, ppid: 10, command: 'pnpm dev' },
    { pid: 30, ppid: 20, command: 'node scripts/dev.mjs' },
    {
      pid: 60,
      ppid: 1,
      command:
        '/home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
    {
      pid: 70,
      ppid: 1,
      command: '/home/sley/Documentos/appiw/node_modules/.bin/pnpm --filter @iwana/api dev',
    },
    { pid: 80, ppid: 1, command: 'node unrelated-script.mjs' },
  ];
  const protectedPids = new Set([20, 30]);
  const markers = [
    { path: '/home/sley/Documentos/appiw/apps/api/', command: 'nest.js start --watch' },
    { path: '/home/sley/Documentos/appiw/', command: 'pnpm --filter @iwana/api dev' },
  ];

  const detectedPids = findRepoWatcherPids(entries, protectedPids, markers);

  assert.deepEqual(
    detectedPids.sort((left, right) => left - right),
    [60, 70],
  );
});

test('findRepoWatcherPids ignora un comando coincidente sin ruta del repositorio', () => {
  const repoRoot = '/home/sley/Documentos/appiw';
  const entries = [
    { pid: 100, ppid: 1, command: `${repoRoot}/node_modules/.bin/node scripts/dev.mjs` },
    { pid: 101, ppid: 1, command: 'node scripts/dev.mjs' },
    { pid: 102, ppid: 1, command: '/tmp/otro-proyecto/node scripts/dev.mjs' },
  ];

  assert.deepEqual(
    findRepoWatcherPids(entries, new Set(), [
      { path: `${repoRoot}/`, command: 'node scripts/dev.mjs' },
      { command: 'node scripts/dev.mjs' },
    ]),
    [100],
  );
});

test('findRepoWatcherPids exige la ruta del repositorio en el ejecutable', () => {
  assert.deepEqual(
    findRepoWatcherPids(
      [
        {
          pid: 103,
          ppid: 1,
          command: 'node --fixture C:/appiw/apps/api/nest.js start --watch',
        },
      ],
      new Set(),
      [{ path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' }],
      'win32',
    ),
    [],
  );
});

test('findRepoWatcherPids detecta invocaciones de Node Unix y Windows con el script del watcher', () => {
  const entries = [
    {
      pid: 104,
      ppid: 1,
      command:
        '/usr/local/bin/node /home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
    {
      pid: 105,
      ppid: 1,
      command:
        '"C:\\Program Files\\nodejs\\node.exe" C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
  ];
  const markers = [
    { path: '/home/sley/Documentos/appiw/apps/api/', command: 'nest.js start --watch' },
    { path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' },
  ];

  assert.deepEqual(findRepoWatcherPids(entries, new Set(), [markers[0]], 'linux'), [104]);
  assert.deepEqual(findRepoWatcherPids(entries, new Set(), [markers[1]], 'win32'), [105]);
});

test('findRepoWatcherPids no confunde nombres de ejecutables o scripts maliciosos', () => {
  const repoRoot = 'C:/appiw';
  const entries = [
    { pid: 106, ppid: 1, command: `${repoRoot}/apps/api/evil-nest.js start --watch` },
    { pid: 107, ppid: 1, command: `node ${repoRoot}/apps/api/evil-nest.js start --watch` },
    { pid: 108, ppid: 1, command: `${repoRoot}/apps/web/evil-next dev --port 3001` },
    { pid: 109, ppid: 1, command: `node ${repoRoot}/apps/web/evil-next dev --port 3001` },
  ];
  const markers = [
    { path: `${repoRoot}/apps/api/`, command: 'nest.js start --watch' },
    { path: `${repoRoot}/apps/web/`, command: 'next dev --port 3001' },
  ];

  assert.deepEqual(findRepoWatcherPids(entries, new Set(), markers, 'win32'), []);
});

test('normalizeForMatching conserva mayúsculas en Unix y normaliza Windows', () => {
  assert.notEqual(
    normalizeForMatching('/home/user/Appiw', 'linux'),
    normalizeForMatching('/home/user/appiw', 'linux'),
  );
  assert.equal(normalizeForMatching('C:\\Appiw\\Apps', 'win32'), 'c:/appiw/apps');
});

test('findRepoWatcherPids detecta watchers de Windows con rutas en backslash', () => {
  const entries = [
    {
      pid: 90,
      ppid: 1,
      command:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
    {
      pid: 91,
      ppid: 1,
      command: 'C:\\appiw\\node_modules\\.bin\\pnpm.CMD --filter @iwana/web dev',
    },
    { pid: 92, ppid: 1, command: 'node unrelated-script.mjs' },
  ];
  const protectedPids = new Set();
  const markers = [
    { path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' },
    { path: 'C:/appiw/', command: 'pnpm.CMD --filter @iwana/web dev' },
  ];

  const detectedPids = findRepoWatcherPids(entries, protectedPids, markers);

  assert.deepEqual(
    detectedPids.sort((left, right) => left - right),
    [90, 91],
  );
});

test('classifyDevPids separates external listeners from workspace watchers', () => {
  assert.deepEqual(
    classifyDevPids([101, 202, 303, 303], [202, 404, 404]),
    { safePids: [202, 404], externalPids: [101, 303] },
  );
});

test('classifyDevPids permits cleaning a stale watcher without a listening socket', () => {
  assert.deepEqual(classifyDevPids([], [404]), {
    safePids: [404],
    externalPids: [],
  });
});

test('planDevPortCleanup reports exit code 1 for external-only listeners', () => {
  assert.deepEqual(planDevPortCleanup([101], []), {
    pidsToKill: [],
    externalPids: [101],
    exitCode: 1,
  });
});

test('planDevPortCleanup kills only safe watchers in mixed cases and reports exit code 1', () => {
  assert.deepEqual(planDevPortCleanup([101, 202], [202]), {
    pidsToKill: [202],
    externalPids: [101],
    exitCode: 1,
  });
});

test('formatPidDiagnostic includes a sanitized command and falls back without one', () => {
  const formatted = formatPidDiagnostic(123, [
    {
      pid: 123,
      command:
        'node scripts/dev.mjs API_KEY=redact-me --password=redact-me --header "Authorization: Bearer redact-me" postgres://user:redact-me@db.example/app',
    },
  ]);

  assert.match(formatted, /^PID 123 \(node scripts\/dev\.mjs/);
  assert.doesNotMatch(formatted, /API_KEY/);
  assert.match(formatted, /--password=\[REDACTED\]/);
  assert.match(formatted, /<connection-redacted>/);
  assert.doesNotMatch(formatted, /redact-me/);
  assert.equal(formatPidDiagnostic(404, []), 'PID 404');
});

test('formatPidDiagnostic redacts short options and unquoted sensitive headers', () => {
  const shortOptions = formatPidDiagnostic(321, [
    {
      pid: 321,
      command: 'node -p password -u user:password',
    },
  ]);
  const headers = formatPidDiagnostic(322, [
    {
      pid: 322,
      command: 'curl -H X-Api-Key:header-secret --header X-Api-Key:long-header-secret',
    },
  ]);
  const formatted = formatPidDiagnostic(323, [
    {
      pid: 323,
      command:
        'node --pwd secret --token token-secret --password password-secret --api-key api-secret --secret secret-value https://url-user:url-secret@example.test/path?token=query-secret',
    },
  ]);

  assert.match(shortOptions, /-p=\[REDACTED\]/);
  assert.match(shortOptions, /-u=\[REDACTED\]/);
  assert.match(headers, /-H=\[REDACTED\]/);
  assert.match(headers, /--header=\[REDACTED\]/);
  assert.match(formatted, /--pwd=\[REDACTED\]/);
  assert.match(formatted, /--token=\[REDACTED\]/);
  assert.match(formatted, /--password=\[REDACTED\]/);
  assert.match(formatted, /--api-key=\[REDACTED\]/);
  assert.match(formatted, /--secret=\[REDACTED\]/);
  assert.match(formatted, /<connection-redacted>/);
  assert.doesNotMatch(
    `${shortOptions} ${headers} ${formatted}`,
    /header-secret|long-header-secret|token-secret|password-secret|api-secret|secret-value|url-secret|query-secret|user:password/,
  );
});

test('formatPidDiagnostic redacts the complete unquoted Authorization header value', () => {
  const formatted = formatPidDiagnostic(324, [
    {
      pid: 324,
      command:
        'curl --header=Authorization: Bearer secret --header X-Api-Key:header-secret -H X-Api-Key:header-secret',
    },
  ]);

  assert.match(formatted, /--header=\[REDACTED\]/);
  assert.equal((formatted.match(/\[REDACTED\]/g) ?? []).length, 3);
  assert.doesNotMatch(formatted, /secret|header-secret/);
});

test('formatPidDiagnostic redacts attached options and sensitive aliases without leaking values', () => {
  const formatted = formatPidDiagnostic(325, [
    {
      pid: 325,
      command:
        'tool -psecret -p secret -uuser:password -u user:password --pwd=secret --db-password=database-secret --auth-token=auth-secret --token token-secret --api-key api-secret --secret secret-value',
    },
  ]);

  assert.match(formatted, /-p=\[REDACTED\]/);
  assert.match(formatted, /-u=\[REDACTED\]/);
  assert.match(formatted, /--db-password=\[REDACTED\]/);
  assert.match(formatted, /--auth-token=\[REDACTED\]/);
  assert.doesNotMatch(
    formatted,
    /database-secret|auth-secret|token-secret|api-secret|secret-value|user:password/i,
  );
});

test('formatPidDiagnostic fails closed when a sensitive option has no confidently parsed value', () => {
  const formatted = formatPidDiagnostic(326, [{ pid: 326, command: 'node --token' }]);

  assert.equal(formatted, 'PID 326 ([REDACTED COMMAND])');
});
