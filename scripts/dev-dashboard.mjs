// Dashboard de terminal de `pnpm dev`.
//
// Node puro, sin dependencias: el arranque de desarrollo no debe cargar una
// librería TUI ni ampliar la superficie de `pnpm audit`. La composición del
// frame (`buildFrame`), el recorte de la ventana de logs (`visibleWindow`), el
// diff entre frames (`diffFrames`) y el tema (`createTheme`) son funciones puras
// para poder probarlas sin una terminal real.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { emitKeypressEvents } from 'node:readline';

export const panelSections = ['all', 'errors', 'api', 'web', 'portal', 'worker', 'docker'];
export const serviceSections = panelSections.filter(
  (section) => !['all', 'errors'].includes(section),
);
// Servicios que el orquestador lanza como proceso propio y puede reiniciar.
// `docker` queda fuera: es infraestructura de Compose, no un hijo de larga duración.
export const restartableSections = ['api', 'web', 'portal', 'worker'];

const maxBufferedLines = 1200;
const frameIntervalMs = 33;
const tickIntervalMs = 100;
const stateSaveDelayMs = 300;
const noticeDurationMs = 3500;
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const sectionLabels = {
  all: 'todo',
  errors: 'errores',
  api: 'api',
  web: 'web',
  portal: 'portal',
  worker: 'worker',
  docker: 'docker',
};

const serviceUrls = [
  ['api', '127.0.0.1:3000'],
  ['web', 'localhost:3001'],
  ['portal', 'localhost:3002'],
];

// Los identificadores internos de estado no cambian; solo su texto visible.
const statusPresentation = {
  idle: { label: 'inactivo', glyph: '○', role: 'muted' },
  starting: { label: 'iniciando', spinner: true, role: 'warning' },
  restarting: { label: 'reiniciando', spinner: true, role: 'warning' },
  waiting_api: { label: 'en espera', glyph: '◌', role: 'warning' },
  running: { label: 'activo', glyph: '●', role: 'success' },
  ready: { label: 'listo', glyph: '●', role: 'success' },
  stopped: { label: 'detenido', glyph: '■', role: 'muted' },
  failed: { label: 'falló', glyph: '✖', role: 'error' },
};

const animatedStatuses = new Set(['starting', 'restarting', 'waiting_api']);

// Paleta tomada de los tokens de `packages/ui/src/styles/globals.css`
// (`--color-iwana-*`). El índigo primario es ilegible como texto sobre una
// terminal oscura: se usa solo como fondo de barras; el lima es el acento.
// `c256` y `fg16`/`bg16` son la degradación para terminales sin truecolor.
const palette = {
  primary: { rgb: [0x17, 0x16, 0x3a], c256: 17, fg16: 34, bg16: 44 },
  selection: { rgb: [0x34, 0x2e, 0x52], c256: 237, fg16: 90, bg16: null },
  accent: { rgb: [0xa5, 0xc3, 0x30], c256: 148, fg16: 92, bg16: 42 },
  border: { rgb: [0x7b, 0x75, 0xab], c256: 103, fg16: 90, bg16: null },
  barText: { rgb: [0xf8, 0xf8, 0xfb], c256: 255, fg16: 97, bg16: null },
  barMuted: { rgb: [0xa8, 0xa4, 0xc8], c256: 146, fg16: 37, bg16: null },
  text: { rgb: [0xe4, 0xe4, 0xe4], c256: 253, fg16: 37, bg16: null },
  muted: { rgb: [0x8a, 0x8a, 0x8a], c256: 245, fg16: 90, bg16: null },
  success: { rgb: [0x22, 0xc5, 0x5e], c256: 41, fg16: 32, bg16: null },
  warning: { rgb: [0xf5, 0x9e, 0x0b], c256: 214, fg16: 33, bg16: null },
  error: { rgb: [0xef, 0x44, 0x44], c256: 203, fg16: 31, bg16: null },
  info: { rgb: [0x3b, 0x82, 0xf6], c256: 69, fg16: 34, bg16: null },
  lavender: { rgb: [0xa8, 0xa4, 0xc8], c256: 146, fg16: 35, bg16: null },
  silver: { rgb: [0xd1, 0xd1, 0xd1], c256: 252, fg16: 37, bg16: null },
};

const tagRoles = {
  setup: 'muted',
  api: 'accent',
  web: 'info',
  portal: 'lavender',
  worker: 'silver',
  docker: 'border',
};

