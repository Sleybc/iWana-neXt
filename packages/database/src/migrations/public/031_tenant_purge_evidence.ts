import type { MigrationInterface, QueryRunner } from 'typeorm';

const LIST = 'public.iwana_list_purge_candidates(integer, integer)';
const PURGE = 'public.iwana_purge_tenant_schema(uuid, integer)';
const LOCK = 'public.iwana_lock_purge_evidence_target(uuid, timestamptz)';
const RECORD = 'public.iwana_record_tenant_purge_evidence(uuid, timestamptz, text, uuid, text)';
const REVOKE = 'public.iwana_revoke_tenant_purge_evidence(uuid, timestamptz, uuid)';
const REJECT_TRUNCATE = 'public.iwana_reject_tenant_purge_evidence_truncate()';

const LIST_PREDICATE = `             AND t.schema_name <> 'tenant_iwana'`;
const EVIDENCE_PREDICATE = `${LIST_PREDICATE}
             AND EXISTS (
               SELECT 1 FROM public.tenant_purge_evidence e
                WHERE e.tenant_id = t.id AND e.deleted_at = t.deleted_at AND e.revoked_at IS NULL
             )`;

const ACTOR = '        v_actor text := session_user;';
const EVIDENCE_VARIABLE = `${ACTOR}
        v_evidence_reference uuid;`;

const PURGE_AUDIT = '        -- 4. Auditoría de inicio, 5. DROP, 6. fila, 7. auditoría de cierre.';
const EVIDENCE_GUARD = `        -- La marca ya está bloqueada. READ COMMITTED impide autorizar con una
        -- instantánea anterior a una revocación que ya liberó el lock de R7.
        IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_ISOLATION' USING ERRCODE = 'P0001';
        END IF;
        SELECT e.evidence_reference INTO v_evidence_reference
          FROM public.tenant_purge_evidence e
         WHERE e.tenant_id = v_tenant.id AND e.deleted_at = v_tenant.deleted_at
           AND e.revoked_at IS NULL;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_REQUIRED' USING ERRCODE = 'P0001';
        END IF;

${PURGE_AUDIT}`;

const AUDIT_DATA = "'purgedBy', 'worker', 'retentionDays', v_retention, 'actor', v_actor)";
const EVIDENCE_AUDIT_DATA = `${AUDIT_DATA.slice(0, -1)},
             'evidenceReference', v_evidence_reference)`;

async function patchDefinition(
  queryRunner: QueryRunner,
  signature: string,
  replacements: ReadonlyArray<readonly [string, string, number]>,
): Promise<void> {
  const [row] = (await queryRunner.query(
    'SELECT pg_catalog.pg_get_functiondef($1::pg_catalog.regprocedure) AS definition',
    [signature],
  )) as [{ definition: string }];
  let definition = row.definition;
  for (const [before, after, count] of replacements) {
    if (definition.split(before).length !== count + 1) {
      throw new Error(`031: la definición de ${signature} difiere de la versión esperada.`);
    }
    definition = definition.replaceAll(before, after);
  }
  // CREATE OR REPLACE conserva la guarda 030, el dueño y la ACL de las funciones de R7.
  await queryRunner.query(definition);
}

const LIST_REPLACEMENTS = [[LIST_PREDICATE, EVIDENCE_PREDICATE, 1]] as const;
const PURGE_REPLACEMENTS = [
  [ACTOR, EVIDENCE_VARIABLE, 1],
  [PURGE_AUDIT, EVIDENCE_GUARD, 1],
  [AUDIT_DATA, EVIDENCE_AUDIT_DATA, 2],
] as const;

