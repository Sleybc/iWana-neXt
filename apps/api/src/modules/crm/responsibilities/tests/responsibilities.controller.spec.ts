import { Test, TestingModule } from '@nestjs/testing';
import { PlatformRole, UserRole } from '@iwana/shared';
import { ResponsibilitiesController } from '../responsibilities.controller';
import { ResponsibilitiesService } from '../responsibilities.service';

describe('ResponsibilitiesController', () => {
  let controller: ResponsibilitiesController;

  const mockService = {
    getResponsibility: jest.fn(),
    updateResponsibility: jest.fn(),
    getResponsibilityHistory: jest.fn(),
  };

  const mockUser = {
    sub: 'user-1',
    email: 'hash',
    role: 'ADMIN',
    tenantId: 'tenant-1',
    schemaName: 'tenant_1',
    jti: 'jti-1',
    type: 'tenant' as const,
  };

  const mockUuid = '00000000-0000-4000-a000-000000000001';

  const mockSnapshot = {
    currentResponsibleUserId: 'user-2',
    currentResponsibleAssignedAt: new Date('2026-03-01T10:00:00Z'),
    currentResponsible: { userId: 'user-2', name: 'Carlos Pérez', role: 'SALES' },
    expedienteId: mockUuid,
  };

  const mockHistoryItem = {
    id: 'history-1',
    previousResponsible: { userId: 'user-1', name: 'Ana López', role: 'ADMIN' },
    newResponsible: { userId: 'user-2', name: 'Carlos Pérez', role: 'SALES' },
    changedByActor: { userId: 'user-3', name: 'Pedro Gómez', role: 'SUPPORT' },
    changedAt: new Date('2026-03-15T14:30:00Z'),
    notes: 'Reasignación por carga de trabajo',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResponsibilitiesController],
      providers: [{ provide: ResponsibilitiesService, useValue: mockService }],
    }).compile();

    controller = module.get<ResponsibilitiesController>(ResponsibilitiesController);
  });

  it('GET /:id/responsibility returns 200 with snapshot', async () => {
    mockService.getResponsibility.mockResolvedValue(mockSnapshot);

    const result = await controller.getResponsibility(mockUuid);

    expect(mockService.getResponsibility).toHaveBeenCalledWith(mockUuid);
    expect(result.data).toEqual(mockSnapshot);
  });

  it('PATCH /:id/responsibility returns 200 and updates responsibility', async () => {
    const updateDto = { responsibleUserId: 'user-3', notes: 'Nueva asignación' };
    mockService.updateResponsibility.mockResolvedValue({
      ...mockSnapshot,
      currentResponsibleUserId: updateDto.responsibleUserId,
      currentResponsible: { userId: 'user-3', name: 'Pedro Gómez', role: 'SUPPORT' },
    });

    const result = await controller.updateResponsibility(mockUuid, updateDto, mockUser);

    expect(mockService.updateResponsibility).toHaveBeenCalledWith(
      mockUuid,
      updateDto,
      mockUser.sub,
    );
    expect(result.data.currentResponsibleUserId).toBe('user-3');
  });

  it('GET /:id/responsibility/history returns 200 with history items', async () => {
    mockService.getResponsibilityHistory.mockResolvedValue({
      data: [mockHistoryItem],
      total: 1,
    });

    const result = await controller.getResponsibilityHistory(mockUuid, 1, 20);

    expect(mockService.getResponsibilityHistory).toHaveBeenCalledWith(mockUuid, 1, 20);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(mockHistoryItem);
  });

  it('GET /:id/responsibility/history returns 200 without pagination', async () => {
    mockService.getResponsibilityHistory.mockResolvedValue({
      data: [mockHistoryItem],
      total: 1,
    });

    const result = await controller.getResponsibilityHistory(mockUuid);

    expect(mockService.getResponsibilityHistory).toHaveBeenCalledWith(
      mockUuid,
      undefined,
      undefined,
    );
    expect(result.data).toHaveLength(1);
  });

  it('Authorization: all CRM roles have access', () => {
    const crmRoles = [
      UserRole.ADMIN,
      UserRole.SALES,
      UserRole.SUPPORT,
      UserRole.TECHNICIAN,
      UserRole.PARTNER,
      PlatformRole.SYSTEM_ADMIN,
    ];

    const controllerPrototype = Object.getOwnPropertyDescriptors(
      ResponsibilitiesController.prototype,
    );

    expect(controllerPrototype.getResponsibility).toBeDefined();
    expect(controllerPrototype.updateResponsibility).toBeDefined();
    expect(controllerPrototype.getResponsibilityHistory).toBeDefined();

    const getResponsibilityRoles = Reflect.getMetadata('roles', controller.getResponsibility);
    const updateResponsibilityRoles = Reflect.getMetadata('roles', controller.updateResponsibility);
    const getHistoryRoles = Reflect.getMetadata('roles', controller.getResponsibilityHistory);

    expect(getResponsibilityRoles).toEqual(crmRoles);
    expect(updateResponsibilityRoles).toEqual(crmRoles);
    expect(getHistoryRoles).toEqual(crmRoles);
  });
});
