import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import {
  anonymizeConfiguredTable,
  loadErasureKeys,
  markAnonymizedRows,
  readTenantColumns,
  type FieldRule,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

const PARTY_RULES: FieldRule[] = [
  { column: 'document_type', kind: 'marker', marker: 'OTHER' },
  { column: 'document_number', kind: 'encrypted-marker', marker: 'ANONIMIZADO' },
  { column: 'document_number_hmac', kind: 'null' },
  { column: 'document_number_hash', kind: 'legacy-hash', marker: 'party-document' },
  { column: 'verification_digit', kind: 'null' },
  { column: 'display_name', kind: 'marker' },
  { column: 'legal_name', kind: 'null' },
  { column: 'birth_date', kind: 'null' },
  { column: 'incorporation_date', kind: 'null' },
  { column: 'notes', kind: 'null' },
  { column: 'address', kind: 'null' },
  { column: 'latitude', kind: 'null' },
  { column: 'longitude', kind: 'null' },
  { column: 'city', kind: 'null' },
  { column: 'department', kind: 'null' },
];

const PARTY_CONTACT_RULES: FieldRule[] = [
  { column: 'value', kind: 'null', notNullFallback: 'marker' },
  { column: 'value_encrypted', kind: 'null' },
  { column: 'value_hmac', kind: 'null' },
  { column: 'metadata', kind: 'null' },
  { column: 'is_primary', kind: 'false' },
  { column: 'verified_at', kind: 'null' },
];

@Injectable()
export class PartyTitularErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}

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
    const keys = scope.cryptoKeys ?? loadErasureKeys(this.config);
    const columns = await readTenantColumns(qr);
    const partyIds = scope.partyId ? [scope.partyId] : [];
    const party = await anonymizeConfiguredTable(
      qr,
      'party',
      partyIds,
      PARTY_RULES,
      columns,
      keys,
      mode,
    );
    if (mode === 'apply' && scope.requestId && partyIds.length > 0) {
      const marker = await markAnonymizedRows(qr, 'party', partyIds, scope.requestId, columns);
      if (marker.residual > 0)
        throw new Error('No se pudo verificar la marca de anonimización del Party.');
    }

    let contactIds: string[] = [];
    if (partyIds.length > 0) {
      const rows = (await qr.query(
        'SELECT id::text FROM party_contact WHERE party_id = $1 FOR UPDATE',
        [scope.partyId],
      )) as Array<{ id: string }>;
      contactIds = rows.map((row) => row.id);
    }
    const contacts = await anonymizeConfiguredTable(
      qr,
      'party_contact',
      contactIds,
      PARTY_CONTACT_RULES,
      columns,
      keys,
      mode,
    );
    return [
      { table: 'party', category: 'IDENTIFICACION', ...party },
      { table: 'party_contact', category: 'CONTACTO', ...contacts },
    ];
  }
}
