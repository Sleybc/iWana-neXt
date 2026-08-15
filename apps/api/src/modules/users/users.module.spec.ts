jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));

jest.mock('otplib', () => ({
  TOTP: jest.fn(),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: jest.fn(),
    TenantContext: { getOrThrow: jest.fn(), run: jest.fn(), get: jest.fn() },
  };
});

import { MODULE_METADATA } from '@nestjs/common/constants';
import { UsersModule } from './users.module';
import { UsersController } from './users.controller';
import { UsersBulkController } from './users-bulk.controller';
import { UsersBulkCreateProcessor } from './users-bulk-create.processor';
import { SettingsPriorityUsersReadPort } from './ports/settings-priority-users-read.port';
import { UsersService } from './users.service';

/**
 * Ola E de MOD04 — cableado del modulo de usuarios.
 *
 * El consumidor del alta masiva vive en `@iwana/api` y no en `@iwana/worker`
 * (deuda declarada en el propio procesador). Si dejara de estar registrado
 * aqui, los lotes se encolarian y nadie los procesaria: el sintoma seria un job
 * eternamente en `queued`, no un error. De ahi la asercion explicita.
 */
describe('UsersModule', () => {
  it('expone los dos controladores de la superficie de usuarios', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, UsersModule) as unknown[];

    expect(controllers).toContain(UsersController);
    expect(controllers).toContain(UsersBulkController);
  });

  it('INVARIANTE: registra el consumidor del alta masiva junto al servicio', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, UsersModule) as unknown[];

    expect(providers).toContain(UsersService);
    expect(providers).toContain(UsersBulkCreateProcessor);
  });

  it('exporta servicio y puerto de lectura; el procesador no cruza el boundary', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, UsersModule) as unknown[];

    expect(exports).toEqual([UsersService, SettingsPriorityUsersReadPort]);
    expect(exports).not.toContain(UsersBulkCreateProcessor);
  });
});
