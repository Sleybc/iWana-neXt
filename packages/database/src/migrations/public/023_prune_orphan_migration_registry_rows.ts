import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nombres históricos que quedaron registrados en `public.typeorm_migrations` sin
 * corresponder a ninguna clase de este build.
 *
 * ORIGEN — no es «el defecto del sufijo corto», es cualquier renombrado de clase
 * ------------------------------------------------------------------------------
 * TypeORM identifica una migración aplicada por el NOMBRE DE SU CLASE, que es lo
 * que graba en el registro. Renombrar la clase de una migración ya aplicada deja
 * por tanto una fila sin dueño: el nombre viejo sigue registrado y el nuevo se
 * graba aparte, como si fueran dos migraciones distintas.
 *
 * En este repo eso pasó siete veces, por dos motivos distintos que producen el
 * mismo residuo:
 *
 * - 012–015: el sufijo original (`1700000000012`…) invadía el rango de
 *   timestamps de las migraciones TENANT. Se reasignaron al rango público
 *   (`1784419201000`…). Trece dígitos antes y después: nunca fue un «sufijo
 *   corto», y aun así el residuo es idéntico.
 * - 018, 020, 021: sufijo de menos de 13 dígitos (`0180000000000`,
 *   `0200000000000`, `0210000000000`), que TypeORM lee como un timestamp ~2e11 y
 *   ordena antes de `001_create_public_schema`, rompiendo todo bootstrap limpio.
 *
 * Solo la 020 y la 021 llevan un `DELETE` de su propio nombre legacy en el
 * `up()`. Las otras cinco no. Y aunque lo llevaran, ese `DELETE` únicamente
 * limpia las instalaciones donde el `up()` corrió DESPUÉS de añadirlo: donde la
 * migración ya constaba aplicada, el `up()` no vuelve a ejecutarse y la fila
 * huérfana sobrevive indefinidamente. Es lo que se observó en la base de
 * desarrollo antes del reset, con la 018 y la 020 residuales y la 021 ya limpia.
 *
 * CÓMO SE CONSTRUYÓ ESTA LISTA, Y HASTA DÓNDE LLEGA
 * ------------------------------------------------------------------------------
 * No leyendo el código: el código solo delata los renombrados cuyo autor dejó
 * una constante `LEGACY_MIGRATION_NAME`, y cinco de los siete no la tienen. Se
 * construyó recorriendo el historial de cada archivo de este directorio
 * (`git log --all` sobre cada path, extrayendo todo `export class …` que haya
 * existido) y contrastando con el nombre vigente.
 *
 * LÍMITE DECLARADO — esta lista NO es demostrablemente exhaustiva:
 *
 * - Solo ve lo que el historial alcanzable conserva. Una rama borrada y ya
 *   podada por `gc`, o una versión aplicada desde un working copy que nunca se
 *   commiteó, dejaría un residuo invisible a este método.
 * - Se verificó que no hubo renombrados de ARCHIVO ni borrados de fuentes de
 *   migración en este directorio, que serían el otro punto ciego del recorrido.
 * - `migration:show` no delata estos residuos (itera las clases del código y
 *   busca su fila, nunca al revés), así que un residuo no listado no aparecerá
 *   en ningún diagnóstico rutinario: se manifestará como un `TypeORMError` en
 *   mitad de un rollback, que es el peor momento posible para descubrirlo.
 *
 * Si aparece un residuo nuevo, la corrección es añadirlo aquí y crear una
 * migración de saneamiento nueva — no editar esta, que ya constará aplicada.
 *
 * POR QUÉ LISTA CERRADA Y NO BARRIDO GENÉRICO
 * ------------------------------------------------------------------------------
 * Un saneamiento del tipo «borrar toda fila que no case con una clase cargada»
 * sería exhaustivo por construcción, y por eso mismo es inaceptable: borraría
 * también las filas de las migraciones DIFERIDAS y las de un build más nuevo que
 * el binario en curso. Es exactamente el escenario contra el que
 * `planTenantRevert` falla rápido en vez de adivinar. Se prefiere una lista que
 * declara su límite a un barrido que no puede distinguir un residuo de una fila
 * legítima que este build no conoce.
 */
