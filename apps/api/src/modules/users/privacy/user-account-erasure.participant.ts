import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import {
  anonymizeConfiguredTable,
  hmacForErasure,
  loadErasureKeys,
  normalizeErasureRows,
  readTenantColumns,
  type FieldRule,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

const USER_RULES: FieldRule[] = [
  { column: 'first_name', kind: 'null' },
  { column: 'last_name', kind: 'null' },
  { column: 'phone', kind: 'null' },
  { column: 'job_title', kind: 'null' },
  { column: 'document_type', kind: 'null' },
  { column: 'document_number', kind: 'null' },
  { column: 'avatar_url', kind: 'null' },
  { column: 'email_hash', kind: 'legacy-hash', marker: 'user-email' },
];

interface UserRow {
  id: string;
  deleted_at: Date | string | null;
}

@Injectable()
export class UserAccountErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}

  async findUserIds(scope: TitularErasureScope, qr: QueryRunner): Promise<string[]> {
    const columns = await readTenantColumns(qr);
    const ids = new Set<string>();
    if (scope.subscriberIds.length > 0) {
      const hasUserLink = columns.has('subscribers.user_id');
      if (hasUserLink) {
        const linked = (await qr.query(
          `SELECT user_id::text AS id FROM subscribers
            WHERE id = ANY($1::uuid[]) AND user_id IS NOT NULL FOR SHARE`,
          [scope.subscriberIds],
        )) as Array<{ id: string }>;
        for (const row of linked) ids.add(row.id);
      }
    }
    if (scope.partyId && columns.has('users.party_id')) {
      const partyUsers = (await qr.query(
        'SELECT id::text AS id FROM users WHERE party_id = $1 FOR SHARE',
        [scope.partyId],
      )) as Array<{ id: string }>;
      for (const row of partyUsers) ids.add(row.id);
    }
    return [...ids].sort();
  }

  async activeAccountCount(userIds: string[], qr: QueryRunner): Promise<number> {
    if (userIds.length === 0) return 0;
    const columns = await readTenantColumns(qr);
    if (!columns.has('users.deleted_at')) {
      throw new Error('No se puede comprobar la baja de las cuentas enlazadas.');
    }
    const rows = (await qr.query(
      'SELECT id::text, deleted_at FROM users WHERE id = ANY($1::uuid[]) FOR SHARE',
      [userIds],
    )) as UserRow[];
    if (rows.length !== new Set(userIds).size) {
      throw new Error('No se pudieron comprobar todas las cuentas enlazadas.');
    }
    return rows.filter((row) => row.deleted_at === null).length;
  }

  async plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, 'dry-run');
  }

  async apply(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, mode);
  }

  private async run(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    if (scope.userIds.length === 0) {
      return [{ table: 'users', category: 'CUENTA_USUARIO', selected: 0, changed: 0, residual: 0 }];
    }
    const columns = await readTenantColumns(qr);
    if (!columns.has('users.email') || !columns.has('users.email_hmac')) {
      throw new Error('El tenant no tiene las columnas únicas de correo requeridas para users.');
    }
    const keys = scope.cryptoKeys ?? loadErasureKeys(this.config);
    const personal = await anonymizeConfiguredTable(
      qr,
      'users',
      scope.userIds,
      USER_RULES,
      columns,
      keys,
      mode,
    );
    const rows = (await qr.query(
      'SELECT id::text, email, email_hmac FROM users WHERE id = ANY($1::uuid[]) FOR UPDATE',
      [scope.userIds],
    )) as Array<{ id: string; email: string; email_hmac: string }>;
    if (rows.length !== new Set(scope.userIds).size) {
      throw new Error('No se pudieron comprobar todas las cuentas enlazadas.');
    }
    let emailChanged = 0;
    let emailResidual = 0;
    for (const row of rows) {
      const email = `anon+${row.id}@anon.invalid`;
      const emailHmac = hmacForErasure(email, keys.hashKey);
      if (row.email !== email || row.email_hmac !== emailHmac) {
        emailResidual += 1;
        if (mode === 'apply') {
          const updated = normalizeErasureRows<{ id: string }>(
            await qr.query(
              `UPDATE users SET email = $2, email_hmac = $3
              WHERE id = $1 AND (email IS DISTINCT FROM $2 OR email_hmac IS DISTINCT FROM $3)
              RETURNING id`,
              [row.id, email, emailHmac],
            ),
          );
          emailChanged += updated.length;
        }
      }
    }
    if (mode === 'apply' && emailResidual > 0) {
      emailResidual = 0;
      const after = (await qr.query(
        'SELECT id::text, email, email_hmac FROM users WHERE id = ANY($1::uuid[])',
        [scope.userIds],
      )) as Array<{ id: string; email: string; email_hmac: string }>;
      for (const row of after) {
        const email = `anon+${row.id}@anon.invalid`;
        if (row.email !== email || row.email_hmac !== hmacForErasure(email, keys.hashKey)) {
          emailResidual += 1;
        }
      }
    }
    return [
      {
        table: 'users',
        category: 'CUENTA_USUARIO',
        selected: rows.length,
        changed: Math.max(personal.changed, emailChanged),
        residual: personal.residual + emailResidual,
      },
    ];
  }
}
