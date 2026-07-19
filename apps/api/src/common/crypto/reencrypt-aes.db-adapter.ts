import { DataSource, QueryRunner } from 'typeorm';
import { isValidSchemaName, runInTenantSchema } from '@iwana/db';
import { EncryptedCellRow, ReencryptDbPort } from './reencrypt-aes.orchestrator';
import { EncryptedColumnTarget } from './reencrypt-aes.targets';

/**
 * Adapter TypeORM para el CLI de recifrado.
 * Public: queries calificadas `public."tabla"`.
 * Tenant: `runInTenantSchema` + SET LOCAL search_path.
 */
export class TypeOrmReencryptDbAdapter implements ReencryptDbPort {
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
      await qr.query(
        `UPDATE "${target.table}" SET "${target.column}" = $1 WHERE "${target.idColumn}" = $2`,
        [newCiphertext, id],
      );
    });
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
