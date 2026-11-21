/**
 * `PlatformAuditService.query({ excludeSessionEvents })` contra PostgreSQL real
 * (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2 §A.3/§A.5). Siembra en
 * `public.platform_audit_logs` con un `entity_type` único por corrida; el
 * registro es append-only (trigger 014/024), así que las filas no se borran.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js platform-audit-exclude-session
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { PlatformAuditLog, resolveMigrationDbCredentials } from '@iwana/db';
import { AUDIT_SESSION_ACTIONS, AuditAction } from '@iwana/shared';
import { PlatformAuditService } from './platform-audit.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const ENTITY_TYPE = `ItPulse${randomBytes(4).toString('hex')}`;

describeWithDb('PlatformAuditService.query — excludeSessionEvents, PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: PlatformAuditService;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [PlatformAuditLog],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    service = new PlatformAuditService(dataSource, {
      resolveMany: async () => new Map(),
      systemActor: () => ({ id: null, type: 'system', displayName: 'Sistema' }),
      unknownActor: (id: string) => ({ id, type: 'platform', displayName: id }),
    } as never);

    const actions = [...AUDIT_SESSION_ACTIONS, AuditAction.CREATE, AuditAction.UPDATE];
    for (const action of actions) {
      await dataSource.query(
        `INSERT INTO public.platform_audit_logs (id, action, entity_type, entity_id)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), action, ENTITY_TYPE, `it-${action.toLowerCase()}`],
      );
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('con excludeSessionEvents=true quedan solo las acciones que no son de sesión, en datos y total', async () => {
    const result = await service.query({ entityType: ENTITY_TYPE, excludeSessionEvents: true });

    expect(result.total).toBe(2);
    expect(result.data.map((row) => row.action).sort()).toEqual(['CREATE', 'UPDATE']);
  });

  it('sin el filtro (por defecto false) trae también las de sesión', async () => {
    const result = await service.query({ entityType: ENTITY_TYPE });

    expect(result.total).toBe(AUDIT_SESSION_ACTIONS.length + 2);
  });
});
