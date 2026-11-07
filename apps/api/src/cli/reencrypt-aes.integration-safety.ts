const SAFE_DISPOSABLE_DATABASE_NAME = /^iwana_it_g7_[a-z0-9_]+$/u;
const CI_RUNNER_DATABASE_NAME = 'test';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export type DisposableIntegrationTarget = {
  enabled: boolean;
  databaseName: string;
  databaseHost?: string | undefined;
  /** Solo quien llama la fija, con `process.env['GITHUB_ACTIONS'] === 'true'` (D-K2A-8). */
  ciRunner?: boolean | undefined;
};

export type K2ReencryptIntegrationOptions = {
  optIn?: string | undefined;
  databaseName: string;
  databaseHost?: string | undefined;
  ciRunner?: boolean | undefined;
};

/** Falla antes de conectar si la integración no apunta a un Postgres local desechable. */
export function assertSafeDisposableIntegrationTarget({
  enabled,
  databaseName,
  databaseHost,
  ciRunner,
}: DisposableIntegrationTarget): void {
  if (!enabled) return;

  const isCiRunnerDatabase = ciRunner === true && databaseName === CI_RUNNER_DATABASE_NAME;
  if (!isCiRunnerDatabase && !SAFE_DISPOSABLE_DATABASE_NAME.test(databaseName)) {
    throw new Error('La integración K2 solo acepta una DB_NAME iwana_it_g7_* desechable.');
  }

  const host = databaseHost?.trim().toLowerCase() || '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('La integración K2 solo acepta un DB_HOST loopback.');
  }
}

/** K2 solo corre con opt-in explícito y conserva la guarda del destino desechable. */
export function resolveK2ReencryptIntegrationEnabled({
  optIn,
  databaseName,
  databaseHost,
  ciRunner,
}: K2ReencryptIntegrationOptions): boolean {
  const enabled = optIn === 'true';
  assertSafeDisposableIntegrationTarget({ enabled, databaseName, databaseHost, ciRunner });
  return enabled;
}
