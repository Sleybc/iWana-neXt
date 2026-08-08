import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';

import { dataSourceOptions } from './data-source';
import { PUBLIC_MIGRATIONS } from './migrations/public';

/**
 * DataSource EXCLUSIVO para `migration:revert` del schema público.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY DOS DATA SOURCES — no unificar sin leer esto
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `migrations` no significa lo mismo para `run` que para `revert`, y el CLI de
 * TypeORM lee la misma propiedad para ambos:
 *
 * - `migration:run` necesita la lista **filtrada** (`resolvePublicMigrations`).
 *   El CLI aplica todo lo pendiente y no tiene forma de saltarse una migración,
 *   así que una diferida (`deferredBy`) debe quedar fuera ANTES de que TypeORM
 *   la vea. Ese es el mecanismo de expand/contract de SEC-P1.
 *
 * - `migration:revert` necesita la lista **completa** (`PUBLIC_MIGRATIONS`).
 *   `MigrationExecutor.undoLastMigration` toma la fila más reciente del registro
 *   —ordenada por `id` DESC, no por timestamp— y resuelve su clase con
 *   `allMigrations.find(m => m.name === fila.name)`. Si no la encuentra, lanza
 *   `TypeORMError` y NO hay ninguna ruta de código que supere esa fila: el
 *   revert queda atascado ahí, y con él todas las migraciones de `id` inferior.
 *
 * Y ahí está el choque: una migración diferida que YA se aplicó (ventana 2 del
 * expand/contract) sigue registrada en la base, pero desaparece de la lista
 * filtrada en cuanto el operador retira su variable de entorno —que es
 * justamente lo que el runbook le ordena hacer al terminar. Con un solo
 * DataSource, cerrar la ventana 2 bricaba el revert público: la 022
 * (`DropPlatformUsersEmailHash1784419210000`) es la fila de `id` más alto y deja
 * de resolverse.
 *
 * Este archivo elimina ese acoplamiento sin tocar el camino de `run`: mismas
 * opciones de conexión (se heredan de `dataSourceOptions`, no se reescriben),
 * única diferencia la lista de migraciones. Es la misma decisión que ya toma el
 * camino tenant, donde `createTenantDataSource` usa `TENANT_MIGRATIONS` íntegra
 * y `planTenantRevert` falla rápido con un mensaje honesto ante una fila que no
 * resuelve.
 *
 * `023_prune_orphan_migration_registry_rows` cubre el caso complementario: filas
 * registradas que no corresponden a NINGUNA clase de ningún build, residuo de
 * los siete renombrados de clase que hubo en este directorio. Esas no se pueden
 * resolver ampliando la lista; hay que retirarlas del registro.
 *
 * NOTA PARA EL CLI: `CommandUtils.loadDataSource` exige que el archivo exporte
 * **exactamente un** `DataSource`. No reexportar `AppDataSource` desde aquí.
 */
export const publicRevertDataSourceOptions: DataSourceOptions = {
  ...dataSourceOptions,
  // La lista íntegra, a propósito. Si alguien la cambia por
  // `resolvePublicMigrations()`, el revert vuelve a romperse al cerrar la
  // ventana 2 — hay un spec que lo impide.
  migrations: PUBLIC_MIGRATIONS,
};

/** Único `DataSource` exportado: lo exige `CommandUtils.loadDataSource`. */
export const PublicRevertDataSource = new DataSource(publicRevertDataSourceOptions);
