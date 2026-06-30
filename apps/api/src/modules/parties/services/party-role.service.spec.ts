import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PartyRoleStatus, PartyRoleType } from '@iwana/shared';
import { PartyRoleService } from './party-role.service';
import { PartyRole } from '../entities/party-role.entity';
import { AssignRoleDto } from '../dto/assign-role.dto';

// Mock TenantContext y runInTenantSchema antes de importar el servicio
jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ schemaName: 'tenant_test', tenantId: 'tid-001' }),
  },
  runInTenantSchema: jest.fn(),
}));

import { TenantContext, runInTenantSchema } from '@iwana/db';

describe('PartyRoleService', () => {
  let service: PartyRoleService;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQr: any;

  beforeEach(() => {
    mockQr = {
      manager: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: typeof mockQr) => Promise<unknown>) => fn(mockQr),
    );

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQr),
    } as unknown as jest.Mocked<DataSource>;

    service = new PartyRoleService(mockDataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Factory para PartyRole con datos ficticios. */
  function buildRole(overrides: Partial<PartyRole> = {}): PartyRole {
    return Object.assign(new PartyRole(), {
      id: 'role-uuid-001',
      partyId: 'party-uuid-001',
      role: PartyRoleType.CUSTOMER,
      status: PartyRoleStatus.ACTIVE,
      validFrom: new Date('2025-01-01'),
      validTo: null,
      createdBy: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      ...overrides,
    });
  }

  // ---------------------------------------------------------------------------
  describe('assign', () => {
    const partyId = 'party-uuid-001';
    const dto: AssignRoleDto = { role: PartyRoleType.CUSTOMER };

    it('crea rol nuevo ACTIVE cuando no existe previo', async () => {
      const newRole = buildRole();
      mockQr.manager.findOne.mockResolvedValue(null); // No existe rol previo
      mockQr.manager.create.mockReturnValue(newRole);
      mockQr.manager.save.mockResolvedValue(newRole);

      const result = await service.assign(partyId, dto);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(runInTenantSchema).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(PartyRole, {
        where: { partyId, role: dto.role },
      });
      expect(mockQr.manager.create).toHaveBeenCalledWith(
        PartyRole,
        expect.objectContaining({
          partyId,
          role: PartyRoleType.CUSTOMER,
          status: PartyRoleStatus.ACTIVE,
        }),
      );
      expect(mockQr.manager.save).toHaveBeenCalledWith(PartyRole, newRole);
      expect(result.status).toBe(PartyRoleStatus.ACTIVE);
    });

    it('lanza ConflictException si el rol ya está ACTIVE', async () => {
      const activeRole = buildRole({ status: PartyRoleStatus.ACTIVE });
      mockQr.manager.findOne.mockResolvedValue(activeRole);

      await expect(service.assign(partyId, dto)).rejects.toThrow(ConflictException);
      await expect(service.assign(partyId, dto)).rejects.toThrow(PartyRoleType.CUSTOMER);

      expect(mockQr.manager.create).not.toHaveBeenCalled();
      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });

    it('reactiva rol INACTIVE en lugar de duplicar', async () => {
      const inactiveRole = buildRole({ status: PartyRoleStatus.INACTIVE });
      mockQr.manager.findOne.mockResolvedValue(inactiveRole);
      mockQr.manager.save.mockResolvedValue({ ...inactiveRole, status: PartyRoleStatus.ACTIVE });

      const result = await service.assign(partyId, dto);

      expect(mockQr.manager.create).not.toHaveBeenCalled();
      expect(mockQr.manager.save).toHaveBeenCalledWith(PartyRole, inactiveRole);
      expect(inactiveRole.status).toBe(PartyRoleStatus.ACTIVE);
      expect(result.status).toBe(PartyRoleStatus.ACTIVE);
    });

    it('asigna validFrom y validTo del DTO cuando se proporcionan', async () => {
      const newRole = buildRole({
        validFrom: new Date('2025-06-01'),
        validTo: new Date('2026-06-01'),
      });
      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(newRole);
      mockQr.manager.save.mockResolvedValue(newRole);

      const dtoWithDates: AssignRoleDto = {
        role: PartyRoleType.SUPPLIER,
        validFrom: '2025-06-01',
        validTo: '2026-06-01',
      };

      await service.assign(partyId, dtoWithDates);

      expect(mockQr.manager.create).toHaveBeenCalledWith(
        PartyRole,
        expect.objectContaining({
          role: PartyRoleType.SUPPLIER,
          validFrom: new Date('2025-06-01'),
          validTo: new Date('2026-06-01'),
        }),
      );
    });

    it('usa validFrom=now cuando no se proporciona fecha', async () => {
      const newRole = buildRole();
      mockQr.manager.findOne.mockResolvedValue(null);
      mockQr.manager.create.mockReturnValue(newRole);
      mockQr.manager.save.mockResolvedValue(newRole);

      await service.assign(partyId, { role: PartyRoleType.EMPLOYEE });

      expect(mockQr.manager.create).toHaveBeenCalledWith(
        PartyRole,
        expect.objectContaining({
          validTo: null,
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('deactivate', () => {
    const partyId = 'party-uuid-001';
    const roleId = 'role-uuid-001';

    it('desactiva rol existente y fija validTo=now', async () => {
      const role = buildRole({ status: PartyRoleStatus.ACTIVE });
      mockQr.manager.findOne.mockResolvedValue(role);
      mockQr.manager.save.mockResolvedValue({ ...role, status: PartyRoleStatus.INACTIVE });

      const result = await service.deactivate(partyId, roleId);

      expect(TenantContext.getOrThrow).toHaveBeenCalled();
      expect(mockQr.manager.findOne).toHaveBeenCalledWith(PartyRole, {
        where: { id: roleId, partyId },
      });
      expect(role.status).toBe(PartyRoleStatus.INACTIVE);
      expect(role.validTo).toBeInstanceOf(Date);
      expect(mockQr.manager.save).toHaveBeenCalledWith(PartyRole, role);
      expect(result.status).toBe(PartyRoleStatus.INACTIVE);
    });

    it('lanza NotFoundException si el rol no existe para ese party', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.deactivate(partyId, 'nonexistent-role')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deactivate(partyId, 'nonexistent-role')).rejects.toThrow(
        'nonexistent-role',
      );

      expect(mockQr.manager.save).not.toHaveBeenCalled();
    });
  });
});
