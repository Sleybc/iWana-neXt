import { Test, TestingModule } from '@nestjs/testing';
import { QuotesController } from '../quotes.controller';
import { QuotesService } from '../quotes.service';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';

describe('QuotesController', () => {
  let controller: QuotesController;

  const serviceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    accept: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotesController],
      providers: [
        { provide: QuotesService, useValue: serviceMock },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    controller = module.get<QuotesController>(QuotesController);
  });

  it('acepta una cotizacion', async () => {
    serviceMock.accept.mockResolvedValue({ id: 'qt-1', status: 'APPROVED' });

    const result = await controller.accept('00000000-0000-4000-a000-000000000001');

    expect(result.data.status).toBe('APPROVED');
  });
});
