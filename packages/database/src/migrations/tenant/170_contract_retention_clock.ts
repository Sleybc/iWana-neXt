import { MigrationInterface, QueryRunner } from 'typeorm';

/** Reloj de retención: primera transición terminal; down elimina solo el campo derivado. */
export class ContractRetentionClock1700000000170 implements MigrationInterface {
  name = 'ContractRetentionClock1700000000170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE contracts ADD COLUMN terminated_at timestamptz NULL');
    const counts: Array<{ candidate: number; count: string }> = await queryRunner.query(`
      WITH candidates AS (
        SELECT c.id,
          (SELECT min(changed_at) FROM crm_lifecycle_changes l
           WHERE l.entity_type = 'CONTRACT' AND l.entity_id = c.id
             AND l.to_status IN ('TERMINATED', 'ARCHIVED')) AS history_at,
          c.status, c.status_changed_at, c.updated_at
        FROM contracts c
        LEFT JOIN subscribers s ON s.id = c.subscriber_id
        WHERE c.status IN ('TERMINATED', 'ARCHIVED') AND c.terminated_at IS NULL
          AND s.anonymized_at IS NULL
      ), resolved AS (
        SELECT *, CASE WHEN history_at IS NOT NULL THEN 1
          WHEN status = 'TERMINATED' AND status_changed_at IS NOT NULL THEN 2
          WHEN status = 'ARCHIVED' AND status_changed_at IS NOT NULL THEN 3
          ELSE 4 END AS candidate,
          COALESCE(history_at, status_changed_at, updated_at) AS anchor
        FROM candidates
      ), updated AS (
        UPDATE contracts c SET terminated_at = r.anchor FROM resolved r
        WHERE c.id = r.id RETURNING r.candidate
      ) SELECT candidate, count(*)::text AS count FROM updated GROUP BY candidate ORDER BY candidate
    `);
    // Conteo por candidato (D-O1-3). Solo números: el logger de TypeORM descarta el mensaje y el
    // runner muestra `console`, igual que las demás migraciones con salida.
    for (const candidate of [1, 2, 3, 4]) {
      const count = counts.find((row) => row.candidate === candidate)?.count ?? '0';
      console.log(`[170] O1 backfill candidate=${candidate} count=${count}`);
    }
    await queryRunner.query(`
      CREATE FUNCTION contract_preserve_retention_clock() RETURNS trigger LANGUAGE plpgsql AS $function$
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
      CREATE TRIGGER trg_contracts_preserve_retention_clock BEFORE UPDATE ON contracts
        FOR EACH ROW EXECUTE FUNCTION contract_preserve_retention_clock()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_contracts_preserve_retention_clock ON contracts',
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS contract_preserve_retention_clock()');
    await queryRunner.query('ALTER TABLE contracts DROP COLUMN terminated_at');
  }
}
