import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PlatformRole } from '@iwana/shared';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformOnlyGuard } from '../auth/guards/platform-only.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformHealthController } from './platform-health.controller';

describe('PlatformHealthController', () => {
  it('exige JWT, roles y token de plataforma; no es público', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlatformHealthController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
      PlatformOnlyGuard,
    ]);
    const handler = PlatformHealthController.prototype.getHistory;
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      PlatformRole.SYSTEM_ADMIN,
      PlatformRole.IWANA_SUPPORT,
    ]);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PlatformHealthController)).toBeUndefined();
  });

  it('envuelve la historia en { data }', async () => {
    const history = { days: [], queues: [], queuesSampledAt: null, generatedAt: 'x' };
    const controller = new PlatformHealthController({
      getHistory: jest.fn().mockResolvedValue(history),
    } as never);
    await expect(controller.getHistory()).resolves.toEqual({ data: history });
  });
});
