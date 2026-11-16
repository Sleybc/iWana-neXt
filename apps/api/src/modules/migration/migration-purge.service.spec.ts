import { AuditAction } from '@iwana/shared';
import { MigrationPurgeService } from './migration-purge.service';
import { MIGRATION_UISP_USERS_PENDING_RETENTION_DAYS } from './migration.constants';

const tenantId = '69000000-0000-4000-8000-000000000001';
const tenant = { tenantId, schemaName: 'tenant_x' };

function harness(pendingDeleted: number) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const qr = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {},
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('DELETE FROM migration_uisp_users')) {
        return [Array.from({ length: pendingDeleted }, () => ({})), pendingDeleted];
      }
      return [];
    }),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const service = new MigrationPurgeService(
    { createQueryRunner: () => qr } as never,
    { deleteObject: jest.fn() } as never,
    audit as never,
  );
  return { service, calls, audit };
}

describe('MigrationPurgeService — filas PENDIENTE de usuarios de UISP (D10)', () => {
  it('borra con su PII las filas PENDIENTE leídas hace más de 30 días y audita solo el conteo', async () => {
    const { service, calls, audit } = harness(3);
    const now = new Date('2026-12-20T08:30:00Z');

    await expect(service.purgeTenant(tenant, now)).resolves.toBe(0);

    const purge = calls.find((call) => call.sql.includes('DELETE FROM migration_uisp_users'));
    expect(purge).toBeDefined();
    expect(purge!.sql).toMatch(/status = 'PENDIENTE'/u);
    expect(purge!.sql).toMatch(/COALESCE\(last_fetched_at, created_at\) <= \$2/u);
    const cutoff = new Date(
      now.getTime() - MIGRATION_UISP_USERS_PENDING_RETENTION_DAYS * 86_400_000,
    );
    expect(purge!.params).toEqual([tenantId, cutoff]);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DELETE,
        entityType: 'MigrationUispUsers',
        entityId: tenantId,
        userId: null,
        newValue: { retencion: 'PENDIENTE_30_DIAS', filasBorradas: 3 },
      }),
      expect.anything(),
    );
  });

  it('sin filas vencidas no audita', async () => {
    const { service, audit } = harness(0);
    await service.purgeTenant(tenant, new Date('2026-12-20T08:30:00Z'));
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('la retención es de 30 días', () => {
    expect(MIGRATION_UISP_USERS_PENDING_RETENTION_DAYS).toBe(30);
  });
});
