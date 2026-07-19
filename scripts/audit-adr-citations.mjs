#!/usr/bin/env node
/**
 * audit-adr-citations.mjs — gate de integridad de citas normativas ADR.
 *
 * Implementa el gate propuesto en ADR-056 §"Ampliación 2026-07-19" (propuesta
 * SR-QA #13) y exigido por el protocolo §7.4: una cita solo confiere autoridad
 * si el artefacto **existe**, su estado es **Aprobado** y **dice lo que se
 * afirma**.
 *
 * Por cada `ADR-\d{3}` citado en `docs/**\/*.md` y `.agents/skills/**\/*.md`:
 *   (a) [D] existe el archivo en docs/adrs/            → BLOQUEANTE
 *   (b) [D] su estado es Aprobado                      → BLOQUEANTE
 *   (c) [H] la atribución inline se corresponde con el
 *           contenido del ADR                          → AVISO (nunca bloquea)
 *
 * Reglas [D] = deterministas (evidencia directa). Reglas [H] = heurísticas:
 * salen marcadas `[revisar]` y requieren confirmación manual antes de entrar a
 * un informe. Mismo contrato que `.agents/skills/iwana-identity-ui-review/
 * scripts/audit-ui.mjs`.
 *
 * Uso:
 *   node scripts/audit-adr-citations.mjs [rutas...] [--json]
 *   (sin rutas: docs, .agents/skills)
 *
 * Exit code 1 solo si hay hallazgos BLOQUEANTES.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const JSON_OUT = process.argv.includes('--json');
const ROOT = process.cwd();
const DEFAULT_PATHS = ['docs', '.agents/skills'];
const ADR_DIR = resolve(ROOT, 'docs/adrs');
const targets = (args.length > 0 ? args : DEFAULT_PATHS).map((p) => resolve(ROOT, p));

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo', '.git']);

/**
 * Vocabulario canónico de estado (ADR-056 §"Ampliación", protocolo §7.4).
 * Cualquier otro valor es defecto: un estado fuera de vocabulario no es
 * interpretable y por tanto no confiere autoridad.
 */
const CANONICAL_STATES = new Set(['aprobado', 'en revision', 'propuesto', 'superado']);
const APPROVED = 'aprobado';

/**
 * Espacio de numeración histórico. ADR-001…ADR-015 NO existen como archivo:
 * son entradas de `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md` §14.6, sin
 * cabecera de estado, y por decisión de ADR-056 §12 no confieren autoridad
 * normativa.
 *
 * Decisión de diseño (documentada en scripts/README-audit-adr-citations.md):
 * NO se distinguen por contexto inline. Se verificó sobre el repo que la
 * inmensa mayoría de estas ~85 citas aparecen desnudas (`**ADRs:** ADR-001,
 * ADR-002, …`) sin marcador `PRD §14.6`, de modo que un detector de contexto
 * sería frágil y produciría falsos negativos. Se usa el criterio determinista
 * y estable —el rango numérico— y se emite AVISO, no bloqueo: la cita es
 * ambigua por construcción histórica, no es un defecto nuevo introducido por
 * el autor. Bloquear aquí convertiría el gate en ruido inmediato.
 */
const HISTORIC_MAX = 15;

/** Ficheros que hablan *sobre* citas defectuosas por diseño (erratas, ADR-056). */
const PATH_ALLOWLIST = [/^docs\/adrs\/ADR-056-Integridad-Base-Normativa-Diseno\.md$/];

/** Marcadores de exclusión embebidos en el propio markdown. */
const IGNORE_FILE_MARKER = /<!--\s*adr-cite-ignore-file\b/;
const IGNORE_LINE_MARKER = /<!--\s*adr-cite-ignore\b(?!-file)/;

const CITE_RE = /ADR-(\d{3})/g;

