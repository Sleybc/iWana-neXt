/**
 * setupFiles de las suites de integración (api, worker, db): ninguna prueba registra empresas
 * fuera de una base desechable.
 *
 * Causa raíz de los fallidos de octubre en la revisión de la agenda y en la de evidencias
 * (B(a), 2026-11-22): varias pruebas insertaban en `public.tenants` empresas `ACTIVE` con
 * schemas parciales y, si no se les pasaba `DB_NAME`, escribían en `dbiw`. El worker de
 * desarrollo, que corre sobre `dbiw`, las veía en sus barridos y fallaba.
 *
 * La guarda envuelve `Client.prototype.query` de `pg`, que usan tanto los `Pool` como TypeORM.
 * Un `INSERT` en `public.tenants` contra una base que no sea `test` ni un clon de integración
 * (`iwana_it_*`, el sufijo por worker de la CI) falla de inmediato y no llega a enviarse. Lo demás
 * pasa sin cambios.
 */

const DISPOSABLE_DATABASE = /^(test|iwana_it_[a-z0-9_]+)$/u;
const TENANT_INSERT = /\binsert\s+into\s+(?:"?public"?\s*\.\s*)?"?tenants"?(?=[\s(])/iu;
const GUARD_FLAG = Symbol.for('iwana.integrationTenantGuard');

function isDisposableIntegrationDatabase(name) {
  return typeof name === 'string' && DISPOSABLE_DATABASE.test(name);
}

function isTenantRegistration(sql) {
  return typeof sql === 'string' && TENANT_INSERT.test(sql);
}

function blockedError(database) {
  return new Error(
    `[BLOCKED] Una prueba de integración intentó registrar una empresa en la base ` +
      `«${database ?? 'sin nombre'}». Solo se permite en DB_NAME=test o en un clon iwana_it_*.`,
  );
}

/** Envuelve `Client.prototype.query` del módulo `pg` recibido. Idempotente. */
function installIntegrationTenantGuard(pgModule = require('pg')) {
  const proto = pgModule.Client.prototype;
  if (proto[GUARD_FLAG]) return;
  const original = proto.query;
  proto.query = function guardedQuery(config, values, callback) {
    const text = typeof config === 'string' ? config : config && config.text;
    if (isTenantRegistration(text) && !isDisposableIntegrationDatabase(this.database)) {
      const error = blockedError(this.database);
      const cb = typeof values === 'function' ? values : callback;
      if (typeof cb === 'function') {
        process.nextTick(() => cb(error));
        return undefined;
      }
      if (config && typeof config.callback === 'function') {
        process.nextTick(() => config.callback(error));
        return config;
      }
      return Promise.reject(error);
    }
    return original.apply(this, arguments);
  };
  Object.defineProperty(proto, GUARD_FLAG, { value: true });
}

module.exports = {
  installIntegrationTenantGuard,
  isDisposableIntegrationDatabase,
  isTenantRegistration,
};

// Como setupFiles, jest solo ejecuta el módulo: instalar al cargarlo.
if (process.env['JEST_WORKER_ID'] !== undefined) {
  installIntegrationTenantGuard();
}
