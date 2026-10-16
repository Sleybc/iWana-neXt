import { isValidSchemaName } from '@iwana/db';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
  looksLikeEncryptedAesGcm,
  parseEncryptionKeyHex,
  piiEncryptionKeyPreviousJoiSchema,
} from '../common/crypto/aes-gcm.util';
import { ReencryptDbPort } from '../common/crypto/reencrypt-aes.orchestrator';
import { EncryptedColumnTarget } from '../common/crypto/reencrypt-aes.targets';

export type MfaToPiiMode = 'dry-run' | 'apply' | 'verify-pii-only';

export type MfaToPiiKeys = {
  piiActiveKey: Buffer;
  piiPreviousKey: Buffer | null;
  mfaKeys: readonly Buffer[];
};

export type MfaToPiiOptions = {
  mode: MfaToPiiMode;
  schemaFilter?: string | undefined;
  eligibleTenantSchemas?: readonly string[] | undefined;
  pageSize?: number | undefined;
  keys: MfaToPiiKeys;
  targets?: readonly EncryptedColumnTarget[];
};

export type MfaToPiiTargetMetrics = {
  schemaName: string;
  entityType: string;
  candidates: number;
  reencrypted: number;
  skippedAlreadyPii: number;
  skippedMissingTable: number;
  nonCiphertext: number;
  decryptErrors: number;
  mfaOnlyRemaining: number;
  piiPreviousRemaining: number;
};

export type MfaToPiiReport = {
  mode: MfaToPiiMode;
  schemasProcessed: string[];
  targets: MfaToPiiTargetMetrics[];
  totals: Omit<MfaToPiiTargetMetrics, 'schemaName' | 'entityType'> & { pending: number };
  hasBlockingIssues: boolean;
};

/**
 * Inventario PII cifrado por los writers actuales. Se mantiene separado del
 * inventario MFA del recifrado ADR-058 original para evitar tocar objetivos MFA.
 */
function piiTarget(entityType: string, table: string, column: string): EncryptedColumnTarget {
  return {
    entityType,
    scope: 'tenant',
    table,
    column,
    idColumn: 'id',
    requireCiphertextShape: true,
  };
}

export const PII_ENCRYPTED_TARGETS: readonly EncryptedColumnTarget[] = [
  piiTarget('subscriber.documentNumberEncrypted', 'subscribers', 'document_number_encrypted'),
  piiTarget('subscriber.emailEncrypted', 'subscribers', 'email_encrypted'),
  piiTarget('subscriber.phoneEncrypted', 'subscribers', 'phone_encrypted'),
  piiTarget('subscriber.altContactPhoneEncrypted', 'subscribers', 'alt_contact_phone_encrypted'),
  piiTarget('subscriber.whatsappEncrypted', 'subscribers', 'whatsapp_encrypted'),
  piiTarget(
    'expediente.documentNumberEncrypted',
    'expediente_records',
    'document_number_encrypted',
  ),
  piiTarget('expediente.phonePrimaryEncrypted', 'expediente_records', 'phone_primary_encrypted'),
  piiTarget(
    'expediente.phoneSecondaryEncrypted',
    'expediente_records',
    'phone_secondary_encrypted',
  ),
  piiTarget('expediente.emailPrimaryEncrypted', 'expediente_records', 'email_primary_encrypted'),
  piiTarget(
    'expediente.altContactPhoneEncrypted',
    'expediente_records',
    'alt_contact_phone_encrypted',
  ),
  piiTarget(
    'expediente.siteContactPhoneEncrypted',
    'expediente_records',
    'site_contact_phone_encrypted',
  ),
  piiTarget('party.documentNumber', 'party', 'document_number'),
  piiTarget('partyContact.valueEncrypted', 'party_contact', 'value_encrypted'),
  piiTarget(
    'privacyRequest.requesterNameEncrypted',
    'data_subject_requests',
    'requester_name_encrypted',
  ),
  piiTarget(
    'privacyRequest.requesterDocumentEncrypted',
    'data_subject_requests',
    'requester_document_encrypted',
  ),
  piiTarget(
    'privacyRequest.requesterContactEncrypted',
    'data_subject_requests',
    'requester_contact_encrypted',
  ),
];

export type PiiTenantRegistryQuery = (sql: string, parameters: string[]) => Promise<unknown>;

/** Resuelve un solo schema registrado, con namespace existente y estado apto para K2. */
export async function listEligiblePiiTenantSchemas(
  query: PiiTenantRegistryQuery,
  requestedSchema: string,
): Promise<string[]> {
  const schemaName = requestedSchema.trim();
  if (!isValidSchemaName(schemaName)) {
    throw new Error('Schema tenant inválido para el recifrado MFA→PII.');
  }

  const queryResult = await query(
    `
      SELECT t.schema_name
      FROM public.tenants AS t
      JOIN pg_catalog.pg_namespace AS n
        ON n.nspname = t.schema_name
      WHERE t.schema_name = $1
    `,
    [schemaName],
  );
  const rows = Array.isArray(queryResult) ? (queryResult as Array<{ schema_name?: unknown }>) : [];

  const eligibleSchemas = rows.flatMap((row) =>
    row.schema_name === schemaName && typeof row.schema_name === 'string' ? [schemaName] : [],
  );
  if (eligibleSchemas.length !== 1) {
    throw new Error('Schema tenant no registrado, sin namespace o no elegible para K2.');
  }
  return eligibleSchemas;
}

