import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { resolveMigrationDbCredentials, runInTenantSchema, TenantContext } from '@iwana/db';
import { AccessPermissionKey, DocumentTypeParty, normalizeDocumentNumber } from '@iwana/shared';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  parseEncryptionKeyHex,
} from '../common/crypto/aes-gcm.util';
import { createFiscalDocumentCryptoFromKeys } from '../common/crypto/fiscal-document.util';
import { hmacPii } from '../common/crypto/pii-hash-key.util';
import { TypeOrmReencryptDbAdapter } from '../common/crypto/reencrypt-aes.db-adapter';
import { EncryptedColumnTarget } from '../common/crypto/reencrypt-aes.targets';
import {
  formatMfaToPiiReport,
  listEligiblePiiTenantSchemas,
  MfaToPiiKeys,
  PII_ENCRYPTED_TARGETS,
  PiiReencryptDbPort,
  runMfaToPii,
} from './reencrypt-aes.pii';
import { resolveK2ReencryptIntegrationEnabled } from './reencrypt-aes.integration-safety';
import { AuditService } from '../modules/audit/audit.service';
import { EffectivePermissionsService } from '../modules/access-control/services/effective-permissions.service';
import { BillingStandingReadAdapter } from '../modules/billing/privacy/billing-standing-read.adapter';
import { BillingTitularErasureParticipant } from '../modules/billing/privacy/billing-titular-erasure.participant';
import { AssuranceTitularErasureParticipant } from '../modules/assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../modules/network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../modules/inventory/privacy/supplier-profile-read.adapter';
import { CrmPersonalDataErasureAdapter } from '../modules/crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { MediaService } from '../modules/media/media.service';
import { MediaTitularErasureParticipant } from '../modules/media/privacy/media-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../modules/parties/privacy/party-titular-erasure.participant';
import { IContractImpersonationPort } from '../modules/privacy/ports/contract-impersonation.port';
import { IPersonalDataErasurePort } from '../modules/privacy/ports/personal-data-erasure.port';
import { IBillingStandingReadPort } from '../modules/privacy/requests/ports/billing-standing-read.port';
import { IContractStandingReadPort } from '../modules/privacy/requests/ports/contract-standing-read.port';
import { PrivacyRequestsService } from '../modules/privacy/requests/requests.service';
import { ExecutionOrderTitularErasureParticipant } from '../modules/tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../modules/tasks/privacy/operational-task-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../modules/users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../modules/wfm/privacy/wfm-titular-erasure.participant';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../packages/database/src/migrations/tenant/runner';

