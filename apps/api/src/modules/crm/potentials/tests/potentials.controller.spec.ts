import { Test, TestingModule } from '@nestjs/testing';
import { PotentialsController } from '../potentials.controller';
import { PotentialsService } from '../potentials.service';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';

describe('PotentialsController', () => {
  let controller: PotentialsController;

  const serviceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    qualify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PotentialsController],
      providers: [
        { provide: PotentialsService, useValue: serviceMock },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    controller = module.get<PotentialsController>(PotentialsController);
  });

  it('delegates la calificacion del potencial', async () => {
    serviceMock.qualify.mockResolvedValue({ id: 'pros-1', status: 'PROSPECT' });

    const result = await controller.qualify('00000000-0000-4000-a000-000000000001', {
      address: 'Calle 123',
      planId: 'plan-1',
      consentAccepted: true,
      consentChannel: 'WEB',
      legalTextVersion: 'v1',
    });

    expect(result.data.status).toBe('PROSPECT');
  });
});
