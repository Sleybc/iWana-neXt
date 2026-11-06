import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { BillingContractReadAdapter } from './billing-contract-read.adapter';

describe('BillingContractReadAdapter', () => {
  const key = Buffer.from(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'hex',
  );
  const context = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    schemaName: 'tenant_billing_test',
    tenantSlug: 'billing-test',
  };
  let dataSource: DataSource;
  let managerQuery: jest.Mock;
  let runnerQuery: jest.Mock;
  let adapter: BillingContractReadAdapter;
  let tenantSettingsReadPort: { getSnapshot: jest.Mock };

  beforeEach(() => {
    managerQuery = jest.fn();
    runnerQuery = jest.fn().mockResolvedValue(undefined);
    const manager = { query: managerQuery } as unknown as EntityManager;
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    dataSource = { createQueryRunner: jest.fn().mockReturnValue(runner) } as unknown as DataSource;
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
    const config = new ConfigService({
      PII_ENCRYPTION_KEY: key.toString('hex'),
      MFA_ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      PII_HASH_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    });
    tenantSettingsReadPort = {
      getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }),
    };
    adapter = new BillingContractReadAdapter(
      dataSource,
      config,
      tenantSettingsReadPort as unknown as SettingsPriorityTenantReadPort,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('proyecta contratos facturables sin pedir ni descifrar el documento en listados', async () => {
    managerQuery.mockResolvedValue([
      {
        contract_id: '00000000-0000-4000-8000-000000000010',
        subscriber_id: '00000000-0000-4000-8000-000000000011',
        party_id: null,
        status: 'SUSPENDED',
        status_reason_code: 'SUPLANTACION',
        terminated_at: null,
        cycle_day: 1,
        cutoff_day: 15,
        start_date: '2026-01-01',
        end_date: null,
        plan_name: 'Plan de prueba',
        monthly_price: '85000.00',
        vat_snapshot: null,
        unbilled_additional_count: 5,
        display_name: 'Titular sintético',
        document_type: 'CC',
        address: null,
        rut_responsibilities: [],
        anonymized_at: null,
        anonymized_request_id: null,
      },
    ]);

    const result = await adapter.findBillableForDate('2026-11-01', { limit: 250 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      activatedAt: '2026-01-01',
      status: 'SUSPENDED',
      statusReasonCode: 'SUPLANTACION',
      unbilledAdditionalCount: 5,
      buyer: { documentNumber: null, rutResponsibilities: ['R-99-PN'] },
    });
    // BR-4.4: el listado solo informa si hay documento (booleano); no proyecta su valor cifrado.
    expect(managerQuery.mock.calls[0]?.[0]).not.toMatch(/\bAS\s+document_number_encrypted\b/u);
    expect(managerQuery.mock.calls[0]?.[0]).not.toMatch(/\bAS\s+legacy_document_number\b/u);
    expect(managerQuery.mock.calls[0]?.[0]).toContain('AS has_document_number');
    expect(result[0]?.buyer.hasDocumentNumber).toBe(false);
    expect(result[0]?.buyer.revealDocumentNumber).toBeUndefined();
    expect(managerQuery.mock.calls[0]?.[0]).not.toContain("plan_snapshot_json->'additionalItems'");
    expect(managerQuery.mock.calls[0]?.[0]).toContain('additional_product_ids');
    expect(managerQuery.mock.calls[0]?.[0]).toContain('additional_service_ids');
    expect(managerQuery.mock.calls[0]?.[0]).toContain('AT TIME ZONE $5::text');
    expect(managerQuery.mock.calls[0]?.[1]?.[3]).toBe(200);
    expect(managerQuery.mock.calls[0]?.[1]?.[4]).toBe('America/Bogota');
    expect(managerQuery.mock.calls[0]?.[1]?.[5]).toBe(62);
  });

  it('descifra documento en findByContractId solo cuando se pide con revealDocument:true', async () => {
    managerQuery.mockResolvedValue([
      {
        contract_id: '00000000-0000-4000-8000-000000000010',
        subscriber_id: '00000000-0000-4000-8000-000000000011',
        party_id: '00000000-0000-4000-8000-000000000012',
        status: 'ACTIVE',
        status_reason_code: null,
        terminated_at: null,
        cycle_day: 1,
        cutoff_day: 15,
        start_date: '2026-01-01',
        end_date: null,
        plan_name: 'Plan de prueba',
        monthly_price: '85000.00',
        vat_snapshot: null,
        unbilled_additional_count: 0,
        display_name: 'Titular sintético',
        document_type: 'CC',
        address: null,
        rut_responsibilities: ['O-13'],
        document_number_encrypted: encryptAes256Gcm('SYNTHETIC-DOCUMENT', key),
        legacy_document_number: null,
        anonymized_at: null,
        anonymized_request_id: null,
      },
    ]);

    const result = await adapter.findByContractId('00000000-0000-4000-8000-000000000010', {
      revealDocument: true,
    });

    expect(result?.buyer.documentNumber).toBe('SYNTHETIC-DOCUMENT');
    expect(managerQuery.mock.calls[0]?.[0]).toContain('fiscal_document_encrypted');
  });

  it('BR-9.2 por defecto no descifra: el documento solo se revela bajo demanda', async () => {
    managerQuery.mockResolvedValue([
      {
        contract_id: '00000000-0000-4000-8000-000000000010',
        subscriber_id: '00000000-0000-4000-8000-000000000011',
        party_id: null,
        status: 'ACTIVE',
        status_reason_code: null,
        terminated_at: null,
        cycle_day: 1,
        cutoff_day: 15,
        start_date: '2026-01-01',
        end_date: null,
        plan_name: 'Plan de prueba',
        monthly_price: '85000.00',
        vat_snapshot: null,
        unbilled_additional_count: 0,
        display_name: 'Titular sintético',
        document_type: 'CC',
        address: null,
        rut_responsibilities: [],
        has_document_number: true,
        document_number_encrypted: encryptAes256Gcm('SYNTHETIC-DOCUMENT', key),
        legacy_document_number: null,
        anonymized_at: null,
        anonymized_request_id: null,
      },
    ]);
    const decrypt = jest.spyOn(
      (adapter as unknown as { fiscalDocumentCrypto: { decrypt: (value: string) => string } })
        .fiscalDocumentCrypto,
      'decrypt',
    );

    const result = await adapter.findByContractId('00000000-0000-4000-8000-000000000010');

    expect(result?.buyer).toMatchObject({ documentNumber: null, hasDocumentNumber: true });
    expect(decrypt).not.toHaveBeenCalled();
    expect(result?.buyer.revealDocumentNumber?.()).toBe('SYNTHETIC-DOCUMENT');
    expect(decrypt).toHaveBeenCalledTimes(1);
    decrypt.mockRestore();
  });

  it('BR-4.4 con revealDocument:false no descifra y lo entrega bajo demanda una sola vez por llamada', async () => {
    managerQuery.mockResolvedValue([
      {
        contract_id: '00000000-0000-4000-8000-000000000010',
        subscriber_id: '00000000-0000-4000-8000-000000000011',
        party_id: null,
        status: 'ACTIVE',
        status_reason_code: null,
        terminated_at: null,
        cycle_day: 1,
        cutoff_day: 15,
        start_date: '2026-01-01',
        end_date: null,
        plan_name: 'Plan de prueba',
        monthly_price: '85000.00',
        vat_snapshot: null,
        unbilled_additional_count: 0,
        display_name: 'Titular sintético',
        document_type: 'CC',
        address: null,
        rut_responsibilities: [],
        has_document_number: true,
        document_number_encrypted: encryptAes256Gcm('SYNTHETIC-DOCUMENT', key),
        legacy_document_number: null,
        anonymized_at: null,
        anonymized_request_id: null,
      },
    ]);
    const decrypt = jest.spyOn(
      (adapter as unknown as { fiscalDocumentCrypto: { decrypt: (value: string) => string } })
        .fiscalDocumentCrypto,
      'decrypt',
    );

    const result = await adapter.findByContractId('00000000-0000-4000-8000-000000000010', {
      revealDocument: false,
    });

    expect(result?.buyer).toMatchObject({ documentNumber: null, hasDocumentNumber: true });
    expect(decrypt).not.toHaveBeenCalled();
    expect(result?.buyer.revealDocumentNumber?.()).toBe('SYNTHETIC-DOCUMENT');
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it('BR-4.3 (RS-20) lee el ciclo del catálogo completo, también el inactivo', async () => {
    managerQuery.mockResolvedValue([{ cycle_day: 5, cutoff_day: 20 }]);

    await adapter.findBillingCycleByContractId('00000000-0000-4000-8000-000000000010');
    managerQuery.mockResolvedValue([]);
    await adapter.findByContractId('00000000-0000-4000-8000-000000000010');
    await adapter.findBillableForDate('2026-11-01', { limit: 10 });

    for (const [sql] of managerQuery.mock.calls) {
      expect(String(sql)).toContain('crm_billing_cycles');
      expect(String(sql)).not.toMatch(/bc\.active/u);
    }
  });

  it('convierte terminatedAt a fecha civil usando la zona horaria del tenant', async () => {
    tenantSettingsReadPort.getSnapshot.mockResolvedValue({ timezone: 'America/Lima' });
    managerQuery.mockResolvedValue([
      {
        contract_id: '00000000-0000-4000-8000-000000000010',
        subscriber_id: '00000000-0000-4000-8000-000000000011',
        party_id: null,
        status: 'TERMINATED',
        status_reason_code: null,
        terminated_at: new Date('2026-01-01T02:00:00.000Z'),
        cycle_day: 1,
        cutoff_day: 15,
        start_date: '2026-01-01',
        end_date: null,
        plan_name: 'Plan de prueba',
        monthly_price: '85000.00',
        vat_snapshot: null,
        unbilled_additional_count: 0,
        display_name: 'Titular sintético',
        document_type: 'CC',
        address: null,
        rut_responsibilities: [],
        document_number_encrypted: null,
        legacy_document_number: null,
        anonymized_at: null,
        anonymized_request_id: null,
      },
    ]);

    const result = await adapter.findByContractId('00000000-0000-4000-8000-000000000010');

    expect(result?.terminatedAt).toBe('2025-12-31');
  });

  it('bloquea al titular con el manager del llamador y usa FOR SHARE', async () => {
    managerQuery.mockResolvedValue([
      {
        party_id: '00000000-0000-4000-8000-000000000012',
        anonymized_at: new Date('2026-10-20T12:00:00.000Z'),
        anonymized_request_id: '00000000-0000-4000-8000-000000000013',
      },
    ]);
    const callerManager = { query: managerQuery } as unknown as EntityManager;

    const result = await adapter.lockTitularForBillingWrite(
      '00000000-0000-4000-8000-000000000011',
      { manager: callerManager },
    );

    expect(result).toEqual({
      exists: true,
      partyId: '00000000-0000-4000-8000-000000000012',
      anonymized: true,
    });
    expect(managerQuery.mock.calls[0]?.[0]).toContain('FOR SHARE');
  });

  it('falla cerrado si cualquiera de las marcas de anonimización está presente', async () => {
    managerQuery.mockResolvedValue([
      {
        party_id: '00000000-0000-4000-8000-000000000012',
        anonymized_at: null,
        anonymized_request_id: '00000000-0000-4000-8000-000000000013',
      },
    ]);

    const result = await adapter.lockTitularForBillingWrite(
      '00000000-0000-4000-8000-000000000011',
      { manager: { query: managerQuery } as unknown as EntityManager },
    );

    expect(result.anonymized).toBe(true);
  });

  it('consulta el ciclo del contrato sin proyectar ni descifrar PII', async () => {
    managerQuery.mockResolvedValue([{ cycle_day: 15, cutoff_day: 30 }]);

    const result = await adapter.findBillingCycleByContractId(
      '00000000-0000-4000-8000-000000000010',
    );

    expect(result).toEqual({ cycleDay: 15, cutoffDay: 30 });
    expect(managerQuery.mock.calls[0]?.[0]).not.toContain('fiscal_document');
    expect(managerQuery.mock.calls[0]?.[0]).toContain('anonymized_at IS NULL');
  });

  it('enumera los ciclos activos del CRM ordenados', async () => {
    managerQuery.mockResolvedValue([
      { cycle_day: 1, cutoff_day: 15 },
      { cycle_day: 15, cutoff_day: 30 },
    ]);

    await expect(adapter.listBillingCycles()).resolves.toEqual([
      { cycleDay: 1, cutoffDay: 15 },
      { cycleDay: 15, cutoffDay: 30 },
    ]);
    expect(managerQuery.mock.calls[0]?.[0]).toContain('active = true');
  });
});
