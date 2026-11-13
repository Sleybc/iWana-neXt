import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingWithholdingOptionsService,
  rateTenThousandths,
} from './billing-withholding-options.service';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      getOrThrow: () => ({
        tenantId: '00000000-0000-4000-8000-000000000001',
        schemaName: 'tenant_test',
      }),
    },
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  };
});

const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';

describe('BillingWithholdingOptionsService (spec MOD14 2026-11-13 R7)', () => {
  const manager = { query: jest.fn() };
  let contracts: {
    findTitularWithholdingEligibility: jest.Mock;
    lockTitularForBillingWrite: jest.Mock;
  };
  let taxCatalog: { findActiveByCode: jest.Mock };
  let service: BillingWithholdingOptionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunInTenantSchema.mockImplementation(
      async (_ds: unknown, _schema: string, work: (qr: unknown) => unknown) => work({ manager }),
    );
    contracts = {
      findTitularWithholdingEligibility: jest.fn().mockResolvedValue({
        exists: true,
        partyId: null,
        anonymized: false,
        withholdingAgent: 'AGENTE_RETENEDOR',
      }),
      lockTitularForBillingWrite: jest.fn(),
    };
    taxCatalog = { findActiveByCode: jest.fn().mockResolvedValue(null) };
    service = new BillingWithholdingOptionsService(contracts as never, taxCatalog as never);
  });

  it('toma la tarifa de la definición activa del tenant en Tributación', async () => {
    taxCatalog.findActiveByCode.mockImplementation(async (code: string) =>
      code === 'RETE_ICA'
        ? { code, name: 'ReteICA Medellín', baseRate: '0.7000' }
        : { code, name: 'Retención servicios', baseRate: '6.0000' },
    );

    const result = await service.optionsForSubscriber(SUBSCRIBER);

    expect(result).toEqual({
      subscriberId: SUBSCRIBER,
      eligible: true,
      eligibility: 'AGENTE_RETENEDOR',
      options: [
        {
          taxCode: 'RETE_FUENTE_SERVICIOS',
          name: 'Retención servicios',
          suggestedRate: '6.0000',
          source: 'TRIBUTACION',
        },
        {
          taxCode: 'RETE_ICA',
          name: 'ReteICA Medellín',
          suggestedRate: '0.7000',
          source: 'TRIBUTACION',
        },
      ],
    });
    // H-7: lectura sin transacción ni FOR SHARE.
    expect(contracts.findTitularWithholdingEligibility).toHaveBeenCalledWith(SUBSCRIBER);
    expect(contracts.lockTitularForBillingWrite).not.toHaveBeenCalled();
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('sin definición activa usa el preset del sistema', async () => {
    contracts.findTitularWithholdingEligibility.mockResolvedValueOnce({
      exists: true,
      partyId: null,
      anonymized: false,
      withholdingAgent: 'AGENTE_RETENEDOR',
    });
    const result = await service.optionsForSubscriber(SUBSCRIBER);
    expect(result.eligibility).toBe('AGENTE_RETENEDOR');
    expect(result.options).toEqual([
      expect.objectContaining({
        taxCode: 'RETE_FUENTE_SERVICIOS',
        suggestedRate: '4.0000',
        source: 'PRESET',
      }),
      expect.objectContaining({ taxCode: 'RETE_ICA', suggestedRate: '0.4140', source: 'PRESET' }),
    ]);
  });

  it('una definición sin tarifa sugiere null', async () => {
    taxCatalog.findActiveByCode.mockResolvedValue({ name: 'Sin tarifa', baseRate: null });
    const result = await service.optionsForSubscriber(SUBSCRIBER);
    expect(result.options.every((option) => option.suggestedRate === null)).toBe(true);
  });

  it('titular que no puede retener: no elegible y sin opciones ni lectura del catálogo', async () => {
    contracts.findTitularWithholdingEligibility.mockResolvedValueOnce({
      exists: true,
      partyId: null,
      anonymized: false,
    });
    await expect(service.optionsForSubscriber(SUBSCRIBER)).resolves.toEqual({
      subscriberId: SUBSCRIBER,
      eligible: false,
      eligibility: null,
      options: [],
    });
    expect(taxCatalog.findActiveByCode).not.toHaveBeenCalled();
  });

  it.each([
    { exists: false, partyId: null, anonymized: false },
    { exists: true, partyId: null, anonymized: true },
  ])('responde 404 para titular inexistente o anonimizado', async (titular) => {
    contracts.findTitularWithholdingEligibility.mockResolvedValueOnce(titular);
    await expect(service.optionsForSubscriber(SUBSCRIBER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  describe('tope de tarifa (H-1 c)', () => {
    it('sugerida + 2 puntos por defecto; preset si no hay definición activa', async () => {
      const ceilings = await service.rateCeilings([
        'RETE_ICA',
        'RETE_FUENTE_SERVICIOS',
        'RETE_ICA',
      ]);
      expect(ceilings.get('RETE_FUENTE_SERVICIOS')).toEqual({
        suggestedRate: '4.0000',
        ceiling: '6.0000',
      });
      expect(ceilings.get('RETE_ICA')).toEqual({ suggestedRate: '0.4140', ceiling: '2.4140' });
      expect(taxCatalog.findActiveByCode).toHaveBeenCalledTimes(2);
    });

    it('la tolerancia es configurable y nunca supera 100 %', async () => {
      const configured = new BillingWithholdingOptionsService(
        contracts as never,
        taxCatalog as never,
        new ConfigService({ BILLING_WITHHOLDING_RATE_TOLERANCE_PP: '0.5' }),
      );
      expect(
        (await configured.rateCeilings(['RETE_FUENTE_SERVICIOS'])).get('RETE_FUENTE_SERVICIOS'),
      ).toEqual({ suggestedRate: '4.0000', ceiling: '4.5000' });
      const wide = new BillingWithholdingOptionsService(
        contracts as never,
        taxCatalog as never,
        new ConfigService({ BILLING_WITHHOLDING_RATE_TOLERANCE_PP: 100 }),
      );
      expect(
        (await wide.rateCeilings(['RETE_FUENTE_SERVICIOS'])).get('RETE_FUENTE_SERVICIOS'),
      ).toEqual({ suggestedRate: '4.0000', ceiling: '100.0000' });
    });

    it('una tolerancia inválida cae al defecto; sin sugerida el tope es null', async () => {
      const invalid = new BillingWithholdingOptionsService(
        contracts as never,
        taxCatalog as never,
        new ConfigService({ BILLING_WITHHOLDING_RATE_TOLERANCE_PP: '-1' }),
      );
      expect(invalid.rateTolerance()).toBe(2);
      taxCatalog.findActiveByCode.mockResolvedValue({ name: 'Sin tarifa', baseRate: null });
      expect((await service.rateCeilings(['RETE_ICA'])).get('RETE_ICA')).toEqual({
        suggestedRate: null,
        ceiling: null,
      });
    });

    it('compara tarifas en diezmilésimas sin errores de flotante', () => {
      expect(rateTenThousandths('0.414')).toBe(4140);
      expect(rateTenThousandths(4)).toBe(40_000);
      expect(rateTenThousandths('100.0000')).toBe(1_000_000);
    });
  });
});
