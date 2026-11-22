import {
  INSERT_TENANT_STATUS_TRANSITION_AUDIT_SQL,
  buildTenantStatusTransitionAudit,
  insertTenantStatusTransitionAudit,
} from './tenant-status-audit';

describe('auditoría de transición de estado de empresa (F2-D2)', () => {
  it('tiene la forma que lee «Activas al cierre»: UPDATE de Tenant con new_value.status y actor sistema', () => {
    expect(buildTenantStatusTransitionAudit('t-1', 'PROVISIONING', 'ACTIVE')).toEqual({
      action: 'UPDATE',
      entityType: 'Tenant',
      entityId: 't-1',
      oldValue: { status: 'PROVISIONING' },
      newValue: { status: 'ACTIVE', actor: 'worker:tenant-provisioning' },
      requestId: 'worker:tenant-provisioning',
    });
  });

  it('inserta con parámetros y sin usuario (actor del sistema)', async () => {
    const executor = { query: jest.fn().mockResolvedValue(undefined) };
    await insertTenantStatusTransitionAudit(
      executor,
      buildTenantStatusTransitionAudit('t-1', 'PROVISIONING', 'PROVISIONING_FAILED'),
    );
    expect(INSERT_TENANT_STATUS_TRANSITION_AUDIT_SQL).toContain('VALUES (NULL, $1');
    expect(executor.query).toHaveBeenCalledWith(INSERT_TENANT_STATUS_TRANSITION_AUDIT_SQL, [
      'UPDATE',
      'Tenant',
      't-1',
      '{"status":"PROVISIONING"}',
      '{"status":"PROVISIONING_FAILED","actor":"worker:tenant-provisioning"}',
      'worker:tenant-provisioning',
    ]);
  });
});
