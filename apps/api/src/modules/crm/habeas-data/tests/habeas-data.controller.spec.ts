import { Test, TestingModule } from '@nestjs/testing';
import { HabeasDataController } from '../habeas-data.controller';
import { HabeasDataService } from '../habeas-data.service';

describe('HabeasDataController', () => {
  let controller: HabeasDataController;

  const serviceMock = {
    createConsent: jest.fn(),
    listConsents: jest.fn(),
    createArcoRequest: jest.fn(),
    listArcoRequests: jest.fn(),
    updateArcoStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HabeasDataController],
      providers: [{ provide: HabeasDataService, useValue: serviceMock }],
    }).compile();

    controller = module.get<HabeasDataController>(HabeasDataController);
  });

  it('lista consentimientos del suscriptor', async () => {
    serviceMock.listConsents.mockResolvedValue([{ id: 'cons-1' }]);

    const result = await controller.listConsents('00000000-0000-4000-a000-000000000001');

    expect(result.data[0]?.id).toBe('cons-1');
  });
});
