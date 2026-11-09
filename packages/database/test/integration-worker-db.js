/**
 * setupFiles de la integración API con varios workers de jest.
 *
 * Spec: docs/specs/2026-11-09-plat-ops-ci-integracion-api-tiempo.md (opción A).
 *
 * Con `IWANA_IT_WORKERS` > 1, cada worker de jest usa su propia base: el worker 1
 * usa `DB_NAME` y los workers 2..N usan los clones de
 * `scripts/db/clone-integration-dbs.sh`. Corre antes de que la suite importe nada,
 * así que `data-source.ts` y los `new DataSource` de las suites ya leen el nombre del
 * clon. Sin la variable, o con 1, no cambia nada.
 *
 * La regla de nombres debe coincidir con la del script de clonado.
 */

const SAFE_DISPOSABLE_DATABASE_NAME = /^iwana_it_g7_[a-z0-9_]+$/u;

/** Número de workers pedido; 1 si la variable falta. Lanza si el valor no es válido. */
function resolveIntegrationWorkers(env = process.env) {
  const raw = (env['IWANA_IT_WORKERS'] ?? '').trim();
  if (raw === '') return 1;
  if (!/^[1-9][0-9]*$/u.test(raw)) {
    throw new Error(`IWANA_IT_WORKERS debe ser un entero >= 1 (recibido: ${raw}).`);
  }
  return Number.parseInt(raw, 10);
}

/** Nombre de la base del worker `workerId` (1..N) para la base original `baseName`. */
function workerDatabaseName(baseName, workerId) {
  if (workerId <= 1) return baseName;
  const clone = baseName.startsWith('iwana_it_g7_')
    ? `${baseName}_w${workerId}`
    : `iwana_it_g7_${baseName}_w${workerId}`;
  if (!SAFE_DISPOSABLE_DATABASE_NAME.test(clone)) {
    throw new Error(`Nombre de clon de integración no desechable: ${clone}.`);
  }
  return clone;
}

function applyWorkerDatabase(env = process.env) {
  const workers = resolveIntegrationWorkers(env);
  if (workers <= 1) return;

  const workerId = Number.parseInt(env['JEST_WORKER_ID'] ?? '1', 10);
  if (!Number.isInteger(workerId) || workerId < 1 || workerId > workers) {
    throw new Error(
      `JEST_WORKER_ID=${env['JEST_WORKER_ID']} fuera de 1..${workers}: maxWorkers y IWANA_IT_WORKERS no coinciden.`,
    );
  }
  // La base original se guarda aparte: así aplicar dos veces en el mismo proceso no
  // encadena sufijos (`_w2_w2`), tanto si jest reutiliza process.env entre archivos como si no.
  const baseName = (env['IWANA_IT_BASE_DB_NAME'] ?? env['DB_NAME'] ?? '').trim();
  if (baseName === '') {
    throw new Error('IWANA_IT_WORKERS > 1 exige DB_NAME (la base original del worker 1).');
  }
  env['IWANA_IT_BASE_DB_NAME'] = baseName;
  env['DB_NAME'] = workerDatabaseName(baseName, workerId);
}

module.exports = { resolveIntegrationWorkers, workerDatabaseName, applyWorkerDatabase };

// Como setupFiles, jest solo ejecuta el módulo: aplicar al cargarlo.
if (process.env['JEST_WORKER_ID'] !== undefined) {
  applyWorkerDatabase();
}
