import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import { isValidSchemaName, runInTenantSchema } from '@iwana/db';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  MigrationBatchCountsSchema,
  type MigrationMappingAction,
  type MigrationMappingKind,
} from '@iwana/shared';
import { MigrationCrypto } from './migration-crypto';
import {
  MIGRATION_MAX_UNCOMPRESSED_BYTES_PER_BATCH,
  MIGRATION_STAGING_CHUNK,
  migrationObjectKey,
} from './migration.constants';
import { MigrationTitularLookupPort } from './ports/migration-titular-lookup.port';
import { parseUispPackage, type ParseUispResult } from './uisp/uisp-parser';
import {
  buildMappingIndex,
  collectTitularKeys,
  simulateBatch,
  type SimulationResult,
  type StagedRecord,
} from './uisp/uisp-simulation';
import { SafeZipError, readZipEntries } from './zip/safe-zip-reader';

export interface ResolvedTenant {
  tenantId: string;
  schemaName: string;
  /** Para abrir el `TenantContext` de los puertos que lo exigen dentro de un job (D3). */
  tenantSlug?: string;
}

/** Error que no se resuelve reintentando (el processor lo marca como fallo definitivo). */
export class MigrationPermanentError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MigrationPermanentError';
  }
}

/** El lote aún no es visible (carrera job ↔ commit): BullMQ reintenta. */
export class MigrationBatchNotVisibleError extends Error {
  constructor() {
    super('MIGRATION_BATCH_NOT_VISIBLE');
    this.name = 'MigrationBatchNotVisibleError';
  }
}

interface BatchForSimulation {
  id: string;
  status: string;
  counts: unknown;
  source_object_key: string | null;
  purged_at: Date | string | null;
}

/**
 * Simulación del lote (ADR-110 D2, D4, D11; spec §3.3 pasos 1–2): lee los ZIP cifrados,
 * valida y carga las intermedias cifradas; deja el lote en `SIMULADO` con el informe por
 * entidad y motivo. Idempotente: reemplaza las intermedias del lote en cada corrida.
 */
@Injectable()
export class MigrationSimulationService {
  private readonly logger = new Logger(MigrationSimulationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly crypto: MigrationCrypto,
    private readonly titularLookup: MigrationTitularLookupPort,
  ) {}

