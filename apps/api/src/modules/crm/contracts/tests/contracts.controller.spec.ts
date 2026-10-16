import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ContractsController } from '../contracts.controller';
import { ContractsService } from '../contracts.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Contract } from '../entities/contract.entity';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { SKIP_AUDIT_KEY } from '../../../audit/decorators/skip-audit.decorator';

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
    findOneForRead: jest.fn(),
    assertContractNotBlocked: jest.fn(),
    update: jest.fn(),
    updateServicePoint: jest.fn(),
    uploadStratumEvidence: jest.fn(),
    removeStratumEvidence: jest.fn(),
    getStratumEvidenceSignedUrl: jest.fn(),
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

  it('omite la auditoría automática en cada endpoint de escritura de contratos', () => {
    const writeHandlers = [
      'createForSubscriber',
      'createFromExpediente',
      'create',
      'update',
      'updateServicePoint',
      'uploadStratumEvidence',
      'removeStratumEvidence',
      'remove',
      'activate',
      'suspend',
      'reactivate',
      'terminate',
      'archive',
    ] as const;

    for (const handlerName of writeHandlers) {
      const handler = ContractsController.prototype[handlerName];
      expect(Reflect.getMetadata(SKIP_AUDIT_KEY, handler)).toBe(true);
    }
  });

  it('no deja ningún endpoint HTTP de escritura sin @SkipAudit(), aunque se añada más adelante', () => {
    const writeMethods = [
      RequestMethod.POST,
      RequestMethod.PUT,
      RequestMethod.PATCH,
      RequestMethod.DELETE,
    ];
    // Se descubren los handlers por su metadato HTTP, no por una lista fija: un endpoint nuevo
    // de escritura entra aquí aunque nadie recuerde añadirlo a la lista de arriba.
    const writeHandlers = Object.getOwnPropertyNames(ContractsController.prototype).filter(
      (name) => {
        if (name === 'constructor') return false;
        const handler = ContractsController.prototype[name as keyof ContractsController];
        return writeMethods.includes(Reflect.getMetadata(METHOD_METADATA, handler));
      },
    );

    expect(writeHandlers.length).toBeGreaterThanOrEqual(13);
    for (const handlerName of writeHandlers) {
      const handler = ContractsController.prototype[handlerName as keyof ContractsController];
      expect({ handlerName, skip: Reflect.getMetadata(SKIP_AUDIT_KEY, handler) }).toEqual({
        handlerName,
        skip: true,
      });
    }
  });

  it.each(['update', 'updateServicePoint', 'uploadStratumEvidence'] as const)(
    'devuelve 409 y no muta el contrato bloqueado en %s',
    async (handler) => {
      serviceMock.assertContractNotBlocked.mockRejectedValue(
        new ConflictException({ code: 'PRIVACY_DATA_BLOCKED' }),
      );
      const actor = { sub: 'actor-1' } as JwtPayload;

      const request =
        handler === 'update'
          ? controller.update('ctr-1', { alias: 'Alias sintético' }, actor)
          : handler === 'updateServicePoint'
            ? controller.updateServicePoint('ctr-1', { installationStratum: 2 }, actor)
            : controller.uploadStratumEvidence(
                'ctr-1',
                { buffer: Buffer.from('synthetic') } as Express.Multer.File,
                actor,
              );

      await expect(request).rejects.toThrow(ConflictException);
      expect(serviceMock.assertContractNotBlocked).toHaveBeenCalledWith('ctr-1');
      expect(serviceMock[handler]).not.toHaveBeenCalled();
    },
  );

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

    it('forwarda los filtros opcionales cuando están presentes', async () => {
      serviceMock.findAll.mockResolvedValue({ data: [], meta: { mode: 'page' } });

      await controller.findAll(ContractStatus.ACTIVE, 'plan-1', 2, 10);

      expect(serviceMock.findAll).toHaveBeenCalledWith(
        {
          status: ContractStatus.ACTIVE,
          planId: 'plan-1',
          page: 2,
          limit: 10,
        },
        false,
        undefined,
      );
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

      expect(serviceMock.findAllBySubscriber).toHaveBeenCalledWith('sub-1', {}, false, undefined);
      expect(result.data).toHaveLength(2);
    });

    it('forwarda paginación cuando se proporcionan page y limit', async () => {
      serviceMock.findAllBySubscriber.mockResolvedValue({ data: [], meta: { mode: 'page' } });

      await controller.findAllBySubscriber('sub-1', 3, 25);

      expect(serviceMock.findAllBySubscriber).toHaveBeenCalledWith(
        'sub-1',
        { page: 3, limit: 25 },
        false,
        undefined,
      );
    });
  });

  describe('uploadStratumEvidence', () => {
    it('rechaza la petición multipart que no trae archivo', async () => {
      await expect(
        controller.uploadStratumEvidence('ctr-1', undefined, { sub: 'user-1' } as JwtPayload),
      ).rejects.toThrow(BadRequestException);
      expect(serviceMock.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('verifica el bloqueo antes de cargar evidencia', async () => {
      serviceMock.assertContractNotBlocked.mockResolvedValue(undefined);
      serviceMock.uploadStratumEvidence.mockResolvedValue(buildContract());

      await controller.uploadStratumEvidence(
        'ctr-1',
        { buffer: Buffer.from('synthetic') } as Express.Multer.File,
        { sub: 'actor-1' } as JwtPayload,
      );

      expect(serviceMock.assertContractNotBlocked).toHaveBeenCalledWith('ctr-1');
      expect(serviceMock.uploadStratumEvidence).toHaveBeenCalled();
    });
  });

  describe('createForSubscriber', () => {
    it('inyecta subscriberId del path en el DTO', async () => {
      const contract = buildContract();
      serviceMock.create.mockResolvedValue(contract);

      await controller.createForSubscriber(
        'sub-1',
        {
          planId: 'plan-1',
          planSnapshotJson: {},
          subscriberId: 'ignorado-se-sobreescribe',
        },
        { sub: 'actor-1' } as JwtPayload,
      );

      expect(serviceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ subscriberId: 'sub-1' }),
        'actor-1',
      );
    });
  });

  describe('createFromExpediente', () => {
    it('delega al servicio con subscriberId y DTO', async () => {
      const contract = buildContract();
      serviceMock.createFromExpediente.mockResolvedValue(contract);

      const result = await controller.createFromExpediente('sub-1', {}, {
        sub: 'actor-1',
      } as JwtPayload);

      expect(serviceMock.createFromExpediente).toHaveBeenCalledWith('sub-1', {}, 'actor-1');
      expect(result.data.id).toBe('ctr-1');
    });
  });

  describe('updateServicePoint', () => {
    it('delega el cambio dedicado y propaga el actor auditado', async () => {
      const actor = { sub: 'user-1' } as JwtPayload;
      serviceMock.updateServicePoint.mockResolvedValue(
        buildContract({ status: ContractStatus.ACTIVE }),
      );

      const result = await controller.updateServicePoint(
        'ctr-1',
        { installationStratum: 2 },
        actor,
      );

      expect(serviceMock.updateServicePoint).toHaveBeenCalledWith(
        'ctr-1',
        { installationStratum: 2 },
        'user-1',
      );
      expect(result.data.status).toBe(ContractStatus.ACTIVE);
    });

    it('verifica el bloqueo aunque el actor tenga permiso de lectura de datos bloqueados', async () => {
      serviceMock.assertContractNotBlocked.mockResolvedValue(undefined);
      serviceMock.updateServicePoint.mockResolvedValue(buildContract());

      await controller.updateServicePoint('ctr-1', { installationStratum: 2 }, {
        sub: 'actor-1',
      } as JwtPayload);

      expect(serviceMock.assertContractNotBlocked).toHaveBeenCalledWith('ctr-1');
      expect(serviceMock.updateServicePoint).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('verifica el bloqueo antes de editar el contrato', async () => {
      serviceMock.assertContractNotBlocked.mockResolvedValue(undefined);
      serviceMock.update.mockResolvedValue(buildContract());

      await controller.update('ctr-1', { alias: 'Alias sintético' }, {
        sub: 'actor-1',
      } as JwtPayload);

      expect(serviceMock.assertContractNotBlocked).toHaveBeenCalledWith('ctr-1');
      expect(serviceMock.update).toHaveBeenCalled();
    });
  });

  describe('Transiciones de estado', () => {
    it('activate retorna contrato con status ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      serviceMock.activate.mockResolvedValue(contract);

      const result = await controller.activate('ctr-1', { sub: 'actor-1' } as JwtPayload);

      expect(serviceMock.activate).toHaveBeenCalledWith('ctr-1', 'actor-1');
      expect(result.data.status).toBe(ContractStatus.ACTIVE);
    });

    it('suspend retorna contrato con status SUSPENDED', async () => {
      serviceMock.suspend.mockResolvedValue(buildContract({ status: ContractStatus.SUSPENDED }));
      const result = await controller.suspend('ctr-1', { sub: 'actor-1' } as JwtPayload);
      expect(serviceMock.suspend).toHaveBeenCalledWith('ctr-1', 'actor-1');
      expect(result.data.status).toBe(ContractStatus.SUSPENDED);
    });

    it('reactivate retorna contrato con status ACTIVE', async () => {
      serviceMock.reactivate.mockResolvedValue(buildContract({ status: ContractStatus.ACTIVE }));
      const result = await controller.reactivate('ctr-1', { sub: 'actor-1' } as JwtPayload);
      expect(serviceMock.reactivate).toHaveBeenCalledWith('ctr-1', 'actor-1');
      expect(result.data.status).toBe(ContractStatus.ACTIVE);
    });

    it('terminate retorna contrato con status TERMINATED', async () => {
      serviceMock.terminate.mockResolvedValue(buildContract({ status: ContractStatus.TERMINATED }));
      const result = await controller.terminate('ctr-1', { sub: 'actor-1' } as JwtPayload);
      expect(serviceMock.terminate).toHaveBeenCalledWith('ctr-1', 'actor-1');
      expect(result.data.status).toBe(ContractStatus.TERMINATED);
    });

    it('archive retorna contrato con status ARCHIVED', async () => {
      serviceMock.archive.mockResolvedValue(buildContract({ status: ContractStatus.ARCHIVED }));
      const result = await controller.archive('ctr-1', { sub: 'actor-1' } as JwtPayload);
      expect(serviceMock.archive).toHaveBeenCalledWith('ctr-1', 'actor-1');
      expect(result.data.status).toBe(ContractStatus.ARCHIVED);
    });
  });

  describe('remove', () => {
    it('delega remove al servicio sin retorno', async () => {
      serviceMock.remove.mockResolvedValue(undefined);
      await expect(
        controller.remove('ctr-1', { sub: 'actor-1' } as JwtPayload),
      ).resolves.toBeUndefined();
      expect(serviceMock.remove).toHaveBeenCalledWith('ctr-1', 'actor-1');
    });
  });
});
