import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  buildFrame,
  classifyLine,
  clipText,
  createDashboard,
  createTheme,
  diffFrames,
  displayWidth,
  formatElapsed,
  formatUptime,
  panelSections,
  stripAnsi,
  visibleWindow,
} from './dev-dashboard.mjs';

const plainTheme = createTheme({ NO_COLOR: '1' }, { platform: 'linux' });
const baseTime = new Date(2026, 10, 9, 10, 42, 7).getTime();

function entry(text, overrides = {}) {
  return { ts: baseTime, section: 'api', text, level: 'info', ...overrides };
}

function buildState(overrides = {}) {
  return {
    selectedSection: 'api',
    statuses: {
      api: 'ready',
      web: 'running',
      portal: 'starting',
      worker: 'waiting_api',
      docker: 'ready',
    },
    since: { api: baseTime - 125_000, web: baseTime - 61_000 },
    lines: [],
    errorCount: 0,
    scrollOffset: 0,
    unseen: 0,
    filter: '',
    filterEditing: false,
    notice: '',
    spinnerFrame: 0,
    startedAt: baseTime - 134_000,
    startup: {
      total: 9,
      done: 9,
      startedAt: baseTime - 134_000,
      finishedAt: baseTime - 86_000,
      failed: false,
      current: '',
    },
    ...overrides,
  };
}

