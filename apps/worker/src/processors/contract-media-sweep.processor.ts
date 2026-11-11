import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Job, Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { isValidSchemaName, runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import { STORAGE_PORT, type StoragePort, type StoredObjectSummary } from '@iwana/storage';
import { SanitizeFailedReason } from '../common/sanitize-failed-reason.decorator';

export const CONTRACT_MEDIA_SWEEP_QUEUE = 'crm-contract-media-sweep';
export const CONTRACT_MEDIA_SWEEP_JOB = 'sweep';
/** Gracia para objetos sin fila: cubre una firma o un render en curso. */
export const CONTRACT_MEDIA_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export interface ContractMediaSweepSummary {
  tenants: number;
  listed: number;
  deletedAnonymized: number;
  deletedOrphans: number;
  failed: number;
}

interface ContractStateRow {
  id: string;
  anonymized: boolean;
}

/**
 * Barrido de los objetos del contrato en medios (hallazgo SEC-1; ADR-109 §4).
 *
 * Bajo `{schema}/contracts/{contractId}/` viven el PDF sin firmar, la imagen de la firma y el
 * PDF firmado, cifrados. Por tenant lista ese prefijo y borra:
 * - todos los objetos de un contrato anonimizado (`contracts.anonymized_at`, que marca la
 *   supresión del titular en su transacción) o inexistente;
 * - los objetos que ninguna fila referencia (firma fallida tras subir la imagen, 503 del
 *   worker, render sin commit) con más de 24 h, para no tocar una firma en curso.
 * Idempotente (borrar un objeto ausente no falla). Los logs solo llevan conteos.
 */
@Processor(CONTRACT_MEDIA_SWEEP_QUEUE, { concurrency: 1 })
export class ContractMediaSweepProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContractMediaSweepProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectQueue(CONTRACT_MEDIA_SWEEP_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add(
      CONTRACT_MEDIA_SWEEP_JOB,
      {},
      {
        repeat: { pattern: '15 */6 * * *' },
        jobId: 'crm-contract-media-sweep-recurring',
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    );
  }

  @SanitizeFailedReason()
  async process(_job: Job<unknown>): Promise<ContractMediaSweepSummary> {
    return this.sweep(new Date());
  }

  async sweep(now: Date): Promise<ContractMediaSweepSummary> {
    if (typeof this.storage.listObjects !== 'function') {
      throw new Error('El almacenamiento no permite listar objetos por prefijo.');
    }
    const summary: ContractMediaSweepSummary = {
      tenants: 0,
      listed: 0,
      deletedAnonymized: 0,
      deletedOrphans: 0,
      failed: 0,
    };
    const tenants = (await this.dataSource.query(
      `SELECT schema_name FROM public.tenants WHERE deleted_at IS NULL ORDER BY schema_name`,
    )) as Array<{ schema_name: string }>;
    for (const { schema_name: schemaName } of tenants) {
      if (!isValidSchemaName(schemaName)) continue;
      try {
        await this.sweepTenant(schemaName, now, summary);
        summary.tenants += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.warn(`contract_media.sweep_tenant_failed ${summarizeErrorForLog(error)}`);
      }
    }
    this.logger.log(
      `contract_media.sweep tenants=${summary.tenants} listed=${summary.listed} ` +
        `anonymized=${summary.deletedAnonymized} orphans=${summary.deletedOrphans} ` +
        `failed=${summary.failed}`,
    );
    return summary;
  }

  private async sweepTenant(
    schemaName: string,
    now: Date,
    summary: ContractMediaSweepSummary,
  ): Promise<void> {
    const prefix = `${schemaName}/contracts/`;
    const objects = await this.storage.listObjects!(prefix);
    summary.listed += objects.length;
    if (objects.length === 0) return;

    const byContract = new Map<string, StoredObjectSummary[]>();
    for (const object of objects) {
      const contractId = object.key.slice(prefix.length).split('/')[0] ?? '';
      if (!UUID.test(contractId)) continue;
      byContract.set(contractId, [...(byContract.get(contractId) ?? []), object]);
    }
    const contractIds = [...byContract.keys()];
    if (contractIds.length === 0) return;

    const { states, referenced } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const stateRows = (await qr.query(
          `SELECT id::text AS id, anonymized_at IS NOT NULL AS anonymized
             FROM contracts WHERE id = ANY($1::uuid[])`,
          [contractIds],
        )) as ContractStateRow[];
        const keyRows = (await qr.query(
          `SELECT document_object_key AS key FROM contract_document_generations
            WHERE contract_id = ANY($1::uuid[]) AND document_object_key IS NOT NULL
           UNION ALL
           SELECT signature_object_key FROM contract_signatures
            WHERE contract_id = ANY($1::uuid[])
           UNION ALL
           SELECT signed_document_object_key FROM contract_signatures
            WHERE contract_id = ANY($1::uuid[])`,
          [contractIds],
        )) as Array<{ key: string }>;
        return {
          states: new Map(stateRows.map((row) => [row.id, row.anonymized])),
          referenced: new Set(keyRows.map((row) => row.key)),
        };
      },
    );

    for (const [contractId, contractObjects] of byContract) {
      const anonymized = states.get(contractId);
      for (const object of contractObjects) {
        const erase = anonymized === undefined || anonymized === true;
        const orphan =
          !referenced.has(object.key) &&
          object.lastModified !== null &&
          now.getTime() - object.lastModified.getTime() > CONTRACT_MEDIA_ORPHAN_GRACE_MS;
        if (!erase && !orphan) continue;
        try {
          await this.storage.deleteObject(object.key);
          if (erase) summary.deletedAnonymized += 1;
          else summary.deletedOrphans += 1;
        } catch (error) {
          summary.failed += 1;
          this.logger.warn(`contract_media.delete_failed ${summarizeErrorForLog(error)}`);
        }
      }
    }
  }
}
