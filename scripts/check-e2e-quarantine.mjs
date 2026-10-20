import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

const QUARANTINE_STRING_PATTERN = /(['"`])QUARANTINE:\s*([A-Z0-9][A-Z0-9_-]*)\1/g;
const FIXME_PATTERN =
  /\btest\.fixme\(\s*true\s*,\s*(['"`])QUARANTINE:\s*([A-Z0-9][A-Z0-9_-]*)\1\s*\)/g;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const CATEGORIES = new Set([
  'entorno',
  'prueba desactualizada',
  'regresión de producto',
  'flaky',
  'obsoleta',
]);
const REQUIRED_ROW_VALUE = /^(?:|[-—]|<[^>]+>|por asignar)$/i;

async function listTestSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listTestSourceFiles(entryPath);
      return entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

function parseMarkdownRows(contents) {
  const rows = [];
  const errors = [];

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;

    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells[0]?.toLowerCase() === 'id') continue;

    if (cells.length !== 7) {
      errors.push(`Fila ${index + 1}: se esperan 7 columnas y hay ${cells.length}.`);
      continue;
    }

    const [id, spec, test, category, reason, owner, dueDate] = cells;
    if (!id || !/^[A-Z0-9][A-Z0-9_-]*$/i.test(id)) {
      errors.push(`Fila ${index + 1}: el id está vacío o no es válido.`);
      continue;
    }

    for (const [field, value] of Object.entries({ spec, test, category, reason, owner, dueDate })) {
      if (REQUIRED_ROW_VALUE.test(value)) {
        errors.push(`Cuarentena ${id}: falta el campo ${field}.`);
      }
    }

    if (!CATEGORIES.has(category.toLocaleLowerCase('es'))) {
      errors.push(`Cuarentena ${id}: categoría no reconocida (${category}).`);
    }

    const dueTime = Date.parse(`${dueDate}T00:00:00Z`);
    const isValidDate =
      /^\d{4}-\d{2}-\d{2}$/.test(dueDate) &&
      !Number.isNaN(dueTime) &&
      new Date(dueTime).toISOString().slice(0, 10) === dueDate;
    if (!isValidDate) {
      errors.push(`Cuarentena ${id}: fecha límite inválida (${dueDate}); usa YYYY-MM-DD.`);
    }

    rows.push({ id, spec: spec.replaceAll('\\', '/').replace(/^\.\//, ''), test, dueDate });
  }

  return { rows, errors };
}

function getIds(pattern, contents) {
  const ids = [];
  for (const match of contents.matchAll(pattern)) ids.push(match[2]);
  return ids;
}

export async function validateQuarantine({ rootDir = REPOSITORY_ROOT, today = new Date() } = {}) {
  const testsDirectory = path.join(rootDir, 'e2e', 'tests');
  const manifestPath = path.join(rootDir, 'e2e', 'QUARANTINE.md');
  const capPath = path.join(rootDir, 'e2e', 'quarantine-cap.json');
  const errors = [];

  let manifestContents;
  let capContents;
  try {
    [manifestContents, capContents] = await Promise.all([
      readFile(manifestPath, 'utf8'),
      readFile(capPath, 'utf8'),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'error desconocido';
    return { errors: [`No se pudo leer el manifiesto o el tope: ${detail}`], quarantineCount: 0 };
  }

  let cap;
  try {
    cap = JSON.parse(capContents);
  } catch {
    errors.push('e2e/quarantine-cap.json no contiene JSON válido.');
  }
  if (!Number.isInteger(cap?.maxQuarantines) || cap.maxQuarantines < 0) {
    errors.push('e2e/quarantine-cap.json debe definir maxQuarantines como entero no negativo.');
  }

  const { rows, errors: rowErrors } = parseMarkdownRows(manifestContents);
  errors.push(...rowErrors);
  const rowsById = new Map();
  for (const row of rows) {
    if (rowsById.has(row.id))
      errors.push(`El id ${row.id} aparece más de una vez en e2e/QUARANTINE.md.`);
    rowsById.set(row.id, row);

    const dueTime = Date.parse(`${row.dueDate}T00:00:00Z`);
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (!Number.isNaN(dueTime) && dueTime < todayUtc) {
      errors.push(`Cuarentena ${row.id}: venció el ${row.dueDate}.`);
    }
    const latestAllowedDueDate = todayUtc + 30 * 24 * 60 * 60 * 1000;
    if (!Number.isNaN(dueTime) && dueTime > latestAllowedDueDate) {
      errors.push(`Cuarentena ${row.id}: la fecha límite supera el máximo de 30 días.`);
    }
  }

  let specFiles;
  try {
    specFiles = await listTestSourceFiles(testsDirectory);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'error desconocido';
    errors.push(`No se pudieron leer las specs E2E: ${detail}`);
    specFiles = [];
  }

  const markerLocations = new Map();
  for (const specFile of specFiles) {
    const contents = await readFile(specFile, 'utf8');
    const markers = getIds(QUARANTINE_STRING_PATTERN, contents);
    const fixmes = getIds(FIXME_PATTERN, contents);
    const relativeSpec = path.relative(rootDir, specFile).split(path.sep).join('/');

    for (const id of markers) {
      const locations = markerLocations.get(id) ?? [];
      locations.push(relativeSpec);
      markerLocations.set(id, locations);
    }

    const markerCounts = new Map();
    const fixmeCounts = new Map();
    for (const id of markers) markerCounts.set(id, (markerCounts.get(id) ?? 0) + 1);
    for (const id of fixmes) fixmeCounts.set(id, (fixmeCounts.get(id) ?? 0) + 1);
    for (const id of new Set([...markerCounts.keys(), ...fixmeCounts.keys()])) {
      if (markerCounts.get(id) !== fixmeCounts.get(id)) {
        errors.push(`${relativeSpec}: QUARANTINE: ${id} debe estar en test.fixme(true, ...).`);
      }
    }
  }

  const quarantinedIds = new Set(markerLocations.keys());
  for (const [id, locations] of markerLocations) {
    if (locations.length > 1) {
      errors.push(`QUARANTINE: ${id} aparece más de una vez en e2e/tests/.`);
    }
  }

  for (const id of quarantinedIds) {
    if (!rowsById.has(id)) errors.push(`QUARANTINE: ${id} no tiene fila en e2e/QUARANTINE.md.`);
  }
  for (const [id, row] of rowsById) {
    const locations = markerLocations.get(id);
    if (!locations) {
      errors.push(`La fila ${id} no tiene un test.fixme correspondiente en e2e/tests/.`);
      continue;
    }
    const specPaths = new Set(locations);
    if (!specPaths.has(row.spec)) {
      errors.push(
        `La fila ${id} declara ${row.spec}, pero el marcador está en ${[...specPaths].join(', ')}.`,
      );
    }
  }

  if (Number.isInteger(cap?.maxQuarantines) && rows.length > cap.maxQuarantines) {
    errors.push(
      `Hay ${rows.length} cuarentenas registradas y el tope versionado es ${cap.maxQuarantines}.`,
    );
  }

  return { errors, quarantineCount: rows.length, markerCount: quarantinedIds.size };
}

async function main() {
  const result = await validateQuarantine();
  if (result.errors.length > 0) {
    console.error('Gate de cuarentena E2E: FAIL');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Gate de cuarentena E2E: PASS (${result.quarantineCount}/${result.markerCount} cuarentenas registradas)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
