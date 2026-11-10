import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PII_ENCRYPTED_TARGETS } from './reencrypt-aes.pii';

type EncryptedTarget = (typeof PII_ENCRYPTED_TARGETS)[number];
type TargetClassification = { participant: string } | { excluded: string };

const repositoryRoot = resolve(__dirname, '../../../..');
const classifications: Readonly<Record<string, TargetClassification>> = {
  'subscriber.documentNumberEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'subscriber.emailEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'subscriber.phoneEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'subscriber.altContactPhoneEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'subscriber.whatsappEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'subscriberLifecycleChange.noteEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'subscriberNote.bodyEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'billingDocument.buyerDocumentEncrypted': {
    participant: 'apps/api/src/modules/billing/privacy/billing-titular-erasure.participant.ts',
  },
  'expediente.documentNumberEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'expediente.phonePrimaryEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'expediente.phoneSecondaryEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'expediente.emailPrimaryEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'expediente.altContactPhoneEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'expediente.siteContactPhoneEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'expediente.fiscalDocumentEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'contract.fiscalDocumentEncrypted': {
    participant:
      'apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts',
  },
  'party.documentNumber': {
    participant: 'apps/api/src/modules/parties/privacy/party-titular-erasure.participant.ts',
  },
  'partyContact.valueEncrypted': {
    participant: 'apps/api/src/modules/parties/privacy/party-titular-erasure.participant.ts',
  },
  'privacyRequest.requesterNameEncrypted': {
    excluded: 'R6 conserva la solicitud de privacidad para trazabilidad.',
  },
  'privacyRequest.requesterDocumentEncrypted': {
    excluded: 'R6 conserva la solicitud de privacidad para trazabilidad.',
  },
  'privacyRequest.requesterContactEncrypted': {
    excluded: 'R6 conserva la solicitud de privacidad para trazabilidad.',
  },
};

function assertCoverageInvariant(
  targets: readonly EncryptedTarget[],
  targetClassifications: Readonly<Record<string, TargetClassification>>,
): void {
  const targetKeys = new Set(targets.map(({ entityType }) => entityType));
  const classificationKeys = new Set(Object.keys(targetClassifications));
  const missing = [...targetKeys].filter((key) => !classificationKeys.has(key));
  const stale = [...classificationKeys].filter((key) => !targetKeys.has(key));
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `Cobertura de supresión incompleta: sin clasificar [${missing.join(', ')}]; sobrantes [${stale.join(', ')}].`,
    );
  }

  for (const target of targets) {
    const classification = targetClassifications[target.entityType];
    if (!classification) throw new Error(`Objetivo sin clasificación: ${target.entityType}.`);
    if ('excluded' in classification) {
      if (classification.excluded.trim().length === 0) {
        throw new Error(`Exclusión sin motivo: ${target.entityType}.`);
      }
      continue;
    }
    const sourcePath = resolve(repositoryRoot, classification.participant);
    const source = readFileSync(sourcePath, 'utf8');
    if (!source.includes(target.table) || !source.includes(target.column)) {
      throw new Error(
        `La columna ${target.table}.${target.column} no aparece en el participante de ${target.entityType}.`,
      );
    }
  }
}

describe('Invariant de cobertura de supresión de datos cifrados', () => {
  it('clasifica exactamente el inventario PII cifrado y encuentra cada columna en su participante', () => {
    expect(() => assertCoverageInvariant(PII_ENCRYPTED_TARGETS, classifications)).not.toThrow();
  });

  it('detecta en rojo un objetivo nuevo que no tenga clasificación', () => {
    const unclassifiedTarget = {
      ...PII_ENCRYPTED_TARGETS[0]!,
      entityType: 'targetAddedForInvariantProbe',
      table: 'probe_table',
      column: 'probe_column_encrypted',
    };

    expect(() =>
      assertCoverageInvariant([...PII_ENCRYPTED_TARGETS, unclassifiedTarget], classifications),
    ).toThrow('targetAddedForInvariantProbe');
  });
});