export class TenantPurgeEvidence1784419219000 implements MigrationInterface {
  name = 'TenantPurgeEvidence1784419219000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE public.tenant_purge_evidence (
        tenant_id uuid NOT NULL,
        deleted_at timestamptz NOT NULL,
        evidence_reference uuid NOT NULL,
        kind text NOT NULL CHECK (kind IN ('DATA_RETURN_DELIVERED', 'ISP_WRITTEN_INSTRUCTION')),
        evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
        recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
        revoked_at timestamptz,
        PRIMARY KEY (tenant_id, deleted_at, evidence_reference)
      );
      CREATE UNIQUE INDEX uq_tenant_purge_evidence_active
        ON public.tenant_purge_evidence (tenant_id, deleted_at) WHERE revoked_at IS NULL;
      REVOKE ALL ON TABLE public.tenant_purge_evidence FROM PUBLIC;
      ALTER TABLE public.tenant_purge_evidence ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.tenant_purge_evidence FORCE ROW LEVEL SECURITY;

      CREATE FUNCTION public.iwana_reject_tenant_purge_evidence_truncate()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, pg_temp
      AS $fn$
      BEGIN
        RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_TRUNCATE_FORBIDDEN' USING ERRCODE = '42501';
      END;
      $fn$;
      -- TRUNCATE no se rige por RLS y el script de roles puede volver a otorgarlo.
      CREATE TRIGGER trg_tenant_purge_evidence_no_truncate
        BEFORE TRUNCATE ON public.tenant_purge_evidence
        FOR EACH STATEMENT EXECUTE FUNCTION ${REJECT_TRUNCATE};
      REVOKE ALL ON FUNCTION ${REJECT_TRUNCATE} FROM PUBLIC;

      DO $policy$
      DECLARE
        v_owner name;
      BEGIN
        FOR v_owner IN
          SELECT DISTINCT pg_catalog.pg_get_userbyid(proowner)
            FROM pg_catalog.pg_proc
           WHERE oid IN ('${LIST}'::pg_catalog.regprocedure, '${PURGE}'::pg_catalog.regprocedure)
        LOOP
          EXECUTE pg_catalog.format('GRANT SELECT ON public.tenant_purge_evidence TO %I', v_owner);
          EXECUTE pg_catalog.format(
            'CREATE POLICY %I ON public.tenant_purge_evidence FOR SELECT TO %I USING (true)',
            'tenant_purge_evidence_read_' || v_owner, v_owner
          );
        END LOOP;
      END;
      $policy$;
    `);

    await queryRunner.query(`
      CREATE FUNCTION public.iwana_lock_purge_evidence_target(p_tenant_id uuid, p_deleted_at timestamptz)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, pg_temp
      AS $fn$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = session_user AND rolsuper) THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_DBA_REQUIRED' USING ERRCODE = '42501';
        END IF;
        IF p_tenant_id IS NULL OR p_deleted_at IS NULL THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_INVALID_TARGET' USING ERRCODE = '22023';
        END IF;
        IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_ISOLATION' USING ERRCODE = 'P0001';
        END IF;
        IF NOT pg_catalog.pg_try_advisory_xact_lock(43, pg_catalog.hashtext(p_tenant_id::text)) THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_BUSY' USING ERRCODE = '55P03';
        END IF;
        PERFORM 1 FROM public.tenants
         WHERE id = p_tenant_id AND deleted_at = p_deleted_at AND status = 'MARKED_FOR_DELETION'
         FOR UPDATE NOWAIT;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_INVALID_TARGET' USING ERRCODE = '22023';
        END IF;
      END;
      $fn$;

      CREATE FUNCTION public.iwana_record_tenant_purge_evidence(
        p_tenant_id uuid, p_deleted_at timestamptz, p_kind text, p_reference uuid, p_sha256 text
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, pg_temp
      AS $fn$
      BEGIN
        PERFORM public.iwana_lock_purge_evidence_target(p_tenant_id, p_deleted_at);
        IF p_kind IS NULL OR p_kind NOT IN ('DATA_RETURN_DELIVERED', 'ISP_WRITTEN_INSTRUCTION')
           OR p_reference IS NULL OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9A-Fa-f]{64}$' THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_INVALID_INPUT' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.tenant_purge_evidence
          (tenant_id, deleted_at, evidence_reference, kind, evidence_sha256)
        VALUES (p_tenant_id, p_deleted_at, p_reference, p_kind, pg_catalog.lower(p_sha256));
        INSERT INTO public.platform_audit_logs (action, entity_type, entity_id, new_value, request_id)
        VALUES ('TENANT_PURGE_EVIDENCE_RECORDED', 'Tenant', p_tenant_id::text,
          pg_catalog.jsonb_build_object('deletedAt', p_deleted_at, 'kind', p_kind,
            'evidenceReference', p_reference, 'actor', session_user),
          'db:tenant-purge-evidence');
      END;
      $fn$;

      CREATE FUNCTION public.iwana_revoke_tenant_purge_evidence(
        p_tenant_id uuid, p_deleted_at timestamptz, p_reference uuid
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog, pg_temp
      AS $fn$
      BEGIN
        PERFORM public.iwana_lock_purge_evidence_target(p_tenant_id, p_deleted_at);
        UPDATE public.tenant_purge_evidence SET revoked_at = pg_catalog.clock_timestamp()
         WHERE tenant_id = p_tenant_id AND deleted_at = p_deleted_at
           AND evidence_reference = p_reference AND revoked_at IS NULL;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_NOT_ACTIVE' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.platform_audit_logs (action, entity_type, entity_id, new_value, request_id)
        VALUES ('TENANT_PURGE_EVIDENCE_REVOKED', 'Tenant', p_tenant_id::text,
          pg_catalog.jsonb_build_object('deletedAt', p_deleted_at,
            'evidenceReference', p_reference, 'actor', session_user),
          'db:tenant-purge-evidence');
      END;
      $fn$;

      REVOKE ALL ON FUNCTION ${LOCK}, ${RECORD}, ${REVOKE} FROM PUBLIC;
    `);

    await patchDefinition(queryRunner, LIST, LIST_REPLACEMENTS);
    await patchDefinition(queryRunner, PURGE, PURGE_REPLACEMENTS);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error('031: la reversión de constancias requiere una transacción.');
    }
    await queryRunner.query(`
      LOCK TABLE public.tenant_purge_evidence IN ACCESS EXCLUSIVE MODE;
      -- El dueño actual debe ver todas las constancias, aunque haya cambiado la ACL.
      ALTER TABLE public.tenant_purge_evidence NO FORCE ROW LEVEL SECURITY;
      DO $rollback$
      BEGIN
        IF EXISTS (SELECT 1 FROM public.tenant_purge_evidence) THEN
          RAISE EXCEPTION 'TENANT_PURGE_EVIDENCE_ROLLBACK_REQUIRES_ARCHIVE';
        END IF;
      END;
      $rollback$;
    `);
    await patchDefinition(
      queryRunner,
      LIST,
      LIST_REPLACEMENTS.map(([before, after, count]) => [after, before, count]),
    );
    await patchDefinition(
      queryRunner,
      PURGE,
      PURGE_REPLACEMENTS.map(([before, after, count]) => [after, before, count]),
    );
    await queryRunner.query(`
      DROP FUNCTION ${RECORD}, ${REVOKE}, ${LOCK};
      DROP TABLE public.tenant_purge_evidence;
      DROP FUNCTION ${REJECT_TRUNCATE};
    `);
  }
}