function createFakeTerminal({ columns = 100, rows = 20 } = {}) {
  const stdout = new EventEmitter();
  const stdin = new EventEmitter();
  const writes = [];

  Object.assign(stdout, {
    isTTY: true,
    columns,
    rows,
    write(chunk) {
      writes.push(String(chunk));
      return true;
    },
  });
  Object.assign(stdin, { isTTY: true, setRawMode() {}, resume() {}, pause() {} });

  return {
    stdout,
    stdin,
    writes,
    // Reconstruye la pantalla aplicando los parches por fila, igual que la terminal.
    screen() {
      const screen = [];

      for (const chunk of writes) {
        for (const match of chunk.matchAll(
          /\x1b\[(\d+);1H([^]*?)(?=\x1b\[\d+;1H|\x1b\[\?2026l|$)/g,
        )) {
          screen[Number(match[1]) - 1] = stripAnsi(match[2]);
        }
      }

      return screen;
    },
  };
}

function startDashboard(terminal, extra = {}) {
  let now = baseTime;
  const dashboard = createDashboard({
    stdout: terminal.stdout,
    stdin: terminal.stdin,
    stateFile: null,
    theme: plainTheme,
    now: () => now,
    ...extra,
  });

  dashboard.start();
  return {
    dashboard,
    advance(milliseconds) {
      now += milliseconds;
    },
  };
}

test('createTheme respeta NO_COLOR y no emite secuencias ANSI', () => {
  assert.equal(plainTheme.level, 'none');
  assert.equal(plainTheme.paint('iWana', { fg: 'accent', bold: true }), 'iWana');
});

test('createTheme usa los colores de marca en truecolor', () => {
  const theme = createTheme({ COLORTERM: 'truecolor' }, { platform: 'linux' });

  assert.equal(theme.level, 'truecolor');
  // Lima #a5c330 como acento e índigo #17163a como fondo de barra.
  assert.equal(theme.paint('x', { fg: 'accent' }), '\x1b[38;2;165;195;48mx\x1b[0m');
  assert.equal(theme.paint('x', { bg: 'primary' }), '\x1b[48;2;23;22;58mx\x1b[0m');
});

test('createTheme degrada a 256 y a 16 colores según la terminal', () => {
  assert.equal(createTheme({ TERM: 'xterm-256color' }, { platform: 'linux' }).level, '256');
  assert.equal(createTheme({ TERM: 'xterm' }, { platform: 'linux' }).level, '16');
  assert.equal(createTheme({ TERM: 'dumb' }, { platform: 'linux' }).level, 'none');
  assert.equal(createTheme({}, { platform: 'win32' }).level, 'truecolor');
});

test('classifyLine distingue error, aviso e información', () => {
  assert.equal(classifyLine('Build failed'), 'error');
  assert.equal(classifyLine('WARN [Config] valor por defecto'), 'warn');
  assert.equal(classifyLine('DeprecationWarning: punycode'), 'warn');
  assert.equal(classifyLine('Found 0 errors. Watching for file changes.'), 'info');
});

test('clipText recorta por ancho de pantalla y conserva el ancho exacto', () => {
  assert.equal(clipText('corto', 10), 'corto');
  assert.equal(clipText('abcdefghij', 5), 'abcd…');
  assert.equal(displayWidth(clipText('日本語のログ', 5)), 5);
  assert.equal(clipText('abc', 0), '');
});

test('formatElapsed y formatUptime dan textos compactos', () => {
  assert.equal(formatElapsed(134_000), '02:14');
  assert.equal(formatElapsed(3_725_000), '1:02:05');
  assert.equal(formatUptime(42_000), '42s');
  assert.equal(formatUptime(125_000), '2m');
  assert.equal(formatUptime(3_900_000), '1h05');
});

test('visibleWindow sigue el final cuando no hay desplazamiento', () => {
  const lines = Array.from({ length: 10 }, (_, index) => entry(`linea ${index}`));
  const view = visibleWindow(lines, { height: 3 });

  assert.deepEqual(
    view.rows.map((row) => row.text),
    ['linea 7', 'linea 8', 'linea 9'],
  );
  assert.equal(view.offset, 0);
  assert.equal(view.maxOffset, 7);
});

test('visibleWindow desplaza hacia atrás y acota el desplazamiento', () => {
  const lines = Array.from({ length: 10 }, (_, index) => entry(`linea ${index}`));

  assert.deepEqual(
    visibleWindow(lines, { height: 3, scrollOffset: 4 }).rows.map((row) => row.text),
    ['linea 3', 'linea 4', 'linea 5'],
  );

  const clamped = visibleWindow(lines, { height: 3, scrollOffset: 999 });
  assert.equal(clamped.offset, 7);
  assert.equal(clamped.rows[0].text, 'linea 0');
});

test('visibleWindow filtra sin distinguir mayúsculas, por texto o por servicio', () => {
  const lines = [
    entry('Nest application successfully started'),
    entry('compiled /dashboard', { section: 'portal' }),
    entry('GET /health 200'),
  ];

  assert.equal(visibleWindow(lines, { height: 5, filter: 'NEST' }).total, 1);
  assert.equal(visibleWindow(lines, { height: 5, filter: 'portal' }).rows[0].section, 'portal');
  assert.equal(visibleWindow(lines, { height: 5, filter: '  ' }).total, 3);
});

for (const [columns, rows] of [
  [200, 50],
  [100, 30],
  [80, 24],
  [60, 16],
  [40, 10],
]) {
  test(`buildFrame llena exactamente ${columns}×${rows}`, () => {
    const state = buildState({
      lines: [entry('Nest application successfully started'), entry('x'.repeat(400))],
    });
    const frame = buildFrame(state, { columns, rows, theme: plainTheme, now: baseTime });

    assert.equal(frame.length, rows);

    for (const row of frame) {
      assert.equal(displayWidth(row), columns, JSON.stringify(row));
    }
  });
}

test('buildFrame muestra marca, estados traducidos y contadores', () => {
  const frame = buildFrame(buildState({ lines: [entry('healthcheck OK tras 2 intento(s)')] }), {
    columns: 110,
    rows: 24,
    theme: plainTheme,
    now: baseTime,
  });
  const text = frame.join('\n');

  assert.match(frame[0], /iWana neXt · dev/);
  // api, web y docker están arriba; portal arranca y worker espera a la API.
  assert.match(frame[0], /3\/5 activos · 0 errores · 02:14/);
  assert.match(text, /▌ 3 api {5}● listo 2m/);
  assert.match(text, /4 web {5}● activo 1m/);
  assert.match(text, /5 portal {2}⠋ iniciando/);
  assert.match(text, /6 worker {2}◌ en espera/);
  assert.match(text, /Arranque ✔ 00:48/);
  assert.match(text, /api {4}127\.0\.0\.1:3000/);
  assert.match(text, /10:42:07 healthcheck OK tras 2 intento\(s\)/);
  assert.match(frame[1], /1 línea · siguiendo/);
  assert.match(frame.at(-1), /r reiniciar/);
});

test('buildFrame etiqueta el servicio en las vistas agregadas', () => {
  const state = buildState({
    selectedSection: 'all',
    lines: [entry('compiled', { section: 'portal' })],
  });
  const frame = buildFrame(state, { columns: 100, rows: 12, theme: plainTheme, now: baseTime });

  assert.match(frame[2], /10:42:07 portal {2}compiled/);
});

test('buildFrame pinta errores y avisos con los colores semánticos', () => {
  const theme = createTheme({ COLORTERM: 'truecolor' }, { platform: 'linux' });
  const state = buildState({
    lines: [entry('Build failed', { level: 'error' }), entry('WARN lento', { level: 'warn' })],
  });
  const frame = buildFrame(state, { columns: 100, rows: 12, theme, now: baseTime });

  assert.ok(frame[2].includes('\x1b[38;2;239;68;68mBuild failed'));
  assert.ok(frame[3].includes('\x1b[38;2;245;158;11mWARN lento'));
});

test('buildFrame indica pausa, líneas nuevas y filtro activo', () => {
  const lines = Array.from({ length: 40 }, (_, index) => entry(`linea ${index}`));
  const frame = buildFrame(buildState({ lines, scrollOffset: 10, unseen: 3, filter: 'linea' }), {
    columns: 120,
    rows: 12,
    theme: plainTheme,
    now: baseTime,
  });

  assert.match(frame[1], /api · \/linea/);
  assert.match(frame[1], /pausado · 3 nuevas · End para seguir/);
});

test('buildFrame muestra el progreso del arranque y el campo de búsqueda', () => {
  const state = buildState({
    filter: 'nest',
    filterEditing: true,
    startup: {
      total: 9,
      done: 4,
      startedAt: baseTime - 12_000,
      finishedAt: null,
      failed: false,
      current: 'Ejecutando migraciones',
    },
  });
  const frame = buildFrame(state, { columns: 110, rows: 24, theme: plainTheme, now: baseTime });
  const text = frame.join('\n');

  assert.match(text, /Arranque ⠋ 4\/9 00:12/);
  assert.match(text, /Ejecutando migraciones/);
  assert.match(frame.at(-1), /\/ nest▏/);
  assert.match(text, /Sin coincidencias para «nest»\./);
});

test('diffFrames reescribe solo las filas que cambian', () => {
  const previous = ['aaa', 'bbb', 'ccc'];

  assert.equal(diffFrames(previous, ['aaa', 'bbb', 'ccc']), '');
  assert.equal(diffFrames(previous, ['aaa', 'BBB', 'ccc']), '\x1b[2;1HBBB');
  assert.equal(diffFrames(null, ['a', 'b']), '\x1b[1;1Ha\x1b[2;1Hb');
  // Un cambio de tamaño invalida el frame anterior completo.
  assert.equal(diffFrames(previous, ['aaa', 'bbb']), '\x1b[1;1Haaa\x1b[2;1Hbbb');
});

test('createDashboard devuelve null sin TTY para conservar la salida en línea', () => {
  const terminal = createFakeTerminal();
  terminal.stdout.isTTY = false;

  assert.equal(
    createDashboard({ stdout: terminal.stdout, stdin: terminal.stdin, stateFile: null }),
    null,
  );
});

test('el dashboard repinta solo las filas afectadas por una línea nueva', () => {
  const terminal = createFakeTerminal();
  const { dashboard, advance } = startDashboard(terminal);

  dashboard.handleKey('3', { name: '3', sequence: '3' });
  terminal.writes.length = 0;
  advance(1000);
  dashboard.log('api', 'Nest application successfully started');
  dashboard.handleKey('', { name: 'f24', sequence: '' });
  dashboard.handleKey('3', { name: '3', sequence: '3' });

  const patched = terminal.writes.join('').match(/\x1b\[\d+;1H/g) ?? [];

  // Cabecera (reloj), regla superior (conteo de líneas), la fila del log y la
  // fila del progreso de arranque: nunca la pantalla entera.
  assert.ok(patched.length > 0 && patched.length <= 4, `filas repintadas: ${patched.length}`);
  assert.match(terminal.screen()[2], /Nest application successfully started/);
  dashboard.stop();
});

test('el dashboard cambia de vista con atajos y clasifica los errores', () => {
  const terminal = createFakeTerminal();
  const { dashboard } = startDashboard(terminal);

  dashboard.log('worker', 'Job failed: timeout');
  dashboard.log('api', 'todo en orden');
  dashboard.handleKey('e', { name: 'e', sequence: 'e' });

  const screen = terminal.screen();
  assert.match(screen[1], /errores/);
  assert.match(screen[2], /worker {2}Job failed: timeout/);
  assert.doesNotMatch(screen.join('\n'), /todo en orden/);
  assert.match(screen[0], /1 error /);
  dashboard.stop();
});

test('el dashboard pausa el seguimiento al desplazarse y lo retoma con End', () => {
  const terminal = createFakeTerminal({ rows: 10 });
  const { dashboard } = startDashboard(terminal);

  dashboard.handleKey('3', { name: '3', sequence: '3' });

  for (let index = 0; index < 30; index += 1) {
    dashboard.log('api', `linea ${index}`);
  }

  dashboard.handleKey('', { name: 'pageup', sequence: '' });
  dashboard.log('api', 'linea nueva');
  dashboard.handleKey('', { name: 'k', sequence: 'k' });

  let screen = terminal.screen();
  assert.match(screen[1], /pausado · 1 nueva · End para seguir/);
  assert.doesNotMatch(screen.join('\n'), /linea nueva/);

  dashboard.handleKey('', { name: 'end', sequence: '' });
  screen = terminal.screen();
  assert.match(screen[1], /31 líneas · siguiendo/);
  assert.match(screen.join('\n'), /linea nueva/);
  dashboard.stop();
});

test('el dashboard filtra mientras se escribe y Esc limpia el filtro', () => {
  const terminal = createFakeTerminal();
  const { dashboard } = startDashboard(terminal);

  dashboard.handleKey('3', { name: '3', sequence: '3' });
  dashboard.log('api', 'GET /health 200');
  dashboard.log('api', 'POST /login 401');
  dashboard.handleKey('/', { sequence: '/' });

  // Dentro del campo de búsqueda las letras no disparan atajos (q no sale).
  for (const char of 'Q401') {
    dashboard.handleKey(char, { name: char.toLowerCase(), sequence: char });
  }

  dashboard.handleKey('', { name: 'backspace', sequence: '\x7f' });
  dashboard.handleKey('', { name: 'backspace', sequence: '\x7f' });
  dashboard.handleKey('', { name: 'backspace', sequence: '\x7f' });
  dashboard.handleKey('', { name: 'backspace', sequence: '\x7f' });

  for (const char of '401') {
    dashboard.handleKey(char, { name: char, sequence: char });
  }

  dashboard.handleKey('\r', { name: 'return', sequence: '\r' });

  let screen = terminal.screen();
  assert.match(screen[1], /api · \/401/);
  assert.match(screen[2], /POST \/login 401/);
  assert.doesNotMatch(screen.join('\n'), /GET \/health/);

  dashboard.handleKey('', { name: 'escape', sequence: '\x1b' });
  screen = terminal.screen();
  assert.match(screen.join('\n'), /GET \/health 200/);
  dashboard.stop();
});

test('r reinicia el servicio seleccionado y avisa si la vista no es reiniciable', () => {
  const terminal = createFakeTerminal();
  const { dashboard } = startDashboard(terminal);
  const restarted = [];

  dashboard.setRestartHandler((section) => restarted.push(section));
  dashboard.handleKey('1', { name: '1', sequence: '1' });
  dashboard.handleKey('r', { name: 'r', sequence: 'r' });
  assert.deepEqual(restarted, []);
  assert.match(terminal.screen().at(-1), /Selecciona api, web, portal o worker/);

  dashboard.handleKey('5', { name: '5', sequence: '5' });
  dashboard.handleKey('r', { name: 'r', sequence: 'r' });
  assert.deepEqual(restarted, ['portal']);
  dashboard.stop();
});

test('c limpia solo la vista actual', () => {
  const terminal = createFakeTerminal();
  const { dashboard } = startDashboard(terminal);

  dashboard.log('api', 'linea de api');
  dashboard.handleKey('3', { name: '3', sequence: '3' });
  dashboard.handleKey('c', { name: 'c', sequence: 'c' });
  assert.doesNotMatch(terminal.screen().join('\n'), /linea de api/);

  dashboard.handleKey('a', { name: 'a', sequence: 'a' });
  assert.match(terminal.screen().join('\n'), /linea de api/);
  dashboard.stop();
});

test('q restaura la terminal e invoca el manejador de salida una sola vez', () => {
  const terminal = createFakeTerminal();
  const { dashboard } = startDashboard(terminal);
  let quits = 0;

  dashboard.setQuitHandler(() => {
    quits += 1;
  });
  dashboard.handleKey('q', { name: 'q', sequence: 'q' });
  dashboard.handleKey('q', { name: 'q', sequence: 'q' });

  assert.equal(quits, 1);
  assert.ok(terminal.writes.at(-1).includes('\x1b[?1049l'));
});

test('las vistas del dashboard conservan el orden y los atajos numéricos', () => {
  assert.deepEqual(panelSections, ['all', 'errors', 'api', 'web', 'portal', 'worker', 'docker']);
});
