import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  isValidSchemaName,
  resolveMigrationDbCredentials,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  TaxRegime,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import { encryptAes256Gcm, parseEncryptionKeyHex } from '../common/crypto/aes-gcm.util';
import { Subscriber } from '../modules/crm/subscribers/entities/subscriber.entity';
import { projectSubscriberForList } from '../modules/crm/subscribers/subscriber-projection';
import { SubscribersService } from '../modules/crm/subscribers/subscribers.service';
import type { VatTreatmentService } from '../modules/crm/subscribers/vat-treatment.service';
import type { SubscriberStatusTransitionService } from '../modules/crm/subscribers/subscriber-status-transition.service';
import type { AuditService } from '../modules/audit/audit.service';
import type { IPartyWritePort } from '../modules/parties/ports/party-write.port';
import type { PlanCatalogReadPort } from '../modules/commercial/ports/plan-catalog-read.port';
import type { IPrivacyMarksReadPort } from '../modules/privacy/ports/privacy-marks-read.port';
import {
  runSubscriberPhoneReadiness,
  type SubscriberPhoneReadinessReport,
} from './report-subscriber-phone-readiness';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const integrationTenantSlug = process.env['E2E_TENANT_SLUG'];
const describeWithDb = dbAvailable && integrationTenantSlug ? describe : describe.skip;

// Claves de laboratorio, iguales a las de las demás specs integradas de suscriptores.
const ENCRYPTION_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PII_HASH_KEY_HEX = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

