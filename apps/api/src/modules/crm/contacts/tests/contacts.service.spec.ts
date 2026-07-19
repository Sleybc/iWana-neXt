import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ContactsService } from '../contacts.service';

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

describe('ContactsService', () => {
  let service: ContactsService;

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 'ten-1', schemaName: 'tenant_test' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: DataSource, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest
              .fn()
              .mockReturnValue('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
          },
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  it('crea contacto asociado a suscriptor', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...data,
            id: 'cnt-1',
          }),
        },
      }),
    );

    const created = await service.create('sub-1', {
      fullName: 'Maria Lopez',
      email: 'maria@test.com',
      phone: '3001112233',
    });

    expect(created.id).toBe('cnt-1');
    expect(created.subscriberId).toBe('sub-1');
  });
});
