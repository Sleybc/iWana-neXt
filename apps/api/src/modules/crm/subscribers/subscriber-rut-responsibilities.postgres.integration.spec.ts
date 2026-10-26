import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { dataSourceOptions, isValidSchemaName, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  TaxRegime,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import { calculateNitVerificationDigit } from '../../../common/crypto/nit-verification-digit.adapter';
import { AuditService } from '../../audit/audit.service';
import { Party } from '../../parties/entities/party.entity';
import { PartyContact } from '../../parties/entities/party-contact.entity';
import { PartyRole } from '../../parties/entities/party-role.entity';
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberFiscalCompletenessService } from './subscriber-fiscal-completeness.service';
import { evaluateSubscriberFiscalCompleteness } from './subscriber-fiscal-completeness.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { FISCAL_INCOMPLETE_SQL } from './subscriber-queue-predicates';

const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = integrationEnabled && integrationTenantSlug ? describe : describe.skip;

if (integrationEnabled && !integrationTenantSlug) {
  console.warn(
    '[MOD05-RUT-integration] Suite omitida: defina E2E_TENANT_SLUG para seleccionar el tenant de pruebas.',
  );
}

interface FiscalSqlRow {
  id: string;
  person_type: PersonType;
  vat_responsibility: VatResponsibility;
  rut_responsibilities: string[];
  nit: string | null;
  nit_verification_digit: string | null;
  legal_representative_party_id: string | null;
  sql_incomplete: boolean;
  status: SubscriberStatus;
}

