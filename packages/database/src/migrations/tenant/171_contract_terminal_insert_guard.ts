import { MigrationInterface, QueryRunner } from 'typeorm';

/** Migración 171: rechaza contratos terminales insertados sin reloj de retención. */
export class ContractTerminalInsertGuard1710000000171 implements MigrationInterface {
  name = 'ContractTerminalInsertGuard1710000000171';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION contract_preserve_retention_clock() RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.status IN ('TERMINATED', 'ARCHIVED') AND NEW.terminated_at IS NULL THEN
            RAISE EXCEPTION 'La inserción terminal requiere fecha de terminación.' USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END IF;
        IF OLD.terminated_at IS NOT NULL AND NEW.terminated_at IS DISTINCT FROM OLD.terminated_at THEN
          RAISE EXCEPTION 'La fecha de terminación es inmutable.' USING ERRCODE = '23514';
        END IF;
        IF OLD.status NOT IN ('TERMINATED', 'ARCHIVED')
           AND NEW.status IN ('TERMINATED', 'ARCHIVED') AND NEW.terminated_at IS NULL THEN
          RAISE EXCEPTION 'La transición terminal requiere fecha de terminación.' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $function$;
      CREATE TRIGGER trg_contracts_require_retention_clock_insert BEFORE INSERT ON contracts
        FOR EACH ROW EXECUTE FUNCTION contract_preserve_retention_clock()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_contracts_require_retention_clock_insert ON contracts',
    );
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION contract_preserve_retention_clock() RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF OLD.terminated_at IS NOT NULL AND NEW.terminated_at IS DISTINCT FROM OLD.terminated_at THEN
          RAISE EXCEPTION 'La fecha de terminación es inmutable.' USING ERRCODE = '23514';
        END IF;
        IF OLD.status NOT IN ('TERMINATED', 'ARCHIVED')
           AND NEW.status IN ('TERMINATED', 'ARCHIVED') AND NEW.terminated_at IS NULL THEN
          RAISE EXCEPTION 'La transición terminal requiere fecha de terminación.' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $function$;
    `);
  }
}