/**
 * Comentarios HTML. Se eliminan ANTES de buscar citas: un `<!-- ADR-021 retirado
 * … -->` es metadato de trazabilidad sobre una cita *removida*, no una cita que
 * invoque autoridad. Verificado 2026-07-19: sin este filtro, las cuatro
 * remediaciones de AI-EM-ARCH (que documentan en comentario el ADR retirado) se
 * reportaban como los mismos bloqueantes que acababan de corregir.
 * Los marcadores `adr-cite-ignore*` se detectan antes de este borrado.
 */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * Convención de cita histórica (protocolo §7.4, decisión AI-EM-ARCH 2026-07-19):
 * una cita de ADR `Superado` / `Propuesto` / `En revisión` con marcador explícito
 * adyacente es genealogía legítima y NO bloquea. Sin marcador, se interpreta como
 * afirmación de autoridad vigente y bloquea.
 *
 * Sintaxis aceptada, insensible a mayúsculas y a tildes, con o sin cursiva o
 * negrita markdown. Dos formas:
 *
 *   1. Marcador propio, entre paréntesis o corchetes:
 *        ADR-021 (superado) · ADR-021 [superado] · ADR-021 (_en revisión_)
 *   2. Marcador dentro del mismo paréntesis que el número, tras separador:
 *        (ADR-021, superado) · (ADR-021 — propuesto)
 *
 * Vocabulario: superado/a · propuesto/a · en revisión (o "en revision").
 */
const MARKER_WORDS = '(?:superad[oa]|propuest[oa]|en\\s+revisi[oó]n)';
const HISTORIC_MARKER_RE = new RegExp(
  // forma 1: (superado)
  `[([]\\s*[*_]{0,2}\\s*${MARKER_WORDS}\\s*[*_]{0,2}\\s*[)\\]]` +
    '|' +
    // forma 2: ", superado)" pegado al número, dentro del mismo paréntesis
    `^\\s*[,;—–-]\\s*[*_]{0,2}\\s*${MARKER_WORDS}\\s*[*_]{0,2}\\s*[)\\]]`,
  'iu',
);

/**
 * Ventana de adyacencia del marcador: desde el final del número citado hasta la
 * siguiente cita `ADR-` de la misma línea (o el fin de línea), con tope de 160
 * caracteres. Así el marcador se liga inequívocamente a SU cita y no a la
 * vecina, y tolera el destino de un enlace markdown intermedio
 * —`[ADR-021](../adrs/ADR-021-….md) (superado)`—, que es la forma más común.
 */
function hasHistoricMarker(text, fromIndex) {
  let window = text.slice(fromIndex, fromIndex + 160);
  const next = window.search(/ADR-\d{3}/);
  // El propio destino del enlace repite el número: no cuenta como "siguiente cita".
  if (next > 0) {
    const tail = window.slice(next);
    if (/^ADR-\d{3}[-\w]*\.md/.test(tail)) {
      const close = tail.indexOf(')');
      window = close >= 0 ? window.slice(0, next) + tail.slice(close) : window.slice(0, next);
    } else {
      window = window.slice(0, next);
    }
  }
  return HISTORIC_MARKER_RE.test(window);
}

/** Stopwords es-CO: no son términos significativos para la heurística (c). */
const STOPWORDS = new Set([
  'para',
  'como',
  'desde',
  'sobre',
  'entre',
  'segun',
  'sin',
  'con',
  'por',
  'del',
  'las',
  'los',
  'una',
  'uno',
  'que',
  'este',
  'esta',
  'estos',
  'estas',
  'todo',
  'toda',
  'todos',
  'todas',
  'mismo',
  'misma',
  'nuevo',
  'nueva',
  'incl',
  'ver',
  'etc',
  'y',
  'o',
  'a',
  'de',
  'en',
  'el',
  'la',
]);

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (entry.endsWith('.md')) yield full;
  }
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/**
 * Extrae el estado de un ADR. Conviven TRES formatos en el repo — verificado
 * 2026-07-19, no asumido. Un validador que lea menos de los tres produce
 * falsos positivos sobre ADRs válidos:
 *   1. markdown plano   `**Estado:** Aprobado`                (27 archivos)
 *   2. blockquote       `> **Estado:** Aprobado`              (5: ADR-016…020)
 *   3. frontmatter YAML `status: "Aprobado"`                  (5: 028-031, 036)
 * Se aceptan además variantes con emoji (`✅ Aprobado`) y cualificadas
 * (`Aprobado (diseño de fase; …)`).
 */
