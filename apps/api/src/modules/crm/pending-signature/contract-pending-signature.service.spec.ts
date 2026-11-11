import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ContractPendingSignatureService } from './contract-pending-signature.service';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
}));

const context = {
  tenantId: '11111111-1111-4111-8111-1111111111dd',
  tenantSlug: 'f-service',
  schemaName: 'tenant_f_service',
};
const C1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const C2 = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
const C3 = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
const S1 = '51515151-5151-4515-8515-515151515151';
const S2 = '52525252-5252-4525-8525-525252525252';
const NOW = new Date('2026-11-11T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

describe('ContractPendingSignatureService', () => {
  const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  let query: jest.Mock;
  let port: { listProvisioningActivatedAt: jest.Mock; getProvisioningActivatedAt: jest.Mock };
  let service: ContractPendingSignatureService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
    query = jest.fn();
    runInTenant.mockImplementation(async (_ds, _schema, fn) => fn({ query } as never));
    port = {
      listProvisioningActivatedAt: jest.fn().mockResolvedValue(new Map()),
      getProvisioningActivatedAt: jest.fn(),
    };
    service = new ContractPendingSignatureService({} as never, port);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('isContractUnsigned', () => {
    it('true solo para DRAFT, con tenant del contexto', async () => {
      query
        .mockResolvedValueOnce([{ status: 'DRAFT' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }]);
      expect(await service.isContractUnsigned(C1)).toBe(true);
      expect(await service.isContractUnsigned(C1)).toBe(false);
      expect(query).toHaveBeenCalledWith(expect.any(String), [context.tenantId, C1]);
    });

    it('false si no existe o el id no es uuid', async () => {
      query.mockResolvedValue([]);
      expect(await service.isContractUnsigned(C1)).toBe(false);
      query.mockClear();
      expect(await service.isContractUnsigned('x')).toBe(false);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('subscribersPendingSignature', () => {
    it('marca solo suscriptores con DRAFT y servicio activado', async () => {
      query.mockResolvedValue([
        { contract_id: C1, subscriber_id: S1 },
        { contract_id: C2, subscriber_id: S2 },
      ]);
      port.listProvisioningActivatedAt.mockResolvedValue(new Map([[C1, hoursAgo(1)]]));

      const result = await service.subscribersPendingSignature([S1, S2, S1, 'malo']);

      expect([...result]).toEqual([S1]);
      expect(query.mock.calls[0]?.[1]).toEqual([context.tenantId, [S1, S2]]);
      expect(port.listProvisioningActivatedAt).toHaveBeenCalledWith([C1, C2]);
    });

    it('sin ids o sin borradores no consulta el puerto', async () => {
      expect((await service.subscribersPendingSignature([])).size).toBe(0);
      query.mockResolvedValue([]);
      expect((await service.subscribersPendingSignature([S1])).size).toBe(0);
      expect(port.listProvisioningActivatedAt).not.toHaveBeenCalled();
    });
  });

  describe('listDueForAlert', () => {
    it('filtra por umbral: 48 h exactas entran, menos no, sin activación no', async () => {
      query.mockResolvedValue([{ contract_id: C1 }, { contract_id: C2 }, { contract_id: C3 }]);
      port.listProvisioningActivatedAt.mockResolvedValue(
        new Map([
          [C1, hoursAgo(48)],
          [C2, hoursAgo(47)],
        ]),
      );

      expect(await service.listDueForAlert(48, NOW)).toEqual([C1]);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), [
        context.tenantId,
        48,
      ]);
    });

    it('sin candidatos no consulta el puerto', async () => {
      query.mockResolvedValue([]);
      expect(await service.listDueForAlert(48, NOW)).toEqual([]);
      expect(port.listProvisioningActivatedAt).not.toHaveBeenCalled();
    });
  });

  describe('recordAlerts', () => {
    it('inserta idempotente y devuelve solo los nuevos', async () => {
      const manager = { query: jest.fn().mockResolvedValue([{ contract_id: C1 }]) };
      const fresh = await service.recordAlerts(manager as never, [C1, C2], 48, 3);
      expect(fresh).toEqual([C1]);
      expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
        context.tenantId,
        [C1, C2],
        48,
        3,
      ]);
    });

    it('lista vacía no escribe', async () => {
      const manager = { query: jest.fn() };
      expect(await service.recordAlerts(manager as never, [], 48, 1)).toEqual([]);
      expect(manager.query).not.toHaveBeenCalled();
    });
  });
});
