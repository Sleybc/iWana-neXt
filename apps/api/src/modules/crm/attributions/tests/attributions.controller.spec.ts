import { Test, TestingModule } from '@nestjs/testing';
import { AcquisitionChannel, UserRole } from '@iwana/shared';
import { AttributionsController } from '../attributions.controller';
import { AttributionsService } from '../attributions.service';

describe('AttributionsController', () => {
  let controller: AttributionsController;

  const attributionsServiceMock = {
    createAttribution: jest.fn(),
    getCurrentAttribution: jest.fn(),
    getAttributionHistory: jest.fn(),
    revokeAttribution: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttributionsController],
      providers: [{ provide: AttributionsService, useValue: attributionsServiceMock }],
    }).compile();

    controller = module.get<AttributionsController>(AttributionsController);
  });

  it('crea atribución con actor autenticado', async () => {
    attributionsServiceMock.createAttribution.mockResolvedValue({ id: 'attr-1' });

    const result = await controller.create(
      '00000000-0000-4000-a000-000000000001',
      {
        actorId: '00000000-0000-4000-a000-000000000010',
        actorRole: UserRole.SALES,
        acquisitionChannel: AcquisitionChannel.WEB,
      },
      {
        sub: 'admin-1',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
    );

    expect(attributionsServiceMock.createAttribution).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      {
        actorId: '00000000-0000-4000-a000-000000000010',
        actorRole: UserRole.SALES,
        acquisitionChannel: AcquisitionChannel.WEB,
      },
      'admin-1',
    );
    expect(result.data.id).toBe('attr-1');
  });

  it('consulta atribución activa e historial', async () => {
    attributionsServiceMock.getCurrentAttribution.mockResolvedValue({ id: 'attr-active' });
    attributionsServiceMock.getAttributionHistory.mockResolvedValue([{ id: 'attr-old' }]);

    const current = await controller.getCurrent('00000000-0000-4000-a000-000000000001');
    const history = await controller.getHistory('00000000-0000-4000-a000-000000000001');

    expect(current.data).toEqual({ id: 'attr-active' });
    expect(history.data).toEqual([{ id: 'attr-old' }]);
  });

  it('revoca atribución activa con motivo obligatorio', async () => {
    attributionsServiceMock.revokeAttribution.mockResolvedValue({ id: 'attr-1', revokedBy: 'admin-1' });

    const result = await controller.revoke(
      '00000000-0000-4000-a000-000000000001',
      { reason: 'Corrección administrativa' },
      {
        sub: 'admin-1',
        email: 'hash',
        role: 'ADMIN',
        tenantId: 'tenant-1',
        schemaName: 'tenant_1',
        jti: 'jti-1',
        type: 'tenant',
      },
    );

    expect(attributionsServiceMock.revokeAttribution).toHaveBeenCalledWith(
      '00000000-0000-4000-a000-000000000001',
      'Corrección administrativa',
      'admin-1',
    );
    expect(result.data).toEqual({ id: 'attr-1', revokedBy: 'admin-1' });
  });
});
