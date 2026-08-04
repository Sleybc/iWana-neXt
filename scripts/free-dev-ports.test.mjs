import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWindowsKillCommand,
  classifyDevPids,
  findRepoWatcherPids,
  formatPidDiagnostic,
  getAutomaticTerminationDecision,
  getProtectedPids,
  isSafeRepoWatcherPid,
  parsePsEntries,
  planRepoWatcherTermination,
  normalizeForMatching,
  parseLinuxProcStatStarttime,
  parseWindowsProcessEntries,
  planDevPortCleanup,
  planDevPortCleanupDecision,
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
    {
      pid: 30,
      ppid: 20,
      command: '/usr/bin/node /home/sley/Documentos/appiw/scripts/dev.mjs',
    },
    {
      pid: 60,
      ppid: 1,
      command:
        '/home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
    {
      pid: 70,
      ppid: 30,
      command: '/home/sley/Documentos/appiw/node_modules/.bin/pnpm --filter @iwana/api dev',
    },
    {
      pid: 71,
      ppid: 1,
      command: '/home/sley/Documentos/appiw/node_modules/.bin/pnpm --filter @iwana/api dev',
    },
    { pid: 80, ppid: 1, command: 'node unrelated-script.mjs' },
  ];
  const protectedPids = new Set([20, 30]);
  const markers = [
    { path: '/home/sley/Documentos/appiw/apps/api/', command: 'nest.js start --watch' },
  ];

  const detectedPids = findRepoWatcherPids(
    entries,
    protectedPids,
    markers,
    'linux',
    '/home/sley/Documentos/appiw',
  );

  assert.deepEqual(
    detectedPids.sort((left, right) => left - right),
    [60, 70],
  );
});

