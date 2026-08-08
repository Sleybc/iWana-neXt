/**
 * Migraciones diferidas — segunda ventana de un expand/contract.
 *
 * Una migración que retira columnas todavía útiles como respaldo (el `contract`
 * de un expand/contract) no debe aplicarse en la misma pasada que su `expand`:
 * mientras las columnas viejas sobrevivan, volver al binario anterior no exige
 * restaurar backup. Marcarla con `deferredBy` la deja fuera de la corrida normal
 * hasta que el operador exporta esa variable de entorno.
 *
 * Se **salta**, no se detiene la corrida: las migraciones posteriores que no
 * dependen de ella siguen aplicándose. El registro (`typeorm_migrations`) se
 * ordena por `id`, no por timestamp, así que aplicarla más tarde no desordena
 * el revert.
 */

export interface DeferrableMigration {
  /** Nombre de la variable de entorno que habilita esta migración. */
  deferredBy?: string;
}

/**
 * `true` si la migración está marcada como diferida y su variable no está activa.
 *
 * Para las migraciones que `deferredBy` declara (los `contract` de un
 * expand/contract, que RETIRAN columnas de respaldo de forma irreversible), el
 * flag solo se considera activo con el literal exacto `'true'`. Inversión
 * deliberada del razonamiento anterior: un env mal escrito (`TRUE`, `1`,
 * `yes`, `on`) debe **fallar cerrado** —quedarse diferido— no abierto. El
 * fallo benigno de un operador que no logra aplicar el contract es recuperable;
 * el maligno (destruir la vía de rollback de toda la flota por una
 * ortografía tolerante) no lo es. Mismo criterio que el precedente
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` (ver `cli/tenant-revert.ts`).
 */
export function isMigrationDeferred(
  migration: DeferrableMigration,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envVar = migration.deferredBy;

  if (!envVar) {
    return false;
  }

  return env[envVar] !== 'true';
}

/**
 * Interpreta una variable de entorno booleana de forma tolerante para usos
 * NO destructivos (hallazgo SEC): acepta `true`, `1`, `yes`, `on` (con trim y
 * sin importar mayúsculas). Quien la use en un aviso o advertencia (p. ej.
 * `shouldWarnContractEnvResidual`) se beneficia de la tolerancia: un env mal
 * escrito debe seguir denunciándose. NO debe usarse para flags que gobiernan
 * operaciones destructivas — esos exigen el literal `'true'` (ver
 * `isMigrationDeferred`).
 */
export function envValueIsTrue(value: string | undefined): boolean {
  if (value == null) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

/**
 * Migraciones diferidas pendientes, para que el CLI las anuncie al terminar.
 * Se resuelve sobre las listas de migraciones, no sobre el registro: una
 * diferida nunca llega a registrarse.
 */
export function listDeferredMigrations(
  migrationClasses: readonly (new () => DeferrableMigration & { name?: string })[],
  env: NodeJS.ProcessEnv = process.env,
): { name: string; envVar: string }[] {
  return migrationClasses
    .map((MigrationClass) => {
      const migration = new MigrationClass();

      return { migration, name: migration.name ?? MigrationClass.name };
    })
    .filter(({ migration }) => isMigrationDeferred(migration, env))
    .map(({ migration, name }) => ({ name, envVar: migration.deferredBy as string }));
}

/**
 * Descarta diferidas que ya constan aplicadas en el registro de migraciones.
 * Tras la ventana 2, el contract queda registrado y anunciarlo como "DIFERIDA"
 * en corridas siguientes sería un falso pendiente para el operador.
 */
export function filterDeferredMigrations(
  deferred: { name: string; envVar: string }[],
  appliedNames: ReadonlySet<string>,
): { name: string; envVar: string }[] {
  return deferred.filter(({ name }) => !appliedNames.has(name));
}

/** Aviso para que una migración diferida no pase inadvertida corrida tras corrida. */
export function describeDeferredMigration(migrationName: string, envVar: string): string {
  return (
    `[MIGRATOR] ${migrationName} DIFERIDA: no se aplica en esta corrida. ` +
    `Es el contract de un expand/contract y las columnas que retira siguen ` +
    `siendo el respaldo para revertir sin backup. Cuando corresponda: ` +
    `exporte ${envVar}=true y vuelva a migrar. ` +
    `Gobernanza: el diferimiento no debe volverse permanente — mientras esté ` +
    `pendiente, los digests sin clave siguen en la base y el rollback sin backup ` +
    `sigue siendo posible; planifique la ventana 2 dentro del periodo de ` +
    `confianza definido por el responsable del proyecto.`
  );
}

/**
 * Decisión del aviso F-3 (env residual del contract): se advierte solo cuando
 * la variable quedó activa pero ya no quedan contracts pendientes. Pura para
 * poder fijarla en tests.
 */
export function shouldWarnContractEnvResidual(
  pendingCount: number,
  env: NodeJS.ProcessEnv = process.env,
  envVar = 'IWANA_APPLY_PII_CONTRACT',
): boolean {
  return pendingCount === 0 && envValueIsTrue(env[envVar]);
}

/** Texto del aviso F-3: retirar la variable del entorno tras la ventana 2. */
export function describeContractEnvResidualWarning(envVar: string): string {
  return (
    `[MIGRATOR] ${envVar} está activo pero no hay contracts pendientes: ` +
    `si la ventana 2 ya se completó, retire la variable del entorno ` +
    `(secret store / pipeline) para que no siga activa en corridas futuras.`
  );
}
