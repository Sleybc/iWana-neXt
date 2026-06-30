import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PartyRoleService } from '../../../parties/services/party-role.service';
import { PartyRoleType, PartyRoleStatus } from '@iwana/shared';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

/**
 * Tests de integración (mock completo) — Party multi-rol (ADR-030).
 *
 * Verifica que un Party puede acumular múltiples roles sin conflicto,
 * y que el ConflictException solo ocurre al asignar el mismo rol activo dos veces.
 *
 * Ref: ADR-030 §Multi-rol, HLD-MOD08-PARTIES-v1.0 §4
 */
describe('Party multi-rol — ADR-030', () => {
  let partyRoleService: PartyRoleService;
  let mockManager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const PARTY_ID = 'party-test-uuid';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      schemaName: 'tenant_test',
      tenantId: 'tenant-001',
    });

    mockManager = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    // runInTenantSchema ejecuta el callback con un QueryRunner mockeado
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({ manager: mockManager }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [PartyRoleService, { provide: DataSource, useValue: {} }],
    }).compile();

    partyRoleService = module.get<PartyRoleService>(PartyRoleService);
  });

  describe('asignación de rol CUSTOMER', () => {
    it('crea un nuevo rol CUSTOMER en un Party sin roles previos', async () => {
      // No existe rol previo
      mockManager.findOne.mockResolvedValue(null);
      mockManager.create.mockReturnValue({
        id: 'role-customer-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.CUSTOMER,
        status: PartyRoleStatus.ACTIVE,
        validFrom: new Date(),
        validTo: null,
      });
      mockManager.save.mockResolvedValue({
        id: 'role-customer-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.CUSTOMER,
        status: PartyRoleStatus.ACTIVE,
      });

      const result = await partyRoleService.assign(PARTY_ID, {
        role: PartyRoleType.CUSTOMER,
        validFrom: new Date().toISOString(),
      });

      expect(result.role).toBe(PartyRoleType.CUSTOMER);
      expect(result.status).toBe(PartyRoleStatus.ACTIVE);
      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    it('lanza ConflictException si el rol CUSTOMER ya está activo', async () => {
      // Rol CUSTOMER ya activo
      mockManager.findOne.mockResolvedValue({
        id: 'existing-role-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.CUSTOMER,
        status: PartyRoleStatus.ACTIVE,
      });

      await expect(
        partyRoleService.assign(PARTY_ID, { role: PartyRoleType.CUSTOMER }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('asignación de rol SUPPLIER (multi-rol)', () => {
    it('NO lanza ConflictException al asignar SUPPLIER a un Party que ya tiene CUSTOMER', async () => {
      // findOne retorna null para SUPPLIER (solo compara por role)
      mockManager.findOne.mockResolvedValue(null);
      mockManager.create.mockReturnValue({
        id: 'role-supplier-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.SUPPLIER,
        status: PartyRoleStatus.ACTIVE,
        validFrom: new Date(),
        validTo: null,
      });
      mockManager.save.mockResolvedValue({
        id: 'role-supplier-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.SUPPLIER,
        status: PartyRoleStatus.ACTIVE,
      });

      // Debe completar sin error
      const result = await partyRoleService.assign(PARTY_ID, {
        role: PartyRoleType.SUPPLIER,
      });

      expect(result.role).toBe(PartyRoleType.SUPPLIER);
      expect(result.status).toBe(PartyRoleStatus.ACTIVE);
      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    it('busca por (partyId, role) específico — no interfiere con otros roles del mismo Party', async () => {
      // El findOne sólo filtra por (partyId, role) — no por el partido completo
      // Si SUPPLIER no existe pero CUSTOMER sí, no debe haber conflicto
      mockManager.findOne.mockResolvedValue(null); // SUPPLIER no existe
      mockManager.create.mockReturnValue({
        id: 'role-supplier-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.SUPPLIER,
        status: PartyRoleStatus.ACTIVE,
      });
      mockManager.save.mockResolvedValue({
        id: 'role-supplier-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.SUPPLIER,
        status: PartyRoleStatus.ACTIVE,
      });

      await partyRoleService.assign(PARTY_ID, { role: PartyRoleType.SUPPLIER });

      // Verificar que buscó por partyId + role SUPPLIER específicamente
      expect(mockManager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: expect.objectContaining({
            partyId: PARTY_ID,
            role: PartyRoleType.SUPPLIER,
          }),
        }),
      );
    });
  });

  describe('reactivación de rol inactivo', () => {
    it('reactiva un rol CUSTOMER inactivo en lugar de duplicar', async () => {
      // Rol CUSTOMER existe pero está INACTIVE
      const inactiveRole = {
        id: 'inactive-role-uuid',
        partyId: PARTY_ID,
        role: PartyRoleType.CUSTOMER,
        status: PartyRoleStatus.INACTIVE,
        validFrom: new Date(),
        validTo: new Date(),
      };
      mockManager.findOne.mockResolvedValue(inactiveRole);
      mockManager.save.mockResolvedValue({
        ...inactiveRole,
        status: PartyRoleStatus.ACTIVE,
      });

      const result = await partyRoleService.assign(PARTY_ID, {
        role: PartyRoleType.CUSTOMER,
      });

      // Debe reactivar, no duplicar
      expect(result.status).toBe(PartyRoleStatus.ACTIVE);
      expect(mockManager.create).not.toHaveBeenCalled(); // No crea nuevo
      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('mapeo de tipos de rol', () => {
    it('acepta CUSTOMER como PartyRoleType válido', async () => {
      mockManager.findOne.mockResolvedValue(null);
      mockManager.create.mockReturnValue({
        id: 'r1',
        role: PartyRoleType.CUSTOMER,
        status: PartyRoleStatus.ACTIVE,
        validFrom: new Date(),
      });
      mockManager.save.mockResolvedValue({
        id: 'r1',
        role: PartyRoleType.CUSTOMER,
        status: PartyRoleStatus.ACTIVE,
      });

      const result = await partyRoleService.assign(PARTY_ID, { role: PartyRoleType.CUSTOMER });
      expect(result.role).toBe('CUSTOMER');
    });

    it('acepta SUPPLIER como PartyRoleType válido', async () => {
      mockManager.findOne.mockResolvedValue(null);
      mockManager.create.mockReturnValue({
        id: 'r2',
        role: PartyRoleType.SUPPLIER,
        status: PartyRoleStatus.ACTIVE,
        validFrom: new Date(),
      });
      mockManager.save.mockResolvedValue({
        id: 'r2',
        role: PartyRoleType.SUPPLIER,
        status: PartyRoleStatus.ACTIVE,
      });

      const result = await partyRoleService.assign(PARTY_ID, { role: PartyRoleType.SUPPLIER });
      expect(result.role).toBe('SUPPLIER');
    });
  });
});
