import { UserStatus } from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import { ActiveUserEmailReadAdapter } from './active-user-email-read.adapter';

describe('ActiveUserEmailReadAdapter', () => {
  const adapter = new ActiveUserEmailReadAdapter();
  const userId = '11111111-1111-4111-8111-111111111111';

  it('lee el correo del usuario activo con SQL parametrizado', async () => {
    const query = jest.fn().mockResolvedValue([{ email: 'responsable@example.test' }]);

    const email = await adapter.emailOf(userId, { query } as unknown as EntityManager);

    expect(email).toBe('responsable@example.test');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('users.status = $2');
    expect(sql).toContain('users.deleted_at IS NULL');
    expect(params).toEqual([userId, UserStatus.ACTIVE]);
  });

  it('devuelve null si el usuario no está activo o no tiene correo', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      adapter.emailOf(userId, { query } as unknown as EntityManager),
    ).resolves.toBeNull();
  });

  it('devuelve null si el correo viene en blanco', async () => {
    const query = jest.fn().mockResolvedValue([{ email: '  ' }]);
    await expect(
      adapter.emailOf(userId, { query } as unknown as EntityManager),
    ).resolves.toBeNull();
  });
});
