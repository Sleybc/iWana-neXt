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
    TenantContext: { getOrThrow: jest.fn() },
  };
});

import { MODULE_METADATA } from '@nestjs/common/constants';
import { CrmModule } from './crm.module';
import { ExpedientesModule } from './expedientes/expedientes.module';
import { ExecutionPolicyReadPort } from './ports/execution-policy-read.port';

describe('CrmModule', () => {
  it('expone la definicion del modulo CRM', () => {
    expect(CrmModule).toBeDefined();
  });

  it('registra servicios operativos base de MOD05', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CrmModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CrmModule) as Array<{
      provide?: unknown;
    }>;

    expect(imports).toContain(ExpedientesModule);
    expect(providers.some((provider) => provider.provide === ExecutionPolicyReadPort)).toBe(true);
  });
});
