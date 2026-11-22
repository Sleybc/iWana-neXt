/**
 * `PlatformAuditService.query` y `exportCsv` con `excludeSessionEvents` /
 * `excludeAccessEvents` contra PostgreSQL real (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2
 * §A.3/§A.5; F2-D5: la exportación aplica los mismos filtros que el listado).
 *
 * El registro es append-only (trigger 014/024): las filas no se pueden borrar, así
 * que la siembra y las lecturas corren dentro de una transacción que se revierte
 * al final (F2-D4); en `public.platform_audit_logs` no queda nada.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js platform-audit-exclude-session
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { PlatformAuditLog, resolveMigrationDbCredentials } from '@iwana/db';
import { AUDIT_SESSION_ACTIONS, AuditAction, PLATFORM_AUDIT_ACCESS_ACTIONS } from '@iwana/shared';
import { PlatformAuditService } from './platform-audit.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const ENTITY_TYPE = `ItPulse${randomBytes(4).toString('hex')}`;

/** Acciones de la columna «Acción» del CSV (tercera celda tras fecha), sin cabecera. */
function csvActions(csv: string): string[] {
  return csv
    .split('\r\n')
    .slice(1)
    .map((line) => line.split('","')[1] ?? '')
    .sort();
}

describeWithDb('PlatformAuditService — filtros de exclusión, PostgreSQL real', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
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
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // El EntityManager de la transacción expone `createQueryBuilder`, `getRepository` y `query`.
    service = new PlatformAuditService(
      queryRunner.manager as unknown as DataSource,
      {
        resolveMany: async () => new Map(),
        systemActor: () => ({ id: null, type: 'system', displayName: 'Sistema' }),
        unknownActor: (id: string) => ({ id, type: 'platform', displayName: id }),
      } as never,
    );

    const actions = [
      ...AUDIT_SESSION_ACTIONS,
      ...PLATFORM_AUDIT_ACCESS_ACTIONS,
      AuditAction.CREATE,
      AuditAction.UPDATE,
    ];
    for (const action of actions) {
      await queryRunner.query(
        `INSERT INTO public.platform_audit_logs (id, action, entity_type, entity_id)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), action, ENTITY_TYPE, `it-${action.toLowerCase()}`],
      );
    }
  });

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
    await queryRunner?.release();
    if (dataSource?.isInitialized) {
      // F2-D4: la reversión no deja filas de la corrida.
      const [row] = (await dataSource.query(
        'SELECT count(*)::int AS count FROM public.platform_audit_logs WHERE entity_type = $1',
        [ENTITY_TYPE],
      )) as Array<{ count: number }>;
      await dataSource.destroy();
      expect(row?.count).toBe(0);
    }
  });

  const ALL = AUDIT_SESSION_ACTIONS.length + PLATFORM_AUDIT_ACCESS_ACTIONS.length + 2;

  it('listado con excludeSessionEvents=true quita las de sesión en datos y total', async () => {
    const result = await service.query({ entityType: ENTITY_TYPE, excludeSessionEvents: true });

    expect(result.total).toBe(PLATFORM_AUDIT_ACCESS_ACTIONS.length + 2);
    expect(result.data.map((row) => row.action).sort()).toEqual(
      ['CREATE', 'UPDATE', ...PLATFORM_AUDIT_ACCESS_ACTIONS].sort(),
    );
  });

  it('listado sin filtros (por defecto false) trae también las de sesión y las lecturas', async () => {
    const result = await service.query({ entityType: ENTITY_TYPE });

    expect(result.total).toBe(ALL);
  });

  it('exportación con excludeSessionEvents y excludeAccessEvents deja las mismas filas que el listado', async () => {
    const filters = {
      entityType: ENTITY_TYPE,
      excludeSessionEvents: true,
      excludeAccessEvents: true,
    };
    const listed = await service.query(filters);
    const exported = await service.exportCsv(filters);

    expect(exported.rowCount).toBe(2);
    expect(csvActions(exported.csv)).toEqual(['CREATE', 'UPDATE']);
    expect(csvActions(exported.csv)).toEqual(listed.data.map((row) => row.action).sort());
  });

  it('exportación con solo excludeAccessEvents conserva las de sesión', async () => {
    const exported = await service.exportCsv({
      entityType: ENTITY_TYPE,
      excludeAccessEvents: true,
    });

    expect(exported.rowCount).toBe(AUDIT_SESSION_ACTIONS.length + 2);
    expect(csvActions(exported.csv)).toEqual(['CREATE', 'UPDATE', ...AUDIT_SESSION_ACTIONS].sort());
  });

  it('exportación sin filtros de exclusión trae todas', async () => {
    const exported = await service.exportCsv({ entityType: ENTITY_TYPE });

    expect(exported.rowCount).toBe(ALL);
  });
});
