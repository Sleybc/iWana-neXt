/**
 * «Solicitar visita» desde un ticket contra PostgreSQL real: el procesador crea la
 * solicitud de visita con las entidades que registra el worker (WORKER_ENTITIES).
 * Regresión del 2026-11-17: sin `VisitRequest` registrada, el job fallaba con
 * EntityMetadataNotFoundError y el ticket quedaba sin visita.
 *
 * Ejecutar: NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test
 *   pnpm --filter @iwana/worker exec jest -c jest.integration.config.js assurance-field-service.visit-request
 */
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { resolveMigrationDbCredentials } from '@iwana/db';
import type { FieldServiceRequest } from '@iwana/shared';
import { WORKER_ENTITIES } from '../worker-entities';
import { AssuranceFieldServiceProcessor } from './assurance-field-service.processor';

/** Mismo patrón que execution-order-relay.integration.spec: DB_* del .env raíz si no vienen dadas. */
function loadWorkspaceEnv(): void {
  const envPath = resolve(__dirname, '../../../../.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    const separator = line.indexOf('=');
    if (!line || line.startsWith('#') || separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
}

loadWorkspaceEnv();

const runIt = process.env.DB_NAME === 'test' ? describe : describe.skip;

runIt('AssuranceFieldServiceProcessor con PostgreSQL real', () => {
  let dataSource: DataSource;
  let tenantId: string;
  let schemaName: string;
  let requestedByUserId: string;
  const ticketIds: string[] = [];

  /** Siembra un ticket y su solicitud de visita como lo hace el API; devuelve ids. */
  async function seedTicket(
    linkExec: { query: DataSource['query'] } = dataSource,
  ): Promise<{ ticketId: string; linkId: string }> {
    const ticketId = randomUUID();
    const linkId = randomUUID();
    ticketIds.push(ticketId);
    await dataSource.query(
      `INSERT INTO "${schemaName}".support_tickets
         (id, tenant_id, ticket_number, type, status, priority, subject, requester_type,
          created_by_user_id)
       VALUES ($1, $2, $3, 'CUSTOMER_INCIDENT', 'IN_PROGRESS', 'HIGH',
               'Prueba de integración: visita desde ticket', 'INTERNAL_USER', $4)`,
      [ticketId, tenantId, `TK-IT-${ticketId.slice(0, 8)}`, requestedByUserId],
    );
    await linkExec.query(
      `INSERT INTO "${schemaName}".ticket_work_order_links
         (id, ticket_id, tenant_id, requested_at, requested_by_user_id, notes)
       VALUES ($1, $2, $3, now(), $4, 'Creada por la prueba de integración del worker.')`,
      [linkId, ticketId, tenantId, requestedByUserId],
    );
    return { ticketId, linkId };
  }

  function jobFor(ids: { ticketId: string; linkId: string }): Job<FieldServiceRequest> {
    // Solo ids (sec-eng C-1): asunto y notas los lee el procesador del schema tenant.
    return {
      name: 'request-field-service',
      data: { ...ids, tenantId, schemaName, requestedByUserId },
    } as unknown as Job<FieldServiceRequest>;
  }

  beforeAll(async () => {
    // Rol migrador, como el resto de la integración del worker: en CI `iwana_app` no
    // tiene USAGE sobre el schema tenant hasta el paso de mínimo privilegio, posterior.
    const migrator = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
      username: migrator.username,
      password: migrator.password,
      database: process.env.DB_NAME ?? 'test',
      entities: WORKER_ENTITIES,
      synchronize: false,
    });
    await dataSource.initialize();
    const slug = process.env.E2E_TENANT_SLUG ?? 'test';
    const [tenant] = await dataSource.query(
      'SELECT id::text AS id, schema_name FROM public.tenants WHERE slug = $1',
      [slug],
    );
    if (!tenant) throw new Error(`[BLOCKED] No existe el tenant de pruebas «${slug}».`);
    tenantId = tenant.id;
    schemaName = tenant.schema_name;
    // Columnas de usuario sin FK: basta un uuid propio.
    requestedByUserId = randomUUID();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (ticketIds.length) {
      await dataSource.query(
        `DELETE FROM "${schemaName}".visit_requests WHERE ticket_id = ANY($1::text[])`,
        [ticketIds],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}".ticket_work_order_links WHERE ticket_id = ANY($1::uuid[])`,
        [ticketIds],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}".support_tickets WHERE id = ANY($1::uuid[])`,
        [ticketIds],
      );
    }
    await dataSource.destroy();
  });

  it('crea la solicitud de visita con asunto y notas del schema y no la duplica al reintentar', async () => {
    const processor = new AssuranceFieldServiceProcessor(dataSource);
    const ids = await seedTicket();

    await processor.process(jobFor(ids));
    await processor.process(jobFor(ids));

    const rows = await dataSource.query(
      `SELECT status, origin_context, origin_label, priority, title, description
         FROM "${schemaName}".visit_requests WHERE ticket_id = $1 AND deleted_at IS NULL`,
      [ids.ticketId],
    );
    expect(rows).toEqual([
      {
        status: 'NEEDS_CONTEXT',
        origin_context: 'ASSURANCE',
        origin_label: `Ticket TK-IT-${ids.ticketId.slice(0, 8)}`,
        priority: 'HIGH',
        title: 'Prueba de integración: visita desde ticket',
        description: 'Creada por la prueba de integración del worker.',
      },
    ]);
  });

  it('espera el commit de la transacción del API que encoló el job y ve la solicitud', async () => {
    const processor = new AssuranceFieldServiceProcessor(dataSource);
    // Como el API: transacción abierta con el ticket bloqueado y la solicitud sin confirmar.
    const api = dataSource.createQueryRunner();
    await api.connect();
    await api.startTransaction();
    let ids: { ticketId: string; linkId: string };
    try {
      ids = await seedTicket(api);
      await api.query(`SELECT 1 FROM "${schemaName}".support_tickets WHERE id = $1 FOR UPDATE`, [
        ids.ticketId,
      ]);
      const processing = processor.process(jobFor(ids));
      await new Promise((r) => setTimeout(r, 300));
      await api.commitTransaction();
      await processing;
    } finally {
      await api.release();
    }

    const rows = await dataSource.query(
      `SELECT description FROM "${schemaName}".visit_requests
        WHERE ticket_id = $1 AND deleted_at IS NULL`,
      [ids!.ticketId],
    );
    expect(rows).toEqual([{ description: 'Creada por la prueba de integración del worker.' }]);
  });
});
