import { UserRole } from '@iwana/shared';
import { canDeleteUser, getDeleteUserBlockedReason } from './can-delete-user';

describe('canDeleteUser (RF-RBAC-04 / FE-03)', () => {
  it('bloquea self-delete', () => {
    expect(
      canDeleteUser({
        targetId: 'admin-1',
        targetRole: UserRole.NOC,
        actorUserId: 'admin-1',
        actorRole: UserRole.ADMIN,
      }),
    ).toBe(false);
    expect(
      getDeleteUserBlockedReason({
        targetId: 'admin-1',
        targetRole: UserRole.NOC,
        actorUserId: 'admin-1',
        actorRole: UserRole.ADMIN,
      }),
    ).toBe('No puedes eliminarte a ti mismo');
  });

  it('bloquea que un ADMIN elimine a otro ADMIN', () => {
    expect(
      canDeleteUser({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        actorUserId: 'admin-1',
        actorRole: UserRole.ADMIN,
      }),
    ).toBe(false);
    expect(
      getDeleteUserBlockedReason({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        actorUserId: 'admin-1',
        actorRole: UserRole.ADMIN,
      }),
    ).toBe('No puedes eliminar a otro administrador del tenant');
  });

  it('permite que SYSTEM_ADMIN elimine a un ADMIN', () => {
    expect(
      canDeleteUser({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        actorUserId: 'sys-1',
        actorRole: UserRole.SYSTEM_ADMIN,
      }),
    ).toBe(true);
    expect(
      getDeleteUserBlockedReason({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        actorUserId: 'sys-1',
        actorRole: UserRole.SYSTEM_ADMIN,
      }),
    ).toBeNull();
  });

  it('permite eliminar un usuario operativo no administrador', () => {
    expect(
      canDeleteUser({
        targetId: 'noc-1',
        targetRole: UserRole.NOC,
        actorUserId: 'admin-1',
        actorRole: UserRole.ADMIN,
      }),
    ).toBe(true);
  });
});
