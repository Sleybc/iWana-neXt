import { MODULE_METADATA } from '@nestjs/common/constants';
import { Global, Module } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PrivacyModule } from './privacy.module';
import { PrivacyRequestsService } from './requests/requests.service';
import { CrmPrivacyAdaptersModule } from '../crm/privacy-adapters/crm-privacy-adapters.module';
import { PRIVACY_DUE_ALERTS_QUEUE } from './alerts/privacy-due-alerts.constants';
import { EVIDENCE_ANALYSIS_QUEUE } from '../media/evidence-asset.provider';
import { REDIS_CLIENT } from '../redis/redis.module';
import { MailerModule } from '../mailer/mailer.module';

const syntheticTestKey = Array.from({ length: 32 }, (_, index) =>
  (index + 1).toString(16).padStart(2, '0'),
).join('');
const testConfigValues: Record<string, string> = {
  NODE_ENV: 'test',
  MFA_ENCRYPTION_KEY: syntheticTestKey,
  PII_ENCRYPTION_KEY: syntheticTestKey,
  PII_HASH_KEY: syntheticTestKey,
};

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      useValue: {
        entityMetadatas: [],
        options: { type: 'postgres' },
        subscribers: [],
        getRepository: jest.fn().mockReturnValue({}),
      },
    },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string, defaultValue?: unknown) => testConfigValues[key] ?? defaultValue,
        getOrThrow: (key: string) => {
          const value = testConfigValues[key];
          if (!value) throw new Error(`Falta configuración de prueba: ${key}`);
          return value;
        },
      },
    },
    {
      provide: REDIS_CLIENT,
      useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
    },
  ],
  exports: [DataSource, ConfigService, REDIS_CLIENT],
})
class PrivacyModuleTestInfrastructureModule {}

describe('PrivacyModule composition', () => {
  it('registra las entidades, controladores, puertos y el único enlace a CRM', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, PrivacyModule) as unknown[];
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      PrivacyModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PrivacyModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, PrivacyModule) as unknown[];
    const crmReference = imports.find(
      (entry) => typeof entry === 'object' && entry !== null && 'forwardRef' in entry,
    ) as { forwardRef: () => unknown } | undefined;

    expect(imports).toHaveLength(6);
    expect(controllers).toHaveLength(8);
    expect(providers).toContain(PrivacyRequestsService);
    expect(exports).toContain(CrmPrivacyAdaptersModule);
    expect(
      imports.filter(
        (entry) => typeof entry === 'object' && entry !== null && 'forwardRef' in entry,
      ),
    ).toHaveLength(1);
    expect(crmReference?.forwardRef()).toBe(CrmPrivacyAdaptersModule);
  });

  it('compila PrivacyModule con sus imports reales', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrivacyModuleTestInfrastructureModule,
        EventEmitterModule.forRoot(),
        MailerModule,
        PrivacyModule,
      ],
    })
      .overrideProvider(getQueueToken(PRIVACY_DUE_ALERTS_QUEUE))
      .useValue({ add: jest.fn() })
      .overrideProvider(getQueueToken(EVIDENCE_ANALYSIS_QUEUE))
      .useValue({ add: jest.fn() })
      .compile();

    await moduleRef.close();
  });
});
