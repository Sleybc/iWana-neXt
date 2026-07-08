import { usersApi, type InternalUser } from '@/lib/api-client';

const USERS_PAGE_SIZE = 100;

export function buildInternalUserLabel(user: InternalUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (fullName) {
    return fullName;
  }

  if (user.email) {
    return user.email;
  }

  return `Usuario ${user.id.slice(0, 8)}`;
}

export async function loadTenantUsers(): Promise<InternalUser[]> {
  const collected = new Map<string, InternalUser>();
  let cursor: string | undefined;

  do {
    const response = await usersApi.list(
      cursor ? { cursor, limit: USERS_PAGE_SIZE } : { limit: USERS_PAGE_SIZE },
    );
    response.data.forEach((user) => collected.set(user.id, user));
    cursor = response.meta.nextCursor ?? undefined;
  } while (cursor);

  return Array.from(collected.values());
}

export function mapUsersToSelectOptions(
  users: InternalUser[],
  emptyOption?: { value: string; label: string },
): Array<{ value: string; label: string }> {
  const options = users
    .map((user) => ({
      value: user.id,
      label: buildInternalUserLabel(user),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));

  return emptyOption ? [emptyOption, ...options] : options;
}

export function buildUserLabelMap(users: InternalUser[]): Map<string, string> {
  return new Map(users.map((user) => [user.id, buildInternalUserLabel(user)]));
}