export const LEGACY_ORPHAN_MIGRATION_NAMES: readonly string[] = [
  // Reasignación de rango: invadían el espacio de timestamps de las tenant.
  'RedactLeakedTemporaryPasswords1700000000012',
  'AddTenantAdminEmail1700000000013',
  'EnforcePlatformAuditImmutability1700000000014',
  'AuditOwnerLeastPrivilege1700000000015',
  // Sufijo de menos de 13 dígitos: se ordenaban antes de 001_create_public_schema.
  'EnablePgTrgm0180000000000',
  'AddMediaAssetStatusAndClaim0200000000000',
  'PlatformUsersEmailHmac0210000000000',
];

/**
 * Migración pública 023 — retira del registro las filas legacy huérfanas.
 *
 * Por qué importa (verificado contra `typeorm/migration/MigrationExecutor.js`,
 * 0.3.31):
 *
 * - `migration:run` no se ve afectado: `executePendingMigrations` calcula lo
 *   pendiente comparando NOMBRES, y la comprobación de timestamp que existía
 *   está comentada en el propio TypeORM. Una fila huérfana solo desvía el
 *   contador informativo del log.
 * - `migration:show` tampoco la ve: `showMigrations` itera las clases del código
 *   y busca su fila, nunca al revés. El residuo es invisible al diagnóstico
 *   estándar — motivo de más para no dejarlo «documentado y ya».
 * - `migration:revert` sí se rompe. `loadExecutedMigrations` ordena por **`id`
 *   DESC** (no por timestamp), y `getLatestExecutedMigration` toma el primero.
 *   Cuando el revert llega a la fila huérfana, `allMigrations.find(...)` no
 *   encuentra clase y TypeORM lanza `TypeORMError` con un mensaje engañoso
 *   («make sure you have this migration in your codebase»). No hay ninguna ruta
 *   de código que pueda superarla: el revert queda atascado ahí para siempre, y
 *   con él todas las migraciones de `id` inferior.
 *
 * Schema: public.
 * Reversible: sí, con un `down()` deliberadamente vacío — ver su comentario.
 */
export class PruneOrphanMigrationRegistryRows1784419211000 implements MigrationInterface {
  // El sufijo es el timestamp que TypeORM usa para ordenar. Posterior a la 022
  // (1784419210000), no el número de archivo 023.
  name = 'PruneOrphanMigrationRegistryRows1784419211000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Se consulta antes de borrar para poder informar con exactitud qué se
    // retiró: un `DELETE` a ciegas no distingue «no había nada» de «se borraron
    // dos filas», y esa diferencia es la única evidencia que le queda al
    // operador de en qué estado estaba su entorno.
    const present = (await queryRunner.query(
      `SELECT "name"
       FROM "public"."typeorm_migrations"
       WHERE "name" = ANY($1::text[])
       ORDER BY "name"`,
      [LEGACY_ORPHAN_MIGRATION_NAMES],
    )) as Array<{ name: string }>;

    const orphanNames = present.map((row) => row.name);

    if (orphanNames.length === 0) {
      // Camino normal en un bootstrap limpio y en cualquier entorno ya saneado.
      process.stderr.write(
        '023: no hay filas legacy huérfanas en public.typeorm_migrations. Nada que retirar.\n',
      );

      return;
    }

    await queryRunner.query(
      `DELETE FROM "public"."typeorm_migrations"
       WHERE "name" = ANY($1::text[])`,
      [orphanNames],
    );

    process.stderr.write(
      `023: retiradas ${orphanNames.length} fila(s) legacy huérfana(s) de ` +
        `public.typeorm_migrations: ${orphanNames.join(', ')}. ` +
        'migration:revert vuelve a poder recorrer el registro completo.\n',
    );
  }

  // El `queryRunner` se declara para respetar la firma de `MigrationInterface`
  // y no se usa: este `down` no toca la base a propósito (ver abajo).
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Vacío a propósito, y esto es una decisión, no un olvido.
    //
    // 1. Reinsertar una fila huérfana reintroduciría exactamente el defecto que
    //    esta migración corrige: dejaría el revert atascado en ella.
    // 2. Un `down()` que lanzara convertiría a la 023 en el nuevo bloqueo del
    //    revert público — sería sustituir un tapón por otro.
    //
    // Revertir la 023 elimina su propia fila del registro y no toca nada más;
    // volver a aplicarla es idempotente.
    process.stderr.write(
      '023 down: no se reinsertan filas legacy huérfanas (reintroducirían el bloqueo de revert).\n',
    );
  }
}