export function loadMfaToPiiKeys(
  config: {
    getOrThrow: (key: string) => string;
    get?: (key: string) => unknown;
  },
  mfaActiveKey: Buffer,
  mfaPreviousKey: Buffer | null,
): MfaToPiiKeys {
  const { activeKey: piiActiveKey } = loadPiiAesGcmKeyPair(config);
  const piiPreviousResult = piiEncryptionKeyPreviousJoiSchema.validate(
    config.get?.('PII_ENCRYPTION_KEY_PREVIOUS'),
    { convert: false },
  );
  if (piiPreviousResult.error) {
    throw new Error(
      'PII_ENCRYPTION_KEY_PREVIOUS debe ser exactamente 64 caracteres hexadecimales.',
    );
  }

  const piiPreviousHex = piiPreviousResult.value as string | undefined;
  const piiPreviousKey = piiPreviousHex ? parseEncryptionKeyHex(piiPreviousHex) : null;
  if (
    mfaActiveKey.equals(piiActiveKey) ||
    (mfaPreviousKey !== null && mfaPreviousKey.equals(piiActiveKey))
  ) {
    throw new Error('PII_ENCRYPTION_KEY debe ser distinta de las claves MFA de origen.');
  }

  return {
    piiActiveKey,
    piiPreviousKey,
    mfaKeys: [mfaActiveKey, ...(mfaPreviousKey ? [mfaPreviousKey] : [])],
  };
}

function blankMetrics(schemaName: string, entityType: string): MfaToPiiTargetMetrics {
  return {
    schemaName,
    entityType,
    candidates: 0,
    reencrypted: 0,
    skippedAlreadyPii: 0,
    skippedMissingTable: 0,
    nonCiphertext: 0,
    decryptErrors: 0,
    mfaOnlyRemaining: 0,
    piiPreviousRemaining: 0,
  };
}

function decryptWith(value: string, key: Buffer): string | null {
  try {
    return decryptAes256Gcm(value, key, null);
  } catch {
    return null;
  }
}

function sumMetrics(targets: MfaToPiiTargetMetrics[]): MfaToPiiReport['totals'] {
  const totals: MfaToPiiReport['totals'] = {
    candidates: 0,
    reencrypted: 0,
    skippedAlreadyPii: 0,
    skippedMissingTable: 0,
    nonCiphertext: 0,
    decryptErrors: 0,
    mfaOnlyRemaining: 0,
    piiPreviousRemaining: 0,
    pending: 0,
  };
  for (const metric of targets) {
    totals.candidates += metric.candidates;
    totals.reencrypted += metric.reencrypted;
    totals.skippedAlreadyPii += metric.skippedAlreadyPii;
    totals.skippedMissingTable += metric.skippedMissingTable;
    totals.nonCiphertext += metric.nonCiphertext;
    totals.decryptErrors += metric.decryptErrors;
    totals.mfaOnlyRemaining += metric.mfaOnlyRemaining;
    totals.piiPreviousRemaining += metric.piiPreviousRemaining;
  }
  return totals;
}

async function processTarget(
  db: ReencryptDbPort,
  schemaName: string,
  target: EncryptedColumnTarget,
  options: MfaToPiiOptions,
): Promise<MfaToPiiTargetMetrics> {
  const metrics = blankMetrics(schemaName, target.entityType);
  if (!(await db.tableExists(schemaName, target.table))) {
    metrics.skippedMissingTable = 1;
    return metrics;
  }

  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 200;
  let offset = 0;
  for (;;) {
    const batch = await db.fetchEncryptedBatch(schemaName, target, offset, pageSize);
    if (batch.length === 0) break;

    for (const row of batch) {
      if (!row.value?.trim()) continue;
      metrics.candidates += 1;
      if (!looksLikeEncryptedAesGcm(row.value)) {
        metrics.nonCiphertext += 1;
        continue;
      }

      if (options.mode === 'verify-pii-only') {
        if (decryptWith(row.value, options.keys.piiActiveKey) !== null) {
          metrics.skippedAlreadyPii += 1;
          continue;
        }
        if (
          options.keys.piiPreviousKey &&
          decryptWith(row.value, options.keys.piiPreviousKey) !== null
        ) {
          metrics.piiPreviousRemaining += 1;
          continue;
        }
        if (options.keys.mfaKeys.some((key) => decryptWith(row.value, key) !== null)) {
          metrics.mfaOnlyRemaining += 1;
          continue;
        }
        metrics.decryptErrors += 1;
        continue;
      }

      let plaintext = decryptWith(row.value, options.keys.piiActiveKey);
      if (plaintext !== null) {
        metrics.skippedAlreadyPii += 1;
        continue;
      }

      if (options.keys.piiPreviousKey) {
        plaintext = decryptWith(row.value, options.keys.piiPreviousKey);
      }
      if (plaintext === null) {
        for (const mfaKey of options.keys.mfaKeys) {
          plaintext = decryptWith(row.value, mfaKey);
          if (plaintext !== null) break;
        }
      }

      if (plaintext === null) {
        metrics.decryptErrors += 1;
        continue;
      }

      const ciphertext = encryptAes256Gcm(plaintext, options.keys.piiActiveKey);
      if (options.mode === 'apply') {
        await db.updateEncryptedValue(schemaName, target, row.id, ciphertext);
      }
      metrics.reencrypted += 1;
    }

    if (batch.length < pageSize) break;
    offset += batch.length;
  }

  return metrics;
}

