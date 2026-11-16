import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TicketCommentAttachments2120000000212 } from './212_ticket_comment_attachments';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

/**
 * Migración 212 en PostgreSQL real (spec MOD09 2026-11-16 «adjuntos en tickets» §2.1):
 * FK compuesta al comentario y a su ticket, tipos y límites por tipo, nombre sin rutas ni
 * controles, un activo de medios por adjunto, `external_id` único parcial por tenant e
 * índices. down bloquea con filas (salvo la variable destructiva) y up vuelve a aplicar.
 *
 * Datos sintéticos: nunca adjuntos reales.
 */
const SCHEMA = `tenant_m212_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const ACTOR_ID = randomUUID();
const DESTRUCTIVE = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const MB = 1024 * 1024;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseAllowed = /^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '');
const describeWithDb = dbAvailable && databaseAllowed ? describe : describe.skip;

jest.setTimeout(900_000);

describeWithDb('Migración 212 — adjuntos de comentarios de tickets', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const m212 = new TicketCommentAttachments2120000000212();
  let ticketId = '';
  let otherTicketId = '';
  let commentId = '';

  const insertAttachment = `INSERT INTO ticket_comment_attachments
      (tenant_id, ticket_id, comment_id, media_asset_id, filename, content_type, size_bytes,
       uploaded_by_user_id, external_id, import_batch_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

  function qr(): QueryRunner {
    if (!runner) throw new Error('QueryRunner no inicializado.');
    return runner;
  }

  function row(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
    const value = {
      ticket: ticketId,
      comment: commentId,
      media: randomUUID(),
      filename: 'acta-visita.pdf',
      contentType: 'application/pdf',
      size: 2048,
      externalId: null as string | null,
      batch: null as string | null,
      ...overrides,
    };
    return [
      TENANT_ID,
      value.ticket,
      value.comment,
      value.media,
      value.filename,
      value.contentType,
      value.size,
      ACTOR_ID,
      value.externalId,
      value.batch,
    ];
  }

  async function sqlstateOf(sql: string, params: unknown[] = []): Promise<string> {
    await qr().query('SAVEPOINT sp_m212');
    try {
      await qr().query(sql, params);
    } catch (error) {
      await qr().query('ROLLBACK TO SAVEPOINT sp_m212');
      return (error as { code?: string }).code ?? 'sin-codigo';
    }
    await qr().query('RELEASE SAVEPOINT sp_m212');
    return 'aceptado';
  }

  async function createTicket(): Promise<string> {
    const [ticket] = (await qr().query(
      `INSERT INTO support_tickets
         (tenant_id, ticket_number, type, subject, requester_type, created_by_user_id)
       VALUES ($1, $2, 'INTERNAL', 'Ticket sintético 212', 'INTERNAL_USER', $3)
       RETURNING id`,
      [TENANT_ID, `TKT-212-${randomBytes(3).toString('hex')}`, ACTOR_ID],
    )) as Array<{ id: string }>;
    return ticket!.id;
  }

  async function indexDefinitions(): Promise<string[]> {
    const rows = (await qr().query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'ticket_comment_attachments'`,
    )) as Array<{ indexdef: string }>;
    return rows.map((entry) => entry.indexdef);
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${SCHEMA}"`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Migración 212 sintética', $2, $3, 'INACTIVE', $4)`,
      [TENANT_ID, SCHEMA.replaceAll('_', '-'), SCHEMA, `${SCHEMA}@invalid.example`],
    );
    const tenantDataSource = createTenantDataSource(dataSource, SCHEMA);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);
    await runner.startTransaction();

    ticketId = await createTicket();
    otherTicketId = await createTicket();
    const [comment] = (await qr().query(
      `INSERT INTO ticket_comments (ticket_id, tenant_id, body, is_internal, author_user_id)
       VALUES ($1, $2, 'Comentario sintético', false, $3) RETURNING id`,
      [ticketId, TENANT_ID, ACTOR_ID],
    )) as Array<{ id: string }>;
    commentId = comment!.id;
  });

  afterAll(async () => {
    delete process.env[DESTRUCTIVE];
    try {
      if (runner && !runner.isReleased) {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    } finally {
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [TENANT_ID]);
        await dataSource.destroy();
      }
    }
  });

  it('acepta un adjunto de cada tipo dentro de su límite', async () => {
    for (const [contentType, size] of [
      ['image/jpeg', 25 * MB],
      ['image/png', 1],
      ['image/webp', 1024],
      ['image/gif', 1024],
      ['application/pdf', 25 * MB],
      ['video/mp4', 100 * MB],
    ] as const) {
      expect(await sqlstateOf(insertAttachment, row({ contentType, size }))).toBe('aceptado');
    }
  });

  it.each([
    ['tipo no admitido', { contentType: 'application/zip' }],
    ['foto de más de 25 MB', { contentType: 'image/png', size: 25 * MB + 1 }],
    ['PDF de más de 25 MB', { contentType: 'application/pdf', size: 25 * MB + 1 }],
    ['MP4 de más de 100 MB', { contentType: 'video/mp4', size: 100 * MB + 1 }],
    ['tamaño cero', { size: 0 }],
    ['nombre vacío', { filename: '  ' }],
    ['nombre con barra', { filename: '../x.pdf' }],
    ['nombre con barra invertida', { filename: 'c:\\x.pdf' }],
    ['nombre con salto de línea', { filename: 'a\nb.pdf' }],
  ])('rechaza %s (23514)', async (_name, overrides) => {
    expect(await sqlstateOf(insertAttachment, row(overrides))).toBe('23514');
  });

  it('rechaza un nombre de 201 caracteres por longitud (22001)', async () => {
    expect(await sqlstateOf(insertAttachment, row({ filename: `${'a'.repeat(197)}.pdf` }))).toBe(
      '22001',
    );
  });

  it('admite un nombre de 200 caracteres con acentos', async () => {
    expect(await sqlstateOf(insertAttachment, row({ filename: `${'é'.repeat(196)}.pdf` }))).toBe(
      'aceptado',
    );
  });

  it('el comentario debe existir y pertenecer al ticket (23503)', async () => {
    expect(await sqlstateOf(insertAttachment, row({ comment: randomUUID() }))).toBe('23503');
    expect(await sqlstateOf(insertAttachment, row({ ticket: otherTicketId }))).toBe('23503');
  });

  it('un activo de medios por adjunto en el tenant (23505)', async () => {
    const media = randomUUID();
    expect(await sqlstateOf(insertAttachment, row({ media }))).toBe('aceptado');
    expect(await sqlstateOf(insertAttachment, row({ media }))).toBe('23505');
  });

  it('external_id único por tenant solo cuando existe', async () => {
    const batch = randomUUID();
    const externalId = 'uisp:ticket_attachment:4711';
    expect(await sqlstateOf(insertAttachment, row({ externalId, batch }))).toBe('aceptado');
    expect(await sqlstateOf(insertAttachment, row({ externalId, batch }))).toBe('23505');
    expect(await sqlstateOf(insertAttachment, row())).toBe('aceptado');
    expect(await sqlstateOf(insertAttachment, row())).toBe('aceptado');
  });

  it('un comentario con adjuntos no se borra (23001, RESTRICT): la reversión retira primero los adjuntos', async () => {
    expect(await sqlstateOf('DELETE FROM ticket_comments WHERE id = $1', [commentId])).toBe(
      '23001',
    );
  });

  it('crea los índices por ticket, por comentario, por lote y el único parcial de external_id', async () => {
    const definitions = (await indexDefinitions()).join('\n');
    expect(definitions).toMatch(
      /idx_ticket_comment_attachments_ticket .*\(tenant_id, ticket_id\)/u,
    );
    expect(definitions).toMatch(/idx_ticket_comment_attachments_comment .*\(comment_id\)/u);
    expect(definitions).toMatch(
      /UNIQUE INDEX uq_ticket_comment_attachments_external_id .*\(tenant_id, external_id\) WHERE \(external_id IS NOT NULL\)/u,
    );
    expect(definitions).toMatch(
      /idx_ticket_comment_attachments_import_batch .*\(import_batch_id\) WHERE \(import_batch_id IS NOT NULL\)/u,
    );
  });

  it('down bloquea con filas y no toca nada', async () => {
    await expect(m212.down(qr())).rejects.toThrow(/Migración 212 down bloqueada/u);
    const [present] = (await qr().query(
      `SELECT to_regclass('ticket_comment_attachments') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    expect(present?.present).toBe(true);
  });

  it('down destructivo retira la tabla y la restricción del comentario; up la restaura', async () => {
    process.env[DESTRUCTIVE] = 'true';
    try {
      await m212.down(qr());
    } finally {
      delete process.env[DESTRUCTIVE];
    }
    const [after] = (await qr().query(
      `SELECT to_regclass('ticket_comment_attachments') IS NOT NULL AS present,
              EXISTS (SELECT 1 FROM pg_constraint
                       WHERE conname = 'uq_ticket_comments_id_ticket'
                         AND connamespace = current_schema()::regnamespace) AS unique_present`,
    )) as Array<{ present: boolean; unique_present: boolean }>;
    expect(after).toEqual({ present: false, unique_present: false });

    await m212.up(qr());
    await m212.up(qr());
    expect(await sqlstateOf(insertAttachment, row())).toBe('aceptado');
  });

  it('down sin filas no exige la variable destructiva', async () => {
    await qr().query('DELETE FROM ticket_comment_attachments');
    await m212.down(qr());
    await m212.up(qr());
    expect(await sqlstateOf(insertAttachment, row())).toBe('aceptado');
  });
});