// Valores sintéticos para Colombia (+57); ninguno pertenece a una persona real.
const SYNTHETIC = {
  normalizablePhone: '300 000 0001',
  notNormalizablePhone: '12',
  normalizableAltPhone: '(310) 000-0002',
  normalizableWhatsapp: '+57 320 000 0003',
  notNormalizableWhatsapp: 'sin-numero',
  anonymizedPhone: '3150000004',
  blockedPhone: '3160000005',
  otherTenantPhone: '3170000006',
};

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describeWithDb('Reporte de teléfonos de suscriptores — PostgreSQL real', () => {
  const schemaName = `tenant_phone_readiness_${randomBytes(5).toString('hex')}`;
  const encryptionKey = parseEncryptionKeyHex(ENCRYPTION_KEY_HEX);
  const blockedPartyId = randomUUID();
  let dataSource: DataSource;
  let tenantId: string;
  let tenantCountryCode: string | null;
  let subscribersService: SubscribersService;
  const seededIds: string[] = [];

  function buildSubscriber(
    phones: { phone?: string; altContactPhone?: string; whatsapp?: string },
    overrides: Partial<Subscriber> = {},
  ): Subscriber {
    const subscriber = new Subscriber();
    subscriber.id = randomUUID();
    subscriber.tenantId = tenantId;
    subscriber.userId = null;
    subscriber.partyId = null;
    subscriber.personType = PersonType.NATURAL;
    subscriber.customerSegment = CustomerSegment.RESIDENTIAL;
    subscriber.documentType = DocumentType.CC;
    subscriber.documentNumberEncrypted = encryptAes256Gcm(
      `9${randomBytes(4).readUInt32BE(0)}`,
      encryptionKey,
    );
    subscriber.documentNumberHash = null;
    subscriber.emailHash = null;
    subscriber.phoneHash = null;
    subscriber.firstName = 'Sintético';
    subscriber.lastName = 'Lectura';
    subscriber.stratum = 3;
    subscriber.birthDate = null;
    subscriber.nit = null;
    subscriber.nitVerificationDigit = null;
    subscriber.businessName = null;
    subscriber.commercialName = null;
    subscriber.legalRepresentativeId = null;
    subscriber.emailEncrypted = null;
    // Mismo cifrado que SubscribersService.create/update.
    subscriber.phoneEncrypted = phones.phone ? encryptAes256Gcm(phones.phone, encryptionKey) : null;
    subscriber.altContactName = null;
    subscriber.altContactPhoneEncrypted = phones.altContactPhone
      ? encryptAes256Gcm(phones.altContactPhone, encryptionKey)
      : null;
    subscriber.whatsapp = null;
    subscriber.whatsappEncrypted = phones.whatsapp
      ? encryptAes256Gcm(phones.whatsapp, encryptionKey)
      : null;
    subscriber.whatsappHmac = null;
    subscriber.vatTreatment = VatTreatment.EXCLUDED;
    subscriber.vatResponsibility = VatResponsibility.RESPONSABLE;
    subscriber.taxRegime = TaxRegime.SIMPLIFIED;
    subscriber.address = 'Dirección sintética';
    subscriber.neighborhood = null;
    subscriber.city = null;
    subscriber.department = null;
    subscriber.postalCode = null;
    subscriber.latitude = null;
    subscriber.longitude = null;
    subscriber.coverageNodeId = null;
    subscriber.expedienteId = null;
    subscriber.convertedAt = null;
    subscriber.activatedAt = null;
    subscriber.manualOverrideReason = null;
    subscriber.status = SubscriberStatus.ACTIVE;
    subscriber.externalId = null;
    subscriber.createdBy = '00000000-0000-4000-8000-0000000000f1';
    return Object.assign(subscriber, overrides);
  }

  async function countRows(): Promise<{ subscribers: number; contracts: number }> {
    const q = quoteIdentifier(schemaName);
    const rows = (await dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM ${q}.subscribers) AS subscribers,
         (SELECT COUNT(*)::int FROM ${q}.contracts) AS contracts`,
    )) as Array<{ subscribers: number; contracts: number }>;
    return rows[0]!;
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [Subscriber],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const tenants = (await dataSource.query(
      `SELECT id::text AS id, schema_name, country_code
         FROM public.tenants
        WHERE slug = $1 AND status = $2
        LIMIT 1`,
      [integrationTenantSlug, SubscriberStatus.ACTIVE],
    )) as Array<{ id: string; schema_name: string; country_code: string | null }>;
    const tenant = tenants[0];
    if (!tenant) throw new Error('No existe el tenant ACTIVE indicado por E2E_TENANT_SLUG.');
    if (!isValidSchemaName(tenant.schema_name)) throw new Error('Tenant con schema inválido.');
    tenantId = tenant.id;
    tenantCountryCode = tenant.country_code?.trim().toUpperCase() ?? null;

    // El DDL se copia del schema del tenant que el runner de migraciones dejó al día;
    // el schema del tenant no se toca.
    const source = quoteIdentifier(tenant.schema_name);
    const target = quoteIdentifier(schemaName);
    await dataSource.query(`CREATE SCHEMA ${target}`);
    await dataSource.query(
      `CREATE TABLE ${target}.subscribers (LIKE ${source}.subscribers INCLUDING ALL)`,
    );
    await dataSource.query(
      `CREATE TABLE ${target}.contracts (LIKE ${source}.contracts INCLUDING ALL)`,
    );

    subscribersService = new SubscribersService(
      dataSource,
      {
        getOrThrow: (key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY') return ENCRYPTION_KEY_HEX;
          if (key === 'PII_HASH_KEY') return PII_HASH_KEY_HEX;
          throw new Error(`Configuración no esperada: ${key}`);
        },
        get: () => undefined,
      } as unknown as ConfigService,
      {} as VatTreatmentService,
      {} as SubscriberStatusTransitionService,
      {} as AuditService,
      {} as IPartyWritePort,
      {
        getPlansByIds: jest.fn().mockResolvedValue(new Map()),
      } as unknown as PlanCatalogReadPort,
      undefined,
      undefined,
      undefined,
      {
        activeMarks: jest.fn(async (partyIds: string[]) =>
          Object.fromEntries(
            partyIds
              .filter((partyId) => partyId === blockedPartyId)
              .map((partyId) => [partyId, ['DATOS_BLOQUEADOS']]),
          ),
        ),
        partyIdsWithActiveMark: jest.fn().mockResolvedValue([blockedPartyId]),
      } as unknown as IPrivacyMarksReadPort,
    );

    const subscribers = [
      // Llamar y WhatsApp por phone (WhatsApp usa el fallback a phone).
      buildSubscriber({ phone: SYNTHETIC.normalizablePhone }),
      // Llamar cae a altContactPhone; WhatsApp sin candidato válido.
      buildSubscriber({
        phone: SYNTHETIC.notNormalizablePhone,
        altContactPhone: SYNTHETIC.normalizableAltPhone,
      }),
      // Solo WhatsApp.
      buildSubscriber({ whatsapp: SYNTHETIC.normalizableWhatsapp }),
      // WhatsApp poblado pero no normalizable.
      buildSubscriber({ whatsapp: SYNTHETIC.notNormalizableWhatsapp }),
      // Sin ningún teléfono.
      buildSubscriber({}),
      // Anonimizado: la proyección oculta sus teléfonos y no habilita acciones.
      buildSubscriber(
        { phone: SYNTHETIC.anonymizedPhone },
        { anonymizedAt: new Date('2026-01-01T00:00:00.000Z'), anonymizedRequestId: randomUUID() },
      ),
      // Con marca DATOS_BLOQUEADOS: la proyección lo restringe.
      buildSubscriber({ phone: SYNTHETIC.blockedPhone }, { partyId: blockedPartyId }),
    ];
    const otherTenant = buildSubscriber(
      { phone: SYNTHETIC.otherTenantPhone },
      { tenantId: randomUUID() },
    );
    seededIds.push(...subscribers.map((subscriber) => subscriber.id), otherTenant.id);

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.manager.save(Subscriber, [...subscribers, otherTenant]);
    });
  }, 60_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    } finally {
      await dataSource.destroy();
    }
  });

  it('mide teléfonos descifrados y acciones con fallback sin escribir ni exponer datos', async () => {
    if (tenantCountryCode !== 'CO') {
      throw new Error('La spec asume el tenant de integración con country_code CO (prefijo +57).');
    }

    const stored = (await dataSource.query(
      `SELECT phone_encrypted FROM ${quoteIdentifier(schemaName)}.subscribers
        WHERE phone_encrypted IS NOT NULL`,
    )) as Array<{ phone_encrypted: string }>;
    for (const row of stored) {
      // El texto cifrado no debe contener los dígitos en claro de ningún teléfono sembrado.
      for (const value of Object.values(SYNTHETIC)) {
        const digits = value.replace(/\D/gu, '');
        if (digits.length >= 7) expect(row.phone_encrypted).not.toContain(digits);
      }
    }

    const before = await countRows();
    const chunks: string[] = [];
    const close = jest.fn().mockResolvedValue(undefined);
    await runSubscriberPhoneReadiness({
      argv: [`--tenant=${integrationTenantSlug}`],
      env: process.env,
      write: (chunk) => chunks.push(chunk),
      createRuntime: async () => ({
        dataSource,
        subscribersService,
        tenantContext: TenantContext,
        isValidSchemaName,
        project: projectSubscriberForList,
        close,
      }),
      ephemeralTest: { schemaName },
    });
    const after = await countRows();
    const stdout = chunks.join('');
    const output = JSON.parse(stdout) as {
      readOnly: boolean;
      tenantCount: number;
      reports: SubscriberPhoneReadinessReport[];
    };

    expect(after).toEqual(before);
    expect(before).toEqual({ subscribers: 8, contracts: 0 });
    expect(close).toHaveBeenCalledTimes(1);
    expect(output.readOnly).toBe(true);
    expect(output.tenantCount).toBe(1);
    expect(output.reports[0]).toEqual({
      tenantId,
      tenantSlug: integrationTenantSlug,
      countryPrefixAvailable: true,
      // El suscriptor de otro tenant_id no entra.
      subscribersScanned: 7,
      fields: {
        // Anonimizado y bloqueado llegan sin teléfonos desde la proyección.
        phone: { populated: 2, normalizable: 1, notNormalizable: 1, normalizablePercent: 50 },
        altContactPhone: {
          populated: 1,
          normalizable: 1,
          notNormalizable: 0,
          normalizablePercent: 100,
        },
        whatsapp: { populated: 2, normalizable: 1, notNormalizable: 1, normalizablePercent: 50 },
      },
      actions: { callSubscribers: 2, whatsappSubscribers: 2 },
    });

    // Valores de menos de 7 caracteres (p. ej. «12») no son discriminantes frente a un UUID.
    for (const value of Object.values(SYNTHETIC)) {
      if (value.length >= 7) expect(stdout).not.toContain(value);
      const digits = value.replace(/\D/gu, '');
      if (digits.length >= 7) expect(stdout).not.toContain(digits);
    }
    for (const id of seededIds) expect(stdout).not.toContain(id);
    expect(stdout).not.toContain('Sintético');
    // Corrección transversal: los UUID aleatorios del reporte no son teléfonos;
    // retirarlos evita falsos positivos al buscar teléfonos expuestos.
    const outputWithoutUuids = stdout.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
      '',
    );
    expect(outputWithoutUuids).not.toMatch(/\d{7,}/u);
  });
});
