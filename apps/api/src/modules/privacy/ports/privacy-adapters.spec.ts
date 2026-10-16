import { ServiceUnavailableException } from '@nestjs/common';
import * as privacyPorts from './index';
import * as requestPorts from '../requests';
import { ContractImpersonationUnavailableAdapter } from './unavailable-privacy-ports.adapters';
import { ContractStandingUnavailableAdapter } from '../requests/ports/unavailable-contract-standing.adapter';

describe('puertos y adaptadores no instalados de privacidad', () => {
  it('exporta los contratos del módulo y de solicitudes', () => {
    expect(privacyPorts.IPrivacyAuthorizationReadPort).toBeDefined();
    expect(privacyPorts.IPrivacyAuthorizationWritePort).toBeDefined();
    expect(privacyPorts.IPrivacyLegalTextReadPort).toBeDefined();
    expect(privacyPorts.IPrivacyMarksReadPort).toBeDefined();
    expect(privacyPorts.IPersonalDataErasurePort).toBeDefined();
    expect(requestPorts.IContractStandingReadPort).toBeDefined();
    expect(requestPorts.IPrivacyRequestsReadPort).toBeDefined();
  });

  it('falla en modo cerrado al invocar integraciones aún no instaladas', async () => {
    await expect(
      new ContractImpersonationUnavailableAdapter().suspendForImpersonation(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    await expect(new ContractStandingUnavailableAdapter().standing()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