test('findRepoWatcherPids solo acepta pnpm dev con ancestro node scripts/dev.mjs del repo', () => {
  const repoRoot = '/home/sley/Documentos/appiw';
  const entries = [
    {
      pid: 200,
      ppid: 1,
      command: `/usr/bin/node ${repoRoot}/scripts/dev.mjs`,
    },
    {
      pid: 201,
      ppid: 200,
      command: `${repoRoot}/node_modules/.bin/pnpm --filter @iwana/worker dev`,
    },
    {
      pid: 202,
      ppid: 1,
      command: `${repoRoot}/node_modules/.bin/pnpm --filter @iwana/web dev`,
    },
    {
      pid: 203,
      ppid: 204,
      command: `${repoRoot}/node_modules/.bin/pnpm --filter @iwana/portal dev`,
    },
    { pid: 204, ppid: 1, command: '/tmp/other-project/scripts/dev.mjs' },
  ];

  assert.deepEqual(
    findRepoWatcherPids(
      entries,
      new Set([200]),
      [{ path: repoRoot, command: 'pnpm --filter @iwana/worker dev' }],
      'linux',
      repoRoot,
    ),
    [201],
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
      ppid: 93,
      command: 'C:\\appiw\\node_modules\\.bin\\pnpm.CMD --filter @iwana/web dev',
    },
    { pid: 92, ppid: 1, command: 'node unrelated-script.mjs' },
    {
      pid: 93,
      ppid: 1,
      command: 'C:\\appiw\\node_modules\\.bin\\node.exe C:\\appiw\\scripts\\dev.mjs',
    },
  ];
  const protectedPids = new Set();
  const markers = [{ path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' }];

  const detectedPids = findRepoWatcherPids(entries, protectedPids, markers, 'win32', 'C:/appiw');

  assert.deepEqual(
    detectedPids.sort((left, right) => left - right),
    [90, 91],
  );
});

test('findRepoWatcherPids canonicaliza rutas y rechaza traversal o prefijos embebidos', () => {
  const unixMarker = { path: '/home/sley/appiw/apps/api/', command: 'nest.js start --watch' };
  const windowsMarker = { path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' };
  const entries = [
    {
      pid: 111,
      ppid: 1,
      command: '/home/sley/appiw/apps/api/../other/nest.js start --watch',
    },
    {
      pid: 112,
      ppid: 1,
      command: '/tmp/home/sley/appiw/apps/api/nest.js start --watch',
    },
    {
      pid: 113,
      ppid: 1,
      command: 'C:\\appiw\\apps\\api\\..\\other\\nest.js start --watch',
    },
    {
      pid: 114,
      ppid: 1,
      command: 'C:\\tmp\\C:\\appiw\\apps\\api\\nest.js start --watch',
    },
    {
      pid: 115,
      ppid: 1,
      command:
        '/home/sley/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
    {
      pid: 116,
      ppid: 1,
      command:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
  ];

  assert.deepEqual(findRepoWatcherPids(entries, new Set(), [unixMarker], 'linux'), [115]);
  assert.deepEqual(findRepoWatcherPids(entries, new Set(), [windowsMarker], 'win32'), [116]);
});

test('isSafeRepoWatcherPid revalida ownership, protección y matcher antes de matar', () => {
  const marker = { path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' };
  const entries = [
    {
      pid: 501,
      ppid: 1,
      command:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
    { pid: 502, ppid: 1, command: 'C:\\appiw\\apps\\api\\unrelated.js --watch' },
    {
      pid: 503,
      ppid: 502,
      command:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
  ];

  assert.equal(isSafeRepoWatcherPid(501, entries, [marker], 'win32', 900, 1), true);
  assert.equal(isSafeRepoWatcherPid(502, entries, [marker], 'win32', 900, 1), false);
  assert.equal(isSafeRepoWatcherPid(503, entries, [marker], 'win32', 900, 503), false);
});

test('planRepoWatcherTermination no propone matar si cambia la identidad de inicio', () => {
  const marker = { path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' };
  const discoveryEntries = [
    {
      pid: 504,
      ppid: 1,
      startIdentity: '2026-08-03T10:00:00.000Z',
      command:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
  ];
  const revalidatedEntries = [
    {
      ...discoveryEntries[0],
      startIdentity: '2026-08-03T10:00:01.000Z',
    },
  ];

  assert.deepEqual(
    planRepoWatcherTermination(
      [504],
      discoveryEntries,
      revalidatedEntries,
      [marker],
      'win32',
      900,
      1,
    ),
    [],
  );
});

test('planRepoWatcherTermination omite candidatos Unix sin identidad de inicio', () => {
  const marker = {
    path: '/home/sley/Documentos/appiw/apps/api/',
    command: 'nest.js start --watch',
  };
  const entriesWithoutIdentity = [
    {
      pid: 505,
      ppid: 1,
      command:
        '/home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
  ];

  assert.deepEqual(
    planRepoWatcherTermination(
      [505],
      entriesWithoutIdentity,
      entriesWithoutIdentity,
      [marker],
      'linux',
      900,
      1,
    ),
    [],
  );
});

test('parsePsEntries conserva lstart solo para diagnostico y no autoriza una terminacion Unix', () => {
  const marker = {
    path: '/home/sley/Documentos/appiw/apps/api/',
    command: 'nest.js start --watch',
  };
  const psFixture =
    '  506  1 Mon Aug  3 10:00:00 2026 /home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch\n';
  const discoveryEntries = parsePsEntries(psFixture);
  const revalidatedEntries = parsePsEntries(psFixture);

  assert.deepEqual(discoveryEntries, [
    {
      pid: 506,
      ppid: 1,
      startIdentity: 'Mon Aug  3 10:00:00 2026',
      command:
        '/home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
  ]);
  assert.deepEqual(
    planRepoWatcherTermination(
      [506],
      discoveryEntries,
      revalidatedEntries,
      [marker],
      'linux',
      900,
      1,
    ),
    [],
  );
});

test('planRepoWatcherTermination acepta en Linux solo ticks de /proc como identidad', () => {
  const marker = {
    path: '/home/sley/Documentos/appiw/apps/api/',
    command: 'nest.js start --watch',
  };
  const entries = [
    {
      pid: 508,
      ppid: 1,
      startIdentity: '987654321',
      command:
        '/home/sley/Documentos/appiw/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch',
    },
  ];

  assert.deepEqual(
    planRepoWatcherTermination([508], entries, entries, [marker], 'linux', 900, 1),
    [508],
  );
  assert.deepEqual(
    planRepoWatcherTermination([508], entries, entries, [marker], 'darwin', 900, 1),
    [],
  );
});

test('getAutomaticTerminationDecision solo permite terminar con identidad estable', () => {
  assert.deepEqual(getAutomaticTerminationDecision('linux'), {
    canTerminate: true,
    warning: null,
  });
  assert.deepEqual(getAutomaticTerminationDecision('win32'), {
    canTerminate: true,
    warning: null,
  });

  for (const platform of ['darwin', 'freebsd']) {
    const decision = getAutomaticTerminationDecision(platform);
    assert.equal(decision.canTerminate, false);
    assert.match(decision.warning ?? '', /terminacion automatica no disponible/i);
    assert.match(decision.warning ?? '', /identidad estable/i);
  }
});

test('parseLinuxProcStatStarttime extrae field 22 aunque comm contenga parentesis', () => {
  const statLine = `12345 (node (watcher)) S ${Array.from({ length: 18 }, (_, index) => index + 1).join(' ')} 987654321 19 20`;

  assert.equal(parseLinuxProcStatStarttime(statLine), '987654321');
});

test('parseWindowsProcessEntries captura CreationDate y conserva la identidad para revalidar', () => {
  const marker = { path: 'C:/appiw/apps/api/', command: 'nest.js start --watch' };
  const windowsFixture = JSON.stringify([
    {
      ProcessId: 507,
      ParentProcessId: 1,
      CreationDate: '20260803100000.000000-420',
      CommandLine:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
  ]);
  const discoveryEntries = parseWindowsProcessEntries(windowsFixture);
  const revalidatedEntries = parseWindowsProcessEntries(windowsFixture);

  assert.deepEqual(discoveryEntries, [
    {
      pid: 507,
      ppid: 1,
      startIdentity: '20260803100000.000000-420',
      command:
        'C:\\appiw\\apps\\api\\node_modules\\.bin\\..\\@nestjs\\cli\\bin\\nest.js start --watch',
    },
  ]);
  assert.equal(revalidatedEntries[0]?.startIdentity, discoveryEntries[0]?.startIdentity);
  assert.deepEqual(
    planRepoWatcherTermination(
      [507],
      discoveryEntries,
      revalidatedEntries,
      [marker],
      'win32',
      900,
      1,
    ),
    [507],
  );
});

test('classifyDevPids separates external listeners from workspace watchers', () => {
  assert.deepEqual(classifyDevPids([101, 202, 303, 303], [202, 404, 404]), {
    safePids: [202, 404],
    externalPids: [101, 303],
  });
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

test('planDevPortCleanupDecision conserva externos antes de bloquear watchers en Unix no Linux', () => {
  assert.deepEqual(planDevPortCleanupDecision([101, 202], [202], 'darwin'), {
    pidsToKill: [202],
    externalPids: [101],
    exitCode: 1,
    terminationWarning:
      'Terminacion automatica no disponible en macOS/otros Unix sin una identidad estable de proceso.',
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
  assert.match(formatted, /\[URL REDACTED\]/);
  assert.doesNotMatch(formatted, /redact-me/);
  assert.equal(formatPidDiagnostic(404, []), 'PID 404');
});

test('formatPidDiagnostic redacts credentials and query values for every URI scheme', () => {
  const formatted = formatPidDiagnostic(333, [
    {
      pid: 333,
      command:
        'tool ws://user:ws-secret@host/socket?token=ws-query ftp://user:ftp-secret@host/file?password=ftp-query --mode safe',
    },
  ]);

  assert.match(formatted, /\[URL REDACTED\]/g);
  assert.doesNotMatch(formatted, /ws-secret|ws-query|ftp-secret|ftp-query|user:/);
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
  assert.match(formatted, /\[URL REDACTED\]/);
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

test('formatPidDiagnostic redacts attached short header forms without leaking their values', () => {
  const formatted = formatPidDiagnostic(327, [
    {
      pid: 327,
      command: 'curl -H=X-Api-Key:equals-secret -HX-Api-Key:attached-secret',
    },
  ]);

  assert.equal(formatted, 'PID 327 (curl -H=[REDACTED] -H=[REDACTED])');
  assert.doesNotMatch(formatted, /equals-secret|attached-secret/);
});

test('formatPidDiagnostic redacts unquoted Bearer and Basic headers without leaking tokens', () => {
  const formatted = formatPidDiagnostic(328, [
    {
      pid: 328,
      command:
        'curl --header Authorization:Bearer bearer-secret --header Authorization:Basic basic-secret',
    },
  ]);

  assert.equal(formatted, 'PID 328 (curl --header=[REDACTED] --header=[REDACTED])');
  assert.doesNotMatch(formatted, /bearer-secret|basic-secret/);
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

test('formatPidDiagnostic fails closed for camelCase sensitive long options', () => {
  const commands = [
    'tool --clientSecret=client-secret-leak --mode safe',
    'tool --accessToken access-token-leak --mode safe',
    'tool --apiKey=api-key-leak --mode safe',
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(337, [{ pid: 337, command }]);

    assert.equal(formatted, 'PID 337 ([REDACTED COMMAND])', command);
    assert.doesNotMatch(formatted, /client-secret-leak|access-token-leak|api-key-leak/);
  }
});

test('formatPidDiagnostic redacts additional secret option aliases in attached and separated forms', () => {
  const aliases = ['access-token', 'bearer-token', 'secret-key', 'pass', 'key'];

  for (const alias of aliases) {
    for (const [option, value] of [
      [`--${alias}=`, `${alias}-attached-leak`],
      [`--${alias}`, `${alias}-separated-leak`],
      [`--${alias.replace(/-/g, '_')}`, `${alias}-underscore-leak`],
    ]) {
      const command = option.endsWith('=') ? `${option}${value}` : `${option} ${value}`;
      const formatted = formatPidDiagnostic(329, [{ pid: 329, command }]);

      assert.ok(formatted.includes(`${option.replace(/=$/, '')}=[REDACTED]`), formatted);
      assert.doesNotMatch(formatted, new RegExp(value));
    }
  }
});

test('formatPidDiagnostic redacts spaced PowerShell sensitive environment assignments', () => {
  const sensitiveNames = [
    'TOKEN',
    'PASSWORD',
    'PASS',
    'SECRET',
    'API_KEY',
    'PRIVATE_KEY',
    'CREDENTIAL',
  ];

  for (const name of sensitiveNames) {
    for (const assignment of [
      `$env:${name}=secret`,
      `$env:${name}= secret`,
      `$env:${name} =secret`,
      `$env:${name} = secret`,
      `$env:${name}="secret value"`,
      String.raw`$env:${name}=secret\ value`,
    ]) {
      const formatted = formatPidDiagnostic(331, [
        { pid: 331, command: `tool ${assignment} --mode safe` },
      ]);

      assert.equal(formatted, `PID 331 (tool $env:${name}=[REDACTED] --mode safe)`);
      assert.doesNotMatch(formatted, /secret|value/);
    }
  }
});

test('formatPidDiagnostic fails closed for compound and braced PowerShell sensitive assignments', () => {
  const sensitiveNames = [
    'TOKEN',
    'PASSWORD',
    'PASS',
    'SECRET',
    'API_KEY',
    'PRIVATE_KEY',
    'CREDENTIAL',
  ];

  for (const name of sensitiveNames) {
    for (const assignment of [
      `$env:${name}+=secret`,
      `$env:${name} =+ secret`,
      `\${env:${name}}=secret`,
      `\${env:${name}} = secret`,
    ]) {
      const formatted = formatPidDiagnostic(338, [
        { pid: 338, command: `tool ${assignment} --mode safe` },
      ]);

      assert.doesNotMatch(formatted, /secret|value/);
      assert.match(formatted, /\[REDACTED\]/);
    }
  }
});

test('formatPidDiagnostic redacts PowerShell environment-writing cmdlets', () => {
  const secret = 'secret-leak';
  const commands = [
    `powershell -Command "Set-Item Env:TOKEN ${secret}"`,
    `PoWeRsHeLl -Command 'set-content "Env:password" ${secret}'`,
    `pwsh -Command "New-Item Env:API_KEY -Value ${secret}"`,
    `powershell -Command "Set-Variable -Name PRIVATE_KEY -Value ${secret}"`,
    `powershell -Command "si Env:AUTH_TOKEN ${secret}"`,
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(344, [{ pid: 344, command }]);

    assert.equal(formatted, 'PID 344 ([REDACTED COMMAND])', command);
    assert.doesNotMatch(formatted, /secret-leak/);
  }
});

test('formatPidDiagnostic fails closed for colon-attached PowerShell environment parameters', () => {
  const secret = 'colon-secret-leak';
  const commands = [
    `Set-Item -Path:Env:TOKEN -Value ${secret}`,
    `Set-Content -LiteralPath:Env:PASSWORD -Value ${secret}`,
    `New-Item -Path:Env:API_KEY -Value ${secret}`,
    `Set-Variable -Name:TOKEN -Value ${secret}`,
    `powershell -Command "sEt-ItEm -PaTh:EnV:TOKEN -VaLuE ${secret}"`,
    `pwsh -Command 'sEt-CoNtEnT -LiTeRaLPaTh:EnV:PASSWORD -VaLuE ${secret}'`,
    `powershell -Command "nEw-ItEm -pAtH:EnV:API_KEY -vAlUe ${secret}"`,
    `pwsh -Command 'sEt-VaRiAbLe -NaMe:TOKEN -VaLuE ${secret}'`,
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(345, [{ pid: 345, command }]);

    assert.equal(formatted, 'PID 345 ([REDACTED COMMAND])', command);
    assert.doesNotMatch(formatted, /colon-secret-leak/);
  }
});

test('formatPidDiagnostic treats single-dash named sensitive options as named options', () => {
  const commands = [
    'tool -Password redact-me --mode safe',
    'tool -User redact-me --mode safe',
    'tool -Token redact-me --mode safe',
    'tool -ApiKey=redact-me --mode safe',
    'tool -client-secret redact-me --mode safe',
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(339, [{ pid: 339, command }]);

    assert.doesNotMatch(formatted, /redact-me/);
  }

  const normal = formatPidDiagnostic(340, [{ pid: 340, command: 'tool -v safe -Port 3000' }]);
  assert.equal(normal, 'PID 340 (tool -v safe -Port 3000)');
});

test('formatPidDiagnostic consumes complete multi-token sensitive header values', () => {
  const formatted = formatPidDiagnostic(341, [
    {
      pid: 341,
      command:
        'curl --header X-Api-Key: secret value --mode safe -H X-Api-Key:attached-secret continuation --ok',
    },
  ]);

  assert.equal(formatted, 'PID 341 (curl --header=[REDACTED] --mode safe -H=[REDACTED] --ok)');
  assert.doesNotMatch(formatted, /secret|value|continuation/);
});

test('formatPidDiagnostic fails closed when a header value has ambiguous token boundaries', () => {
  const formatted = formatPidDiagnostic(342, [
    { pid: 342, command: 'curl --header X-Api-Key: secret value positional' },
  ]);

  assert.equal(formatted, 'PID 342 ([REDACTED COMMAND])');
  assert.doesNotMatch(formatted, /secret|value|positional/);
});

test('formatPidDiagnostic redacts an entire escaped or quoted multi-word sensitive value', () => {
  const commands = [
    String.raw`tool --token=secret\ value --mode safe`,
    String.raw`tool --token=secret\\ value --mode safe`,
    'tool --token="secret value" --mode safe',
    String.raw`tool --token secret\ value --mode safe`,
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(332, [{ pid: 332, command }]);

    assert.ok(
      formatted === 'PID 332 (tool --token=[REDACTED] --mode safe)' ||
        formatted === 'PID 332 ([REDACTED COMMAND])',
      formatted,
    );
    assert.doesNotMatch(formatted, /secret|value/);
  }
});

test('formatPidDiagnostic fails closed when quotes hide sensitive option-like content', () => {
  const commands = [
    'tool --mode "safe --token secret"',
    "tool --mode 'safe --token secret'",
    'tool --mode "safe --token"secret',
    "tool --mode 'safe --token'secret",
    "tool --mode safe' --token secret'",
    'tool --mode "safe" --token "secret"',
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(343, [{ pid: 343, command }]);

    assert.equal(formatted, 'PID 343 ([REDACTED COMMAND])', command);
    assert.doesNotMatch(formatted, /secret/);
  }
});

test('formatPidDiagnostic fails closed for malformed sensitive aliases', () => {
  const commands = [
    'tool --key:LEAK',
    'tool --secret-key.LEAK',
    'tool --access-token/LEAK',
    'tool --key=',
    'tool --bearer-token --next',
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(330, [{ pid: 330, command }]);
    assert.equal(formatted, 'PID 330 ([REDACTED COMMAND])', command);
    assert.doesNotMatch(formatted, /LEAK/);
  }
});

test('formatPidDiagnostic fails closed for sensitive segments hidden in option delimiters', () => {
  const commands = [
    'tool --custom-token:SECRET=attached',
    'tool --custom-token.SECRET=attached',
    'tool --custom-token/SECRET=attached',
    'tool --custom-token-SECRET=attached',
    'tool --custom-credential=SECRET',
  ];

  for (const command of commands) {
    const formatted = formatPidDiagnostic(336, [{ pid: 336, command }]);
    assert.equal(formatted, 'PID 336 ([REDACTED COMMAND])', command);
    assert.doesNotMatch(formatted, /SECRET/);
  }
});

test('formatPidDiagnostic fails closed when a sensitive option has no confidently parsed value', () => {
  const formatted = formatPidDiagnostic(326, [{ pid: 326, command: 'node --token' }]);

  assert.equal(formatted, 'PID 326 ([REDACTED COMMAND])');
});

test('formatPidDiagnostic fails closed for unsupported shell syntax without leaking secrets', () => {
  const formatted = formatPidDiagnostic(334, [
    { pid: 334, command: 'tool --token secret; echo secret' },
  ]);

  assert.equal(formatted, 'PID 334 ([REDACTED COMMAND])');
  assert.doesNotMatch(formatted, /secret/);
});

test('formatPidDiagnostic fails closed for ampersand shell syntax without leaking either value', () => {
  const formatted = formatPidDiagnostic(335, [
    { pid: 335, command: 'tool --token secret & echo later-secret' },
  ]);

  assert.equal(formatted, 'PID 335 ([REDACTED COMMAND])');
  assert.doesNotMatch(formatted, /secret/);
  assert.doesNotMatch(formatted, /later-secret/);
});

test('buildWindowsKillCommand construye taskkill sin arbol de procesos', () => {
  const command = buildWindowsKillCommand(1234);

  assert.equal(command, 'taskkill /PID 1234 /F');
  assert.doesNotMatch(command, /\/T/);
});
