import { PlatformRole, UserRole } from '@iwana/shared';
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
        actorRole: PlatformRole.SYSTEM_ADMIN,
      }),
    ).toBe(true);
    expect(
      getDeleteUserBlockedReason({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        actorUserId: 'sys-1',
        actorRole: PlatformRole.SYSTEM_ADMIN,
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

  // Ola D punto 2: la regla solo miraba `targetRole === ADMIN`, asi que un
  // objetivo con rol de plataforma no quedaba protegido en absoluto. El espejo
  // del backend arrastraba el mismo hueco (FE-03: ya divergio una vez).
  it.each([PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT])(
    'bloquea que un ADMIN de tenant elimine a un objetivo con rol %s',
    (targetRole) => {
      expect(
        canDeleteUser({
          targetId: 'plataforma-1',
          targetRole,
          actorUserId: 'admin-1',
          actorRole: UserRole.ADMIN,
        }),
      ).toBe(false);
      expect(
        getDeleteUserBlockedReason({
          targetId: 'plataforma-1',
          targetRole,
          actorUserId: 'admin-1',
          actorRole: UserRole.ADMIN,
        }),
      ).toBe('No puedes eliminar a un usuario con rol de plataforma');
    },
  );

  it('permite que un actor de plataforma elimine a otro usuario de plataforma', () => {
    expect(
      canDeleteUser({
        targetId: 'plataforma-1',
        targetRole: PlatformRole.IWANA_SUPPORT,
        actorUserId: 'sys-1',
        actorRole: PlatformRole.SYSTEM_ADMIN,
      }),
    ).toBe(true);
  });

  // ADR-063: espejo del 409 del backend.
  it('bloquea eliminar al administrador principal designado', () => {
    expect(
      canDeleteUser({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        targetIsPrincipalAdmin: true,
        actorUserId: 'sys-1',
        actorRole: PlatformRole.SYSTEM_ADMIN,
      }),
    ).toBe(false);
    expect(
      getDeleteUserBlockedReason({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        targetIsPrincipalAdmin: true,
        actorUserId: 'sys-1',
        actorRole: PlatformRole.SYSTEM_ADMIN,
      }),
    ).toBe('Es el administrador principal de la empresa; designa otro antes de eliminarlo');
  });

  it('no bloquea cuando la respuesta no trae el dato de admin principal', () => {
    expect(
      canDeleteUser({
        targetId: 'admin-2',
        targetRole: UserRole.ADMIN,
        actorUserId: 'sys-1',
        actorRole: PlatformRole.SYSTEM_ADMIN,
      }),
    ).toBe(true);
  });
});