export function stripAnsi(text) {
  return String(text)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function normalizeChunk(chunk) {
  return stripAnsi(String(chunk)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Un carácter de control crudo en un log desplazaría el cursor y rompería el frame.
function sanitizeLine(line) {
  return String(line)
    .replace(/\t/g, '  ')
    .replace(/[\x00-\x1f\x7f]/g, '');
}

export function isErrorLine(text) {
  const normalizedText = stripAnsi(text).trim().toLowerCase();

  if (/found 0 errors?\b/.test(normalizedText)) {
    return false;
  }

  if (/\blog\s+\[routerexplorer\]\s+mapped\s+\{.*\/exceptions?\b/.test(normalizedText)) {
    return false;
  }

  // Los resúmenes de migración/backfill reportan conteos (`failed=0`), no un
  // error: sin este caso, `failed=0` entraba al panel de errores del dashboard.
  // `failed=<n>` con n > 0 sigue marcándose.
  return /(\berror\b|err_|\bexception\b|\bexceptionhandler\b|\bfailed\b(?!\s*=\s*0\b)|\beaddrinuse\b|\bunable\b|\bcannot\b|\bdenied\b)/i.test(
    normalizedText,
  );
}

export function classifyLine(text) {
  if (isErrorLine(text)) {
    return 'error';
  }

  if (/(\bwarn(?:ing)?\b|\bdeprecat\w*|⚠)/i.test(stripAnsi(text))) {
    return 'warn';
  }

  return 'info';
}

function charWidth(codePoint) {
  if (
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
  ) {
    return 0;
  }

  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  ) {
    return 2;
  }

  return 1;
}

export function displayWidth(text) {
  let width = 0;

  for (const char of String(text)) {
    width += charWidth(char.codePointAt(0));
  }

  return width;
}

// Recorta a un ancho de pantalla exacto, con elipsis si el texto no cabe.
export function clipText(text, width) {
  if (width <= 0) {
    return '';
  }

  if (displayWidth(text) <= width) {
    return text;
  }

  let result = '';
  let used = 0;

  for (const char of String(text)) {
    const next = charWidth(char.codePointAt(0));

    if (used + next > width - 1) {
      break;
    }

    result += char;
    used += next;
  }

  return `${result}…${' '.repeat(width - used - 1)}`;
}

function detectColorLevel(env, platform) {
  if (env.NO_COLOR) {
    return 'none';
  }

  if (env.TERM === 'dumb') {
    return 'none';
  }

  if (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? '')) {
    return 'truecolor';
  }

  if (env.WT_SESSION || ['vscode', 'iTerm.app', 'WezTerm', 'ghostty'].includes(env.TERM_PROGRAM)) {
    return 'truecolor';
  }

  // conhost admite color de 24 bits desde Windows 10 1703.
  if (platform === 'win32') {
    return 'truecolor';
  }

  if (/256/.test(env.TERM ?? '')) {
    return '256';
  }

  return '16';
}

export function createTheme(env = process.env, options = {}) {
  const level = detectColorLevel(env, options.platform ?? process.platform);

  function colorCode(role, background) {
    const entry = palette[role];

    if (!entry) {
      return null;
    }

    if (level === 'truecolor') {
      return `${background ? 48 : 38};2;${entry.rgb.join(';')}`;
    }

    if (level === '256') {
      return `${background ? 48 : 38};5;${entry.c256}`;
    }

    const code = background ? entry.bg16 : entry.fg16;
    return code === null ? null : String(code);
  }

  function paint(text, style) {
    if (level === 'none' || !style || text === '') {
      return text;
    }

    const codes = [];

    if (style.bold) {
      codes.push('1');
    }

    for (const [role, background] of [
      [style.fg, false],
      [style.bg, true],
    ]) {
      const code = role ? colorCode(role, background) : null;

      if (code) {
        codes.push(code);
      }
    }

    return codes.length > 0 ? `\x1b[${codes.join(';')}m${text}\x1b[0m` : text;
  }

  return { level, paint };
}

function seg(text, style) {
  return { text, style };
}

function segmentsWidth(segments) {
  return segments.reduce((total, segment) => total + displayWidth(segment.text), 0);
}

// Pinta segmentos a un ancho exacto: recorta el que desborda y rellena el resto.
function renderSegments(segments, width, theme, base) {
  let remaining = width;
  let output = '';

  for (const segment of segments) {
    if (remaining <= 0) {
      break;
    }

    const style = base ? { ...base, ...segment.style } : segment.style;
    const segmentWidth = displayWidth(segment.text);

    if (segmentWidth <= remaining) {
      output += theme.paint(segment.text, style);
      remaining -= segmentWidth;
      continue;
    }

    output += theme.paint(clipText(segment.text, remaining), style);
    remaining = 0;
  }

  if (remaining > 0) {
    output += theme.paint(' '.repeat(remaining), base);
  }

  return output;
}

// Izquierda + derecha a un ancho exacto; la derecha se omite si no cabe.
function renderSplit(leftSegments, rightSegments, width, theme, base) {
  const rightWidth = segmentsWidth(rightSegments);

  if (rightWidth === 0 || segmentsWidth(leftSegments) + rightWidth > width) {
    return renderSegments(leftSegments, width, theme, base);
  }

  return (
    renderSegments(leftSegments, width - rightWidth, theme, base) +
    renderSegments(rightSegments, rightWidth, theme, base)
  );
}

function ruleSegments(width, leftSegments, rightSegments = []) {
  const border = { fg: 'border' };
  const left =
    leftSegments.length > 0 ? [seg('─ ', border), ...leftSegments, seg(' ', border)] : [];
  let right =
    rightSegments.length > 0 ? [seg(' ', border), ...rightSegments, seg(' ─', border)] : [];

  if (segmentsWidth(left) + segmentsWidth(right) > width) {
    right = [];
  }

  const fill = Math.max(0, width - segmentsWidth(left) - segmentsWidth(right));
  return [...left, seg('─'.repeat(fill), border), ...right];
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function formatClock(timestamp) {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`;
}

export function formatUptime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  return `${Math.floor(totalMinutes / 60)}h${pad2(totalMinutes % 60)}`;
}

function matchesFilter(entry, needle) {
  return entry.text.toLowerCase().includes(needle) || entry.section.toLowerCase().includes(needle);
}

export function filterLines(lines, filter) {
  const needle = (filter ?? '').trim().toLowerCase();
  return needle ? lines.filter((entry) => matchesFilter(entry, needle)) : lines;
}

// `scrollOffset` cuenta líneas desde el final: 0 significa «siguiendo».
export function visibleWindow(lines, { height, scrollOffset = 0, filter = '' }) {
  const filtered = filterLines(lines, filter);
  const maxOffset = Math.max(0, filtered.length - height);
  const offset = Math.min(Math.max(0, scrollOffset), maxOffset);
  const end = filtered.length - offset;

  return {
    rows: filtered.slice(Math.max(0, end - height), end),
    total: filtered.length,
    offset,
    maxOffset,
  };
}

function placeholderFor(section, status, filter) {
  if (filter) {
    return `Sin coincidencias para «${filter}».`;
  }

  if (section === 'errors') {
    return 'Sin errores capturados por ahora.';
  }

  if (section === 'all') {
    return 'Esperando eventos del orquestador…';
  }

  const placeholderByStatus = {
    idle: `Esperando que ${section} entre en la secuencia de arranque.`,
    starting: `${section} se está iniciando. Los logs aparecerán aquí.`,
    restarting: `${section} se está reiniciando. Los logs aparecerán aquí.`,
    waiting_api: `${section} está en espera hasta que la API responda healthcheck OK.`,
    running: `${section} está corriendo. Los nuevos logs aparecerán aquí.`,
    ready: `${section} está listo. Los nuevos logs aparecerán aquí.`,
    stopped: `${section} se detuvo. Pulsa r para iniciarlo de nuevo.`,
    failed: `${section} falló. Revisa la vista errores o pulsa r para reiniciarlo.`,
  };

  return placeholderByStatus[status] ?? `${section} sin salida registrada aún.`;
}

function sidebarLayoutWidth(columns) {
  if (columns >= 96) {
    return 28;
  }

  if (columns >= 70) {
    return 24;
  }

  return columns >= 48 ? 18 : 0;
}

function buildSidebarRows(state, now, spinner) {
  const rows = panelSections.map((section, index) => {
    const selected = state.selectedSection === section;
    const base = selected ? { bg: 'selection' } : undefined;
    const segments = [
      seg(selected ? '▌' : ' ', { fg: 'accent' }),
      seg(` ${index + 1} `, { fg: 'muted' }),
      seg(
        sectionLabels[section].padEnd(8, ' '),
        selected ? { fg: 'accent', bold: true } : { fg: 'text' },
      ),
    ];

    if (section === 'errors') {
      segments.push(
        seg(String(state.errorCount), {
          fg: state.errorCount > 0 ? 'error' : 'muted',
          bold: state.errorCount > 0,
        }),
      );
    } else if (section !== 'all') {
      const status = state.statuses[section] ?? 'idle';
      const presentation = statusPresentation[status] ?? statusPresentation.idle;
      const style = { fg: presentation.role };

      segments.push(seg(presentation.spinner ? spinner : presentation.glyph, style));
      segments.push(seg(` ${presentation.label}`, style));

      const since = state.since[section];

      if (
        restartableSections.includes(section) &&
        (status === 'running' || status === 'ready') &&
        typeof since === 'number'
      ) {
        segments.push(seg(` ${formatUptime(now - since)}`, { fg: 'muted' }));
      }
    }

    return { segments, base };
  });

  const startup = state.startup;
  rows.push({ segments: [] });

  if (startup.failed) {
    rows.push({
      segments: [seg(' Arranque ', { fg: 'muted' }), seg('✖ falló', { fg: 'error' })],
    });
  } else if (typeof startup.finishedAt === 'number') {
    rows.push({
      segments: [
        seg(' Arranque ', { fg: 'muted' }),
        seg('✔', { fg: 'success' }),
        seg(` ${formatElapsed(startup.finishedAt - startup.startedAt)}`, { fg: 'text' }),
      ],
    });
  } else {
    rows.push({
      segments: [
        seg(' Arranque ', { fg: 'muted' }),
        seg(spinner, { fg: 'warning' }),
        seg(` ${startup.done}/${startup.total}`, { fg: 'text' }),
        seg(` ${formatElapsed(now - startup.startedAt)}`, { fg: 'muted' }),
      ],
    });

    if (startup.current) {
      rows.push({ segments: [seg(` ${startup.current}`, { fg: 'muted' })] });
    }
  }

  rows.push({ segments: [] });

  for (const [section, url] of serviceUrls) {
    const status = state.statuses[section];
    const live = status === 'running' || status === 'ready';

    rows.push({
      segments: [
        seg(` ${section.padEnd(7, ' ')}`, { fg: live ? 'text' : 'muted' }),
        seg(url, { fg: live ? 'accent' : 'muted' }),
      ],
    });
  }

  return rows;
}

function buildContentSegments(entry, showTag) {
  const segments = [seg(`${formatClock(entry.ts)} `, { fg: 'muted' })];

  if (showTag) {
    segments.push(
      seg(`${entry.section.padEnd(7, ' ')} `, { fg: tagRoles[entry.section] ?? 'muted' }),
    );
  }

  const style =
    entry.level === 'error'
      ? { fg: 'error' }
      : entry.level === 'warn'
        ? { fg: 'warning' }
        : undefined;
  segments.push(seg(entry.text, style));
  return segments;
}

function buildFooter(state, columns, theme) {
  const base = { bg: 'primary', fg: 'barMuted' };

  if (state.filterEditing) {
    return renderSplit(
      [seg(' / ', { fg: 'accent', bold: true }), seg(`${state.filter}▏`, { fg: 'barText' })],
      [seg('Enter aplicar · Esc cancelar ', {})],
      columns,
      theme,
      base,
    );
  }

  if (state.notice) {
    return renderSegments([seg(` ${state.notice}`, { fg: 'warning' })], columns, theme, base);
  }

  const hints = [
    ['↑↓', 'vista'],
    ['1-7', 'directo'],
    ['PgUp/PgDn', 'scroll'],
    ['/', 'buscar'],
    ['r', 'reiniciar'],
    ['c', 'limpiar'],
    ['q', 'salir'],
  ];
  const segments = [seg(' ', {})];

  for (const [key, description] of hints) {
    segments.push(seg(key, { fg: 'accent', bold: true }));
    segments.push(seg(` ${description}  `, {}));
  }

  return renderSegments(segments, columns, theme, base);
}

// Devuelve exactamente `rows` cadenas, cada una de ancho de pantalla `columns`.
export function buildFrame(state, { columns, rows, theme, now }) {
  const spinner = spinnerFrames[state.spinnerFrame % spinnerFrames.length];
  const bodyHeight = Math.max(1, rows - 4);
  const sidebarWidth = sidebarLayoutWidth(columns);
  const hasSidebar = sidebarWidth > 0;
  // Bordes verticales (3 con barra lateral, 2 sin ella) más un espacio de
  // margen a cada lado del panel de contenido.
  const contentWidth = Math.max(1, columns - sidebarWidth - (hasSidebar ? 5 : 4));
  const border = (text) => theme.paint(text, { fg: 'border' });
  const selectedSection = state.selectedSection;
  const view = visibleWindow(state.lines, {
    height: bodyHeight,
    scrollOffset: state.scrollOffset,
    filter: state.filter,
  });
  const runningServices = serviceSections.filter((section) => {
    const status = state.statuses[section];
    return status === 'running' || status === 'ready';
  }).length;
  const barBase = { bg: 'primary', fg: 'barText' };

  const header = renderSplit(
    [
      seg(' ', {}),
      seg('▌', { fg: 'accent' }),
      seg('iWana', { bold: true }),
      seg(' neXt', { fg: 'accent', bold: true }),
      seg(' · dev', { fg: 'barMuted' }),
    ],
    [
      seg(`${runningServices}/${serviceSections.length} activos`, {
        fg: runningServices === serviceSections.length ? 'success' : 'warning',
      }),
      seg(' · ', { fg: 'barMuted' }),
      seg(`${state.errorCount} ${state.errorCount === 1 ? 'error' : 'errores'}`, {
        fg: state.errorCount > 0 ? 'error' : 'barMuted',
      }),
      seg(` · ${formatElapsed(now - state.startedAt)} `, { fg: 'barMuted' }),
    ],
    columns,
    theme,
    barBase,
  );

  const titleSegments = [seg(sectionLabels[selectedSection], { fg: 'accent', bold: true })];

  if (state.filter) {
    titleSegments.push(seg(` · /${state.filter}`, { fg: 'warning' }));
  }

  const lineCount = `${view.total} ${view.total === 1 ? 'línea' : 'líneas'}`;
  const followSegments =
    view.offset > 0
      ? [
          seg(
            `pausado · ${state.unseen} ${state.unseen === 1 ? 'nueva' : 'nuevas'} · End para seguir`,
            { fg: 'warning' },
          ),
        ]
      : [seg(`${lineCount} · siguiendo`, { fg: 'muted' })];

  const contentRule = renderSegments(
    ruleSegments(contentWidth + 2, titleSegments, followSegments),
    contentWidth + 2,
    theme,
  );
  const topRule = hasSidebar
    ? border('┌') +
      renderSegments(
        ruleSegments(sidebarWidth, [seg('Servicios', { fg: 'text', bold: true })]),
        sidebarWidth,
        theme,
      ) +
      border('┬') +
      contentRule +
      border('┐')
    : border('┌') + contentRule + border('┐');
  const bottomRule = hasSidebar
    ? border(`└${'─'.repeat(sidebarWidth)}┴${'─'.repeat(contentWidth + 2)}┘`)
    : border(`└${'─'.repeat(contentWidth + 2)}┘`);

  const sidebarRows = hasSidebar ? buildSidebarRows(state, now, spinner) : [];
  const showTag = selectedSection === 'all' || selectedSection === 'errors';
  const placeholder =
    view.rows.length === 0
      ? placeholderFor(selectedSection, state.statuses[selectedSection] ?? 'idle', state.filter)
      : null;
  const frame = [header, topRule];

  for (let rowIndex = 0; rowIndex < bodyHeight; rowIndex += 1) {
    const entry = view.rows[rowIndex];
    const contentSegments = entry
      ? buildContentSegments(entry, showTag)
      : placeholder && rowIndex === 0
        ? [seg(placeholder, { fg: 'muted' })]
        : [];
    const content = ` ${renderSegments(contentSegments, contentWidth, theme)} `;

    if (!hasSidebar) {
      frame.push(border('│') + content + border('│'));
      continue;
    }

    const sidebarRow = sidebarRows[rowIndex];
    const sidebar = renderSegments(
      sidebarRow?.segments ?? [],
      sidebarWidth,
      theme,
      sidebarRow?.base,
    );
    frame.push(border('│') + sidebar + border('│') + content + border('│'));
  }

  frame.push(bottomRule, buildFooter(state, columns, theme));

  while (frame.length < rows) {
    frame.push(' '.repeat(columns));
  }

  return frame.slice(0, rows);
}

// Secuencia mínima para pasar de un frame al siguiente. Cada fila ya ocupa el
// ancho completo, así que no se emite «borrar hasta fin de línea»: con el cursor
// en la última columna, ese borrado se llevaría el borde derecho.
export function diffFrames(previous, next) {
  const full = !previous || previous.length !== next.length;
  let output = '';

  for (let index = 0; index < next.length; index += 1) {
    if (!full && previous[index] === next[index]) {
      continue;
    }

    output += `\x1b[${index + 1};1H${next[index]}`;
  }

  return output;
}

function loadSelectedSection(stateFile) {
  if (!stateFile) {
    return 'all';
  }

  try {
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8'));
    const selectedSection =
      typeof parsed?.selectedSection === 'string' ? parsed.selectedSection : 'all';
    return panelSections.includes(selectedSection) ? selectedSection : 'all';
  } catch {
    return 'all';
  }
}

function saveSelectedSection(stateFile, section) {
  if (!stateFile) {
    return;
  }

  try {
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ selectedSection: section }), 'utf8');
  } catch {
    // No-op: si no podemos persistir el estado, el dashboard sigue funcionando.
  }
}

export function createDashboard(options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stdin = options.stdin ?? process.stdin;

  if (!stdout.isTTY || !stdin.isTTY) {
    return null;
  }

  const stateFile =
    options.stateFile === undefined
      ? join(process.cwd(), '.turbo', 'dev-dashboard-state.json')
      : options.stateFile;
  const theme = options.theme ?? createTheme(options.env ?? process.env);
  const clock = options.now ?? Date.now;

  const buffers = new Map(serviceSections.map((section) => [section, []]));
  const fragments = new Map(['system', ...serviceSections].map((section) => [section, '']));
  const timeline = [];
  const errorTimeline = [];
  const statuses = new Map(serviceSections.map((section) => [section, 'idle']));
  const since = new Map();
  const startedAt = clock();
  const startup = {
    total: 0,
    done: 0,
    startedAt,
    finishedAt: null,
    failed: false,
    running: [],
  };
  let selectedIndex = Math.max(panelSections.indexOf(loadSelectedSection(stateFile)), 0);
  let scrollOffset = 0;
  let unseen = 0;
  let filter = '';
  let filterEditing = false;
  let notice = '';
  let spinnerFrame = 0;
  let tickCount = 0;
  let active = false;
  let quitting = false;
  let quitHandler = null;
  let restartHandler = null;
  let previousFrame = null;
  let previousColumns = 0;
  let lastRenderAt = 0;
  let renderTimer = null;
  let tickTimer = null;
  let saveTimer = null;
  let noticeTimer = null;

  function selectedSection() {
    return panelSections[selectedIndex] ?? 'all';
  }

  function linesFor(section) {
    if (section === 'all') {
      return timeline;
    }

    return section === 'errors' ? errorTimeline : (buffers.get(section) ?? []);
  }

  function bodyHeight() {
    return Math.max(1, (stdout.rows ?? 40) - 4);
  }

  function snapshot() {
    return {
      selectedSection: selectedSection(),
      statuses: Object.fromEntries(statuses),
      since: Object.fromEntries(since),
      lines: linesFor(selectedSection()),
      errorCount: errorTimeline.length,
      scrollOffset,
      unseen,
      filter,
      filterEditing,
      notice,
      spinnerFrame,
      startedAt,
      startup: {
        total: startup.total,
        done: startup.done,
        startedAt: startup.startedAt,
        finishedAt: startup.finishedAt,
        failed: startup.failed,
        current: startup.running[startup.running.length - 1] ?? '',
      },
    };
  }

  function render() {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }

    if (!active) {
      return;
    }

    lastRenderAt = clock();

    const columns = stdout.columns ?? 120;
    const rows = stdout.rows ?? 40;
    const frame = buildFrame(snapshot(), { columns, rows, theme, now: lastRenderAt });
    const full = !previousFrame || previousColumns !== columns || previousFrame.length !== rows;
    const patch = diffFrames(full ? null : previousFrame, frame);

    previousFrame = frame;
    previousColumns = columns;

    if (!patch) {
      return;
    }

    // Salida sincronizada (modo 2026): la terminal aplica el frame de una vez
    // y no se ve a medio pintar. Las que no lo soportan ignoran la secuencia.
    stdout.write(`\x1b[?2026h${full ? '\x1b[2J' : ''}${patch}\x1b[?2026l`);
  }

  // Los logs llegan en ráfagas: se agrupan a ~30 fps. Las teclas repintan ya.
  function requestRender(immediate = false) {
    if (!active) {
      return;
    }

    if (immediate) {
      render();
      return;
    }

    if (renderTimer) {
      return;
    }

    const wait = Math.max(0, frameIntervalMs - (clock() - lastRenderAt));
    renderTimer = setTimeout(render, wait);
    renderTimer.unref?.();
  }

  function isAnimating() {
    if (startup.finishedAt === null && !startup.failed) {
      return true;
    }

    for (const status of statuses.values()) {
      if (animatedStatuses.has(status)) {
        return true;
      }
    }

    return false;
  }

  function tick() {
    tickCount += 1;

    if (isAnimating()) {
      spinnerFrame += 1;
      requestRender();
      return;
    }

    // En reposo basta un repintado por segundo para el reloj y los tiempos activos.
    if (tickCount % Math.round(1000 / tickIntervalMs) === 0) {
      requestRender();
    }
  }

  function scheduleStateSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveSelectedSection(stateFile, selectedSection());
    }, stateSaveDelayMs);
    saveTimer.unref?.();
  }

  function flushStateSave() {
    if (!saveTimer) {
      return;
    }

    clearTimeout(saveTimer);
    saveTimer = null;
    saveSelectedSection(stateFile, selectedSection());
  }

  function setNotice(text) {
    notice = text;

    if (noticeTimer) {
      clearTimeout(noticeTimer);
    }

    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      notice = '';
      requestRender();
    }, noticeDurationMs);
    noticeTimer.unref?.();
    requestRender(true);
  }

  function resetScroll() {
    scrollOffset = 0;
    unseen = 0;
  }

  function selectIndex(index) {
    selectedIndex = (index + panelSections.length) % panelSections.length;
    resetScroll();
    scheduleStateSave();
    requestRender(true);
  }

  function setSelectedSection(section) {
    selectIndex(Math.max(panelSections.indexOf(section), 0));
  }

  function scrollBy(delta) {
    const { maxOffset } = visibleWindow(linesFor(selectedSection()), {
      height: bodyHeight(),
      filter,
    });

    scrollOffset = Math.min(Math.max(0, scrollOffset + delta), maxOffset);

    if (scrollOffset === 0) {
      unseen = 0;
    }

    requestRender(true);
  }

  function pushEntry(collection, entry, viewSection) {
    collection.push(entry);

    if (collection.length > maxBufferedLines) {
      collection.splice(0, collection.length - maxBufferedLines);
    }

    // Con el panel pausado, la ventana se mantiene sobre las mismas líneas.
    if (scrollOffset > 0 && selectedSection() === viewSection) {
      const needle = filter.trim().toLowerCase();

      if (!needle || matchesFilter(entry, needle)) {
        scrollOffset += 1;
        unseen += 1;
      }
    }
  }

  function record(section, line) {
    const text = sanitizeLine(line);
    const entry = { ts: clock(), section, text, level: classifyLine(text) };

    if (buffers.has(section)) {
      pushEntry(buffers.get(section), entry, section);
    }

    pushEntry(timeline, entry, 'all');

    if (entry.level === 'error') {
      pushEntry(errorTimeline, entry, 'errors');
    }

    requestRender();
  }

  function logSystem(line) {
    record('setup', line);
  }

  function log(section, line) {
    if (!serviceSections.includes(section)) {
      logSystem(line);
      return;
    }

    record(section, line);
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

    if (statuses.get(section) !== status) {
      since.set(section, clock());
    }

    statuses.set(section, status);
    requestRender();
  }

  function setStartupTotal(total) {
    startup.total = total;
    requestRender();
  }

  // Devuelve la función que cierra el paso; admite pasos en paralelo.
  function startupStep(label) {
    let closed = false;
    startup.running.push(label);
    requestRender();

    return (ok = true) => {
      if (closed) {
        return;
      }

      closed = true;
      const index = startup.running.lastIndexOf(label);

      if (index >= 0) {
        startup.running.splice(index, 1);
      }

      if (ok) {
        startup.done += 1;
      } else {
        startup.failed = true;
      }

      requestRender();
    };
  }

  function completeStartup() {
    if (startup.finishedAt === null) {
      startup.finishedAt = clock();
      startup.done = Math.max(startup.done, startup.total);
    }

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

  function requestRestart() {
    const section = selectedSection();

    if (!restartableSections.includes(section)) {
      setNotice('Selecciona api, web, portal o worker para reiniciar.');
      return;
    }

    if (typeof restartHandler !== 'function') {
      setNotice('El reinicio aún no está disponible: el arranque no ha terminado.');
      return;
    }

    setNotice(`Reiniciando ${section}…`);
    restartHandler(section);
  }

  function clearCurrentView() {
    linesFor(selectedSection()).length = 0;
    resetScroll();
    requestRender(true);
  }

  function handleFilterKey(key, sequence) {
    const keyName = (key?.name ?? '').toLowerCase();

    if (keyName === 'escape') {
      filter = '';
      filterEditing = false;
    } else if (keyName === 'return' || keyName === 'enter') {
      filterEditing = false;
    } else if (keyName === 'backspace') {
      filter = [...filter].slice(0, -1).join('');
    } else if (!key?.ctrl && !key?.meta && [...sequence].length === 1 && sequence >= ' ') {
      filter += sequence;
    } else {
      return;
    }

    resetScroll();
    requestRender(true);
  }

  function handleKey(input, key) {
    const keyName = (key?.name ?? '').toLowerCase();
    const rawSequence = key?.sequence ?? input ?? '';
    const sequence = rawSequence.toLowerCase();

    if (!key && !sequence) {
      return;
    }

    if (key?.ctrl && keyName === 'c') {
      requestQuit();
      return;
    }

    if (filterEditing) {
      handleFilterKey(key, rawSequence);
      return;
    }

    if (keyName === 'q' || sequence === 'q') {
      requestQuit();
      return;
    }

    if (sequence === '/') {
      filterEditing = true;
      requestRender(true);
      return;
    }

    if (keyName === 'escape') {
      if (filter) {
        filter = '';
        resetScroll();
        requestRender(true);
      }

      return;
    }

    if (/^[1-9]$/.test(sequence) && Number(sequence) <= panelSections.length) {
      selectIndex(Number(sequence) - 1);
      return;
    }

    const page = Math.max(1, bodyHeight() - 1);
    const actions = {
      a: () => setSelectedSection('all'),
      e: () => setSelectedSection('errors'),
      r: requestRestart,
      c: clearCurrentView,
      up: () => selectIndex(selectedIndex - 1),
      down: () => selectIndex(selectedIndex + 1),
      k: () => scrollBy(1),
      j: () => scrollBy(-1),
      pageup: () => scrollBy(page),
      pagedown: () => scrollBy(-page),
      home: () => scrollBy(maxBufferedLines),
      end: () => scrollBy(-maxBufferedLines),
    };

    actions[keyName || sequence]?.();
  }

  function onResize() {
    previousFrame = null;
    requestRender(true);
  }

  function start() {
    if (active) {
      return;
    }

    active = true;
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', handleKey);
    stdout.on('resize', onResize);
    stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H');
    tickTimer = setInterval(tick, tickIntervalMs);
    tickTimer.unref?.();
    requestRender(true);
  }

  function stop() {
    if (!active) {
      return;
    }

    active = false;

    for (const timer of [renderTimer, noticeTimer]) {
      if (timer) {
        clearTimeout(timer);
      }
    }

    if (tickTimer) {
      clearInterval(tickTimer);
    }

    renderTimer = null;
    noticeTimer = null;
    tickTimer = null;
    flushStateSave();
    stdout.write('\x1b[?2026l\x1b[?25h\x1b[0m\x1b[?1049l');

    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }

    stdin.pause();
    stdin.off('keypress', handleKey);
    stdout.off('resize', onResize);
  }

  return {
    completeStartup,
    consumeChunk,
    flush,
    handleKey,
    log,
    logSystem,
    setQuitHandler(handler) {
      quitHandler = handler;
    },
    setRestartHandler(handler) {
      restartHandler = handler;
    },
    setStartupTotal,
    setStatus,
    start,
    startupStep,
    stop,
  };
}