function parseState(text) {
  const head = text.split(/\r?\n/).slice(0, 40);
  for (const line of head) {
    let m =
      /^\s*>?\s*\*\*Estado:?\*\*:?\s*(.+)$/.exec(line) ??
      /^\s*status:\s*["']?([^"'\n]+)["']?\s*$/.exec(line);
    if (!m) continue;
    let raw = m[1].trim();
    // Corta el cualificador: "Aprobado (diseño de fase; …)" → "Aprobado"
    raw = raw.split('(')[0];
    // Limpia emoji, markdown residual y puntuación de cierre
    raw = raw
      .replace(/[\p{Extended_Pictographic}\u2600-\u27bf\ufe0f]/gu, '')
      .replace(/[*_`"']/g, '')
      .replace(/[.,;:]+$/, '')
      .trim();
    if (raw) return { raw, key: norm(raw) };
  }
  return null;
}

/** Índice de ADRs reales: número → { file, state } */
function buildAdrIndex() {
  const index = new Map();
  if (!existsSync(ADR_DIR)) return index;
  for (const entry of readdirSync(ADR_DIR)) {
    const m = /^ADR-(\d{3})[-.].*\.md$/.exec(entry);
    if (!m) continue;
    const file = join(ADR_DIR, entry);
    const text = readFileSync(file, 'utf8');
    index.set(m[1], { file: rel(file), state: parseState(text), body: norm(text) });
  }
  return index;
}

/**
 * Heurística (c): extrae la atribución inline que sigue a la cita.
 * Formas reconocidas: `ADR-0NN = texto` · `ADR-0NN (texto)` · `ADR-0NN: texto`
 */
function extractAttribution(line, matchEnd) {
  const rest = line.slice(matchEnd);
  let m = /^\s*\(([^)]{3,120})\)/.exec(rest);
  if (m) return m[1];
  m = /^\s*=\s*([^|.;\n]{3,120})/.exec(rest);
  if (m) return m[1];
  m = /^\s*:\s*([^|.;\n]{3,120})/.exec(rest);
  if (m) return m[1];
  return null;
}

/** Términos significativos de una atribución (≥4 chars, sin stopwords). */
function significantTerms(attr) {
  return [
    ...new Set(
      norm(attr)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
    ),
  ];
}

/** Un término cuenta como presente si el cuerpo del ADR lo contiene (prefijo tolerante a plural/género). */
function termInBody(term, body) {
  if (body.includes(term)) return true;
  const stem = term.slice(0, Math.max(4, term.length - 2));
  return stem.length >= 4 && body.includes(stem);
}

const adrIndex = buildAdrIndex();
const findings = [];

for (const target of targets) {
  if (!existsSync(target)) continue;
  const files = statSync(target).isDirectory() ? [...walk(target)] : [target];

  for (const file of files) {
    const r = rel(file);
    if (PATH_ALLOWLIST.some((re) => re.test(r))) continue;
    const text = readFileSync(file, 'utf8');
    if (IGNORE_FILE_MARKER.test(text)) continue;
    const lines = text.split(/\r?\n/);

    lines.forEach((rawLine, i) => {
      if (IGNORE_LINE_MARKER.test(rawLine)) return;
      if (i > 0 && IGNORE_LINE_MARKER.test(lines[i - 1])) return;

      // Los comentarios HTML no son citas: se borran tras evaluar los marcadores.
      const line = rawLine.replace(HTML_COMMENT_RE, '');

      CITE_RE.lastIndex = 0;
      let m;
      const seen = new Set();
      while ((m = CITE_RE.exec(line)) !== null) {
        const num = m[1];
        // Autorreferencia: el propio ADR-0NN-*.md nombrándose a sí mismo.
        if (r === adrIndex.get(num)?.file) continue;
        if (seen.has(num)) continue;
        seen.add(num);

        const push = (rule, kind, sev, desc) =>
          findings.push({
            rule,
            kind,
            sev,
            adr: `ADR-${num}`,
            file: r,
            line: i + 1,
            desc,
            evidence: rawLine.trim().slice(0, 160),
          });

        const entry = adrIndex.get(num);

        // (a) existencia
        if (!entry) {
          if (Number(num) <= HISTORIC_MAX) {
            push(
              'adr-historic-space',
              'D',
              'AVISO',
              'Espacio de numeración histórico: ADR-001…015 no existen como archivo (son PRD_Sistema_ISP_Colombia_v2_4.md §14.6, sin estado). No confieren autoridad normativa — citar como "PRD §14.6 ADR-0NN" (ADR-056 §12)',
            );
          } else {
            push(
              'adr-missing',
              'D',
              'BLOQUEANTE',
              'ADR citado que no existe como archivo en docs/adrs/ — la cita no confiere autoridad (protocolo §7.4)',
            );
          }
          continue;
        }

        // (b) estado
        if (!entry.state) {
          push(
            'adr-no-status',
            'D',
            'BLOQUEANTE',
            `${entry.file} no declara estado en su cabecera — sin estado no hay autoridad (protocolo §7.4)`,
          );
          continue;
        }
        if (!CANONICAL_STATES.has(entry.state.key)) {
          push(
            'adr-status-invalid',
            'D',
            'BLOQUEANTE',
            `Estado "${entry.state.raw}" fuera del vocabulario canónico (Aprobado · En revisión · Propuesto · Superado) en ${entry.file}`,
          );
          continue;
        }
        if (entry.state.key !== APPROVED) {
          // Convención de cita histórica: marcador explícito ⇒ genealogía, no autoridad.
          if (hasHistoricMarker(line, m.index + m[0].length)) continue;
          push(
            'adr-not-approved',
            'D',
            'BLOQUEANTE',
            `ADR citado como autoridad con estado "${entry.state.raw}" y sin marcador de cita histórica — añade "(${entry.state.raw.toLowerCase()})" junto al número si la cita es genealógica, o retira la cita (protocolo §7.4, convención de cita histórica)`,
          );
          continue;
        }

        // (c) correspondencia atribución ↔ contenido (heurística)
        const attr = extractAttribution(line, m.index + m[0].length);
        if (!attr) continue;
        const terms = significantTerms(attr);
        if (terms.length === 0) continue;
        const hit = terms.some((t) => termInBody(t, entry.body));
        if (!hit) {
          push(
            'adr-attribution-mismatch',
            'H',
            'AVISO',
            `Ningún término de la atribución "${attr.trim()}" aparece en ${entry.file} — verificar manualmente que el ADR dice lo que se le atribuye`,
          );
        }
      }
    });
  }
}

const ORDER = { BLOQUEANTE: 0, AVISO: 1 };
findings.sort(
  (a, b) => ORDER[a.sev] - ORDER[b.sev] || a.file.localeCompare(b.file) || a.line - b.line,
);

const blocking = findings.filter((f) => f.sev === 'BLOQUEANTE');
const warnings = findings.filter((f) => f.sev === 'AVISO');
const counts = {
  BLOQUEANTE: blocking.length,
  AVISO: warnings.length,
  adrsIndexados: adrIndex.size,
};

if (JSON_OUT) {
  console.log(JSON.stringify({ counts, findings }, null, 2));
} else {
  if (findings.length === 0) {
    console.log(
      `audit-adr-citations: sin hallazgos (${adrIndex.size} ADRs indexados en docs/adrs/).`,
    );
  } else {
    let currentSev = '';
    for (const f of findings) {
      if (f.sev !== currentSev) {
        currentSev = f.sev;
        console.log(`\n=== ${f.sev} ===`);
      }
      const tag = f.kind === 'H' ? ' [revisar]' : '';
      console.log(`${f.file}:${f.line} — [${f.sev}][${f.rule}]${tag} ${f.adr}: ${f.desc}`);
      console.log(`    ${f.evidence}`);
    }
    console.log(
      `\nResumen: BLOQUEANTE: ${counts.BLOQUEANTE} · AVISO: ${counts.AVISO} ` +
        `(${adrIndex.size} ADRs indexados; los [revisar] son heurísticos y requieren confirmación manual)`,
    );
  }
}

process.exit(blocking.length > 0 ? 1 : 0);
