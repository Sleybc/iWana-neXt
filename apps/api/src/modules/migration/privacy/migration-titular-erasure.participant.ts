import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '@iwana/db';
import type { QueryRunner } from 'typeorm';
import { decryptAes256Gcm, loadPiiAesGcmKeyPair } from '../../../common/crypto/aes-gcm.util';
import { normalizeErasureRows } from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

type CountRow = { count: number | string };

interface StagingRow {
  id: string;
  batch_id: string;
  entity: string;
  payload_encrypted: string;
}

/**
 * Supresión del titular en las intermedias de la importación (ADR-110 D10; hallazgo H2 de
 * sec-eng). Borra las filas de `migration_staging_records` ligadas al titular suprimido: la
 * del suscriptor (`promoted_entity_id`) y las de sus dependientes (`clientExternalId` dentro de
 * la carga cifrada, que se descifra solo para comparar). Además adelanta la purga de los lotes
 * afectados (`purge_after` → ahora): el barrido diario borra sus ZIP cifrados en la siguiente
 * corrida (03:30 Bogotá). El ZIP no se borra aquí porque la supresión es transaccional y el
 * borrado en storage no se puede deshacer; el lote ya no es promovible tras el adelanto
 * porque la purga deja `source_object_key` en NULL.
 *
 * Una carga que no se puede descifrar con la clave activa ni la previa se trata como del
 * titular (se borra): no se puede demostrar que no lo sea y ya es ilegible.
 */
@Injectable()
export class MigrationTitularErasureParticipant implements TitularErasureParticipant {
  constructor(@Optional() private readonly config?: ConfigService) {}

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
    const subscriberIds = [...new Set(scope.subscriberIds)];
    if (subscriberIds.length === 0 || !(await this.tablesExist(qr))) return this.emptyResults();
    const tenantId = TenantContext.getOrThrow().tenantId;

    const owners = (await qr.query(
      `SELECT id::text, batch_id::text, external_id
         FROM migration_staging_records
        WHERE tenant_id = $1::uuid AND entity = 'SUSCRIPTOR'
          AND promoted_entity_id = ANY($2::uuid[])`,
      [tenantId, subscriberIds],
    )) as Array<{ id: string; batch_id: string; external_id: string }>;
    if (owners.length === 0) return this.emptyResults();

    const ownerKeys = new Set(owners.map((row) => `${row.batch_id}|${row.external_id}`));
    const batchIds = [...new Set(owners.map((row) => row.batch_id))];
    const targetIds = new Set(owners.map((row) => row.id));
    const dependents = (await qr.query(
      `SELECT id::text, batch_id::text, entity, payload_encrypted
         FROM migration_staging_records
        WHERE tenant_id = $1::uuid AND batch_id = ANY($2::uuid[]) AND entity <> 'SUSCRIPTOR'`,
      [tenantId, batchIds],
    )) as StagingRow[];
    const keys = this.keys(scope);
    for (const row of dependents) {
      const owner = this.clientExternalId(row.payload_encrypted, keys);
      if (owner === null || ownerKeys.has(`${row.batch_id}|${owner}`)) targetIds.add(row.id);
    }
    const ids = [...targetIds];

    const pendingBatches = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count FROM migration_batches
        WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[]) AND purged_at IS NULL
          AND purge_after > GREATEST(created_at + interval '1 second', now())`,
      [tenantId, batchIds],
    );

    let changedRows = 0;
    let changedBatches = 0;
    if (mode === 'apply') {
      changedRows = normalizeErasureRows<{ id: string }>(
        await qr.query(
          `DELETE FROM migration_staging_records
            WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])
            RETURNING id::text AS id`,
          [tenantId, ids],
        ),
      ).length;
      changedBatches = normalizeErasureRows<{ id: string }>(
        await qr.query(
          `UPDATE migration_batches
              SET purge_after = GREATEST(created_at + interval '1 second', now()),
                  updated_at = now()
            WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[]) AND purged_at IS NULL
              AND purge_after > GREATEST(created_at + interval '1 second', now())
            RETURNING id::text AS id`,
          [tenantId, batchIds],
        ),
      ).length;
    }

    const residualRows = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count FROM migration_staging_records
        WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
      [tenantId, ids],
    );
    const residualBatches = await this.count(
      qr,
      `SELECT COUNT(*)::int AS count FROM migration_batches
        WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[]) AND purged_at IS NULL
          AND purge_after > GREATEST(created_at + interval '1 second', now())`,
      [tenantId, batchIds],
    );

    return [
      {
        table: 'migration_staging_records',
        category: 'IDENTIFICACION',
        selected: ids.length,
        changed: changedRows,
        residual: residualRows,
      },
      {
        table: 'migration_batches',
        category: 'IDENTIFICACION',
        selected: pendingBatches,
        changed: changedBatches,
        residual: residualBatches,
      },
    ];
  }

  private keys(scope: TitularErasureScope): { active: Buffer; previous: Buffer[] } {
    if (scope.cryptoKeys) {
      const previous = scope.cryptoKeys.previousEncryptionKey;
      return {
        active: scope.cryptoKeys.activeEncryptionKey,
        previous: previous === null ? [] : Buffer.isBuffer(previous) ? [previous] : [...previous],
      };
    }
    if (!this.config) throw new Error('La supresión de intermedias requiere la clave PII.');
    const pair = loadPiiAesGcmKeyPair(this.config);
    return { active: pair.activeKey, previous: pair.previousKey };
  }

  /** `clientExternalId` de la carga, o `null` si no se puede descifrar ni leer. */
  private clientExternalId(
    encrypted: string,
    keys: { active: Buffer; previous: Buffer[] },
  ): string | null {
    try {
      const payload = JSON.parse(decryptAes256Gcm(encrypted, keys.active, keys.previous)) as {
        derived?: { clientExternalId?: unknown };
      };
      const value = payload.derived?.clientExternalId;
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  private async tablesExist(qr: QueryRunner): Promise<boolean> {
    const rows = (await qr.query(
      `SELECT to_regclass('migration_staging_records') IS NOT NULL
          AND to_regclass('migration_batches') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  private async count(qr: QueryRunner, sql: string, parameters: unknown[]): Promise<number> {
    const rows = (await qr.query(sql, parameters)) as CountRow[];
    return Number(rows[0]?.count ?? 0);
  }

  private emptyResults(): TitularErasureTableResult[] {
    return [
      {
        table: 'migration_staging_records',
        category: 'IDENTIFICACION',
        selected: 0,
        changed: 0,
        residual: 0,
      },
      {
        table: 'migration_batches',
        category: 'IDENTIFICACION',
        selected: 0,
        changed: 0,
        residual: 0,
      },
    ];
  }
}
