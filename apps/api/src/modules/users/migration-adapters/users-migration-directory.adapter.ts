import { Injectable } from '@nestjs/common';
import { MIGRATION_IMPORTABLE_USER_ROLES } from '@iwana/shared';
import type { MigrationReadContext } from '../../migration/ports/migration-import.ports';
import { MigrationUserDirectoryPort } from '../../migration/ports/migration-user-directory.port';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Adaptador de Usuarios (MOD04) para la atribución de la importación desde UISP (ADR-110 D15).
 * Solo ids: nunca devuelve datos del usuario. Borrado lógico (`deleted_at`) = inexistente.
 * Solo personal importable (`MIGRATION_IMPORTABLE_USER_ROLES`, S-5): un SUBSCRIBER, PARTNER o
 * INVESTOR nunca se propone para enlazar ni recibe la atribución de tickets o pagos.
 */
@Injectable()
export class UsersMigrationDirectoryAdapter extends MigrationUserDirectoryPort {
  async existingUserIds(ctx: MigrationReadContext, userIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(userIds.filter((id) => UUID.test(id)).map((id) => id.toLowerCase()))];
    if (ids.length === 0) return new Set();
    const rows = (await ctx.manager.query(
      `SELECT id::text FROM users
        WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
          AND role = ANY($3::varchar[])`,
      [ctx.tenantId, ids, [...MIGRATION_IMPORTABLE_USER_ROLES]],
    )) as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  }

  async findUserIdsByEmailHash(
    ctx: MigrationReadContext,
    emailHashes: string[],
  ): Promise<Map<string, string>> {
    const hashes = [...new Set(emailHashes)];
    if (hashes.length === 0) return new Map();
    const rows = (await ctx.manager.query(
      `SELECT id::text AS id, email_hmac
         FROM users
        WHERE tenant_id = $1 AND email_hmac = ANY($2::varchar[]) AND deleted_at IS NULL
          AND role = ANY($3::varchar[])`,
      [ctx.tenantId, hashes, [...MIGRATION_IMPORTABLE_USER_ROLES]],
    )) as Array<{ id: string; email_hmac: string }>;
    return new Map(rows.map((row) => [row.email_hmac, row.id]));
  }
}
