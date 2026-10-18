import { ServiceUnavailableException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { In } from 'typeorm';
import type { PrivacyMark } from '@iwana/shared';
import {
  hydrateFiscalDocument,
  type FiscalDocumentCrypto,
} from '../../../common/crypto/fiscal-document.util';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { Subscriber } from '../subscribers/entities/subscriber.entity';
import { Contract } from './entities/contract.entity';

export interface ContractReadProjection {
  data: Contract[];
  blockedServed: number;
}

/** Proyección canónica de lectura, compartida por Contracts y la ficha 360°. */
export async function projectContractsForRead(
  manager: EntityManager,
  contracts: Contract[],
  canSeeBlocked: boolean,
  fiscalDocumentCrypto: FiscalDocumentCrypto,
  privacyMarksReadPort?: IPrivacyMarksReadPort,
): Promise<ContractReadProjection> {
  await hydrateContractFiscalDocuments(manager, contracts, fiscalDocumentCrypto);
  const subscriberIds = [...new Set(contracts.map((contract) => contract.subscriberId))];
  const subscribers = subscriberIds.length
    ? await manager.find(Subscriber, {
        where: { id: In(subscriberIds) },
        select: ['id', 'partyId', 'anonymizedAt'],
      })
    : [];
  const subscriberById = new Map(subscribers.map((subscriber) => [subscriber.id, subscriber]));
  const partyIds = [
    ...new Set(
      subscribers.flatMap((subscriber) => (subscriber.partyId ? [subscriber.partyId] : [])),
    ),
  ];

  if (partyIds.length > 0 && !privacyMarksReadPort) {
    throw new ServiceUnavailableException({
      code: 'PRIVACY_MARKS_UNAVAILABLE',
      message: 'No se pudo aplicar la protección de privacidad al contrato.',
    });
  }
  const marksByParty = partyIds.length ? await privacyMarksReadPort!.activeMarks(partyIds) : {};

  let blockedServed = 0;
  const data = contracts.map((contract) => {
    const subscriber = subscriberById.get(contract.subscriberId);
    const anonymizedAt = subscriber?.anonymizedAt ?? null;
    const marks: PrivacyMark[] = subscriber?.partyId
      ? (marksByParty[subscriber.partyId] ?? [])
      : [];
    const blocked = anonymizedAt == null && marks.includes('DATOS_BLOQUEADOS');
    if (blocked && canSeeBlocked) blockedServed += 1;
    const projected = Object.assign(contract, {
      titularAnonymizedAt: anonymizedAt?.toISOString() ?? null,
    });
    if (blocked && !canSeeBlocked) {
      Object.assign(projected, {
        alias: 'Datos bloqueados',
        installationAddress: null,
        installationCity: null,
        installationDepartment: null,
        installationPostalCode: null,
        installationNotes: null,
        installationStratum: null,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        fiscalName: null,
        fiscalDocument: null,
        fiscalAddress: null,
      });
    }
    return projected;
  });
  return { data, blockedServed };
}

export async function hydrateContractFiscalDocuments(
  manager: EntityManager,
  contracts: Contract[],
  fiscalDocumentCrypto: FiscalDocumentCrypto,
): Promise<void> {
  if (contracts.length === 0 || typeof manager.query !== 'function') return;
  const rows = (await manager.query(
    `SELECT id::text AS id, fiscal_document, fiscal_document_encrypted, fiscal_document_hmac
       FROM contracts WHERE id = ANY($1::uuid[])`,
    [contracts.map((contract) => contract.id)],
  )) as Array<{
    id: string;
    fiscal_document: string | null;
    fiscal_document_encrypted: string | null;
    fiscal_document_hmac: string | null;
  }>;
  const rowById = new Map(rows.map((row) => [row.id, row]));
  for (const contract of contracts) {
    const row = rowById.get(contract.id);
    if (!row) continue;
    hydrateFiscalDocument(
      contract,
      row.fiscal_document_encrypted,
      row.fiscal_document_hmac,
      row.fiscal_document,
      fiscalDocumentCrypto,
    );
  }
}
