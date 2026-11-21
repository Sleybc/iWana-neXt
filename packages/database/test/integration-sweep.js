/**
 * globalSetup que solo barre los schemas efímeros de corridas cortadas (ver ephemeral-schema.js).
 * Lo usan las suites que no necesitan el probe de disponibilidad (worker). Sin base alcanzable no
 * hace nada: cada spec decide por su cuenta si corre.
 */

const { loadWorkspaceEnv, resolveConnection } = require('./integration-db-probe');
const { sweepStaleEphemeralSchemas } = require('./ephemeral-schema');

module.exports = async function integrationSweep() {
  loadWorkspaceEnv();
  const { Client } = require('pg');
  const client = new Client({ ...resolveConnection(), connectionTimeoutMillis: 5_000 });
  try {
    await client.connect();
    await sweepStaleEphemeralSchemas(client);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[integration-sweep] barrido omitido: ${reason}`);
  } finally {
    await client.end().catch(() => undefined);
  }
};
