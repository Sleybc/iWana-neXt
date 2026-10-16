import { Injectable } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { normalizeErasureRows } from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

interface MediaCandidateSets {
  privacy: string[];
  stratum: string[];
  execution: string[];
}

interface MediaUpdateResult {
  selected: number;
  changed: number;
  residual: number;
}

@Injectable()
export class MediaTitularErasureParticipant implements TitularErasureParticipant {
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
    const candidates = this.mediaCandidates(scope);
    const tenantSchema = scope.tenantSchema ?? (await this.currentSchema(qr));
    const privacy = await this.updateAssets(
      qr,
      candidates.privacy,
      tenantSchema,
      'privacy_evidence',
      mode,
    );
    const stratum = await this.updateAssets(
      qr,
      candidates.stratum,
      tenantSchema,
      'stratum_evidence',
      mode,
    );
    const execution = await this.updateAssets(
      qr,
      candidates.execution,
      tenantSchema,
      'execution_evidence',
      mode,
    );
    return [
      { table: 'media_assets:privacy_evidence', category: 'EVIDENCIA_DOCUMENTAL', ...privacy },
      { table: 'media_assets:stratum_evidence', category: 'EVIDENCIA_DOCUMENTAL', ...stratum },
      { table: 'media_assets:execution_evidence', category: 'EVIDENCIA_DOCUMENTAL', ...execution },
    ];
  }

  private async currentSchema(qr: QueryRunner): Promise<string> {
    const rows = (await qr.query('SELECT current_schema() AS schema_name')) as Array<{
      schema_name: string;
    }>;
    const schema = rows[0]?.schema_name;
    if (!schema) throw new Error('No se pudo resolver el schema tenant para Media.');
    return schema;
  }

  private mediaCandidates(scope: TitularErasureScope): MediaCandidateSets {
    return {
      privacy: [...new Set(scope.relatedIds?.privacyEvidenceMediaIds ?? [])],
      stratum: [...new Set(scope.relatedIds?.stratumEvidenceMediaIds ?? [])],
      execution: [...new Set(scope.relatedIds?.executionEvidenceMediaIds ?? [])],
    };
  }

  private async updateAssets(
    qr: QueryRunner,
    ids: string[],
    tenantSchema: string,
    usage: 'privacy_evidence' | 'stratum_evidence' | 'execution_evidence',
    mode: 'dry-run' | 'apply',
  ): Promise<MediaUpdateResult> {
    if (ids.length === 0) return { selected: 0, changed: 0, residual: 0 };
    const present = (await qr.query(
      `SELECT to_regclass('public.media_assets') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    if (present[0]?.present !== true) {
      throw new Error('La tabla Media no está disponible para verificar la evidencia.');
    }
    const selectedRows = (await qr.query(
      `SELECT id::text AS id, deleted_at FROM public.media_assets
        WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3 FOR UPDATE`,
      [ids, tenantSchema, usage],
    )) as Array<{ id: string; deleted_at: Date | string | null }>;
    if (selectedRows.length !== new Set(ids).size) {
      throw new Error('No se pudo verificar toda la evidencia Media del alcance.');
    }
    let changed = selectedRows.filter((row) => row.deleted_at === null).length;
    if (mode === 'apply') {
      const updated = normalizeErasureRows<{ id: string }>(
        await qr.query(
          `UPDATE public.media_assets SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
          WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3 AND deleted_at IS NULL
          RETURNING id`,
          [selectedRows.map((row) => row.id), tenantSchema, usage],
        ),
      );
      changed = updated.length;
    }
    const residualRows = (await qr.query(
      `SELECT COUNT(*)::int AS count FROM public.media_assets
        WHERE id = ANY($1::uuid[]) AND tenant_schema = $2 AND usage = $3 AND deleted_at IS NULL`,
      [selectedRows.map((row) => row.id), tenantSchema, usage],
    )) as Array<{ count: number }>;
    const residual = residualRows[0]?.count ?? 0;
    return { selected: selectedRows.length, changed, residual };
  }
}
