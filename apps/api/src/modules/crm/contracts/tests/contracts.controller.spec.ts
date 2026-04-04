import { Test, TestingModule } from '@nestjs/testing';
import { ContractsController } from '../contracts.controller';
import { ContractsService } from '../contracts.service';

describe('ContractsController', () => {
  let controller: ContractsController;

  const serviceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [{ provide: ContractsService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ContractsController>(ContractsController);
  });

  it('retorna contratos en un data envelope', async () => {
    serviceMock.findAll.mockResolvedValue([{ id: 'ctr-1' }]);

    const result = await controller.findAll();

    expect(result.data).toHaveLength(1);
  });
});
