import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { UserStatus } from '@iwana/shared';
import { AssuranceAssigneeNamesPort } from '../../assurance/ports/assurance-assignee-names.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Únicos estados con los que el usuario se muestra como responsable (lista de permitidos). */
const VISIBLE_STATUSES: readonly UserStatus[] = [
  UserStatus.ACTIVE,
  UserStatus.PENDING_VERIFICATION,
];

/** Usuarios es dueño de `users`; Assurance solo recibe el nombre (spec MOD05 Soporte §16 B-1). */
@Injectable()
export class AssuranceAssigneeNamesAdapter extends AssuranceAssigneeNamesPort {
  async findDisplayNames(
    manager: EntityManager,
    tenantId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const ids = [...new Set(userIds.filter((id) => UUID_PATTERN.test(id)))];
    const names = new Map<string, string>();
    if (ids.length === 0) return names;

    const rows = (await manager.query(
      `SELECT id::text AS id, first_name, last_name
         FROM users
        WHERE tenant_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL
          AND status::text = ANY($3::text[])`,
      [tenantId, ids, VISIBLE_STATUSES],
    )) as Array<{ id: string; first_name: string | null; last_name: string | null }>;

    for (const row of rows) {
      const name = [row.first_name, row.last_name]
        .map((part) => part?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
      if (name) names.set(row.id, name);
    }
    return names;
  }
}