describeWithDb('MOD05 RUT condicional — PostgreSQL real', () => {
  const tenantContext = () => ({
    tenantId: resolvedTenantId,
    schemaName,
    tenantSlug: integrationTenantSlug!,
  });
  let resolvedTenantId: string;
  let schemaName: string;
  let dataSource: DataSource;
  let testPartyId: string;
  const seededSubscriberIds: string[] = [];
  const actorId = randomUUID();
  const nit = '900111222';
  const nitVerificationDigit = calculateNitVerificationDigit(nit);

  function buildSubscriber(
    personType: PersonType,
    vatResponsibility: VatResponsibility,
    rutResponsibilities: string[],
  ): Subscriber {
    const id = randomUUID();
    const juridica = personType === PersonType.JURIDICA;
    return Object.assign(new Subscriber(), {
      id,
      tenantId: resolvedTenantId,
      userId: null,
      partyId: null,
      personType,
      customerSegment: juridica ? CustomerSegment.CORPORATE : CustomerSegment.RESIDENTIAL,
      documentType: juridica ? null : DocumentType.CC,
      documentNumberEncrypted: juridica ? null : `MOD05-RUT-DOC-${id}`,
      documentNumberHash: null,
      emailHash: null,
      phoneHash: null,
      firstName: juridica ? null : 'Persona sintética',
      lastName: juridica ? null : 'Integración RUT',
      stratum: juridica ? null : 3,
      birthDate: null,
      nit: juridica ? nit : null,
      nitVerificationDigit: juridica ? nitVerificationDigit : null,
      businessName: juridica ? `Empresa sintética ${id.slice(0, 8)}` : null,
      commercialName: null,
      legalRepresentativeId: null,
      legalRepresentativePartyId: juridica ? testPartyId : null,
      legalRepresentativeDisplayName: null,
      emailEncrypted: 'synthetic-email-cipher',
      phoneEncrypted: 'synthetic-phone-cipher',
      altContactName: null,
      altContactPhoneEncrypted: null,
      whatsapp: null,
      whatsappEncrypted: null,
      whatsappHmac: null,
      vatTreatment: juridica ? VatTreatment.STANDARD : VatTreatment.EXCLUDED,
      vatResponsibility,
      rutResponsibilities,
      taxRegime: juridica ? TaxRegime.COMMON : TaxRegime.SIMPLIFIED,
      address: 'Dirección sintética de prueba',
      neighborhood: null,
      city: null,
      department: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      coverageNodeId: null,
      expedienteId: null,
      convertedAt: null,
      anonymizedAt: null,
      anonymizedRequestId: null,
      activatedAt: null,
      manualOverrideReason: null,
      status: SubscriberStatus.PROSPECT,
      externalId: `MOD05-RUT-${id}`,
      createdBy: actorId,
    });
  }

  async function seedSubscriber(subscriber: Subscriber): Promise<void> {
    seededSubscriberIds.push(subscriber.id);
    await runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      queryRunner.manager.save(Subscriber, subscriber),
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Subscriber, Party, PartyContact, PartyRole],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 4, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const tenants = (await dataSource.query(
      `SELECT id::text AS id, schema_name
         FROM public.tenants
        WHERE slug = $1 AND status = $2
        LIMIT 1`,
      [integrationTenantSlug, 'ACTIVE'],
    )) as Array<{ id: string; schema_name: string }>;
    const tenant = tenants[0];
    if (!tenant) throw new Error('No existe el tenant ACTIVE indicado por E2E_TENANT_SLUG.');
    if (!isValidSchemaName(tenant.schema_name)) throw new Error('Tenant con schema inválido.');
    if (integrationTenantSlug === 'tenant_iwana' || tenant.schema_name === 'tenant_iwana') {
      throw new Error('La integración MOD05-RUT no puede usar tenant_iwana.');
    }

    resolvedTenantId = tenant.id;
    schemaName = tenant.schema_name;

    testPartyId = randomUUID();
    const syntheticPartyDocument = `M5R${randomUUID().replaceAll('-', '').slice(0, 28)}`;
    await runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      queryRunner.query(
        `INSERT INTO party (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', $2, 'Representante sintético MOD05')`,
        [testPartyId, syntheticPartyDocument],
      ),
    );
  }, 30_000);

  afterAll(async () => {
    try {
      if (dataSource?.isInitialized && schemaName && resolvedTenantId) {
        await runInTenantSchema(dataSource, schemaName, async (queryRunner) => {
          if (seededSubscriberIds.length > 0) {
            await queryRunner.query(
              'DELETE FROM subscribers WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
              [resolvedTenantId, seededSubscriberIds],
            );
          }
          if (testPartyId)
            await queryRunner.query('DELETE FROM party WHERE id = $1', [testPartyId]);
        });
      }
    } finally {
      if (dataSource?.isInitialized) await dataSource.destroy();
    }
  });

  it('activa a una persona natural no responsable con contacto y RUT vacío', async () => {
    const subscriber = buildSubscriber(PersonType.NATURAL, VatResponsibility.NO_RESPONSABLE, []);
    await seedSubscriber(subscriber);

    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const transitions = new SubscriberStatusTransitionService(
      dataSource,
      auditService,
      new SubscriberFiscalCompletenessService(),
    );
    const result = await TenantContext.run(tenantContext(), () =>
      transitions.transition(subscriber.id, SubscriberStatus.ACTIVE, null, actorId),
    );

    expect(result.toStatus).toBe(SubscriberStatus.ACTIVE);
    const persisted = (await runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      queryRunner.query('SELECT status::text AS status FROM subscribers WHERE id = $1', [
        subscriber.id,
      ]),
    )) as Array<{ status: SubscriberStatus }>;
    expect(persisted[0]?.status).toBe(SubscriberStatus.ACTIVE);
  });

  it('mantiene paridad PostgreSQL real entre FISCAL_INCOMPLETE_SQL y la función para ocho casos', async () => {
    const combinations = [
      { personType: PersonType.JURIDICA, vat: VatResponsibility.RESPONSABLE },
      { personType: PersonType.JURIDICA, vat: VatResponsibility.NO_RESPONSABLE },
      { personType: PersonType.NATURAL, vat: VatResponsibility.RESPONSABLE },
      { personType: PersonType.NATURAL, vat: VatResponsibility.NO_RESPONSABLE },
    ];
    const fixtures: Subscriber[] = [];
    for (const combination of combinations) {
      for (const responsibilities of [[], ['O-13']]) {
        fixtures.push(buildSubscriber(combination.personType, combination.vat, responsibilities));
      }
    }
    for (const fixture of fixtures) await seedSubscriber(fixture);

    const rows = (await runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      queryRunner.query(
        `SELECT s.id::text AS id,
                s.person_type::text AS person_type,
                s.vat_responsibility::text AS vat_responsibility,
                s.rut_responsibilities,
                s.nit,
                s.nit_verification_digit,
                s.legal_representative_party_id::text AS legal_representative_party_id,
                s.status::text AS status,
                ${FISCAL_INCOMPLETE_SQL} AS sql_incomplete
           FROM subscribers s
          WHERE s.tenant_id = $1 AND s.id = ANY($2::uuid[])`,
        [resolvedTenantId, fixtures.map(({ id }) => id)],
      ),
    )) as FiscalSqlRow[];
    expect(rows).toHaveLength(8);

    for (const row of rows) {
      const required =
        row.person_type === PersonType.JURIDICA ||
        row.vat_responsibility === VatResponsibility.RESPONSABLE;
      const completeness = evaluateSubscriberFiscalCompleteness({
        personType: row.person_type,
        vatResponsibility: row.vat_responsibility,
        rutResponsibilities: row.rut_responsibilities,
        nit: row.nit,
        nitVerificationDigit: row.nit_verification_digit,
        legalRepresentativePartyId: row.legal_representative_party_id,
      });
      expect(completeness.missing.includes('RUT_RESPONSIBILITIES')).toBe(
        required && row.rut_responsibilities.length === 0,
      );
      expect(row.sql_incomplete).toBe(!completeness.complete);
    }
  });
});
