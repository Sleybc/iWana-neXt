import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AcquisitionChannel, UserRole } from '@iwana/shared';
import { AttributionsService } from '../attributions.service';
import { SalesAttribution } from '../entities/sales-attribution.entity';

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

describe('AttributionsService', () => {
  let service: AttributionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AttributionsService, { provide: DataSource, useValue: {} }],
    }).compile();

    service = module.get<AttributionsService>(AttributionsService);
  });

  it('crea atribución activa cuando no existe una previa', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ id: 'exp-1' })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'actor-1', firstName: 'Ana', lastName: 'Perez', email: 'h' }),
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            id: 'attr-1',
            ...data,
          }),
        },
      }),
    );

    const created = await service.createAttribution(
      'exp-1',
      {
        actorId: 'actor-1',
        actorRole: UserRole.SALES,
        acquisitionChannel: AcquisitionChannel.WEB,
        notes: 'Origen web',
      },
      'admin-1',
    );

    expect(created.id).toBe('attr-1');
    expect(created.expedienteId).toBe('exp-1');
    expect(created.acquisitionChannel).toBe(AcquisitionChannel.WEB);
    expect(created.attributionRole).toBe('ORIGINATOR');
  });

  it('exige motivo al reatribuir cuando ya existe atribución activa', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ id: 'exp-1' })
            .mockResolvedValueOnce({ id: 'attr-active' }),
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({ id: 'attr-2', ...data }),
        },
      }),
    );

    await expect(
      service.createAttribution(
        'exp-1',
        {
          actorId: 'actor-1',
          actorRole: UserRole.SALES,
          acquisitionChannel: AcquisitionChannel.WEB,
        },
        'admin-1',
      ),
    ).rejects.toThrow('reatribución exige motivo');
  });

  it('revoca atribución activa y conserva historial', async () => {
    const activeAttribution: SalesAttribution = {
      id: 'attr-1',
      tenantId: 'ten-1',
      expedienteId: 'exp-1',
      attributionRole: 'ORIGINATOR',
      actorId: 'actor-1',
      actorRole: 'SALES',
      actorName: 'Ana Perez',
      acquisitionChannel: 'WEB',
      notes: null,
      attributedAt: new Date(),
      attributedBy: 'admin-1',
      revokedAt: null,
      revokedBy: null,
      revokedReason: null,
      createdAt: new Date(),
      expediente: {} as never,
    };

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: jest.fn().mockResolvedValue(activeAttribution),
          save: async (_entity: unknown, data: SalesAttribution) => data,
        },
      }),
    );

    const revoked = await service.revokeAttribution('exp-1', 'Ajuste operativo', 'admin-1');

    expect(revoked.revokedBy).toBe('admin-1');
    expect(revoked.revokedReason).toBe('Ajuste operativo');
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });
});
