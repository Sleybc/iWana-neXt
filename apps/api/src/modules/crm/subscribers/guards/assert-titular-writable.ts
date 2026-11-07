import type { QueryRunner } from 'typeorm';
import { titularAnonymizedConflict } from './titular-anonymized-conflict';

import type { TitularWriteReference } from '../../ports/titular-write-reference';

/** Bloquea las filas CRM en la misma transacción que escribirá el texto. */
export async function assertTitularWritable(
  references: TitularWriteReference[],
  qr: QueryRunner,
): Promise<void> {
  const contractIds = references.filter((ref) => ref.type === 'CONTRACT').map((ref) => ref.id);
  const subscriberIds = references.filter((ref) => ref.type === 'SUBSCRIBER').map((ref) => ref.id);
  const expedienteIds = references.filter((ref) => ref.type === 'EXPEDIENTE').map((ref) => ref.id);
  if (contractIds.length) {
    const contracts = (await qr.query(
      'SELECT subscriber_id::text AS subscriber_id FROM contracts WHERE id::text = ANY($1::text[])',
      [contractIds],
    )) as Array<{ subscriber_id: string }>;
    subscriberIds.push(...contracts.map((row) => row.subscriber_id));
  }
  if (subscriberIds.length) {
    const rows = (await qr.query(
      'SELECT id, anonymized_at, expediente_id::text AS expediente_id FROM subscribers WHERE id::text = ANY($1::text[]) ORDER BY id FOR UPDATE',
      [[...new Set(subscriberIds)]],
    )) as Array<{ anonymized_at: Date | null; expediente_id: string | null }>;
    if (rows.some((row) => row.anonymized_at !== null)) throw titularAnonymizedConflict();
    expedienteIds.push(...rows.flatMap((row) => (row.expediente_id ? [row.expediente_id] : [])));
  }
  if (expedienteIds.length) {
    const rows = (await qr.query(
      'SELECT id, anonymized_at FROM expediente_records WHERE id::text = ANY($1::text[]) ORDER BY id FOR UPDATE',
      [[...new Set(expedienteIds)]],
    )) as Array<{ anonymized_at: Date | null }>;
    if (rows.some((row) => row.anonymized_at !== null)) throw titularAnonymizedConflict();
  }
}
