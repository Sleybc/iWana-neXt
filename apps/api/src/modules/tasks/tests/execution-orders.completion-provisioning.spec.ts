/**
 * MOD11 — getCompletion pasa al evaluador el estado de aprovisionamiento con
 * la misma lectura que close() (puerto MOD13 getGateStatus). Sin PII real.
 */
import { DataSource } from 'typeorm';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import { ClosureGateEvaluatorService } from '../services/closure-gate-evaluator.service';

// requireActual conserva entidades y enums que la cadena de imports consume;
// solo se parchea el contexto de tenant y el runner de schema.
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ExecutionOrder: class ExecutionOrder {},
  ExecutionOrderActivity: class ExecutionOrderActivity {},
  ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
  ExecutionOrderEvidence: class ExecutionOrderEvidence {},
}));

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

import { runInTenantSchema } from '@iwana/db';

const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

const buildQueryBuilder = (rows: unknown[]) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(rows),
});

const PROVISIONING_SNAPSHOT = [
  {
    key: 'service-provisioning',
    label: 'Aprovisionamiento certificado',
    required: true,
    kind: 'PROVISIONING',
  },
];

const runGetCompletion = async (snapshot: unknown, getGateStatus?: jest.Mock) => {
  const service = new ExecutionOrdersService(
    {} as DataSource,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new ClosureGateEvaluatorService(),
  );
  if (getGateStatus) {
    Object.defineProperty(service, 'serviceProvisioningReadPort', {
      value: { getGateStatus },
    });
  }
  const manager = {
    findOne: jest.fn().mockResolvedValue({
      id: 'eo-001',
      tenantId: 'tenant-001',
      templateRequirementsSnapshot: snapshot,
    }),
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(buildQueryBuilder([]))
      .mockReturnValueOnce(buildQueryBuilder([]))
      .mockReturnValueOnce(buildQueryBuilder([])),
  };
  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
  return service.getCompletion('eo-001');
};

describe('getCompletion lee el aprovisionamiento como el cierre', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('CERTIFIED en MOD13 publica PROVISIONING satisfecho', async () => {
    const getGateStatus = jest.fn().mockResolvedValue({ enforced: true, status: 'CERTIFIED' });
    const completion = await runGetCompletion(PROVISIONING_SNAPSHOT, getGateStatus);

    expect(getGateStatus).toHaveBeenCalledWith('eo-001');
    expect(completion.completed).toBe(1);
    expect(completion.total).toBe(1);
    expect(completion.requirements?.[0]).toMatchObject({ kind: 'PROVISIONING', satisfied: true });
  });

  it.each([null, 'PENDING', 'FAILED'])(
    'estado %s publica PROVISIONING no satisfecho',
    async (status) => {
      const getGateStatus = jest.fn().mockResolvedValue({ enforced: true, status });
      const completion = await runGetCompletion(PROVISIONING_SNAPSHOT, getGateStatus);

      expect(completion.completed).toBe(0);
      expect(completion.requirements?.[0]).toMatchObject({ satisfied: false });
    },
  );

  it('lectura fallida: fallo cerrado, no satisfecho', async () => {
    const getGateStatus = jest.fn().mockRejectedValue(new Error('mod13 caído'));
    const completion = await runGetCompletion(PROVISIONING_SNAPSHOT, getGateStatus);

    expect(completion.completed).toBe(0);
    expect(completion.requirements?.[0]).toMatchObject({ satisfied: false });
  });

  it('sin requisito PROVISIONING no consulta MOD13', async () => {
    const getGateStatus = jest.fn();
    await runGetCompletion(
      [
        {
          key: 'a',
          label: 'Instalación',
          required: true,
          kind: 'ACTIVITY',
          activityType: 'INSTALLATION',
        },
      ],
      getGateStatus,
    );

    expect(getGateStatus).not.toHaveBeenCalled();
  });
});
