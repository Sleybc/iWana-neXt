import { Test, TestingModule } from '@nestjs/testing';
import { ContactsController } from '../contacts.controller';
import { ContactsService } from '../contacts.service';

describe('ContactsController', () => {
  let controller: ContactsController;

  const serviceMock = {
    create: jest.fn(),
    findBySubscriber: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [{ provide: ContactsService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ContactsController>(ContactsController);
  });

  it('lista contactos por suscriptor', async () => {
    serviceMock.findBySubscriber.mockResolvedValue([{ id: 'cnt-1' }]);

    const result = await controller.findAll('00000000-0000-4000-a000-000000000001');

    expect(result.data[0]?.id).toBe('cnt-1');
  });
});
