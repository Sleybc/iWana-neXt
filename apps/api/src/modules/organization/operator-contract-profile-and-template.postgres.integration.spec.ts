import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { TenantContext, dataSourceOptions } from '@iwana/db';
import { LEGAL_APPROVAL_DECLARATION } from '@iwana/shared';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../packages/database/src/migrations/tenant/runner';
import { LegalTextEntity } from '../privacy/entities/legal-text.entity';
import { LegalTextsService } from '../privacy/legal-texts/legal-texts.service';
import { OperatorContractProfileService } from './operator-contract-profile.service';
import { OperatorIdentityReadPort } from './ports/operator-identity-read.port';

/**
 * Cierre de venta, bloques A0 y A, contra PostgreSQL real con la cadena tenant completa:
 * datos del operador (faltantes, guardado, aislamiento por tenant) y publicación de la
 * plantilla de contrato con y sin la declaración de aprobación jurídica.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('Datos del operador y plantilla de contrato (PostgreSQL real)', () => {
  const tenantId = randomUUID();
  const tenantSlug = `contract-tpl-${tenantId.slice(0, 8)}`;
  const schemaName = `tenant_contract_tpl_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const publisherId = randomUUID();
  const asTenant = <T>(operation: () => Promise<T>) =>
    TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);

  let dataSource: DataSource;
  let profiles: OperatorContractProfileService;
  let legalTexts: LegalTextsService;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [...((dataSourceOptions.entities ?? []) as never[]), LegalTextEntity] as never[],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 2, min: 0 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email, legal_name, nit)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7)`,
      [
        tenantId,
        'Contrato plantilla sintético',
        tenantSlug,
        schemaName,
        'contract-tpl@example.invalid',
        'Operador Sintético SAS',
        '900000001',
      ],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const migrations = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await migrations.initialize();
    try {
      await applyTenantMigrationsInOrder(migrations);
    } finally {
      await migrations.destroy();
    }

    const identity: OperatorIdentityReadPort = {
      getOperatorIdentity: async (id: string) => {
        const rows = (await dataSource.query(
          `SELECT legal_name AS "legalName", nit FROM public.tenants WHERE id = $1`,
          [id],
        )) as Array<{ legalName: string | null; nit: string | null }>;
        return rows[0] ?? { legalName: null, nit: null };
      },
    };
    profiles = new OperatorContractProfileService(dataSource, audit as never, identity);
    legalTexts = new LegalTextsService(dataSource, audit as never);
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  }, 30_000);

  it('sin datos guardados lista los faltantes y toma razón social y NIT del tenant', async () => {
    const view = await asTenant(() => profiles.get());
    expect(view.profile.legalName).toBe('Operador Sintético SAS');
    expect(view.profile.nit).toBe('900000001');
    expect(view.missingFields).toEqual([
      'qualityAndCoverageUrl',
      'customerServiceChannels',
      'reconnectionFee',
      'annualIncreaseCapPercent',
      'equipmentIncidentReportChannel',
    ]);
  });

  it('guarda, relee los numéricos y deja de reportar faltantes; un segundo PUT actualiza', async () => {
    const input = {
      qualityAndCoverageUrl: 'https://operador.example/calidad',
      customerServiceChannels: [
        { kind: 'PHONE' as const, value: '6015550000', label: 'Línea gratuita' },
      ],
      reconnectionFee: 15000.5,
      annualIncreaseCapPercent: 5.25,
      equipmentIncidentReportChannel: 'Línea de soporte',
      otherConditions: null,
    };
    const created = await asTenant(() => profiles.update(input, { userId: publisherId }));
    expect(created.missingFields).toEqual([]);
    expect(created.profile).toMatchObject({
      reconnectionFee: 15000.5,
      annualIncreaseCapPercent: 5.25,
    });

    const updated = await asTenant(() =>
      profiles.update({ ...input, reconnectionFee: null }, { userId: publisherId }),
    );
    expect(updated.missingFields).toEqual(['reconnectionFee']);
    const rows = (await dataSource.query(
      `SELECT COUNT(*)::int AS total, MAX(updated_by::text) AS by
         FROM "${schemaName}".operator_contract_profile`,
    )) as Array<{ total: number; by: string }>;
    expect(rows[0]).toEqual({ total: 1, by: publisherId });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'operator_contract_profile', tenantId }),
    );

    const explicit = await profiles.getForTenant(tenantId, schemaName);
    expect(explicit.missingFields).toEqual(['reconnectionFee']);
  });

  it('rechaza publicar la plantilla sin la declaración y no deja fila', async () => {
    await expect(
      asTenant(() =>
        legalTexts.create(
          { type: 'CONTRATO_SERVICIO', version: '1.0', content: '<p>Contrato</p>', format: 'HTML' },
          { userId: publisherId },
        ),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(asTenant(() => legalTexts.getCurrent('CONTRATO_SERVICIO'))).resolves.toBeNull();
  });

  it('publica con la declaración y la persiste con quien publica y la fecha', async () => {
    const saved = await asTenant(() =>
      legalTexts.create(
        {
          type: 'CONTRATO_SERVICIO',
          version: '1.0',
          content: '<p>Contrato {{contratoNumero}}</p>',
          format: 'HTML',
          legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION,
        },
        { userId: publisherId },
      ),
    );
    expect(saved.legalApproval?.approvedByUserId).toBe(publisherId);

    const current = await asTenant(() => legalTexts.getCurrent('CONTRATO_SERVICIO'));
    expect(current).toMatchObject({
      version: '1.0',
      format: 'HTML',
      legalApproval: {
        declaration: LEGAL_APPROVAL_DECLARATION,
        approvedByUserId: publisherId,
      },
    });
    await expect(asTenant(() => legalTexts.current('CONTRATO_SERVICIO'))).resolves.toMatchObject({
      version: '1.0',
    });
  });

  it('la base de datos rechaza un contrato sin aprobación aunque se salte el servicio', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO "${schemaName}".legal_texts (type, version, sha256, content, published_at, format)
         VALUES ('CONTRATO_SERVICIO', '9.9', $1, 'x', now(), 'HTML')`,
        ['b'.repeat(64)],
      ),
    ).rejects.toMatchObject({ driverError: { constraint: 'ck_legal_texts_contract_approved' } });
  });
});
