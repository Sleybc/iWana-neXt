import { UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { AssuranceFieldServiceProcessor } from './assurance-field-service.processor';
import {
  type FieldServiceRequest,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
}));

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

function buildPayload(overrides: Partial<FieldServiceRequest> = {}): FieldServiceRequest {
  return {
    ticketId: 'ticket-001',
    tenantId: 'tenant-001',
    schemaName: 'tenant_test_ops',
    priority: 'CRITICAL',
    subject: 'Visita técnica requerida por caída de servicio',
    requestedByUserId: 'user-001',
    notes: 'Coordinar con soporte NOC antes de salir.',
    ...overrides,
  };
}

function buildProcessor(managerOverrides: Record<string, jest.Mock> = {}) {
  const manager = {
    createQueryBuilder: jest.fn(),
    create: jest.fn().mockImplementation((_entity, data) => data),
    save: jest.fn().mockResolvedValue(undefined),
    ...managerOverrides,
  };

  mockRunInTenantSchema.mockImplementation(
    async (
      _ds: unknown,
      _schemaName: string,
      callback: (qr: { manager: typeof manager }) => Promise<unknown>,
    ) => callback({ manager }),
  );

  const processor = new AssuranceFieldServiceProcessor({} as DataSource);
  return { processor, manager };
}

describe('AssuranceFieldServiceProcessor', () => {
  beforeEach(() => {
    mockRunInTenantSchema.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('materializa una VisitRequest NEEDS_CONTEXT para Assurance', async () => {
    const getOne = jest.fn().mockResolvedValue(null);
    const createQueryBuilder = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne,
    });

    const { processor, manager } = buildProcessor({ createQueryBuilder });
    const payload = buildPayload();

    await processor.process({ name: 'request-field-service', data: payload } as never);

    expect(mockRunInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      payload.schemaName,
      expect.any(Function),
    );
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: payload.tenantId,
        status: VisitRequestStatus.NEEDS_CONTEXT,
        originContext: WorkOrderSourceContext.ASSURANCE,
        originRef: payload.ticketId,
        workType: WfmWorkType.SUPPORT,
        priority: WorkOrderPriority.URGENT,
      }),
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('omite jobs duplicados cuando ya existe una solicitud activa', async () => {
    const getOne = jest.fn().mockResolvedValue({ id: 'vr-001' });
    const createQueryBuilder = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne,
    });

    const { processor, manager } = buildProcessor({ createQueryBuilder });

    await processor.process({ name: 'request-field-service', data: buildPayload() } as never);

    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza payloads con schemaName invalido', async () => {
    const { processor } = buildProcessor();

    await expect(
      processor.process({
        name: 'request-field-service',
        data: buildPayload({ schemaName: 'public;drop schema' }),
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
