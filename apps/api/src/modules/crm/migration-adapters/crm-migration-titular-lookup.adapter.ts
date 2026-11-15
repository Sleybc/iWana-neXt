import { Injectable } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import {
  MigrationTitularLookupPort,
  type MigrationTitularLookupInput,
  type MigrationTitularLookupResult,
  type MigrationTitularTarget,
} from '../../migration/ports/migration-titular-lookup.port';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';

interface CandidateRow {
  id: string;
  party_id: string | null;
  external_id: string | null;
}

/**
 * Adaptador CRM del puerto de titulares de la importación (ADR-110 D11). Solo lee tablas de
 * CRM (`subscribers`, `expediente_records`) en la transacción tenant del llamador y devuelve
 * conjuntos de HMAC / `external_id` e ids de suscriptor; nunca datos del titular. El bloqueo
 * por privacidad sale de `IPrivacyMarksReadPort`, la misma fuente de `privacyRestricted`.
 */
@Injectable()
export class CrmMigrationTitularLookupAdapter extends MigrationTitularLookupPort {
  constructor(private readonly privacyMarks: IPrivacyMarksReadPort) {
    super();
  }

  async lookup(
    qr: QueryRunner,
    input: MigrationTitularLookupInput,
  ): Promise<MigrationTitularLookupResult> {
    const existingHmacs = new Set<string>();
    const anonymizedExternalIds = new Set<string>();
    const importedExternalIds = new Set<string>();
    const subscriberIdByHmac = new Map<string, string>();
    const restrictedSubscriberIds = new Set<string>();
    const externalIdBySubscriber = new Map<string, string | null>();

    if (input.documentHmacs.length > 0) {
      const rows = (await qr.query(
        `SELECT document_number_hmac AS hmac FROM subscribers
          WHERE tenant_id = $2 AND document_number_hmac = ANY($1::varchar[])
            AND deleted_at IS NULL AND anonymized_at IS NULL
         UNION
         SELECT document_number_hmac AS hmac FROM expediente_records
          WHERE tenant_id = $2 AND document_number_hmac = ANY($1::varchar[])
            AND deleted_at IS NULL AND anonymized_at IS NULL`,
        [input.documentHmacs, input.tenantId],
      )) as Array<{ hmac: string }>;
      for (const row of rows) existingHmacs.add(row.hmac);

      const candidates = (await qr.query(
        `SELECT DISTINCT ON (document_number_hmac)
                document_number_hmac AS hmac, id::text AS id, party_id::text AS party_id,
                external_id
           FROM subscribers
          WHERE tenant_id = $2 AND document_number_hmac = ANY($1::varchar[])
            AND deleted_at IS NULL AND anonymized_at IS NULL
          ORDER BY document_number_hmac, created_at, id`,
        [input.documentHmacs, input.tenantId],
      )) as Array<CandidateRow & { hmac: string }>;
      for (const row of candidates) {
        subscriberIdByHmac.set(row.hmac, row.id);
        externalIdBySubscriber.set(row.id, row.external_id);
      }
      for (const id of await this.restrictedAmong(qr, candidates)) restrictedSubscriberIds.add(id);
    }

    if (input.externalIds.length > 0) {
      const rows = (await qr.query(
        // Sin filtrar bajas: el índice único de `external_id` también las incluye.
        `SELECT external_id, (anonymized_at IS NOT NULL) AS anonymized
           FROM subscribers
          WHERE tenant_id = $2 AND external_id = ANY($1::varchar[])`,
        [input.externalIds, input.tenantId],
      )) as Array<{ external_id: string; anonymized: boolean }>;
      for (const row of rows) {
        (row.anonymized ? anonymizedExternalIds : importedExternalIds).add(row.external_id);
      }
    }

    return {
      existingHmacs,
      anonymizedExternalIds,
      importedExternalIds,
      subscriberIdByHmac,
      restrictedSubscriberIds,
      externalIdBySubscriber,
    };
  }

  async titularTarget(
    qr: QueryRunner,
    tenantId: string,
    subscriberId: string,
  ): Promise<MigrationTitularTarget | null> {
    const rows = (await qr.query(
      `SELECT id::text AS id, party_id::text AS party_id, external_id
         FROM subscribers
        WHERE id = $1::uuid AND tenant_id = $2 AND deleted_at IS NULL AND anonymized_at IS NULL`,
      [subscriberId, tenantId],
    )) as CandidateRow[];
    const row = rows[0];
    if (!row) return null;
    const restricted = await this.restrictedAmong(qr, [row]);
    return {
      subscriberId: row.id,
      externalId: row.external_id,
      restricted: restricted.has(row.id),
    };
  }

  /** Suscriptores con `DATOS_BLOQUEADOS` vigente en su Party (misma regla que `privacyRestricted`). */
  private async restrictedAmong(qr: QueryRunner, rows: CandidateRow[]): Promise<Set<string>> {
    const partyIds = [...new Set(rows.flatMap((row) => (row.party_id ? [row.party_id] : [])))];
    if (partyIds.length === 0) return new Set();
    const marks = await this.privacyMarks.activeMarks(partyIds, { manager: qr.manager });
    return new Set(
      rows
        .filter((row) => row.party_id && (marks[row.party_id] ?? []).includes('DATOS_BLOQUEADOS'))
        .map((row) => row.id),
    );
  }

  async activeBillingCycleDays(qr: QueryRunner): Promise<Set<number>> {
    const rows = (await qr.query(
      `SELECT cycle_day FROM crm_billing_cycles WHERE active`,
    )) as Array<{ cycle_day: number | string }>;
    return new Set(rows.map((row) => Number(row.cycle_day)));
  }
}
