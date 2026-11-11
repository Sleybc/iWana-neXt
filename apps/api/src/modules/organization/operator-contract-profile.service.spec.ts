import { TenantContext, runInTenantSchema } from '@iwana/db';
import { AuditAction, type UpdateOperatorContractProfileInput } from '@iwana/shared';
import { OperatorContractProfileService } from './operator-contract-profile.service';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return { ...actual, TenantContext: { getOrThrow: jest.fn() }, runInTenantSchema: jest.fn() };
});

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';

const fullRow = {
  quality_and_coverage_url: 'https://operador.example/calidad',
  customer_service_channels: [{ kind: 'PHONE', value: '6015550000', label: 'Línea' }],
  reconnection_fee: '15000.00',
  annual_increase_cap_percent: '5.50',
  equipment_incident_report_channel: 'Línea de soporte',
  other_conditions: null,
  updated_at: new Date('2026-11-11T12:00:00.000Z'),
};

const input: UpdateOperatorContractProfileInput = {
  qualityAndCoverageUrl: 'https://operador.example/calidad',
  customerServiceChannels: [{ kind: 'PHONE', value: '6015550000', label: 'Línea' }],
  reconnectionFee: 15000,
  annualIncreaseCapPercent: 5.5,
  equipmentIncidentReportChannel: 'Línea de soporte',
  otherConditions: null,
};

function setup(
  identity: { legalName: string | null; nit: string | null } = {
    legalName: 'Operador Sintético SAS',
    nit: '900000001',
  },
) {
  const query = jest.fn();
  (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, callback) =>
    callback({ query }),
  );
  (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
    tenantId: TENANT_ID,
    schemaName: 'tenant_test',
  });
  const audit = { log: jest.fn() };
  const identityPort = { getOperatorIdentity: jest.fn().mockResolvedValue(identity) };
  const service = new OperatorContractProfileService(
    {} as never,
    audit as never,
    identityPort as never,
  );
  return { service, query, audit, identityPort };
}

describe('OperatorContractProfileService (A0, CA-11)', () => {
  afterEach(() => jest.clearAllMocks());

  it('sin fila devuelve campos vacíos y lista los obligatorios del operador', async () => {
    const { service, query, identityPort } = setup();
    query.mockResolvedValueOnce([]);

    const view = await service.get();

    expect(identityPort.getOperatorIdentity).toHaveBeenCalledWith(TENANT_ID);
    expect(view.profile).toEqual({
      legalName: 'Operador Sintético SAS',
      nit: '900000001',
      qualityAndCoverageUrl: null,
      customerServiceChannels: [],
      reconnectionFee: null,
      annualIncreaseCapPercent: null,
      equipmentIncidentReportChannel: null,
      otherConditions: null,
      updatedAt: null,
    });
    expect(view.missingFields).toEqual([
      'qualityAndCoverageUrl',
      'customerServiceChannels',
      'reconnectionFee',
      'annualIncreaseCapPercent',
      'equipmentIncidentReportChannel',
    ]);
  });

  it('convierte los numéricos de PostgreSQL y reporta razón social y NIT faltantes', async () => {
    const { service, query } = setup({ legalName: null, nit: '' });
    query.mockResolvedValueOnce([fullRow]);

    const view = await service.get();

    expect(view.profile.reconnectionFee).toBe(15000);
    expect(view.profile.annualIncreaseCapPercent).toBe(5.5);
    expect(view.profile.updatedAt).toBe('2026-11-11T12:00:00.000Z');
    expect(view.missingFields).toEqual(['legalName', 'nit']);
  });

  it('guarda con consulta parametrizada y el usuario del JWT, y audita la creación', async () => {
    const { service, query, audit } = setup();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([fullRow]);

    const view = await service.update(input, { userId: USER_ID, ipAddress: '127.0.0.1' });

    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    const [sql, params] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (tenant_id) DO UPDATE');
    expect(params).toEqual([
      TENANT_ID,
      input.qualityAndCoverageUrl,
      JSON.stringify(input.customerServiceChannels),
      15000,
      5.5,
      'Línea de soporte',
      null,
      USER_ID,
    ]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        entityType: 'operator_contract_profile',
        entityId: TENANT_ID,
        userId: USER_ID,
        oldValue: null,
      }),
    );
    expect(view.missingFields).toEqual([]);
  });

  it('audita como actualización cuando ya existía la fila', async () => {
    const { service, query, audit } = setup();
    query
      .mockResolvedValueOnce([fullRow])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ ...fullRow, other_conditions: 'Condición sintética' }]);

    const view = await service.update(
      { ...input, otherConditions: 'Condición sintética' },
      { userId: USER_ID },
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        oldValue: expect.objectContaining({ otherConditions: null }),
        newValue: expect.objectContaining({ otherConditions: 'Condición sintética' }),
      }),
    );
    expect(view.profile.otherConditions).toBe('Condición sintética');
  });

  it('getForTenant usa el tenant explícito, sin el contexto de la petición', async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce([fullRow]);

    const view = await service.getForTenant(TENANT_ID, 'tenant_explicito');

    expect(runInTenantSchema).toHaveBeenCalledWith({}, 'tenant_explicito', expect.any(Function));
    expect(TenantContext.getOrThrow).not.toHaveBeenCalled();
    expect(view.missingFields).toEqual([]);
  });
});