  async resolveTenant(tenantId: string): Promise<ResolvedTenant> {
    const rows = (await this.dataSource.query(
      `SELECT id::text AS id, schema_name, slug, status, deleted_at
         FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
      [tenantId],
    )) as Array<{
      id: string;
      schema_name: string;
      slug: string;
      status: string;
      deleted_at: unknown;
    }>;
    const tenant = rows[0];
    if (
      !tenant ||
      tenant.status !== 'ACTIVE' ||
      tenant.deleted_at ||
      !isValidSchemaName(tenant.schema_name)
    ) {
      throw new MigrationPermanentError('MIGRATION_TENANT_INACTIVE');
    }
    return { tenantId: tenant.id, schemaName: tenant.schema_name, tenantSlug: tenant.slug };
  }

  private async loadBatch(
    tenant: ResolvedTenant,
    batchId: string,
  ): Promise<BatchForSimulation | null> {
    return runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id, status, counts, source_object_key, purged_at
           FROM migration_batches WHERE id = $1 AND tenant_id = $2`,
        [batchId, tenant.tenantId],
      )) as BatchForSimulation[];
      return rows[0] ?? null;
    });
  }

  /** Lee y parsea cada ZIP; un ZIP ilegible es un archivo rechazado, no un fallo del job. */
  async readPackages(
    prefix: string,
    files: number,
    maxTotalBytes: number = MIGRATION_MAX_UNCOMPRESSED_BYTES_PER_BATCH,
  ): Promise<ParseUispResult[]> {
    const results: ParseUispResult[] = [];
    // H3: tope descomprimido del lote completo; cada ZIP se suelta antes de leer el siguiente.
    let total = 0;
    for (let index = 0; index < files; index += 1) {
      const blob = await this.storage.getObject(migrationObjectKey(prefix, index));
      let plain: Buffer;
      try {
        plain = this.crypto.decryptObject(blob);
      } catch {
        throw new MigrationPermanentError('MIGRATION_OBJECT_UNREADABLE');
      }
      try {
        const entries = await readZipEntries(plain);
        for (const content of entries.values()) total += content.length;
        if (total > maxTotalBytes) {
          throw new MigrationPermanentError('MIGRATION_BATCH_UNCOMPRESSED_LIMIT');
        }
        results.push(parseUispPackage(entries));
      } catch (error) {
        if (!(error instanceof SafeZipError)) throw error;
        results.push({ ok: false, reason: error.code });
      }
    }
    return results;
  }

  async simulate(tenantId: string, batchId: string): Promise<'SIMULADO' | 'OMITIDO'> {
    const tenant = await this.resolveTenant(tenantId);
    const done = await this.stage(tenant, batchId, 'SIMULADO');
    return done ? 'SIMULADO' : 'OMITIDO';
  }

  /**
   * Revalida las intermedias de un lote en `CARGADO` con las equivalencias vigentes, antes de
   * su primera promoción (D4): el operador resuelve las equivalencias pendientes después de la
   * simulación, y un registro rechazado entonces por falta de equivalencia no debe quedar
   * excluido. No actúa si alguna fila ya se promovió (reintento de una promoción parcial).
   */
  async restageForPromotion(tenant: ResolvedTenant, batchId: string): Promise<boolean> {
    return this.stage(tenant, batchId, 'CARGADO');
  }

  private async stage(
    tenant: ResolvedTenant,
    batchId: string,
    expectedStatus: 'SIMULADO' | 'CARGADO',
  ): Promise<boolean> {
    const batch = await this.loadBatch(tenant, batchId);
    if (!batch) throw new MigrationBatchNotVisibleError();
    if (batch.status !== expectedStatus || batch.purged_at || !batch.source_object_key) {
      return false;
    }
    const expectedPrefix = `${tenant.schemaName}/migration/${batchId}/`;
    if (batch.source_object_key !== expectedPrefix) {
      throw new MigrationPermanentError('MIGRATION_OBJECT_KEY_MISMATCH');
    }
    const counts = MigrationBatchCountsSchema.safeParse(batch.counts);
    const files = counts.success ? counts.data.archivos.recibidos : 0;
    const packages = await this.readPackages(expectedPrefix, files);

    const staged = await runInTenantSchema(this.dataSource, tenant.schemaName, async (qr) => {
      const locked = (await qr.query(
        `SELECT status, purged_at FROM migration_batches
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [batchId, tenant.tenantId],
      )) as Array<{ status: string; purged_at: unknown }>;
      if (locked[0]?.status !== expectedStatus || locked[0]?.purged_at) return false;
      if (expectedStatus === 'CARGADO') {
        const promoted = (await qr.query(
          `SELECT 1 FROM migration_staging_records
            WHERE batch_id = $1 AND status = 'PROMOVIDO' LIMIT 1`,
          [batchId],
        )) as unknown[];
        if (promoted.length > 0) return false;
      }
      const result = await this.buildResult(qr, tenant, packages);
      await qr.query(`DELETE FROM migration_staging_records WHERE batch_id = $1`, [batchId]);
      await this.insertRecords(qr, tenant.tenantId, batchId, result.records);
      await qr.query(
        `UPDATE migration_batches
            SET counts = $3::jsonb, rejections = $4::jsonb, updated_at = now()
          WHERE id = $1 AND tenant_id = $2`,
        [
          batchId,
          tenant.tenantId,
          JSON.stringify(result.counts),
          JSON.stringify(result.rejections),
        ],
      );
      return true;
    });
    if (staged) {
      this.logger.log(
        expectedStatus === 'SIMULADO'
          ? `[migration] Lote ${batchId} simulado (archivos=${files}).`
          : `[migration] Lote ${batchId} revalidado antes de promover (archivos=${files}).`,
      );
    }
    return staged;
  }

  private async buildResult(
    qr: QueryRunner,
    tenant: ResolvedTenant,
    packages: ParseUispResult[],
  ): Promise<SimulationResult> {
    const mappingRows = (await qr.query(
      `SELECT kind, external_value, action, target_ref FROM migration_mappings
        WHERE tenant_id = $1 AND source_system = 'UISP'`,
      [tenant.tenantId],
    )) as Array<{
      kind: MigrationMappingKind;
      external_value: string;
      action: MigrationMappingAction;
      target_ref: string | null;
    }>;
    const keys = collectTitularKeys(packages);
    const facts = await this.titularLookup.lookup(qr, {
      documentHmacs: keys.documents.map((document) => this.crypto.documentHmac(document)),
      externalIds: keys.externalIds,
    });
    return simulateBatch(packages, {
      ...facts,
      mappings: buildMappingIndex(
        mappingRows.map((row) => ({
          kind: row.kind,
          externalValue: row.external_value,
          action: row.action,
        })),
      ),
      hmacOf: (document) => this.crypto.documentHmac(document),
      cycles: {
        targetDayOf: new Map(
          mappingRows
            .filter((row) => row.kind === 'CICLO')
            .map((row) => {
              const day = row.target_ref === null ? NaN : Number(row.target_ref);
              return [row.external_value, Number.isInteger(day) ? day : null] as const;
            }),
        ),
        activeDays: await this.titularLookup.activeBillingCycleDays(qr),
      },
    });
  }

  private async insertRecords(
    qr: QueryRunner,
    tenantId: string,
    batchId: string,
    records: StagedRecord[],
  ): Promise<void> {
    for (let start = 0; start < records.length; start += MIGRATION_STAGING_CHUNK) {
      const chunk = records.slice(start, start + MIGRATION_STAGING_CHUNK);
      const values: unknown[] = [];
      const tuples = chunk.map((record, offset) => {
        const base = offset * 7;
        values.push(
          tenantId,
          batchId,
          record.entity,
          record.externalId,
          this.crypto.encryptPayload(record.payload),
          record.status,
          record.reason,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
      });
      await qr.query(
        `INSERT INTO migration_staging_records
           (tenant_id, batch_id, entity, external_id, payload_encrypted, status, rejection_reason)
         VALUES ${tuples.join(', ')}`,
        values,
      );
    }
  }

  /** Último intento fallido: deja constancia en el lote sin PII. */
  async markFailed(tenantId: string, batchId: string): Promise<void> {
    const tenant = await this.resolveTenant(tenantId);
    await runInTenantSchema(this.dataSource, tenant.schemaName, (qr) =>
      qr.query(
        `UPDATE migration_batches
            SET counts = jsonb_set(counts, '{procesamiento}', '"FALLIDO"'::jsonb),
                updated_at = now()
          WHERE id = $1 AND tenant_id = $2 AND status = 'SIMULADO'`,
        [batchId, tenant.tenantId],
      ),
    );
  }
}
