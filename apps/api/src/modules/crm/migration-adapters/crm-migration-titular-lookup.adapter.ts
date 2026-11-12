import { Injectable } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import {
  MigrationTitularLookupPort,
  type MigrationTitularLookupInput,
  type MigrationTitularLookupResult,
} from '../../migration/ports/migration-titular-lookup.port';

/**
 * Adaptador CRM del puerto de titulares de la importación (ADR-110 D11). Solo lee tablas de
 * CRM (`subscribers`, `expediente_records`) en la transacción tenant del llamador y devuelve
 * conjuntos de HMAC / `external_id`; nunca datos del titular.
 */
@Injectable()
export class CrmMigrationTitularLookupAdapter extends MigrationTitularLookupPort {
  async lookup(
    qr: QueryRunner,
    input: MigrationTitularLookupInput,
  ): Promise<MigrationTitularLookupResult> {
    const existingHmacs = new Set<string>();
    const anonymizedExternalIds = new Set<string>();
    const importedExternalIds = new Set<string>();

    if (input.documentHmacs.length > 0) {
      const rows = (await qr.query(
        `SELECT document_number_hmac AS hmac FROM subscribers
          WHERE document_number_hmac = ANY($1::varchar[])
            AND deleted_at IS NULL AND anonymized_at IS NULL
         UNION
         SELECT document_number_hmac AS hmac FROM expediente_records
          WHERE document_number_hmac = ANY($1::varchar[])
            AND deleted_at IS NULL AND anonymized_at IS NULL`,
        [input.documentHmacs],
      )) as Array<{ hmac: string }>;
      for (const row of rows) existingHmacs.add(row.hmac);
    }

    if (input.externalIds.length > 0) {
      const rows = (await qr.query(
        // Sin filtrar bajas: el índice único de `external_id` también las incluye.
        `SELECT external_id, (anonymized_at IS NOT NULL) AS anonymized
           FROM subscribers
          WHERE external_id = ANY($1::varchar[])`,
        [input.externalIds],
      )) as Array<{ external_id: string; anonymized: boolean }>;
      for (const row of rows) {
        (row.anonymized ? anonymizedExternalIds : importedExternalIds).add(row.external_id);
      }
    }

    return { existingHmacs, anonymizedExternalIds, importedExternalIds };
  }

  async activeBillingCycleDays(qr: QueryRunner): Promise<Set<number>> {
    const rows = (await qr.query(
      `SELECT cycle_day FROM crm_billing_cycles WHERE active`,
    )) as Array<{ cycle_day: number | string }>;
    return new Set(rows.map((row) => Number(row.cycle_day)));
  }
}
