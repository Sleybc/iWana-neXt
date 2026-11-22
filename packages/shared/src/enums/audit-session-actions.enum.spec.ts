import { AuditAction } from './audit-action.enum';
import { AUDIT_SESSION_ACTIONS, PLATFORM_AUDIT_ACCESS_ACTIONS } from './audit-session-actions.enum';
import * as shared from '../index';

describe('acciones excluibles del feed de auditoría', () => {
  it('las lecturas auditadas son LIST_ACCESS y RECORD_ACCESS, públicas desde @iwana/shared', () => {
    expect(PLATFORM_AUDIT_ACCESS_ACTIONS).toEqual([
      AuditAction.LIST_ACCESS,
      AuditAction.RECORD_ACCESS,
    ]);
    expect(shared.PLATFORM_AUDIT_ACCESS_ACTIONS).toBe(PLATFORM_AUDIT_ACCESS_ACTIONS);
  });

  it('sesión y lecturas no se solapan: cada filtro saca solo lo suyo', () => {
    const session = new Set<string>(AUDIT_SESSION_ACTIONS);
    expect(PLATFORM_AUDIT_ACCESS_ACTIONS.filter((action) => session.has(action))).toEqual([]);
  });
});