/** Recifra PII con claves MFA históricas a la clave PII activa por schema tenant. */
export async function runMfaToPii(
  db: ReencryptDbPort,
  options: MfaToPiiOptions,
): Promise<MfaToPiiReport> {
  const schemaFilter = options.schemaFilter?.trim();
  if (schemaFilter === 'public') {
    throw new Error('El recifrado MFA→PII solo acepta schemas tenant.');
  }

  const eligibleTenantSchemas =
    options.eligibleTenantSchemas ?? (await db.listActiveTenantSchemas());
  const schemas: string[] = schemaFilter
    ? eligibleTenantSchemas.filter((schema) => schema === schemaFilter)
    : [...eligibleTenantSchemas];
  if (schemaFilter && schemas.length === 0) {
    throw new Error(`Schema tenant no encontrado o no elegible: ${schemaFilter}.`);
  }

  const targets: MfaToPiiTargetMetrics[] = [];
  for (const schemaName of schemas) {
    for (const target of options.targets ?? PII_ENCRYPTED_TARGETS) {
      targets.push(await processTarget(db, schemaName, target, options));
    }
  }

  const totals = sumMetrics(targets);
  totals.pending =
    (options.mode === 'dry-run' ? totals.reencrypted : 0) +
    totals.skippedMissingTable +
    totals.nonCiphertext +
    totals.decryptErrors +
    (options.mode === 'verify-pii-only'
      ? totals.mfaOnlyRemaining + totals.piiPreviousRemaining
      : 0);
  const hasBlockingIssues =
    totals.skippedMissingTable > 0 ||
    (options.mode === 'verify-pii-only'
      ? totals.nonCiphertext > 0 ||
        totals.decryptErrors > 0 ||
        totals.mfaOnlyRemaining > 0 ||
        totals.piiPreviousRemaining > 0
      : totals.nonCiphertext > 0 || totals.decryptErrors > 0);

  return {
    mode: options.mode,
    schemasProcessed: schemas,
    targets,
    totals,
    hasBlockingIssues,
  };
}

export function formatMfaToPiiReport(report: MfaToPiiReport): string {
  const lines = [
    `[REENCRYPT-PII] mode=${report.mode}`,
    `[REENCRYPT-PII] schemas=${report.schemasProcessed.length} [${report.schemasProcessed.join(', ')}]`,
    `[REENCRYPT-PII] totals candidates=${report.totals.candidates} reencrypted=${report.totals.reencrypted} skipped_pii=${report.totals.skippedAlreadyPii} non_ciphertext=${report.totals.nonCiphertext} decrypt_errors=${report.totals.decryptErrors} mfa_only_remaining=${report.totals.mfaOnlyRemaining} pii_previous_remaining=${report.totals.piiPreviousRemaining} pending=${report.totals.pending} missing_table_targets=${report.totals.skippedMissingTable}`,
  ];

  for (const metric of report.targets) {
    if (
      metric.candidates === 0 &&
      metric.skippedMissingTable === 0 &&
      metric.nonCiphertext === 0 &&
      metric.decryptErrors === 0 &&
      metric.mfaOnlyRemaining === 0 &&
      metric.piiPreviousRemaining === 0
    ) {
      continue;
    }
    lines.push(
      `[REENCRYPT-PII] ${metric.schemaName}/${metric.entityType}: candidates=${metric.candidates} reencrypted=${metric.reencrypted} skipped_pii=${metric.skippedAlreadyPii} non_ciphertext=${metric.nonCiphertext} decrypt_errors=${metric.decryptErrors} mfa_only_remaining=${metric.mfaOnlyRemaining} pii_previous_remaining=${metric.piiPreviousRemaining}${metric.skippedMissingTable ? ' table_missing=1' : ''}`,
    );
  }

  lines.push(`[REENCRYPT-PII] blocking=${report.hasBlockingIssues ? 'yes' : 'no'}`);
  return lines.join('\n');
}
