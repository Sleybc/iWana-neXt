import { DataSource } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { CustomerSegment, InstallationRule, NetworkType, VatConcept } from '@iwana/shared';
import { CommercialCatalogReadAdapter } from './commercial-catalog-read.adapter';

/**
 * CA-5 (D3): con `ctx` el adaptador usa el manager del llamante y no abre una
 * transacción propia; sin `ctx` conserva `runInTenantSchema` como antes.
 */
const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: jest.fn() },
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  };
});

const TENANT = { tenantId: 'ten-ctx', schemaName: 'tenant_ctx' };
const PLAN_ID = '00000000-0000-4000-a000-000000000101';

function planManager() {
  const findOne = jest.fn(async () => ({
    id: PLAN_ID,
    name: 'Plan Fibra 300',
    type: 'PLAN',
    isActive: true,
    vatConcept: VatConcept.INTERNET_ACCESS,
  }));
  const priceBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest
      .fn()
      .mockResolvedValue([{ itemId: PLAN_ID, basePrice: '89900.00', installationFee: '0.00' }]),
  };
  const detailBuilder = {
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([
      {
        itemId: PLAN_ID,
        technology: 'FTTH',
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 300,
        installationRule: InstallationRule.ON_DEMAND,
        networkType: NetworkType.MOBILE,
      },
    ]),
  };
  const createQueryBuilder = jest
    .fn()
    .mockReturnValueOnce(priceBuilder)
    .mockReturnValueOnce(detailBuilder);
  return { findOne, createQueryBuilder };
}

function snapshotManager() {
  const findOne = jest
    .fn()
    .mockResolvedValueOnce({
      id: PLAN_ID,
      tenantId: TENANT.tenantId,
      name: 'Plan Pyme 500',
      type: 'PLAN',
      isActive: true,
      deletedAt: null,
      vatConcept: VatConcept.INTERNET_ACCESS,
    })
    .mockResolvedValueOnce({
      itemId: PLAN_ID,
      customerSegment: CustomerSegment.RESIDENTIAL,
      basePrice: '129900.00',
      installationFee: '0.00',
      isCurrent: true,
    })
    .mockResolvedValueOnce({
      itemId: PLAN_ID,
      technology: 'XGS-PON',
      downloadSpeedMbps: 500,
      uploadSpeedMbps: 500,
      networkType: NetworkType.MOBILE,
    });
  return { findOne };
}

describe('CommercialCatalogReadAdapter · contexto de transacción (D3)', () => {
  let adapter: CommercialCatalogReadAdapter;

  beforeEach(() => {
    adapter = new CommercialCatalogReadAdapter({} as DataSource);
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue(TENANT);
  });

  afterEach(() => jest.clearAllMocks());

  it('getPlanById con ctx usa el manager del llamante y no abre transacción propia', async () => {
    const manager = planManager();

    const result = await adapter.getPlanById('ten-caller', 'tenant_caller', PLAN_ID, {
      manager: manager as never,
    });

    expect(result).toEqual(
      expect.objectContaining({ id: PLAN_ID, technology: 'FTTH', basePrice: 89900 }),
    );
    expect(manager.findOne).toHaveBeenCalled();
    expect(manager.createQueryBuilder).toHaveBeenCalled();
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('getPlanById sin ctx conserva la transacción propia con runInTenantSchema', async () => {
    const manager = planManager();
    mockRunInTenantSchema.mockImplementationOnce(
      async (_ds: unknown, _schema: unknown, cb: (qr: unknown) => Promise<unknown>) =>
        cb({ manager }),
    );

    const result = await adapter.getPlanById('ten-caller', 'tenant_caller', PLAN_ID);

    expect(result).toEqual(expect.objectContaining({ id: PLAN_ID }));
    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      TENANT.schemaName,
      expect.any(Function),
    );
  });

  it('createSnapshot con ctx usa el manager del llamante y no abre transacción propia', async () => {
    const manager = snapshotManager();

    const result = await adapter.createSnapshot(
      'ten-caller',
      'tenant_caller',
      PLAN_ID,
      CustomerSegment.RESIDENTIAL,
      {
        manager: manager as never,
      },
    );

    expect(result).toEqual(expect.objectContaining({ planId: PLAN_ID, monthlyPrice: 129900 }));
    expect(manager.findOne).toHaveBeenCalledTimes(3);
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('createSnapshot sin ctx conserva la transacción propia con runInTenantSchema', async () => {
    const manager = snapshotManager();
    mockRunInTenantSchema.mockImplementationOnce(
      async (_ds: unknown, _schema: unknown, cb: (qr: unknown) => Promise<unknown>) =>
        cb({ manager }),
    );

    const result = await adapter.createSnapshot('ten-caller', 'tenant_caller', PLAN_ID);

    expect(result).toEqual(expect.objectContaining({ planId: PLAN_ID }));
    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      TENANT.schemaName,
      expect.any(Function),
    );
  });

  it('MOD14: getItemVatTreatments omite identificadores no UUID sin consultar', async () => {
    const manager = { query: jest.fn() };

    await expect(
      adapter.getItemVatTreatments('ten-caller', 'tenant_caller', ['legacy', ''], {
        manager: manager as never,
      }),
    ).resolves.toEqual([]);
    expect(manager.query).not.toHaveBeenCalled();
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('MOD14: getItemVatTreatments con ctx lee en la transacción del llamante y mapea', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([
        {
          item_id: PLAN_ID,
          item_type: 'PLAN',
          vat_treatment: null,
          vat_legal_basis: null,
          installation_vat_treatment: 'STANDARD',
          installation_vat_legal_basis: 'ET_468',
        },
      ]),
    };

    const result = await adapter.getItemVatTreatments(
      'ten-caller',
      'tenant_caller',
      [PLAN_ID, PLAN_ID, 'legacy'],
      { manager: manager as never },
    );

    expect(result).toEqual([
      {
        itemId: PLAN_ID,
        itemType: 'PLAN',
        vatTreatment: null,
        vatLegalBasis: null,
        installationVatTreatment: 'STANDARD',
        installationVatLegalBasis: 'ET_468',
      },
    ]);
    // El tenant sale de TenantContext, nunca del llamante; ids deduplicados y solo UUID.
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('ci.tenant_id = $1'), [
      TENANT.tenantId,
      [PLAN_ID],
      null,
    ]);
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('MOD14 bloque C: con segmento devuelve nombre y precio vigente del segmento', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([
        {
          item_id: PLAN_ID,
          item_type: 'SERVICE',
          name: 'IP fija',
          vat_treatment: 'STANDARD',
          vat_legal_basis: 'ET_468',
          installation_vat_treatment: null,
          installation_vat_legal_basis: null,
          current_base_price: '30000.00',
        },
      ]),
    };

    const [row] = await adapter.getItemVatTreatments(
      'ten-caller',
      'tenant_caller',
      [PLAN_ID],
      { manager: manager as never },
      'BUSINESS' as never,
    );

    expect(row).toMatchObject({ name: 'IP fija', currentBasePrice: '30000.00' });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ph.customer_segment = $3'),
      [TENANT.tenantId, [PLAN_ID], 'BUSINESS'],
    );
  });

  it('MOD14: getItemVatTreatments sin ctx abre su transacción tenant', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    mockRunInTenantSchema.mockImplementationOnce(
      async (_ds: unknown, _schema: unknown, cb: (qr: unknown) => Promise<unknown>) =>
        cb({ manager }),
    );

    await adapter.getItemVatTreatments('ten-caller', 'tenant_caller', [PLAN_ID]);

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      TENANT.schemaName,
      expect.any(Function),
    );
  });
});
