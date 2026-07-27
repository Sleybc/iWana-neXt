import { UserRole, UserStatus } from '@iwana/shared';
import {
  buildUsersListParams,
  emptyUsersQuery,
  parseUsersQueryFromSearchParams,
  serializeUsersQuery,
  usersQueryToSearchParams,
} from './users-query';

describe('buildUsersListParams (FE-01)', () => {
  it('preserva status y role al añadir búsqueda', () => {
    const current = {
      search: '',
      status: UserStatus.SUSPENDED,
      role: 'NOC',
      page: '',
    };

    const { nextQuery, params } = buildUsersListParams(current, { search: 'ana' });

    expect(nextQuery).toEqual({
      search: 'ana',
      status: UserStatus.SUSPENDED,
      role: 'NOC',
      page: '',
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
      page: '',
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
    expect(nextQuery).toEqual({ search: '', status: '', role: '', page: '' });
    expect(params).toEqual({ limit: 20 });
  });
});

describe('URL canónica users-query', () => {
  it('parseUsersQueryFromSearchParams hidrata search+status+role', () => {
    const params = new URLSearchParams(
      `search=ana&status=${UserStatus.ACTIVE}&role=${UserRole.NOC}`,
    );
    expect(parseUsersQueryFromSearchParams(params)).toEqual({
      search: 'ana',
      status: UserStatus.ACTIVE,
      role: UserRole.NOC,
      page: '',
    });
  });

  it('usersQueryToSearchParams solo setea keys no vacías', () => {
    const params = usersQueryToSearchParams({
      search: '  ',
      status: UserStatus.SUSPENDED,
      role: '',
      page: '',
    });
    expect(params.get('search')).toBeNull();
    expect(params.get('status')).toBe(UserStatus.SUSPENDED);
    expect(params.get('role')).toBeNull();
    expect(params.toString()).toBe(`status=${UserStatus.SUSPENDED}`);
  });

  it('serializeUsersQuery es estable para comparación anti-loop', () => {
    const a = serializeUsersQuery({
      search: 'ana',
      status: UserStatus.ACTIVE,
      role: UserRole.ADMIN,
      page: '',
    });
    const b = serializeUsersQuery(parseUsersQueryFromSearchParams(new URLSearchParams(a)));
    expect(a).toBe(b);
  });
});
