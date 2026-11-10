import type { MigrationInterface, QueryRunner } from 'typeorm';

const ORIGINAL_OWN = `              SELECT 'pg_catalog.pg_proc'::regclass, p.oid
                FROM pg_catalog.pg_proc p WHERE p.pronamespace = v_nsp`;

const EXTENDED_OWN = `${ORIGINAL_OWN}
              UNION ALL
              SELECT 'pg_catalog.pg_namespace'::regclass, v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_collation'::regclass, oid
                FROM pg_catalog.pg_collation WHERE collnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_operator'::regclass, oid
                FROM pg_catalog.pg_operator WHERE oprnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_opclass'::regclass, oid
                FROM pg_catalog.pg_opclass WHERE opcnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_opfamily'::regclass, oid
                FROM pg_catalog.pg_opfamily WHERE opfnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_conversion'::regclass, oid
                FROM pg_catalog.pg_conversion WHERE connamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_ts_config'::regclass, oid
                FROM pg_catalog.pg_ts_config WHERE cfgnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_ts_dict'::regclass, oid
                FROM pg_catalog.pg_ts_dict WHERE dictnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_ts_parser'::regclass, oid
                FROM pg_catalog.pg_ts_parser WHERE prsnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_ts_template'::regclass, oid
                FROM pg_catalog.pg_ts_template WHERE tmplnamespace = v_nsp
              UNION ALL
              SELECT 'pg_catalog.pg_statistic_ext'::regclass, oid
                FROM pg_catalog.pg_statistic_ext WHERE stxnamespace = v_nsp`;

const ORIGINAL_RESOLVER_END = `                       ELSE NULL
                     END AS dep_nsp`;

// El catálogo de direcciones no devuelve esquema para estas entradas auxiliares.
const EXTENDED_RESOLVER_END = `                       WHEN 'pg_catalog.pg_amop'::regclass THEN
                         (SELECT f.opfnamespace FROM pg_catalog.pg_amop a
                            JOIN pg_catalog.pg_opfamily f ON f.oid = a.amopfamily WHERE a.oid = d.objid)
                       WHEN 'pg_catalog.pg_amproc'::regclass THEN
                         (SELECT f.opfnamespace FROM pg_catalog.pg_amproc a
                            JOIN pg_catalog.pg_opfamily f ON f.oid = a.amprocfamily WHERE a.oid = d.objid)
                       WHEN 'pg_catalog.pg_default_acl'::regclass THEN
                         (SELECT a.defaclnamespace FROM pg_catalog.pg_default_acl a WHERE a.oid = d.objid)
${ORIGINAL_RESOLVER_END}`;

const ORIGINAL_DEPENDENCY_TEST = `                   ) IS DISTINCT FROM v_nsp`;

// PostgreSQL puede subir del miembro a la extensión al resolver DROP CASCADE.
const EXTENDED_DEPENDENCY_TEST = `${ORIGINAL_DEPENDENCY_TEST}
            UNION ALL
            SELECT 1
              FROM pg_catalog.pg_depend d
              JOIN own o ON o.classid = d.classid AND o.objid = d.objid
             WHERE d.deptype = 'e' AND d.refclassid = 'pg_catalog.pg_extension'::regclass`;

async function replaceDependencyGuard(
  queryRunner: QueryRunner,
  replacements: ReadonlyArray<readonly [previous: string, next: string]>,
): Promise<void> {
  const [row] = (await queryRunner.query(`
    SELECT pg_catalog.pg_get_functiondef(
      'public.iwana_purge_tenant_schema(uuid, integer)'::pg_catalog.regprocedure
    ) AS definition
  `)) as [{ definition: string }];

  let definition = row.definition;
  for (const [previous, next] of replacements) {
    const start = definition.indexOf(previous);
    if (start === -1 || start !== definition.lastIndexOf(previous)) {
      throw new Error('030: la guarda de dependencias de purga difiere de la versión esperada.');
    }
    definition = definition.replace(previous, next);
  }

  // CREATE OR REPLACE conserva el propietario y los permisos otorgados por la 029.
  await queryRunner.query(definition);
}

export class HardenTenantPurgeDependencies1784419218000 implements MigrationInterface {
  name = 'HardenTenantPurgeDependencies1784419218000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await replaceDependencyGuard(queryRunner, [
      [ORIGINAL_OWN, EXTENDED_OWN],
      [ORIGINAL_RESOLVER_END, EXTENDED_RESOLVER_END],
      [ORIGINAL_DEPENDENCY_TEST, EXTENDED_DEPENDENCY_TEST],
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await replaceDependencyGuard(queryRunner, [
      [EXTENDED_OWN, ORIGINAL_OWN],
      [EXTENDED_RESOLVER_END, ORIGINAL_RESOLVER_END],
      [EXTENDED_DEPENDENCY_TEST, ORIGINAL_DEPENDENCY_TEST],
    ]);
  }
}
