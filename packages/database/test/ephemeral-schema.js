/**
 * Schemas efímeros de las pruebas de integración.
 *
 * Si una corrida se corta (timeout, Ctrl+C, worker matado), su `afterAll` no se ejecuta y el
 * schema —y a veces su fila de `public.tenants`— queda en la base, inflando los conteos de la
 * consola. PostgreSQL no guarda cuándo se creó un schema, así que la fecha va en el nombre:
 * `<prefijo>itx<ms en base36, 8><hex, 8>`. El `globalSetup` de cada suite borra los que pasen
 * de STALE_AFTER_MS. Nunca toca un schema vivo de otra corrida ni uno real: un tenant real no
 * lleva ese sufijo.
 */

const { randomBytes } = require('node:crypto');

const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const PREFIX_PATTERN = /^[a-z][a-z0-9_]*_$/u;
const EPHEMERAL_PATTERN = /^[a-z][a-z0-9_]*_itx([0-9a-z]{8})[0-9a-f]{8}$/u;
/** Primer instante válido del sufijo (2020-01-01): descarta coincidencias que no son fechas. */
const EARLIEST_CREATED_AT_MS = Date.UTC(2020, 0, 1);

/** Nombre de schema efímero: `prefix` en minúsculas y terminado en `_`. */
function ephemeralSchemaName(prefix) {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`Prefijo de schema efímero inválido: ${prefix}`);
  }
  const createdAt = Date.now().toString(36).padStart(8, '0');
  const name = `${prefix}itx${createdAt}${randomBytes(4).toString('hex')}`;
  if (name.length > 63) {
    throw new Error(`Schema efímero de más de 63 caracteres: ${name}`);
  }
  return name;
}

/** Milisegundos de creación codificados en el nombre, o null si no es un schema efímero. */
function ephemeralSchemaCreatedAt(name) {
  const match = EPHEMERAL_PATTERN.exec(name);
  if (!match) return null;
  const createdAt = Number.parseInt(match[1], 36);
  return createdAt >= EARLIEST_CREATED_AT_MS ? createdAt : null;
}

/**
 * Borra los schemas efímeros de más de STALE_AFTER_MS y su fila de `public.tenants`.
 * Es higiene: cada fallo (otro dueño, bloqueo) se avisa y no detiene la corrida.
 */
async function sweepStaleEphemeralSchemas(client, now = Date.now()) {
  const { rows } = await client.query(
    "SELECT nspname FROM pg_namespace WHERE nspname ~ '_itx[0-9a-z]{8}[0-9a-f]{8}$'",
  );
  const stale = rows
    .map((row) => row.nspname)
    .filter((name) => {
      const createdAt = ephemeralSchemaCreatedAt(name);
      return createdAt !== null && now - createdAt > STALE_AFTER_MS;
    });

  let dropped = 0;
  for (const name of stale) {
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
      await client.query('DELETE FROM public.tenants WHERE schema_name = $1', [name]);
      dropped += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[integration-sweep] no se pudo borrar ${name}: ${reason}`);
    }
  }
  if (dropped > 0) {
    console.log(
      `[integration-sweep] ${dropped} schema(s) efímero(s) de corridas cortadas borrado(s).`,
    );
  }
  return dropped;
}

module.exports = {
  STALE_AFTER_MS,
  ephemeralSchemaName,
  ephemeralSchemaCreatedAt,
  sweepStaleEphemeralSchemas,
};