const databaseName = (process.env['DB_NAME'] ?? '').trim();
const databaseHost = process.env['DB_HOST']?.trim() || undefined;
const k2Enabled = resolveK2ReencryptIntegrationEnabled({
  optIn: process.env['IWANA_K2_REENCRYPT_INTEGRATION'],
  databaseName,
  databaseHost,
  ciRunner: process.env['GITHUB_ACTIONS'] === 'true',
});
const describeWithDb = k2Enabled ? describe : describe.skip;
const schemaName = `tenant_k2_reencrypt_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const actorId = randomUUID();
const mfaKey = parseEncryptionKeyHex('0123456789abcdef'.repeat(4));
const mfaPreviousKey = parseEncryptionKeyHex('fedcba9876543210'.repeat(4));
const piiKey = parseEncryptionKeyHex('89abcdef01234567'.repeat(4));
const piiPreviousKey = parseEncryptionKeyHex('76543210fedcba98'.repeat(4));
const hashKey = parseEncryptionKeyHex('abcdef0123456789'.repeat(4));
const sourceKeys = [mfaKey, mfaPreviousKey];

function encryptLegacy(value: string, key: Buffer = mfaKey): string {
  return encryptAes256Gcm(value, key);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

type ErasureTenant = { id: string; schema: string };

type ErasureScenario = {
  /** Clave con la que la API cifra antes de K2. */
  writerKey: Buffer;
  /** `null` reproduce el modo sin `PII_ENCRYPTION_KEY`: la API cifra con la clave MFA. */
  configuredPiiKey: Buffer | null;
  keys: MfaToPiiKeys;
};

/** Ids fijos: el orden del recorrido deja un vivo antes y otro después de los suprimidos. */
const erasureIds = {
  liveLow: '00000000-0000-4000-8000-000000000001',
  natural: '50000000-0000-4000-8000-000000000002',
  juridica: '60000000-0000-4000-8000-000000000003',
  liveHigh: 'f0000000-0000-4000-8000-000000000004',
  partyNatural: '10000000-0000-4000-8000-000000000005',
  partyJuridica: '20000000-0000-4000-8000-000000000006',
  expediente: '30000000-0000-4000-8000-000000000007',
  contract: '40000000-0000-4000-8000-000000000008',
  billingPeriod: '70000000-0000-4000-8000-000000000009',
  billingDocument: '80000000-0000-4000-8000-00000000000a',
} as const;
const naturalDocument = '90000123';
const juridicaDocument = '900000123';
const TITULAR_GUARD_FUNCTION = 'titular_prevent_anonymized_mutation';

class ScopedTenantDbPort implements PiiReencryptDbPort {
  constructor(
    private readonly delegate: TypeOrmReencryptDbAdapter,
    private readonly schema: string,
  ) {}

  async listActiveTenantSchemas(): Promise<string[]> {
    throw new Error(
      'La integración debe resolver el schema por el lookup elegible de control-plane.',
    );
  }

  tableExists(schemaName: string, table: string): Promise<boolean> {
    return this.delegate.tableExists(schemaName, table);
  }

  fetchEncryptedBatch(
    schemaName: string,
    target: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ) {
    return this.delegate.fetchEncryptedBatch(schemaName, target, offset, limit);
  }

  updateEncryptedValue(
    schemaName: string,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<void> {
    return this.delegate.updateEncryptedValue(schemaName, target, id, newCiphertext);
  }

  probeEncryptedWrite(
    schemaName: string,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<string | null> {
    return this.delegate.probeEncryptedWrite(schemaName, target, id, newCiphertext);
  }
}

describeWithDb('CLI reencrypt-aes PII — PostgreSQL real, esquema tenant migrado', () => {
  let dataSource: DataSource;
  let db: ScopedTenantDbPort;
  let eligibleTenantSchemas: string[];
  const erasureTenants: ErasureTenant[] = [];
  const subscriberOne = randomUUID();
  const subscriberTwo = randomUUID();
  const contractId = randomUUID();
  const billingPeriodId = randomUUID();
  const billingDocumentId = randomUUID();
  const expedienteId = randomUUID();
  const mfaObjectiveId = randomUUID();
  const mfaEmailCiphertext = encryptLegacy('synthetic-mfa-email');
  const mfaObjectiveCiphertext = encryptLegacy('synthetic-mfa-objective');
  // `subscribers.phone_encrypted` es varchar(100): admite hasta 21 bytes de texto claro.
  const synthetic = {
    subscriberDocument: 'synthetic-subscriber-document',
    subscriberEmail: 'synthetic-subscriber-email',
    subscriberPhone: 'synthetic-phone',
    subscriberAltPhone: 'synthetic-alt-phone',
    subscriberWhatsapp: 'synthetic-subscriber-whatsapp',
    subscriberEmailTwo: 'synthetic-subscriber-email-two',
    expedienteDocument: 'synthetic-expediente-document',
    expedientePrimaryPhone: 'synthetic-expediente-primary-phone',
    expedienteSecondaryPhone: 'synthetic-expediente-secondary-phone',
    expedienteEmail: 'synthetic-expediente-email',
    expedienteAltPhone: 'synthetic-expediente-alt-phone',
    expedienteSitePhone: 'synthetic-expediente-site-phone',
    expedienteFiscalDocument: 'synthetic-expediente-fiscal',
    contractFiscalDocument: 'synthetic-contract-fiscal',
    lifecycleNote: 'synthetic-lifecycle-note',
    partyDocument: 'synthetic-party-document',
    partyContact: 'synthetic-party-contact',
    requesterName: 'synthetic-requester-name',
    requesterDocument: 'synthetic-requester-document',
    requesterContact: 'synthetic-requester-contact',
    buyerDocument: 'synthetic-buyer-document',
  } as const;

  async function seedFixture(): Promise<void> {
    const q = quoteIdentifier(schemaName);
    const partyId = randomUUID();

    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
         created_by, email_encrypted, phone_encrypted, alt_contact_phone_encrypted,
         whatsapp_encrypted)
       VALUES
        ($1, $2, 'LEAD', 'NATURAL', 'RESIDENTIAL', 'CC', $3, 'Titular', 'Sintético', 3,
         'STANDARD', 'Dirección sintética', $4, $5, $6, $7, $8)`,
      [
        subscriberOne,
        tenantId,
        encryptLegacy(synthetic.subscriberDocument),
        actorId,
        encryptLegacy(synthetic.subscriberEmail, mfaPreviousKey),
        encryptLegacy(synthetic.subscriberPhone),
        encryptLegacy(synthetic.subscriberAltPhone),
        encryptLegacy(synthetic.subscriberWhatsapp),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, status, person_type, customer_segment, nit, business_name, vat_treatment,
         address, created_by, email_encrypted)
       VALUES
        ($1, $2, 'LEAD', 'JURIDICA', 'PYME', '900000000', 'Empresa sintética', 'STANDARD',
         'Dirección sintética', $3, $4)`,
      [subscriberTwo, tenantId, actorId, encryptLegacy(synthetic.subscriberEmailTwo)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records
        (id, tenant_id, full_name, created_by, document_number_encrypted,
         phone_primary_encrypted, phone_secondary_encrypted, email_primary_encrypted,
         alt_contact_phone_encrypted, site_contact_phone_encrypted, fiscal_document_encrypted)
       VALUES ($1, $2, 'Titular sintético', $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        expedienteId,
        tenantId,
        actorId,
        encryptLegacy(synthetic.expedienteDocument),
        encryptLegacy(synthetic.expedientePrimaryPhone),
        encryptLegacy(synthetic.expedienteSecondaryPhone),
        encryptLegacy(synthetic.expedienteEmail),
        encryptLegacy(synthetic.expedienteAltPhone),
        encryptLegacy(synthetic.expedienteSitePhone),
        encryptLegacy(synthetic.expedienteFiscalDocument),
      ],
    );
    // Contrato terminado y con la clave PII previa: es la fila que retiene una rotación real.
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, status, terminated_at, plan_id, plan_snapshot_json,
         fiscal_document_encrypted)
       VALUES ($1, $2, $3, 'TERMINATED', now(), 'fixture-plan', '{}'::jsonb, $4)`,
      [
        contractId,
        tenantId,
        subscriberOne,
        encryptLegacy(synthetic.contractFiscalDocument, piiPreviousKey),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.billing_periods
        (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
         generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2026-11-01', '2026-11-30', '2026-11-01',
               '2026-11-01', '2026-11-14', '{}'::jsonb)`,
      [billingPeriodId, tenantId, contractId, subscriberOne],
    );
    await dataSource.query(
      `INSERT INTO ${q}.billing_documents
        (id, tenant_id, period_id, contract_id, subscriber_id, status, number, issue_date,
         due_date, subtotal, tax_total, total, buyer_snapshot, buyer_document_encrypted, created_by)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', 'DC-K2-001', '2026-11-01', '2026-11-14',
               10000, 1900, 11900, $6::jsonb, $7, $8)`,
      [
        billingDocumentId,
        tenantId,
        billingPeriodId,
        contractId,
        subscriberOne,
        JSON.stringify({ displayName: 'Titular sintético', documentType: 'CC' }),
        encryptLegacy(synthetic.buyerDocument, piiPreviousKey),
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.crm_lifecycle_changes
        (tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status, reason_code,
         source, batch_id, note_encrypted)
       VALUES ($1, 'SUBSCRIBER', $2, $2, 'ACTIVE', 'SUSPENDED', 'MORA', 'MANUAL', $3, $4)`,
      [tenantId, subscriberOne, randomUUID(), encryptLegacy(synthetic.lifecycleNote)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular sintético')`,
      [partyId, encryptLegacy(synthetic.partyDocument)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party_contact (party_id, type, value_encrypted)
       VALUES ($1, 'EMAIL', $2)`,
      [partyId, encryptLegacy(synthetic.partyContact)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.data_subject_requests
        (requester_kind, kind, "right", status, received_at, due_at, requester_name_encrypted,
         requester_document_encrypted, requester_contact_encrypted)
       VALUES ('TITULAR', 'CONSULTA', 'CONOCER', 'RADICADA', now(), CURRENT_DATE, $1, $2, $3)`,
      [
        encryptLegacy(synthetic.requesterName),
        encryptLegacy(synthetic.requesterDocument),
        encryptLegacy(synthetic.requesterContact),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.users (id, email, password_hash, role, tenant_id, email_hmac, mfa_secret)
       VALUES ($1, $2, 'synthetic-hash', 'ADMIN', $3, 'synthetic-hmac', $4)`,
      [mfaObjectiveId, mfaEmailCiphertext, tenantId, mfaObjectiveCiphertext],
    );
  }

  async function createErasureTenant(): Promise<ErasureTenant> {
    const tenant = {
      id: randomUUID(),
      schema: `tenant_k2_erasure_${randomBytes(5).toString('hex')}`,
    };
    erasureTenants.push(tenant);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'K2 borrado sintético', $2, $3, 'ACTIVE', 'k2-erasure@example.invalid')`,
      [tenant.id, `k2-erasure-${tenant.id.slice(0, 8)}`, tenant.schema],
    );
    await dataSource.query(`CREATE SCHEMA ${quoteIdentifier(tenant.schema)}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      tenant.schema,
      `k2-erasure-${tenant.id.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    return tenant;
  }

  async function seedLiveSubscriber(
    tenant: ErasureTenant,
    id: string,
    label: string,
    key: Buffer,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${quoteIdentifier(tenant.schema)}.subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
         created_by, email_encrypted)
       VALUES ($1, $2, 'LEAD', 'NATURAL', 'RESIDENTIAL', 'CC', $3, 'Vivo', 'Sintético', 3,
         'STANDARD', 'Dirección sintética', $4, $5)`,
      [
        id,
        tenant.id,
        encryptLegacy(`synthetic-doc-${label}`, key),
        actorId,
        encryptLegacy(`synthetic-email-${label}`, key),
      ],
    );
  }

  /** Llena toda celda cifrada del titular: un objetivo vacío probaría el NULL sin borrar nada. */
  async function seedErasureFixture(tenant: ErasureTenant, key: Buffer): Promise<void> {
    const q = quoteIdentifier(tenant.schema);
    await seedLiveSubscriber(tenant, erasureIds.liveLow, 'low', key);
    await seedLiveSubscriber(tenant, erasureIds.liveHigh, 'high', key);
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records
        (id, tenant_id, full_name, document_type, document_number_encrypted, document_number_hmac,
         phone_primary_encrypted, phone_secondary_encrypted, email_primary_encrypted,
         alt_contact_phone_encrypted, site_contact_phone_encrypted, fiscal_document_encrypted,
         created_by)
       VALUES ($1, $2, 'Prospecto ficticio', 'CC', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        erasureIds.expediente,
        tenant.id,
        encryptLegacy('synthetic-exp-document', key),
        hmacPii(normalizeDocumentNumber(DocumentTypeParty.CC, naturalDocument), hashKey),
        encryptLegacy('synthetic-exp-primary', key),
        encryptLegacy('synthetic-exp-secondary', key),
        encryptLegacy('synthetic-exp-email', key),
        encryptLegacy('synthetic-exp-alt', key),
        encryptLegacy('synthetic-exp-site', key),
        encryptLegacy('synthetic-exp-fiscal', key),
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular ficticio')`,
      [erasureIds.partyNatural, encryptLegacy('synthetic-party-document', key)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party_contact (party_id, type, value_encrypted) VALUES ($1, 'EMAIL', $2)`,
      [erasureIds.partyNatural, encryptLegacy('synthetic-party-contact', key)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, party_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, email_encrypted,
         phone_encrypted, alt_contact_phone_encrypted, whatsapp_encrypted, vat_treatment,
         tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4, 'Nombre ficticio',
         'Apellido ficticio', 2, $5, $6, $7, $8, 'STANDARD', 'COMMON', 'RESPONSABLE',
         'Dirección ficticia', $9)`,
      [
        erasureIds.natural,
        tenant.id,
        erasureIds.partyNatural,
        encryptLegacy('synthetic-subscriber-doc', key),
        encryptLegacy('synthetic-subscriber-email', key),
        encryptLegacy('synthetic-phone', key),
        encryptLegacy('synthetic-alt-phone', key),
        encryptLegacy('synthetic-whatsapp', key),
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, fiscal_document_encrypted)
       VALUES ($1, $2, $3, 'synthetic-plan', '{}'::jsonb, $4)`,
      [
        erasureIds.contract,
        tenant.id,
        erasureIds.natural,
        encryptLegacy('synthetic-contract-fiscal', key),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.billing_periods
        (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
         generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2026-11-01', '2026-11-30', '2026-11-01',
               '2026-11-01', '2026-11-14', '{}'::jsonb)`,
      [erasureIds.billingPeriod, tenant.id, erasureIds.contract, erasureIds.natural],
    );
    await dataSource.query(
      `INSERT INTO ${q}.billing_documents
        (id, tenant_id, period_id, contract_id, subscriber_id, status, number, issue_date,
         due_date, subtotal, tax_total, total, buyer_snapshot, buyer_document_encrypted, created_by)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', 'DC-K2-ERASURE', '2026-11-01', '2026-11-14',
               10000, 1900, 11900, $6::jsonb, $7, $8)`,
      [
        erasureIds.billingDocument,
        tenant.id,
        erasureIds.billingPeriod,
        erasureIds.contract,
        erasureIds.natural,
        JSON.stringify({ displayName: 'Titular ficticio', documentType: 'CC' }),
        encryptLegacy('synthetic-buyer-document', key),
        actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.crm_lifecycle_changes
        (tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status, reason_code,
         source, batch_id, note_encrypted)
       VALUES ($1, 'SUBSCRIBER', $2, $2, 'ACTIVE', 'SUSPENDED', 'MORA', 'MANUAL', $3, $4)`,
      [tenant.id, erasureIds.natural, randomUUID(), encryptLegacy('synthetic-note', key)],
    );
    // Jurídico sin documento: el borrado anterior también le escribía la marca (spec §2, R5).
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'ORGANIZATION', 'NIT', $2, 'Empresa ficticia')`,
      [erasureIds.partyJuridica, encryptLegacy('synthetic-party-nit', key)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, party_id, person_type, customer_segment, nit, business_name,
         vat_treatment, address, created_by)
       VALUES ($1, $2, $3, 'JURIDICA', 'PYME', $4, 'Empresa ficticia', 'STANDARD',
         'Dirección ficticia', $5)`,
      [erasureIds.juridica, tenant.id, erasureIds.partyJuridica, juridicaDocument, actorId],
    );
  }

  /** Mismo armado que la API: servicio, adaptador y sus ocho participantes reales. */
  async function createErasureService(scenario: ErasureScenario): Promise<PrivacyRequestsService> {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY') return mfaKey.toString('hex');
        if (key === 'PII_HASH_KEY') return hashKey.toString('hex');
        throw new Error('Clave sintética no configurada.');
      },
      get: (key: string) =>
        key === 'PII_ENCRYPTION_KEY' ? scenario.configuredPiiKey?.toString('hex') : undefined,
    } as unknown as ConfigService;
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ConfigService, useValue: config },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logWithin: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: IContractImpersonationPort, useValue: { suspendForImpersonation: jest.fn() } },
        {
          provide: IContractStandingReadPort,
          useValue: {
            standing: jest.fn().mockResolvedValue({
              subscriberIds: [],
              openContractIds: [],
              lastTerminatedAt: null,
            }),
          },
        },
        { provide: MediaService, useValue: { findOne: jest.fn() } },
        {
          provide: EffectivePermissionsService,
          useValue: {
            getEffectivePermissionsForUser: jest
              .fn()
              .mockResolvedValue([
                AccessPermissionKey.PRIVACY_READ,
                AccessPermissionKey.PRIVACY_MANAGE,
              ]),
          },
        },
        CrmTitularErasureParticipant,
        PartyTitularErasureParticipant,
        UserAccountErasureParticipant,
        WfmTitularErasureParticipant,
        ExecutionOrderTitularErasureParticipant,
        OperationalTaskTitularErasureParticipant,
        MediaTitularErasureParticipant,
        BillingTitularErasureParticipant,
        BillingStandingReadAdapter,
        { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
        AssuranceTitularErasureParticipant,
        NetworkTitularErasureParticipant,
        SupplierProfileReadAdapter,
        CrmPersonalDataErasureAdapter,
        { provide: IPersonalDataErasurePort, useExisting: CrmPersonalDataErasureAdapter },
        {
          provide: PrivacyRequestsService,
          inject: [
            getDataSourceToken(),
            ConfigService,
            AuditService,
            IContractImpersonationPort,
            IContractStandingReadPort,
            MediaService,
            EffectivePermissionsService,
            IPersonalDataErasurePort,
            IBillingStandingReadPort,
          ],
          useFactory: (...deps: ConstructorParameters<typeof PrivacyRequestsService>) =>
            new PrivacyRequestsService(...deps),
        },
      ],
    }).compile();
    return moduleRef.get(PrivacyRequestsService);
  }

  async function suppressTitular(
    service: PrivacyRequestsService,
    tenant: ErasureTenant,
    partyId: string,
    requesterDocumentType: DocumentTypeParty,
    requesterDocument: string,
  ): Promise<void> {
    const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
      TenantContext.run(
        { tenantId: tenant.id, schemaName: tenant.schema, tenantSlug: 'k2-erasure' },
        operation,
      );
    const created = await inTenant(() =>
      service.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          partyId,
          requesterKind: 'TITULAR',
          requesterName: 'Titular ficticio de integración',
          requesterDocumentType,
          requesterDocument,
          requesterContact: 'titular@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        },
        actorId,
      ),
    );
    await inTenant(() => service.transition(created.request.id, 'complete', {}, actorId));
    const preview = await inTenant(() => service.erasurePreview(created.request.id));
    expect(preview.blockers).toEqual([]);
    await inTenant(() =>
      service.transition(
        created.request.id,
        'resolve',
        {
          responseText: 'Supresión aplicada en la integración.',
          responseChannel: 'EMAIL',
          erasure: { confirm: true, expedienteIds: preview.candidateExpedienteIds },
        },
        actorId,
      ),
    );
  }

  /** Tablas que protege la 169, leídas del catálogo y no de una lista copiada. */
  async function tablesGuardedBy169(schema: string): Promise<string[]> {
    const rows = (await dataSource.query(
      `SELECT DISTINCT c.relname AS table_name
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = $1 AND p.proname = $2 AND NOT t.tgisinternal AND t.tgenabled <> 'D'
        ORDER BY 1`,
      [schema, TITULAR_GUARD_FUNCTION],
    )) as Array<{ table_name: string }>;
    return rows.map((row) => row.table_name);
  }

  /** Celdas con valor de cada objetivo K2 en tablas de la 169, solo en filas del titular. */
  async function titularCellsByTarget(schema: string): Promise<Record<string, number>> {
    const titularRows: Record<string, string[]> = {
      subscribers: [erasureIds.natural],
      expediente_records: [erasureIds.expediente],
      contracts: [erasureIds.contract],
    };
    const guarded = await tablesGuardedBy169(schema);
    const cells: Record<string, number> = {};
    for (const target of PII_ENCRYPTED_TARGETS.filter(({ table }) => guarded.includes(table))) {
      const [row] = (await dataSource.query(
        `SELECT COUNT(${quoteIdentifier(target.column)})::int AS filled
           FROM ${quoteIdentifier(schema)}.${quoteIdentifier(target.table)}
          WHERE id = ANY($1::uuid[])`,
        [titularRows[target.table]],
      )) as Array<{ filled: number }>;
      cells[`${target.table}.${target.column}`] = row?.filled ?? 0;
    }
    return cells;
  }

  async function expectErasedTenantReencrypts(scenario: ErasureScenario): Promise<void> {
    const tenant = await createErasureTenant();
    const q = quoteIdentifier(tenant.schema);
    await seedErasureFixture(tenant, scenario.writerKey);

    const cellsBefore = await titularCellsByTarget(tenant.schema);
    expect(await tablesGuardedBy169(tenant.schema)).toEqual([
      'contracts',
      'expediente_records',
      'subscribers',
    ]);
    expect(Object.keys(cellsBefore).length).toBeGreaterThan(0);
    expect(Object.entries(cellsBefore).filter(([, filled]) => filled === 0)).toEqual([]);

    const service = await createErasureService(scenario);
    await suppressTitular(
      service,
      tenant,
      erasureIds.partyNatural,
      DocumentTypeParty.CC,
      naturalDocument,
    );
    await suppressTitular(
      service,
      tenant,
      erasureIds.partyJuridica,
      DocumentTypeParty.NIT,
      juridicaDocument,
    );

    const anonymized = (await dataSource.query(
      `SELECT id::text, document_number_encrypted, email_encrypted, phone_encrypted,
              alt_contact_phone_encrypted, whatsapp_encrypted
         FROM ${q}.subscribers WHERE anonymized_at IS NOT NULL ORDER BY id`,
    )) as Array<Record<string, string | null>>;
    expect(anonymized.map((row) => row['id'])).toEqual([erasureIds.natural, erasureIds.juridica]);
    // CA-K2A-02: recorre el inventario; el jurídico tampoco conserva ningún cifrado.
    for (const target of PII_ENCRYPTED_TARGETS.filter(({ table }) => table === 'subscribers')) {
      expect(anonymized.map((row) => row[target.column])).toEqual([null, null]);
    }
    const cellsAfter = await titularCellsByTarget(tenant.schema);
    expect(Object.keys(cellsAfter).sort()).toEqual(Object.keys(cellsBefore).sort());
    expect(Object.entries(cellsAfter).filter(([, filled]) => filled !== 0)).toEqual([]);
    expect(
      await dataSource.query(
        `SELECT buyer_document_encrypted FROM ${q}.billing_documents WHERE id = $1`,
        [erasureIds.billingDocument],
      ),
    ).toEqual([{ buyer_document_encrypted: null }]);

    const eligible = await listEligiblePiiTenantSchemas(
      (query, parameters) => dataSource.query(query, parameters),
      tenant.schema,
    );
    const options = {
      schemaFilter: tenant.schema,
      eligibleTenantSchemas: eligible,
      pageSize: 1,
      keys: scenario.keys,
    };

    // CA-K2A-03: vivos (4), marcas de Party (2) y solicitudes como prueba (6).
    const dryRun = await runMfaToPii(db, { ...options, mode: 'dry-run' });
    expect(dryRun.hasBlockingIssues).toBe(false);
    expect(dryRun.totals.writeBlocked).toBe(0);
    expect(dryRun.totals.reencrypted).toBe(12);
    expect(dryRun.totals.decryptErrors).toBe(0);
    expect(dryRun.totals.nonCiphertext).toBe(0);

    const apply = await runMfaToPii(db, { ...options, mode: 'apply' });
    expect(apply.hasBlockingIssues).toBe(false);
    expect(apply.totals.reencrypted).toBe(12);

    const verification = await runMfaToPii(db, { ...options, mode: 'verify-pii-only' });
    expect(verification.hasBlockingIssues).toBe(false);
    expect(verification.totals.pending).toBe(0);
    expect(verification.totals.mfaOnlyRemaining).toBe(0);
    expect(verification.totals.piiPreviousRemaining).toBe(0);
    expect(verification.totals.skippedAlreadyPii).toBe(12);

    const [liveHigh] = (await dataSource.query(
      `SELECT document_number_encrypted FROM ${q}.subscribers WHERE id = $1`,
      [erasureIds.liveHigh],
    )) as Array<{ document_number_encrypted: string }>;
    expect(decryptAes256Gcm(liveHigh?.document_number_encrypted ?? '', piiKey, null)).toBe(
      'synthetic-doc-high',
    );

    // CA-K2A-04: la protección sigue viva tras K2, sin GUC, en las tres tablas de la 169.
    const blocked = { driverError: expect.objectContaining({ code: '55000' }) };
    const guardedRows: Array<[string, string]> = [
      ['subscribers', erasureIds.natural],
      ['expediente_records', erasureIds.expediente],
      ['contracts', erasureIds.contract],
    ];
    // La función del trigger resuelve `subscribers` por search_path, como en la API.
    const inTenantSchema = (sql: string, id: string) =>
      runInTenantSchema(dataSource, tenant.schema, (qr) => qr.query(sql, [id]));
    for (const [table, id] of guardedRows) {
      const quotedTable = quoteIdentifier(table);
      await expect(
        inTenantSchema(`UPDATE ${quotedTable} SET updated_at = now() WHERE id = $1`, id),
      ).rejects.toMatchObject(blocked);
      await expect(
        inTenantSchema(`DELETE FROM ${quotedTable} WHERE id = $1`, id),
      ).rejects.toMatchObject(blocked);
    }
    const [guard] = (await dataSource.query(
      `SELECT pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1 AND p.proname = $2`,
      [tenant.schema, TITULAR_GUARD_FUNCTION],
    )) as Array<{ definition: string }>;
    const settings = [...(guard?.definition ?? '').matchAll(/current_setting\('([^']+)'/gu)];
    expect(settings.map((match) => match[1])).toEqual(['iwana.titular_erasure']);
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: databaseHost ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'INACTIVE', $5)`,
      [
        tenantId,
        'K2 sintético',
        `k2-${tenantId.slice(0, 8)}`,
        schemaName,
        'k2-reencrypt@example.invalid',
      ],
    );
    // Cadena real: columnas, restricciones y triggers que un DDL a mano no reproduce.
    await dataSource.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `k2-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await seedFixture();

    for (const status of ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'MARKED_FOR_DELETION']) {
      await dataSource.query('UPDATE public.tenants SET status = $1 WHERE schema_name = $2', [
        status,
        schemaName,
      ]);
      const result = await listEligiblePiiTenantSchemas(
        (query, parameters) => dataSource.query(query, parameters),
        schemaName,
      );
      expect(result).toEqual([schemaName]);
    }
    await dataSource.query('UPDATE public.tenants SET status = $1 WHERE schema_name = $2', [
      'INACTIVE',
      schemaName,
    ]);
    eligibleTenantSchemas = await listEligiblePiiTenantSchemas(
      (query, parameters) => dataSource.query(query, parameters),
      schemaName,
    );
    expect(eligibleTenantSchemas).toEqual([schemaName]);
    await expect(
      listEligiblePiiTenantSchemas(
        (query, parameters) => dataSource.query(query, parameters),
        'tenant_k2_unregistered',
      ),
    ).rejects.toThrow('Schema tenant no registrado, sin namespace o no elegible para K2.');
    db = new ScopedTenantDbPort(new TypeOrmReencryptDbAdapter(dataSource), schemaName);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        for (const tenant of erasureTenants) {
          await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(tenant.schema)} CASCADE`);
          await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenant.id]);
        }
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('el inventario coincide con las columnas *_encrypted del esquema migrado', async () => {
    const rows = (await dataSource.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = $1 AND column_name LIKE '%\\_encrypted'`,
      [schemaName],
    )) as Array<{ table_name: string; column_name: string }>;
    const schemaColumns = rows.map((row) => `${row.table_name}.${row.column_name}`);
    const inventory = PII_ENCRYPTED_TARGETS.map(({ table, column }) => `${table}.${column}`);

    expect(schemaColumns.filter((column) => !inventory.includes(column))).toEqual([]);
    expect(
      inventory.filter(
        (column) => column.endsWith('_encrypted') && !schemaColumns.includes(column),
      ),
    ).toEqual([]);
  });

  it('dry-run cuenta sin escribir y recifra todos los objetivos PII, sin alterar MFA', async () => {
    const keys = {
      piiActiveKey: piiKey,
      piiPreviousKey,
      mfaKeys: sourceKeys,
    };
    const dryRun = await runMfaToPii(db, {
      mode: 'dry-run',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(dryRun.hasBlockingIssues).toBe(false);
    expect(dryRun.totals.reencrypted).toBe(21);
    expect(dryRun.totals.nonCiphertext).toBe(0);
    expect(
      dryRun.targets.filter((metric) => metric.candidates === 0).map((m) => m.entityType),
    ).toEqual([]);

    const legacyBeforeApply = await dataSource.query(
      `SELECT document_number_encrypted, email_encrypted FROM ${quoteIdentifier(schemaName)}.subscribers WHERE id = $1`,
      [subscriberOne],
    );
    expect(decryptAes256Gcm(legacyBeforeApply[0].email_encrypted, mfaPreviousKey, null)).toBe(
      synthetic.subscriberEmail,
    );

    const verificationBeforeApply = await runMfaToPii(db, {
      mode: 'verify-pii-only',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(verificationBeforeApply.totals.piiPreviousRemaining).toBe(2);
    expect(verificationBeforeApply.hasBlockingIssues).toBe(true);

    const apply = await runMfaToPii(db, {
      mode: 'apply',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(apply.hasBlockingIssues).toBe(false);
    expect(apply.totals.reencrypted).toBe(21);

    const repeated = await runMfaToPii(db, {
      mode: 'apply',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(repeated.hasBlockingIssues).toBe(false);
    expect(repeated.totals.reencrypted).toBe(0);

    const verification = await runMfaToPii(db, {
      mode: 'verify-pii-only',
      schemaFilter: schemaName,
      eligibleTenantSchemas,
      pageSize: 1,
      keys,
    });
    expect(verification.hasBlockingIssues).toBe(false);
    expect(verification.totals.mfaOnlyRemaining).toBe(0);
    expect(verification.totals.piiPreviousRemaining).toBe(0);

    const subscribers = (await dataSource.query(
      `SELECT id, document_number_encrypted, email_encrypted, phone_encrypted,
              alt_contact_phone_encrypted, whatsapp_encrypted
       FROM ${quoteIdentifier(schemaName)}.subscribers ORDER BY id`,
    )) as Array<Record<string, string | null>>;
    const migrated = subscribers.find((row) => row['id'] === subscriberOne);
    const paged = subscribers.find((row) => row['id'] === subscriberTwo);
    expect(migrated?.['document_number_encrypted']).toBeTruthy();
    expect(decryptAes256Gcm(migrated?.['document_number_encrypted'] ?? '', piiKey, null)).toBe(
      synthetic.subscriberDocument,
    );
    expect(decryptAes256Gcm(migrated?.['email_encrypted'] ?? '', piiKey, null)).toBe(
      synthetic.subscriberEmail,
    );
    expect(decryptAes256Gcm(paged?.['email_encrypted'] ?? '', piiKey, null)).toBe(
      synthetic.subscriberEmailTwo,
    );
    expect(migrated?.['phone_encrypted']).not.toBeNull();

    const nullSafe = await dataSource.query(
      `SELECT phone_encrypted FROM ${quoteIdentifier(schemaName)}.subscribers WHERE id = $1`,
      [subscriberTwo],
    );
    expect(nullSafe[0]?.phone_encrypted).toBeNull();

    const mfaObjective = await dataSource.query(
      `SELECT email, mfa_secret FROM ${quoteIdentifier(schemaName)}.users WHERE id = $1`,
      [mfaObjectiveId],
    );
    expect(mfaObjective[0]?.email).toBe(mfaEmailCiphertext);
    expect(decryptAes256Gcm(mfaObjective[0]?.email, mfaKey, null)).toBe('synthetic-mfa-email');
    expect(mfaObjective[0]?.mfa_secret).toBe(mfaObjectiveCiphertext);
    expect(decryptAes256Gcm(mfaObjective[0]?.mfa_secret, mfaKey, null)).toBe(
      'synthetic-mfa-objective',
    );

    const allPiiRows = await dataSource.query(`
      SELECT 'expediente' AS family, id, document_number_encrypted AS value FROM ${quoteIdentifier(schemaName)}.expediente_records
      UNION ALL SELECT 'expediente_fiscal', id, fiscal_document_encrypted FROM ${quoteIdentifier(schemaName)}.expediente_records
      UNION ALL SELECT 'contract_fiscal', id, fiscal_document_encrypted FROM ${quoteIdentifier(schemaName)}.contracts
      UNION ALL SELECT 'billing_buyer', id, buyer_document_encrypted FROM ${quoteIdentifier(schemaName)}.billing_documents
      UNION ALL SELECT 'lifecycle', id, note_encrypted FROM ${quoteIdentifier(schemaName)}.crm_lifecycle_changes
      UNION ALL SELECT 'party', id, document_number FROM ${quoteIdentifier(schemaName)}.party
      UNION ALL SELECT 'party_contact', id, value_encrypted FROM ${quoteIdentifier(schemaName)}.party_contact
      UNION ALL SELECT 'request', id, requester_name_encrypted FROM ${quoteIdentifier(schemaName)}.data_subject_requests
    `);
    expect(allPiiRows.length).toBeGreaterThan(0);
    expect(JSON.stringify(allPiiRows)).not.toContain('synthetic-');

    const [billingDocument] = (await dataSource.query(
      `SELECT buyer_snapshot, buyer_document_encrypted
         FROM ${quoteIdentifier(schemaName)}.billing_documents WHERE id = $1`,
      [billingDocumentId],
    )) as Array<{ buyer_snapshot: Record<string, unknown>; buyer_document_encrypted: string }>;
    expect(billingDocument?.buyer_snapshot).not.toHaveProperty('documentNumber');
    expect(decryptAes256Gcm(billingDocument?.buyer_document_encrypted ?? '', piiKey, null)).toBe(
      synthetic.buyerDocument,
    );
  });

  it('el documento fiscal se lee por la ruta de producción tras retirar las claves previas', async () => {
    const crypto = createFiscalDocumentCryptoFromKeys({
      activeEncryptionKey: piiKey,
      previousEncryptionKeys: null,
      hashKey,
    });
    const [contract] = (await dataSource.query(
      `SELECT fiscal_document_encrypted, status::text AS status, terminated_at
         FROM ${quoteIdentifier(schemaName)}.contracts WHERE id = $1`,
      [contractId],
    )) as Array<{
      fiscal_document_encrypted: string;
      status: string;
      terminated_at: Date | null;
    }>;
    const [expediente] = (await dataSource.query(
      `SELECT fiscal_document_encrypted
         FROM ${quoteIdentifier(schemaName)}.expediente_records WHERE id = $1`,
      [expedienteId],
    )) as Array<{ fiscal_document_encrypted: string }>;

    expect(crypto.decrypt(contract?.fiscal_document_encrypted ?? '')).toBe(
      synthetic.contractFiscalDocument,
    );
    expect(crypto.decrypt(expediente?.fiscal_document_encrypted ?? '')).toBe(
      synthetic.expedienteFiscalDocument,
    );
    expect(contract?.status).toBe('TERMINATED');
    expect(contract?.terminated_at).not.toBeNull();
  });

  // D-K2A-7, Prueba 1. Tenant propio por modo: el fixture de arriba no tiene titulares suprimidos.
  it('K2 recifra un tenant con un titular suprimido por el borrado real', async () => {
    await expectErasedTenantReencrypts({
      writerKey: piiPreviousKey,
      configuredPiiKey: piiPreviousKey,
      keys: { piiActiveKey: piiKey, piiPreviousKey, mfaKeys: sourceKeys },
    });
    await expectErasedTenantReencrypts({
      writerKey: mfaKey,
      configuredPiiKey: null,
      keys: { piiActiveKey: piiKey, piiPreviousKey: null, mfaKeys: sourceKeys },
    });
  });

  // Caso legado: filas suprimidas antes de la 176, con la marca cifrada que exigía
  // chk_subscriber_person_fields. El trigger de la 169 rechaza su UPDATE, así que K2 no la puede
  // recifrar: el dry-run lo delata y apply sigue abortando (D-K2A-9). Debe ir al final: la fila
  // no se puede retirar.
  it('el dry-run delata una marca cifrada anterior y apply aborta', async () => {
    const q = quoteIdentifier(schemaName);
    const keys = { piiActiveKey: piiKey, piiPreviousKey, mfaKeys: sourceKeys };
    const options = { schemaFilter: schemaName, eligibleTenantSchemas, pageSize: 1, keys };
    const anonymizedId = randomUUID();
    const legacyMarker = encryptLegacy('ANONIMIZADO', piiPreviousKey);
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, address,
         created_by, anonymized_at, anonymized_request_id)
       VALUES
        ($1, $2, 'CANCELLED', 'NATURAL', 'RESIDENTIAL', 'CC', $3, 'ANONIMIZADO', 'ANONIMIZADO', 1,
         'STANDARD', 'ANONIMIZADO', $4, now(), $5)`,
      [anonymizedId, tenantId, legacyMarker, actorId, randomUUID()],
    );
    // El borrado deja NULL el documento fiscal del contrato: esta fila no se recifra ni bloquea.
    await dataSource.query(
      `INSERT INTO ${q}.contracts (tenant_id, subscriber_id, plan_id, plan_snapshot_json)
       VALUES ($1, $2, 'fixture-plan', '{}'::jsonb)`,
      [tenantId, anonymizedId],
    );
    const readRow = () =>
      dataSource.query(
        `SELECT document_number_encrypted, updated_at FROM ${q}.subscribers WHERE id = $1`,
        [anonymizedId],
      );
    const rowBefore = (await readRow()) as Array<{ document_number_encrypted: string }>;
    expect(rowBefore[0]?.document_number_encrypted).toBe(legacyMarker);

    const dryRun = await runMfaToPii(db, { ...options, mode: 'dry-run' });
    expect(dryRun.totals.writeBlocked).toBe(1);
    expect(dryRun.totals.reencrypted).toBe(0);
    expect(dryRun.totals.pending).toBe(1);
    expect(dryRun.hasBlockingIssues).toBe(true);
    expect(
      dryRun.targets.find(({ entityType }) => entityType === 'subscriber.documentNumberEncrypted'),
    ).toMatchObject({ writeBlocked: 1, reencrypted: 0, writeBlockedBySqlState: { '55000': 1 } });
    const report = formatMfaToPiiReport(dryRun);
    expect(report).toContain('write_blocked=1');
    expect(report).toContain('write_blocked_55000=1');
    expect(report).toContain('blocking=yes');
    expect(report).not.toContain(anonymizedId);
    expect(report).not.toContain(legacyMarker);
    expect(await readRow()).toEqual(rowBefore);

    await expect(runMfaToPii(db, { ...options, mode: 'apply' })).rejects.toMatchObject({
      driverError: expect.objectContaining({ code: '55000' }),
    });
    expect(await readRow()).toEqual(rowBefore);

    const verification = await runMfaToPii(db, { ...options, mode: 'verify-pii-only' });
    expect(verification.totals.piiPreviousRemaining).toBe(1);
    expect(verification.hasBlockingIssues).toBe(true);
  });
});
