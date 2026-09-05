import { Test, TestingModule } from '@nestjs/testing';
import { ContractsController } from '../contracts.controller';
import { ContractsService } from '../contracts.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Contract } from '../entities/contract.entity';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';

/** Factory de contrato mínimo para tests */
function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'ctr-1',
    tenantId: 'ten-1',
    quoteId: null,
    subscriberId: 'sub-1',
    planId: 'plan-fibra-300',
    planSnapshotJson: {},
    status: ContractStatus.DRAFT,
    alias: 'Servicio — Bogotá',
    installationAddress: null,
    installationCity: null,
    installationDepartment: null,
    installationPostalCode: null,
    installationNotes: null,
    customerSegment: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Contract;
}

describe('ContractsController', () => {
  let controller: ContractsController;

  const serviceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAllBySubscriber: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createFromExpediente: jest.fn(),
    activate: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
    terminate: jest.fn(),
    archive: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [
        { provide: ContractsService, useValue: serviceMock },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    controller = module.get<ContractsController>(ContractsController);
  });

  describe('findAll', () => {
    it('retorna contratos en envelope { data, meta }', async () => {
      serviceMock.findAll.mockResolvedValue({
        data: [buildContract()],
        meta: {
          nextCursor: null,
          total: 1,
          totalIsEstimate: false,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });

      const result = await controller.findAll();

      expect(result.data).toHaveLength(1);
      expect(result.meta.mode).toBe('page');
    });
  });

  describe('findAllBySubscriber', () => {
    it('delega al servicio con el subscriberId correcto', async () => {
      const contracts = [buildContract(), buildContract({ id: 'ctr-2' })];
      serviceMock.findAllBySubscriber.mockResolvedValue({
        data: contracts,
        meta: {
          nextCursor: null,
          total: 2,
          totalIsEstimate: false,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasMore: false,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
      });

      const result = await controller.findAllBySubscriber('sub-1');

      expect(serviceMock.findAllBySubscriber).toHaveBeenCalledWith('sub-1', {});
      expect(result.data).toHaveLength(2);
    });
  });

  describe('createForSubscriber', () => {
    it('inyecta subscriberId del path en el DTO', async () => {
      const contract = buildContract();
      serviceMock.create.mockResolvedValue(contract);

      await controller.createForSubscriber('sub-1', {
        planId: 'plan-1',
        planSnapshotJson: {},
        subscriberId: 'ignorado-se-sobreescribe',
      });

      expect(serviceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ subscriberId: 'sub-1' }),
      );
    });
  });

  describe('createFromExpediente', () => {
    it('delega al servicio con subscriberId y DTO', async () => {
      const contract = buildContract();
      serviceMock.createFromExpediente.mockResolvedValue(contract);

      const result = await controller.createFromExpediente('sub-1', {});

      expect(serviceMock.createFromExpediente).toHaveBeenCalledWith('sub-1', {});
      expect(result.data.id).toBe('ctr-1');
    });
  });

  describe('Transiciones de estado', () => {
    it('activate retorna contrato con status ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      serviceMock.activate.mockResolvedValue(contract);

      const result = await controller.activate('ctr-1');

      expect(serviceMock.activate).toHaveBeenCalledWith('ctr-1');
      expect(result.data.status).toBe(ContractStatus.ACTIVE);
    });

    it('suspend retorna contrato con status SUSPENDED', async () => {
      serviceMock.suspend.mockResolvedValue(buildContract({ status: ContractStatus.SUSPENDED }));
      const result = await controller.suspend('ctr-1');
      expect(result.data.status).toBe(ContractStatus.SUSPENDED);
    });

    it('reactivate retorna contrato con status ACTIVE', async () => {
      serviceMock.reactivate.mockResolvedValue(buildContract({ status: ContractStatus.ACTIVE }));
      const result = await controller.reactivate('ctr-1');
      expect(result.data.status).toBe(ContractStatus.ACTIVE);
    });

    it('terminate retorna contrato con status TERMINATED', async () => {
      serviceMock.terminate.mockResolvedValue(buildContract({ status: ContractStatus.TERMINATED }));
      const result = await controller.terminate('ctr-1');
      expect(result.data.status).toBe(ContractStatus.TERMINATED);
    });

    it('archive retorna contrato con status ARCHIVED', async () => {
      serviceMock.archive.mockResolvedValue(buildContract({ status: ContractStatus.ARCHIVED }));
      const result = await controller.archive('ctr-1');
      expect(result.data.status).toBe(ContractStatus.ARCHIVED);
    });
  });

  describe('remove', () => {
    it('delega remove al servicio sin retorno', async () => {
      serviceMock.remove.mockResolvedValue(undefined);
      await expect(controller.remove('ctr-1')).resolves.toBeUndefined();
    });
  });
});
