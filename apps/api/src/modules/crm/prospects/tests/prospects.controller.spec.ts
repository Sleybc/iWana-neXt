import { Test, TestingModule } from '@nestjs/testing';
import { ProspectsController } from '../prospects.controller';
import { ProspectsService } from '../prospects.service';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';

describe('ProspectsController', () => {
  let controller: ProspectsController;

  const serviceMock = {
    scheduleInstallation: jest.fn(),
    rescheduleInstallation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProspectsController],
      providers: [
        { provide: ProspectsService, useValue: serviceMock },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    controller = module.get<ProspectsController>(ProspectsController);
  });

  it('delegates installation scheduling', async () => {
    serviceMock.scheduleInstallation.mockResolvedValue({
      id: 'pros-1',
      status: 'INSTALLATION_SCHEDULED',
    });

    const result = await controller.scheduleInstallation('00000000-0000-4000-a000-000000000001', {
      planId: 'plan-1',
      ticketId: 'tic-1',
      workOrderId: 'wo-1',
    });

    expect(result.data.status).toBe('INSTALLATION_SCHEDULED');
  });
});
