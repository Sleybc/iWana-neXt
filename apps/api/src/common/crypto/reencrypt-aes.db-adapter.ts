import { DataSource, QueryFailedError, QueryRunner } from 'typeorm';
import { isValidSchemaName, runInTenantSchema } from '@iwana/db';
import type { PiiReencryptDbPort } from '../../cli/reencrypt-aes.pii';
import { EncryptedCellRow } from './reencrypt-aes.orchestrator';
import { EncryptedColumnTarget } from './reencrypt-aes.targets';

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;

/** Fuerza el rollback de `runInTenantSchema`, que confirma si el callback termina bien. */
class ProbeRollbackSignal extends Error {}

function readSqlState(error: QueryFailedError): string | null {
  const { code } = error.driverError as { code?: unknown };
  return typeof code === 'string' && SQLSTATE_PATTERN.test(code) ? code : null;
}

/**
 * Adapter TypeORM para el CLI de recifrado.
 * Public: queries calificadas `public."tabla"`.
 * Tenant: `runInTenantSchema` + SET LOCAL search_path.
 */
export class TypeOrmReencryptDbAdapter implements PiiReencryptDbPort {
  constructor(private readonly dataSource: DataSource) {}

  async listActiveTenantSchemas(): Promise<string[]> {
    const rows = (await this.dataSource.query(`
      SELECT schema_name
      FROM public.tenants
      WHERE status = 'ACTIVE'
      ORDER BY schema_name ASC
    `)) as Array<{ schema_name: string }>;

    return rows.map((r) => r.schema_name);
  }

  async tableExists(schemaName: string, table: string): Promise<boolean> {
    const rows = (await this.dataSource.query(
      `
      SELECT 1 AS ok
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
      LIMIT 1
      `,
      [schemaName, table],
    )) as Array<{ ok: number }>;

    return rows.length > 0;
  }

  async fetchEncryptedBatch(
    schemaName: string,
    target: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ): Promise<EncryptedCellRow[]> {
    if (schemaName === 'public') {
      return this.fetchPublicBatch(target, offset, limit);
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      this.fetchWithRunner(qr, target, offset, limit),
    );
  }

  async updateEncryptedValue(
    schemaName: string,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<void> {
    if (schemaName === 'public') {
      await this.dataSource.query(
        `UPDATE public."${target.table}" SET "${target.column}" = $1 WHERE "${target.idColumn}" = $2`,
        [newCiphertext, id],
      );
      return;
    }

    if (!isValidSchemaName(schemaName)) {
      throw new Error(`Schema name invalido: ${schemaName}`);
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.updateTenantCell(qr, target, id, newCiphertext);
    });
  }

  /**
   * Ensaya el UPDATE de `apply` y siempre lo revierte. Solo schemas tenant: un
   * `public` lo rechaza `runInTenantSchema`. Un `QueryFailedError` sin SQLSTATE
   * se propaga: devolver `null` lo daría por escribible.
   */
  async probeEncryptedWrite(
    schemaName: string,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<string | null> {
    try {
      await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        await this.updateTenantCell(qr, target, id, newCiphertext);
        throw new ProbeRollbackSignal();
      });
    } catch (error) {
      if (error instanceof ProbeRollbackSignal) return null;
      const sqlState = error instanceof QueryFailedError ? readSqlState(error) : null;
      if (sqlState === null) throw error;
      return sqlState;
    }
    throw new Error('La sonda de escritura terminó sin revertir.');
  }

  private async updateTenantCell(
    qr: QueryRunner,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<void> {
    await qr.query(
      `UPDATE "${target.table}" SET "${target.column}" = $1 WHERE "${target.idColumn}" = $2`,
      [newCiphertext, id],
    );
  }

  private async fetchPublicBatch(
    target: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ): Promise<EncryptedCellRow[]> {
    const rows = (await this.dataSource.query(
      `
      SELECT "${target.idColumn}" AS id, "${target.column}" AS value
      FROM public."${target.table}"
      WHERE "${target.column}" IS NOT NULL
        AND TRIM("${target.column}"::text) <> ''
      ORDER BY "${target.idColumn}" ASC
      OFFSET $1
      LIMIT $2
      `,
      [offset, limit],
    )) as Array<{ id: string; value: string }>;

    return rows.map((r) => ({ id: String(r.id), value: String(r.value) }));
  }

  private async fetchWithRunner(
    qr: QueryRunner,
    target: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ): Promise<EncryptedCellRow[]> {
    const rows = (await qr.query(
      `
      SELECT "${target.idColumn}" AS id, "${target.column}" AS value
      FROM "${target.table}"
      WHERE "${target.column}" IS NOT NULL
        AND TRIM("${target.column}"::text) <> ''
      ORDER BY "${target.idColumn}" ASC
      OFFSET $1
      LIMIT $2
      `,
      [offset, limit],
    )) as Array<{ id: string; value: string }>;

    return rows.map((r) => ({ id: String(r.id), value: String(r.value) }));
  }
}
