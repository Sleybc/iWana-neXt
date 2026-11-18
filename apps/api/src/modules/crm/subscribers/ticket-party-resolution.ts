import { ServiceUnavailableException } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { TenantContext } from '@iwana/db';
import type { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import type {
  CrmTicketPartyLookup,
  CrmTicketPartySnapshot,
} from '../ports/crm-subscriber-read.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

interface SubscriberNameRow {
  id: string;
  party_id: string | null;
  anonymized_at: Date | string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  commercial_name: string | null;
}

interface ContractRow {
  id: string;
  subscriber_id: string;
}

interface ExpedienteNameRow {
  id: string;
  anonymized_at: Date | string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  /** Partes de todos los suscriptores enlazados, borrados incluidos (S-8). */
  party_ids: string[] | null;
  subscriber_anonymized: boolean;
}

function normalizeId(id: string): string | null {
  const normalized = id.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function subscriberDisplayName(row: SubscriberNameRow): string | null {
  return (
    row.commercial_name?.trim() ||
    row.business_name?.trim() ||
    [row.first_name, row.last_name]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' ') ||
    null
  );
}

/** Misma precedencia que `ExpedienteService.resolveDisplayName`. */
function expedienteDisplayName(row: ExpedienteNameRow): string | null {
  return (
    row.full_name?.trim() ||
    [row.first_name, row.last_name]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' ') ||
    row.company_name?.trim() ||
    null
  );
}

/**
 * Resolución de nombres de titulares para el detalle de un ticket (MOD10, R4).
 *
 * Corre con el `qr` del llamante (su transacción y su `search_path`): no abre conexiones.
 * Supresión (`anonymized_at`) y DATOS_BLOQUEADOS ocultan el nombre siempre, sin excepción
 * por permiso: el detalle del ticket no es el lugar de consulta de un titular protegido.
 * Sin el puerto de marcas lanza 503 y el llamante oculta el nombre (fail-closed).
 */
export async function resolveTicketParties(
  references: CrmTicketPartyLookup[],
  qr: QueryRunner,
  privacyMarksReadPort: IPrivacyMarksReadPort | undefined,
): Promise<CrmTicketPartySnapshot[]> {
  if (references.length === 0) return [];
  const { tenantId } = TenantContext.getOrThrow();

  const idsOf = (type: CrmTicketPartyLookup['type']): string[] => [
    ...new Set(
      references
        .filter((reference) => reference.type === type)
        .map((reference) => normalizeId(reference.id))
        .filter((id): id is string => id !== null),
    ),
  ];
  const contractIds = idsOf('CONTRACT');
  const expedienteIds = idsOf('EXPEDIENTE');

  const contracts = contractIds.length
    ? ((await qr.query(
        `SELECT id::text AS id, subscriber_id::text AS subscriber_id
           FROM contracts
          WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
        [tenantId, contractIds],
      )) as ContractRow[])
    : [];
  const contractById = new Map(contracts.map((row) => [row.id, row]));

  const subscriberIds = [
    ...new Set([...idsOf('SUBSCRIBER'), ...contracts.map((row) => row.subscriber_id)]),
  ];
  const subscribers = subscriberIds.length
    ? ((await qr.query(
        `SELECT id::text AS id, party_id::text AS party_id, anonymized_at,
                first_name, last_name, business_name, commercial_name
           FROM subscribers
          WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
        [tenantId, subscriberIds],
      )) as SubscriberNameRow[])
    : [];
  const subscriberById = new Map(subscribers.map((row) => [row.id, row]));

  // Un expediente convertido toma las marcas del suscriptor enlazado (regla de
  // `ExpedienteService.getPrivacyMarksForExpediente`, que no descarta suscriptores borrados);
  // si ese suscriptor está suprimido, el expediente también se protege. Se miran TODOS los
  // enlazados, borrados incluidos (S-8): basta uno bloqueado o suprimido para ocultar el nombre.
  const expedientes = expedienteIds.length
    ? ((await qr.query(
        `SELECT e.id::text AS id, e.anonymized_at, e.full_name, e.first_name, e.last_name,
                e.company_name, linked.party_ids, COALESCE(linked.anonymized, false) AS subscriber_anonymized
           FROM expediente_records e
           LEFT JOIN LATERAL (
             SELECT array_agg(DISTINCT s.party_id::text) FILTER (WHERE s.party_id IS NOT NULL) AS party_ids,
                    bool_or(s.anonymized_at IS NOT NULL) AS anonymized
               FROM subscribers s
              WHERE s.expediente_id = e.id AND s.tenant_id = e.tenant_id
           ) linked ON true
          WHERE e.tenant_id = $1::uuid AND e.id = ANY($2::uuid[]) AND e.deleted_at IS NULL`,
        [tenantId, expedienteIds],
      )) as ExpedienteNameRow[])
    : [];
  const expedienteById = new Map(expedientes.map((row) => [row.id, row]));

  const partyIds = [
    ...new Set(
      [
        ...subscribers.map((row) => row.party_id),
        ...expedientes.flatMap((row) => row.party_ids ?? []),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  let blockedParties = new Set<string>();
  if (partyIds.length > 0) {
    if (!privacyMarksReadPort) {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_MARKS_UNAVAILABLE',
        message: 'No se pudo verificar el estado de privacidad del titular.',
      });
    }
    const marks = await privacyMarksReadPort.activeMarks(partyIds, { manager: qr.manager });
    blockedParties = new Set(
      partyIds.filter((partyId) => (marks[partyId] ?? []).includes('DATOS_BLOQUEADOS')),
    );
  }

  const fromSubscriber = (
    reference: CrmTicketPartyLookup,
    subscriber: SubscriberNameRow | undefined,
  ): CrmTicketPartySnapshot => {
    if (!subscriber) {
      return { ...reference, state: 'NOT_FOUND', displayName: null, profile: null };
    }
    const profile = { kind: 'SUBSCRIBER' as const, id: subscriber.id };
    const isProtected =
      subscriber.anonymized_at != null ||
      (subscriber.party_id != null && blockedParties.has(subscriber.party_id));
    return isProtected
      ? { ...reference, state: 'PROTECTED', displayName: null, profile }
      : {
          ...reference,
          state: 'AVAILABLE',
          displayName: subscriberDisplayName(subscriber),
          profile,
        };
  };

  return references.map((reference): CrmTicketPartySnapshot => {
    const id = normalizeId(reference.id);
    if (!id) return { ...reference, state: 'NOT_FOUND', displayName: null, profile: null };

    if (reference.type === 'SUBSCRIBER') return fromSubscriber(reference, subscriberById.get(id));

    if (reference.type === 'CONTRACT') {
      const contract = contractById.get(id);
      return fromSubscriber(
        reference,
        contract ? subscriberById.get(contract.subscriber_id) : undefined,
      );
    }

    const expediente = expedienteById.get(id);
    if (!expediente) return { ...reference, state: 'NOT_FOUND', displayName: null, profile: null };
    const profile = { kind: 'EXPEDIENTE' as const, id: expediente.id };
    const isProtected =
      expediente.anonymized_at != null ||
      expediente.subscriber_anonymized ||
      (expediente.party_ids ?? []).some((partyId) => blockedParties.has(partyId));
    return isProtected
      ? { ...reference, state: 'PROTECTED', displayName: null, profile }
      : {
          ...reference,
          state: 'AVAILABLE',
          displayName: expedienteDisplayName(expediente),
          profile,
        };
  });
}
