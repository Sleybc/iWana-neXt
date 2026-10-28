jest.mock('../auth/auth.module', () => ({ AuthModule: class AuthModule {} }));
jest.mock('../access-control/access-control.module', () => ({
  AccessControlModule: class AccessControlModule {},
}));
jest.mock('../organization/organization.module', () => ({
  OrganizationModule: class OrganizationModule {},
}));
jest.mock('../tenant/tenant.module', () => ({ TenantModule: class TenantModule {} }));
jest.mock('../audit/audit.module', () => ({ AuditModule: class AuditModule {} }));
jest.mock('../tasks/execution-order-scheduling.module', () => ({
  ExecutionOrderSchedulingModule: class ExecutionOrderSchedulingModule {},
}));
jest.mock('../crm/subscribers/subscriber-service-context-read.module', () => ({
  SubscriberServiceContextReadModule: class SubscriberServiceContextReadModule {},
}));
jest.mock('../inventory/ports/installed-equipment-read.module', () => ({
  InstalledEquipmentReadModule: class InstalledEquipmentReadModule {},
}));

import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { createAppConfigurationSchema } from '../../app.config';
import { NetworkModule } from './network.module';
import { NETWORK_IP_PROTECTION_STATUS, type IpProtectionStatus } from './ip-protection-status';
import { NETWORK_RESERVATIONS_PAUSED } from './network-reservations-state';

const NETWORK_IP_PROTECTION = 'NETWORK_IP_PROTECTION';

type RuntimeConfigProvider = {
  provide: unknown;
  useFactory?: (config: ConfigService) => unknown;
};

const DEVELOPMENT_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  DB_NAME: 'iwana_test',
  DB_USER: 'iwana_test',
  DB_PASSWORD: '',
  REDIS_PASSWORD: 'test-only-redis-password',
  JWT_PRIVATE_KEY: 'test-only-private-key-material',
  JWT_PUBLIC_KEY: 'test-only-public-key-material',
  EXECUTION_ORDER_IDEMPOTENCY_SECRET: '0123456789abcdef0123456789abcdef',
  MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
  PII_HASH_KEY: 'fedcba9876543210'.repeat(4),
};

async function resolveProviderFromConfig(
  environmentKey: string,
  providerToken: string,
  rawValue: string | undefined,
): Promise<{ configValue: unknown; providerValue: unknown }> {
  const originalEnv = { ...process.env };
  let moduleRef: TestingModule | null = null;

  try {
    for (const key of Object.keys(process.env)) {
      if (
        !(key in DEVELOPMENT_ENV) &&
        key !== NETWORK_RESERVATIONS_PAUSED &&
        key !== NETWORK_IP_PROTECTION
      ) {
        continue;
      }
      delete process.env[key];
    }
    Object.assign(process.env, DEVELOPMENT_ENV);
    if (rawValue === undefined) {
      delete process.env[environmentKey];
    } else {
      process.env[environmentKey] = rawValue;
    }

    const configModule = await ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validationSchema: createAppConfigurationSchema(),
      validationOptions: { abortEarly: false },
    });
    moduleRef = await Test.createTestingModule({ imports: [configModule] }).compile();

    const config = moduleRef.get(ConfigService);
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      NetworkModule,
    ) as RuntimeConfigProvider[];
    const provider = providers.find((entry) => entry.provide === providerToken);
    if (!provider?.useFactory) {
      throw new Error(`No se encontró el provider de ${providerToken}.`);
    }

    return {
      configValue: config.get(environmentKey),
      providerValue: provider.useFactory(config),
    };
  } finally {
    await moduleRef?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  }
}

function resolveReservationsPausedFromConfig(rawValue: string | undefined) {
  return resolveProviderFromConfig(
    NETWORK_RESERVATIONS_PAUSED,
    NETWORK_RESERVATIONS_PAUSED,
    rawValue,
  );
}

function resolveIpProtectionFromConfig(rawValue: string | undefined) {
  return resolveProviderFromConfig(NETWORK_IP_PROTECTION, NETWORK_IP_PROTECTION_STATUS, rawValue);
}

describe('NETWORK_RESERVATIONS_PAUSED — bootstrap y provider de NetworkModule', () => {
  it.each([
    ['true', true],
    ['false', false],
    [undefined, false],
  ] as const)('lee %s desde ConfigModule y lo conecta al provider', async (rawValue, expected) => {
    const result = await resolveReservationsPausedFromConfig(rawValue);

    expect(result.configValue).toBe(expected);
    expect(result.providerValue).toBe(expected);
  });

  it('rechaza valores inválidos durante el bootstrap de ConfigModule', async () => {
    await expect(resolveReservationsPausedFromConfig('enabled')).rejects.toThrow(
      /NETWORK_RESERVATIONS_PAUSED/,
    );
  });
});

describe('NETWORK_IP_PROTECTION — bootstrap y provider de NetworkModule', () => {
  it.each([
    ['ACTIVE', 'ACTIVE'],
    ['PENDING', 'PENDING'],
    [undefined, 'PENDING'],
  ] as const)('lee %s desde ConfigModule y lo conecta al provider', async (rawValue, expected) => {
    const result = await resolveIpProtectionFromConfig(rawValue);

    expect(result.configValue).toBe(expected);
    expect(result.providerValue).toBe(expected satisfies IpProtectionStatus);
  });

  it('rechaza valores inválidos durante el bootstrap de ConfigModule', async () => {
    await expect(resolveIpProtectionFromConfig('enabled')).rejects.toThrow(/NETWORK_IP_PROTECTION/);
  });
});
