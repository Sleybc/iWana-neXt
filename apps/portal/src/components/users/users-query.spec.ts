import { UserStatus } from '@iwana/shared';
import { buildUsersListParams, emptyUsersQuery } from './users-query';

describe('buildUsersListParams (FE-01)', () => {
  it('preserva status y role al añadir búsqueda', () => {
    const current = {
      search: '',
      status: UserStatus.SUSPENDED,
      role: 'NOC',
    };

    const { nextQuery, params } = buildUsersListParams(current, { search: 'ana' });

    expect(nextQuery).toEqual({
      search: 'ana',
      status: UserStatus.SUSPENDED,
      role: 'NOC',
    });
    expect(params).toEqual({
      limit: 20,
      search: 'ana',
      status: UserStatus.SUSPENDED,
      role: 'NOC',
    });
  });

  it('preserva search al cambiar status', () => {
    const current = {
      search: 'ana',
      status: '',
      role: 'SUPPORT',
    };

    const { params } = buildUsersListParams(current, { status: UserStatus.SUSPENDED });

    expect(params).toEqual({
      limit: 20,
      search: 'ana',
      status: UserStatus.SUSPENDED,
      role: 'SUPPORT',
    });
  });

  it('limpia todos los criterios desde emptyUsersQuery', () => {
    const { nextQuery, params } = buildUsersListParams(emptyUsersQuery(), {}, 20);
    expect(nextQuery).toEqual({ search: '', status: '', role: '' });
    expect(params).toEqual({ limit: 20 });
  });
});
