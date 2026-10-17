import { MODULE_METADATA } from '@nestjs/common/constants';
import { SubscribersModule } from '../subscribers.module';
import { SubscriberFiscalCompletenessService } from '../subscriber-fiscal-completeness.service';

describe('SubscribersModule', () => {
  it('registra y exporta el servicio de completitud fiscal', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SubscribersModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SubscribersModule) as unknown[];

    expect(providers).toContain(SubscriberFiscalCompletenessService);
    expect(exports).toContain(SubscriberFiscalCompletenessService);
  });
});
