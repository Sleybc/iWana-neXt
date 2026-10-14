import { AccessPermissionKey, UserRole, UserStatus } from '@iwana/shared';
import { ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2 } from '../access-control.constants';
import { PermissionHoldersReadAdapter } from './permission-holders-read.adapter';

describe('PermissionHoldersReadAdapter', () => {
  it('returns only usable active holders with the effective permission query', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([
        { userId: 'user-1', email: 'privacy@example.test' },
        { userId: '', email: 'invalid@example.test' },
        { userId: 'user-2', email: '   ' },
      ]),
    };

    const result = await new PermissionHoldersReadAdapter().holders(
      AccessPermissionKey.PRIVACY_MANAGE,
      manager as never,
    );

    expect(result).toEqual([{ userId: 'user-1', email: 'privacy@example.test' }]);
    const [query, parameters] = manager.query.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('users.status = $2');
    expect(query).toContain('users.deleted_at IS NULL');
    expect(query).toContain('assignment.valid_from <= $5::date');
    expect(query).toContain('profile.scope_site_id IS NULL');
    expect(parameters).toEqual([
      AccessPermissionKey.PRIVACY_MANAGE,
      UserStatus.ACTIVE,
      UserRole.ADMIN,
      ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.ADMIN],
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
    ]);
  });
});
