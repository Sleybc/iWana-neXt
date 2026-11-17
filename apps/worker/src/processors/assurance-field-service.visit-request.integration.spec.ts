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
  const ticketId = `TK-IT-${randomUUID()}`;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'iwana',
      password: process.env.DB_PASSWORD ?? '',
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
    // visit_requests.requested_by_user_id no tiene FK: basta un uuid propio.
    requestedByUserId = randomUUID();
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DELETE FROM "${schemaName}".visit_requests WHERE ticket_id = $1`, [
      ticketId,
    ]);
    await dataSource.destroy();
  });

  it('crea la solicitud de visita del ticket y no la duplica al reintentar', async () => {
    const processor = new AssuranceFieldServiceProcessor(dataSource);
    const job = {
      name: 'request-field-service',
      data: {
        ticketId,
        tenantId,
        schemaName,
        priority: 'HIGH',
        subject: 'Prueba de integración: visita desde ticket',
        requestedByUserId,
        notes: 'Creada por la prueba de integración del worker.',
      },
    } as unknown as Job<FieldServiceRequest>;

    await processor.process(job);
    await processor.process(job);

    const rows = await dataSource.query(
      `SELECT status, origin_context, ticket_id FROM "${schemaName}".visit_requests
        WHERE ticket_id = $1 AND deleted_at IS NULL`,
      [ticketId],
    );
    expect(rows).toEqual([
      { status: 'NEEDS_CONTEXT', origin_context: 'ASSURANCE', ticket_id: ticketId },
    ]);
  });
});
