import { MigrationInterface, QueryRunner } from 'typeorm';

/** Índices de lectura tenant para la pestaña Soporte de suscriptores (MOD05 E6). */
export const SUBSCRIBER_SUPPORT_LOOKUP_INDEX_NAMES = [
  'idx_support_tickets_tenant_requester_subscriber',
  'idx_support_tickets_tenant_subject',
  'idx_visit_requests_tenant_subscriber',
  'idx_visit_requests_tenant_expediente',
  'idx_schedule_events_tenant_subscriber',
] as const;

async function dropInvalidIndexIfExists(
  queryRunner: QueryRunner,
  indexName: string,
): Promise<void> {
  const rows = (await queryRunner.query(
    `SELECT 1
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1
        AND n.nspname = current_schema()
        AND i.indisvalid = false`,
    [indexName],
  )) as unknown[];

  if (rows.length === 0) return;
  if (!(SUBSCRIBER_SUPPORT_LOOKUP_INDEX_NAMES as readonly string[]).includes(indexName)) {
    throw new Error(`Nombre de índice fuera de la lista permitida: ${indexName}`);
  }

  await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
}

async function verifyIndexes(queryRunner: QueryRunner): Promise<void> {
  const rows = (await queryRunner.query(
    `
    SELECT c.relname AS index_name, i.indisvalid AS is_valid
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = ANY($1::text[])
       AND n.nspname = current_schema()
  `,
    [[...SUBSCRIBER_SUPPORT_LOOKUP_INDEX_NAMES]],
  )) as Array<{
    index_name: string;
    is_valid: boolean;
  }>;
  const byName = new Map(rows.map((row) => [row.index_name, row.is_valid]));
  const invalid = rows.filter((row) => !row.is_valid).map((row) => row.index_name);
  const missing = SUBSCRIBER_SUPPORT_LOOKUP_INDEX_NAMES.filter((name) => !byName.has(name));

  if (invalid.length > 0 || missing.length > 0) {
    throw new Error(
      `Migración 159 incompleta: índices inválidos [${invalid.join(', ')}], ` +
        `faltantes [${missing.join(', ')}].`,
    );
  }
}

/**
 * Migración tenant 159: índices parciales y compuestos para filtrar tickets,
 * solicitudes de visita por suscriptor o expediente y eventos por suscriptor.
 * Es aditiva y reversible.
 *
 * Los índices se construyen concurrentemente (ADR-066); `down()` solo elimina
 * estas estructuras y conserva las tablas y sus filas.
 */
export class AddSubscriberSupportLookupIndexes1590000000000 implements MigrationInterface {
  name = 'AddSubscriberSupportLookupIndexes1590000000000';

  /** CREATE/DROP INDEX CONCURRENTLY no puede ejecutarse dentro de una transacción. */
  transactional = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await dropInvalidIndexIfExists(queryRunner, 'idx_support_tickets_tenant_requester_subscriber');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_tenant_requester_subscriber
        ON support_tickets (tenant_id, requester_ref_id)
        WHERE requester_type = 'SUBSCRIBER'
    `);

    await dropInvalidIndexIfExists(queryRunner, 'idx_support_tickets_tenant_subject');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_tenant_subject
        ON support_tickets (tenant_id, subject_type, subject_ref_id)
    `);

    await dropInvalidIndexIfExists(queryRunner, 'idx_visit_requests_tenant_subscriber');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_requests_tenant_subscriber
        ON visit_requests (tenant_id, subscriber_id)
    `);

    await dropInvalidIndexIfExists(queryRunner, 'idx_visit_requests_tenant_expediente');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_requests_tenant_expediente
        ON visit_requests (tenant_id, expediente_id)
        WHERE expediente_id IS NOT NULL AND deleted_at IS NULL
    `);

    await dropInvalidIndexIfExists(queryRunner, 'idx_schedule_events_tenant_subscriber');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedule_events_tenant_subscriber
        ON schedule_events (tenant_id, subscriber_id)
    `);

    await verifyIndexes(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_schedule_events_tenant_subscriber',
    );
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_visit_requests_tenant_expediente',
    );
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_visit_requests_tenant_subscriber',
    );
    await queryRunner.query('DROP INDEX CONCURRENTLY IF EXISTS idx_support_tickets_tenant_subject');
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_support_tickets_tenant_requester_subscriber',
    );
  }
}
