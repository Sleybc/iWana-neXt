import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';

const rootCwd = process.cwd();
const isWindows = process.platform === 'win32';
const hasScriptCommand =
  !isWindows && spawnSync('script', ['-qc', 'true', '/dev/null'], { stdio: 'ignore' }).status === 0;
const panelSections = ['all', 'errors', 'api', 'web', 'portal', 'worker', 'docker'];
const serviceSections = panelSections.filter((section) => !['all', 'errors'].includes(section));
const maxBufferedLines = 1200;
const dashboardStateFile = join(rootCwd, '.turbo', 'dev-dashboard-state.json');

function resolveCommand(command) {
  return isWindows ? `${command}.cmd` : command;
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function normalizeChunk(chunk) {
  return stripAnsi(String(chunk)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function truncate(text, width) {
  if (width <= 0) {
    return '';
  }

  if (text.length <= width) {
    return text.padEnd(width, ' ');
  }

  if (width === 1) {
    return text.slice(0, 1);
  }

  return `${text.slice(0, width - 1)}…`;
}

function padAnsi(text, width) {
  const visibleWidth = stripAnsi(text).length;

  if (visibleWidth >= width) {
    return text;
  }

  return `${text}${' '.repeat(width - visibleWidth)}`;
}

function colorize(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function colorizeStatus(status, text) {
  if (status === 'running' || status === 'ready') {
    return colorize(text, '32');
  }

  if (status === 'starting') {
    return colorize(text, '33');
  }

  if (status === 'failed') {
    return colorize(text, '31');
  }

  if (status === 'stopped') {
    return colorize(text, '36');
  }

  if (status === 'vista') {
    return colorize(text, '34');
  }

  return colorize(text, '90');
}

function loadSelectedSection() {
  try {
    const raw = readFileSync(dashboardStateFile, 'utf8');
    const parsed = JSON.parse(raw);
    const selectedSection =
      typeof parsed?.selectedSection === 'string' ? parsed.selectedSection : 'all';
    return panelSections.includes(selectedSection) ? selectedSection : 'all';
  } catch {
    return 'all';
  }
}

function saveSelectedSection(section) {
  try {
    mkdirSync(join(rootCwd, '.turbo'), { recursive: true });
    writeFileSync(dashboardStateFile, JSON.stringify({ selectedSection: section }), 'utf8');
  } catch {
    // No-op: si no podemos persistir el estado, el dashboard sigue funcionando.
  }
}

function isErrorLine(text) {
  const normalizedText = stripAnsi(text).trim().toLowerCase();

  if (/found 0 errors?\b/.test(normalizedText)) {
    return false;
  }

  if (/\blog\s+\[routerexplorer\]\s+mapped\s+\{.*\/exceptions?\b/.test(normalizedText)) {
    return false;
  }

  return /(\berror\b|err_|\bexception\b|\bexceptionhandler\b|\bfailed\b|\beaddrinuse\b|\bunable\b|\bcannot\b|\bdenied\b)/i.test(
    normalizedText,
  );
}

function spawnCommand(command, args, options = {}) {
  return spawn(resolveCommand(command), args, {
    cwd: rootCwd,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function spawnPipedCommand(command, args, options = {}) {
  return spawn(resolveCommand(command), args, {
    cwd: rootCwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: !isWindows,
    ...options,
  });
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildObservedCommand(command, args, options = {}) {
  if (options.pseudoTty && hasScriptCommand) {
    const wrappedCommand = [resolveCommand(command), ...args].map(shellEscape).join(' ');
    return {
      command: 'script',
      args: ['-qfec', wrappedCommand, '/dev/null'],
    };
  }

  return { command, args };
}

function createDashboard() {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    return null;
  }

  const buffers = new Map(serviceSections.map((section) => [section, []]));
  const fragments = new Map(['system', ...serviceSections].map((section) => [section, '']));
  const timeline = [];
  const errorTimeline = [];
  const statuses = new Map(serviceSections.map((section) => [section, 'idle']));
  let selectedIndex = Math.max(panelSections.indexOf(loadSelectedSection()), 0);
  let active = false;
  let quitting = false;
  let renderScheduled = false;
  let quitHandler = null;

  function pushBufferedLine(collection, line) {
    collection.push(line);

    if (collection.length > maxBufferedLines) {
      collection.splice(0, collection.length - maxBufferedLines);
    }
  }

  function setSelectedSection(section) {
    const nextIndex = panelSections.indexOf(section);
    selectedIndex = nextIndex >= 0 ? nextIndex : 0;
    saveSelectedSection(panelSections[selectedIndex]);
    requestRender();
  }

  function moveSelection(delta) {
    selectedIndex = (selectedIndex + delta + panelSections.length) % panelSections.length;
    saveSelectedSection(panelSections[selectedIndex]);
    requestRender();
  }

  function render() {
    if (!active) {
      return;
    }

    renderScheduled = false;

    const columns = process.stdout.columns ?? 120;
    const rows = process.stdout.rows ?? 40;
    const sidebarWidth = Math.min(26, Math.max(18, Math.floor(columns * 0.22)));
    const contentWidth = Math.max(20, columns - sidebarWidth - 3);
    const contentHeight = Math.max(8, rows - 6);
    const selectedSection = panelSections[selectedIndex] ?? 'all';
    const runningServices = serviceSections.filter((section) => {
      const status = statuses.get(section);
      return status === 'running' || status === 'ready';
    }).length;
    const header = `iWana dev dashboard | vista: ${selectedSection}`;
    const controls = '↑↓ seleccionar  a all  e errors  q salir';

    const menuRows = [
      truncate('Servicios', sidebarWidth),
      '',
      ...panelSections.map((section) => {
        const status =
          section === 'all'
            ? 'vista'
            : section === 'errors'
              ? `${errorTimeline.length} err`
              : (statuses.get(section) ?? 'idle');
        const marker = panelSections[selectedIndex] === section ? '>' : ' ';
        const sectionText =
          panelSections[selectedIndex] === section
            ? colorize(section.padEnd(7, ' '), '1;36')
            : section.padEnd(7, ' ');
        const statusText =
          section === 'errors'
            ? colorize(status.padEnd(8, ' '), errorTimeline.length > 0 ? '31' : '90')
            : colorizeStatus(section === 'all' ? 'vista' : status, String(status).padEnd(8, ' '));
        const row = padAnsi(`${marker} ${sectionText} ${statusText}`, sidebarWidth);
        return panelSections[selectedIndex] === section ? colorize(row, '1') : row;
      }),
      '',
      truncate('Vista actual', sidebarWidth),
      truncate(selectedSection, sidebarWidth),
    ];

    const selectedLines =
      selectedSection === 'all'
        ? timeline
        : selectedSection === 'errors'
          ? errorTimeline
          : (buffers.get(selectedSection) ?? []);
    const visibleContent = selectedLines.slice(-contentHeight);
    const output = [
      '\x1b[H',
      truncate(header, columns),
      truncate(controls, columns),
      `${'-'.repeat(sidebarWidth)}-+-${'-'.repeat(contentWidth)}`,
    ];

    for (let rowIndex = 0; rowIndex < contentHeight; rowIndex += 1) {
      const left = (menuRows[rowIndex] ?? '').padEnd(sidebarWidth, ' ');
      const right = truncate(visibleContent[rowIndex] ?? '', contentWidth);
      output.push(`${left} | ${right}`);
    }

    output.push(`${'-'.repeat(sidebarWidth)}-+-${'-'.repeat(contentWidth)}`);
    output.push(
      truncate(
        `Vista ${selectedSection} | lineas ${selectedLines.length} | errores ${errorTimeline.length} | servicios activos ${runningServices}/${serviceSections.length}`,
        columns,
      ),
    );
    output.push(truncate('q cierra el dashboard y detiene los procesos activos', columns));

    while (output.length < rows) {
      output.push(' '.repeat(columns));
    }

    process.stdout.write(output.join('\n'));
  }

  function requestRender() {
    if (!active || renderScheduled) {
      return;
    }

    renderScheduled = true;
    setImmediate(render);
  }

  function recordTimeline(prefix, line) {
    const entry = `[${prefix}] ${line}`;
    pushBufferedLine(timeline, entry);

    if (isErrorLine(entry)) {
      pushBufferedLine(errorTimeline, entry);
    }
  }

  function logSystem(line) {
    recordTimeline('setup', line);
    requestRender();
  }

  function log(section, line) {
    if (!serviceSections.includes(section)) {
      logSystem(line);
      return;
    }

    const sanitizedLine = line.replace(/\t/g, '  ');
    pushBufferedLine(buffers.get(section), sanitizedLine);
    recordTimeline(section, sanitizedLine);
    requestRender();
  }

  function consumeChunk(section, chunk) {
    const normalized = normalizeChunk(chunk);
    const previous = fragments.get(section) ?? '';
    const parts = `${previous}${normalized}`.split('\n');
    const remainder = parts.pop() ?? '';

    fragments.set(section, remainder);

    for (const line of parts) {
      if (!line) {
        continue;
      }

      if (section === 'system') {
        logSystem(line);
        continue;
      }

      log(section, line);
    }
  }

  function flush(section) {
    const remainder = fragments.get(section);

    if (!remainder) {
      return;
    }

    fragments.set(section, '');

    if (section === 'system') {
      logSystem(remainder);
      return;
    }

    log(section, remainder);
  }

  function setStatus(section, status) {
    if (!serviceSections.includes(section)) {
      return;
    }

    statuses.set(section, status);
    requestRender();
  }

  function requestQuit() {
    if (quitting) {
      return;
    }

    quitting = true;
    stop();

    if (typeof quitHandler === 'function') {
      quitHandler();
      return;
    }

    process.exit(0);
  }

  function onKeypress(input, key) {
    const keyName = (key?.name ?? '').toLowerCase();
    const sequence = (key?.sequence ?? input ?? '').toLowerCase();

    if (!key && !sequence) {
      return;
    }

    if (key?.ctrl && keyName === 'c') {
      requestQuit();
      return;
    }

    if (keyName === 'q' || sequence === 'q') {
      requestQuit();
      return;
    }

    if (keyName === 'a' || sequence === 'a') {
      setSelectedSection('all');
      return;
    }

    if (keyName === 'e' || sequence === 'e') {
      setSelectedSection('errors');
      return;
    }

    if (keyName === 'up') {
      moveSelection(-1);
      return;
    }

    if (keyName === 'down') {
      moveSelection(1);
      return;
    }
  }

  function start() {
    if (active) {
      return;
    }

    active = true;
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKeypress);
    process.stdout.on('resize', requestRender);
    process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H');
    requestRender();
  }

  function stop() {
    if (!active) {
      return;
    }

    active = false;
    process.stdout.write('\x1b[?25h\x1b[0m\x1b[?1049l');

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    process.stdin.pause();

    process.stdin.off('keypress', onKeypress);
    process.stdout.off('resize', requestRender);
  }

  return {
    consumeChunk,
    flush,
    log,
    logSystem,
    setQuitHandler(handler) {
      quitHandler = handler;
    },
    setStatus,
    start,
    stop,
  };
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      reject(new Error(`${label} failed with ${reason}`));
    });
  });
}

async function runStep(label, command, args, options = {}) {
  const { dashboard, section } = options;

  if (!dashboard) {
    console.log(`\n[iWana dev] ${label}`);
    const child = spawnCommand(command, args);
    await waitForExit(child, label);
    return;
  }

  dashboard.logSystem(label);

  if (section) {
    dashboard.setStatus(section, 'starting');
  }

  const child = spawnPipedCommand(command, args);

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      dashboard.consumeChunk(section ?? 'system', chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      dashboard.consumeChunk(section ?? 'system', chunk);
    });
  }

  await waitForExit(child, label);
  dashboard.flush(section ?? 'system');

  if (section) {
    dashboard.setStatus(section, 'ready');
  }
}

async function waitForApiHealth(dashboard) {
  const url = 'http://127.0.0.1:3000/api/v1/health';
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        if (dashboard) {
          dashboard.log('api', `healthcheck OK tras ${attempt} intento(s)`);
        } else {
          console.log(`[iWana dev] API healthy after ${attempt} attempt(s)`);
        }

        return;
      }
    } catch {
      // La API puede seguir compilando; reintentamos hasta que quede lista.
    }

    await delay(1000);
  }

  throw new Error('API health check timed out at http://127.0.0.1:3000/api/v1/health');
}

