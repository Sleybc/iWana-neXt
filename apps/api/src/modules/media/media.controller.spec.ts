import { Test, TestingModule } from '@nestjs/testing';
import { TenantContext } from '@iwana/db';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController', () => {
  let controller: MediaController;

  const user = {
    sub: 'user-001',
    email: 'hash',
    role: 'ADMIN',
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant' as const,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: { upload: jest.fn() } }],
    }).compile();
    controller = module.get(MediaController);
  });

  it('rechaza operación cuando falta el contexto de tenant', async () => {
    await expect(
      controller.getSignedUrl(user, '00000000-0000-0000-0000-000000000001'),
    ).rejects.toThrow();
  });

  it('rechaza contexto que no coincide con claims de tenant verificados', async () => {
    await expect(
      TenantContext.run(
        { tenantId: 'tenant-002', schemaName: 'tenant_002', tenantSlug: 'other' },
        () => controller.getSignedUrl(user, '00000000-0000-0000-0000-000000000001'),
      ),
    ).rejects.toThrow('no coincide con el token');
  });
});
