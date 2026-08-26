import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repara tenants que quedaron sin horario base tras la migracion a Organization.
 * La semilla 07:00-18:00 preserva la compatibilidad aprobada para WFM.
 */
export class RepairOrganizationCompanyBusinessHoursSeed1170000000000 implements MigrationInterface {
  name = 'RepairOrganizationCompanyBusinessHoursSeed1170000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema        TEXT := current_schema();
        canonical_tenant_id  UUID;
        tenant_count         INTEGER;
        existing_count       INTEGER;
        explicit_configuration_count INTEGER;
        inserted_count       INTEGER;
      BEGIN
        IF tenant_schema IS NULL
           OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'
        THEN
          RAISE EXCEPTION
            'La migracion 117 solo puede ejecutarse sobre un schema tenant valido; schema actual: %',
            tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT COUNT(*)
        INTO tenant_count
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        IF tenant_count <> 1 THEN
          RAISE EXCEPTION
            'Se esperaba exactamente un tenant canonico para el schema %, encontrados: %',
            tenant_schema,
            tenant_count;
        END IF;

        SELECT id
        INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        LOCK TABLE organization_company_business_hours
          IN SHARE ROW EXCLUSIVE MODE;

        SELECT COUNT(*)
        INTO existing_count
        FROM organization_company_business_hours
        WHERE tenant_id = canonical_tenant_id;

        SELECT COUNT(*)
        INTO explicit_configuration_count
        FROM audit_logs
        WHERE tenant_id = canonical_tenant_id
          AND entity_type = 'organization_company_business_hours';

        IF existing_count = 0 AND explicit_configuration_count = 0 THEN
          INSERT INTO organization_company_business_hours (
            id,
            tenant_id,
            weekday,
            opens_at,
            closes_at,
            is_open
          )
          SELECT
            md5(
              concat_ws(
                chr(31),
                'iwana',
                'migration-117',
                canonical_tenant_id::TEXT,
                seed.weekday::TEXT
              )
            )::UUID,
            canonical_tenant_id,
            seed.weekday,
            TIME '07:00:00',
            TIME '18:00:00',
            TRUE
          FROM (
            VALUES
              ('MONDAY'::business_hours_weekday_enum),
              ('TUESDAY'::business_hours_weekday_enum),
              ('WEDNESDAY'::business_hours_weekday_enum),
              ('THURSDAY'::business_hours_weekday_enum),
              ('FRIDAY'::business_hours_weekday_enum),
              ('SATURDAY'::business_hours_weekday_enum),
              ('SUNDAY'::business_hours_weekday_enum)
          ) AS seed(weekday)
          ON CONFLICT (tenant_id, weekday) DO NOTHING;

          GET DIAGNOSTICS inserted_count = ROW_COUNT;

          IF inserted_count <> 7 THEN
            RAISE EXCEPTION
              'La semilla de horario operativo quedo incompleta para el schema %: insertadas % de 7 filas',
              tenant_schema,
              inserted_count;
          END IF;
        END IF;
      END
      $migration$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        tenant_schema        TEXT := current_schema();
        canonical_tenant_id  UUID;
        tenant_count         INTEGER;
        seed_row_count       INTEGER;
        intact_seed_count    INTEGER;
      BEGIN
        IF tenant_schema IS NULL
           OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'
        THEN
          RAISE EXCEPTION
            'El rollback de la migracion 117 solo puede ejecutarse sobre un schema tenant valido; schema actual: %',
            tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT COUNT(*)
        INTO tenant_count
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        IF tenant_count <> 1 THEN
          RAISE EXCEPTION
            'Se esperaba exactamente un tenant canonico para el schema %, encontrados: %',
            tenant_schema,
            tenant_count;
        END IF;

        SELECT id
        INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        LOCK TABLE organization_company_business_hours
          IN SHARE ROW EXCLUSIVE MODE;

        SELECT COUNT(*)
        INTO seed_row_count
        FROM organization_company_business_hours AS hours
        JOIN (
          VALUES
            ('MONDAY'::business_hours_weekday_enum),
            ('TUESDAY'::business_hours_weekday_enum),
            ('WEDNESDAY'::business_hours_weekday_enum),
            ('THURSDAY'::business_hours_weekday_enum),
            ('FRIDAY'::business_hours_weekday_enum),
            ('SATURDAY'::business_hours_weekday_enum),
            ('SUNDAY'::business_hours_weekday_enum)
        ) AS seed(weekday) ON hours.weekday = seed.weekday
        WHERE hours.tenant_id = canonical_tenant_id
          AND hours.id = md5(
            concat_ws(
              chr(31),
              'iwana',
              'migration-117',
              canonical_tenant_id::TEXT,
              seed.weekday::TEXT
            )
          )::UUID;

        SELECT COUNT(*)
        INTO intact_seed_count
        FROM organization_company_business_hours AS hours
        JOIN (
          VALUES
            ('MONDAY'::business_hours_weekday_enum),
            ('TUESDAY'::business_hours_weekday_enum),
            ('WEDNESDAY'::business_hours_weekday_enum),
            ('THURSDAY'::business_hours_weekday_enum),
            ('FRIDAY'::business_hours_weekday_enum),
            ('SATURDAY'::business_hours_weekday_enum),
            ('SUNDAY'::business_hours_weekday_enum)
        ) AS seed(weekday) ON hours.weekday = seed.weekday
        WHERE hours.tenant_id = canonical_tenant_id
          AND hours.weekday = seed.weekday
          AND hours.id = md5(
            concat_ws(
              chr(31),
              'iwana',
              'migration-117',
              canonical_tenant_id::TEXT,
              seed.weekday::TEXT
            )
          )::UUID
          AND hours.is_open = TRUE
          AND hours.opens_at = TIME '07:00:00'
          AND hours.closes_at = TIME '18:00:00'
          AND hours.created_at = hours.updated_at;

        IF seed_row_count = 0 THEN
          RETURN;
        END IF;

        IF seed_row_count <> 7 OR intact_seed_count <> 7 THEN
          RAISE EXCEPTION
            'No se puede revertir la migracion 117 en el schema % porque la semilla fue modificada',
            tenant_schema;
        END IF;

        DELETE FROM organization_company_business_hours AS hours
        USING (
          VALUES
            ('MONDAY'::business_hours_weekday_enum),
            ('TUESDAY'::business_hours_weekday_enum),
            ('WEDNESDAY'::business_hours_weekday_enum),
            ('THURSDAY'::business_hours_weekday_enum),
            ('FRIDAY'::business_hours_weekday_enum),
            ('SATURDAY'::business_hours_weekday_enum),
            ('SUNDAY'::business_hours_weekday_enum)
        ) AS seed(weekday)
        WHERE hours.tenant_id = canonical_tenant_id
          AND hours.weekday = seed.weekday
          AND hours.id = md5(
            concat_ws(
              chr(31),
              'iwana',
              'migration-117',
              canonical_tenant_id::TEXT,
              seed.weekday::TEXT
            )
          )::UUID;
      END
      $rollback$;
    `);
  }
}