function terminate(child, signal = 'SIGTERM') {
  if (!child || !child.pid) {
    return;
  }

  try {
    if (!isWindows) {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // No-op: el proceso pudo haber terminado entre el chequeo y la señal.
    }
  }
}

function spawnObservedProcess(section, command, args, dashboard, options = {}) {
  const observedCommand = buildObservedCommand(command, args, options);

  if (!dashboard) {
    const child = spawnPipedCommand(observedCommand.command, observedCommand.args);
    const prefix = `[${section}] `;

    function writeChunk(chunk) {
      const lines = normalizeChunk(chunk).split('\n');

      for (const line of lines) {
        if (!line) {
          continue;
        }

        process.stdout.write(`${prefix}${line}\n`);
      }
    }

    if (child.stdout) {
      child.stdout.on('data', writeChunk);
    }

    if (child.stderr) {
      child.stderr.on('data', writeChunk);
    }

    return child;
  }

  dashboard.setStatus(section, 'starting');
  const child = spawnPipedCommand(observedCommand.command, observedCommand.args);

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      dashboard.consumeChunk(section, chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      dashboard.consumeChunk(section, chunk);
    });
  }

  child.once('spawn', () => {
    dashboard.setStatus(section, 'running');
  });

  return child;
}

async function main() {
  const dashboard = createDashboard();
  const managedChildren = [];
  let shutdownRequested = false;

  function shutdownAll(signal = 'SIGTERM') {
    for (const child of managedChildren) {
      terminate(child, signal);
    }
  }

  dashboard?.setQuitHandler(() => {
    if (shutdownRequested) {
      return;
    }

    shutdownRequested = true;
    shutdownAll('SIGTERM');

    // Fallback: devolver el prompt aunque algun hijo ignore SIGTERM.
    setTimeout(() => {
      shutdownAll('SIGKILL');
      process.exit(0);
    }, 800);
  });

  dashboard?.start();
  dashboard?.logSystem('Inicializando entorno de desarrollo');

  await runStep('Liberando puertos de desarrollo', 'pnpm', ['dev:free-ports'], { dashboard });

  await runStep(
    'Levantando infraestructura Docker local',
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.yml',
      'up',
      '-d',
      'postgres',
      'redis',
      'pgbouncer',
      'minio',
      'nginx',
      'adminer',
    ],
    { dashboard, section: 'docker' },
  );

  await runStep('Estado de la infraestructura Docker', 'docker', ['compose', 'ps'], {
    dashboard,
    section: 'docker',
  });

  await runStep('Compilando @iwana/shared', 'pnpm', ['--filter', '@iwana/shared', 'build'], {
    dashboard,
  });

  await runStep('Ejecutando migraciones', 'pnpm', ['db:migrate:all'], { dashboard });

  dashboard?.logSystem('Iniciando API en modo watch');
  const apiChild = spawnObservedProcess(
    'api',
    'pnpm',
    ['--filter', '@iwana/api', 'dev'],
    dashboard,
    { pseudoTty: true },
  );
  managedChildren.push(apiChild);

  const shutdown = (signal) => {
    shutdownAll(signal);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await waitForApiHealth(dashboard);
  } catch (error) {
    terminate(apiChild, 'SIGTERM');
    throw error;
  }

  dashboard?.setStatus('api', 'running');
  dashboard?.logSystem('Iniciando web, portal y worker');

  const webChild = spawnObservedProcess(
    'web',
    'pnpm',
    ['--filter', '@iwana/web', 'dev'],
    dashboard,
  );
  const portalChild = spawnObservedProcess(
    'portal',
    'pnpm',
    ['--filter', '@iwana/portal', 'dev'],
    dashboard,
  );
  const workerChild = spawnObservedProcess(
    'worker',
    'pnpm',
    ['--filter', '@iwana/worker', 'dev'],
    dashboard,
    { pseudoTty: true },
  );
  managedChildren.push(webChild, portalChild, workerChild);

  const children = [
    ['api', apiChild],
    ['web', webChild],
    ['portal', portalChild],
    ['worker', workerChild],
  ];

  function exitPromiseFor(name, child) {
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        dashboard?.flush(name);

        if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
          dashboard?.setStatus(name, 'stopped');
          resolve({ source: name, code: code ?? 0, signal });
          return;
        }

        dashboard?.setStatus(name, 'failed');
        reject(new Error(`${name} dev process exited unexpectedly with ${signal ?? code}`));
      });
    });
  }

  try {
    await Promise.race(children.map(([name, child]) => exitPromiseFor(name, child)));
  } finally {
    shutdownAll('SIGTERM');

    dashboard?.stop();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[iWana dev] ${message}`);
  process.exitCode = 1;
});
