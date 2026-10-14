import { MODULE_METADATA } from '@nestjs/common/constants';
import { PrivacyModule } from './privacy.module';
import { PrivacyRequestsService } from './requests/requests.service';
import { CrmPrivacyAdaptersModule } from '../crm/privacy-adapters/crm-privacy-adapters.module';

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
});
