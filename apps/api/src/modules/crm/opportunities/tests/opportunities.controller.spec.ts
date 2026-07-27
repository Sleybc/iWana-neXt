import { Test, TestingModule } from '@nestjs/testing';
import { OpportunitiesController } from '../opportunities.controller';
import { OpportunitiesService } from '../opportunities.service';

describe('OpportunitiesController', () => {
  let controller: OpportunitiesController;

  const serviceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpportunitiesController],
      providers: [{ provide: OpportunitiesService, useValue: serviceMock }],
    }).compile();

    controller = module.get<OpportunitiesController>(OpportunitiesController);
  });

  it('retorna lista de oportunidades', async () => {
    serviceMock.findAll.mockResolvedValue({
      data: [{ id: 'opp-1' }],
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
    expect(result.meta.total).toBe(1);
  });
});
