// MOD05 Cierre de venta · bloque F (ADR-109 D3, CA-5): con servicio aprovisionado y contrato
// en DRAFT (sin firma) la activación comercial queda BLOCKED con CONTRACT_UNSIGNED.
import { TenantContext } from '@iwana/db';
import { SubscriberStatus } from '@iwana/shared';
import { ServiceProvisioningActivatedEvent } from '../../../network/events/service-provisioning-activated.event';
import { NetworkActivationListenerError } from '../../../network/events/network-activation-listener.error';
import { ServiceProvisioningActivationListener } from './service-provisioning-activation.listener';

const context = {
  tenantId: '11111111-1111-4111-8111-1111111111bb',
  tenantSlug: 'f-cierre-venta',
  schemaName: 'tenant_f_cierre_venta',
};
const PROVISIONING_ID = '22222222-2222-4222-8222-2222222222bb';
const CONTRACT_ID = '66666666-6666-4666-8666-6666666666bb';

function activation(contractId: string | null = CONTRACT_ID) {
  return new ServiceProvisioningActivatedEvent(
    context.tenantId,
    context.schemaName,
    PROVISIONING_ID,
    '33333333-3333-4333-8333-3333333333bb',
    '44444444-4444-4444-8444-4444444444bb',
    contractId,
    '55555555-5555-4555-8555-5555555555bb',
    null,
  );
}

const activeWithContact = {
  status: SubscriberStatus.ACTIVE,
  emailEncrypted: 'ciphertext-ficticio',
  phoneEncrypted: null,
};

describe('Listener de aprovisionamiento — CONTRACT_UNSIGNED', () => {
  let subscribersService: { findByExpedienteId: jest.Mock };
  let port: { record: jest.Mock };
  let pendingSignature: { isContractUnsigned: jest.Mock };
  let listener: ServiceProvisioningActivationListener;

  beforeEach(() => {
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
    subscribersService = { findByExpedienteId: jest.fn().mockResolvedValue(activeWithContact) };
    port = { record: jest.fn().mockResolvedValue(undefined) };
    pendingSignature = { isContractUnsigned: jest.fn().mockResolvedValue(true) };
    listener = new ServiceProvisioningActivationListener(
      { transitionStatus: jest.fn().mockResolvedValue(undefined) } as never,
      subscribersService as never,
      port as never,
      pendingSignature as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('contrato en DRAFT: BLOCKED con CONTRACT_UNSIGNED y un solo registro', async () => {
    await listener.handle(activation());

    expect(pendingSignature.isContractUnsigned).toHaveBeenCalledWith(CONTRACT_ID);
    expect(port.record).toHaveBeenCalledTimes(1);
    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'BLOCKED', 'CONTRACT_UNSIGNED');
  });

  it('contrato firmado: DONE', async () => {
    pendingSignature.isContractUnsigned.mockResolvedValue(false);

    await listener.handle(activation());

    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'DONE', null);
  });

  it('sin contrato en el evento: DONE sin consultar la firma', async () => {
    await listener.handle(activation(null));

    expect(pendingSignature.isContractUnsigned).not.toHaveBeenCalled();
    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'DONE', null);
  });

  it('los datos fiscales incompletos prevalecen sobre la firma', async () => {
    subscribersService.findByExpedienteId.mockResolvedValue({
      ...activeWithContact,
      status: SubscriberStatus.PROSPECT,
    });

    await listener.handle(activation());

    expect(pendingSignature.isContractUnsigned).not.toHaveBeenCalled();
    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'BLOCKED', 'FISCAL_INCOMPLETE');
  });

  it('un fallo al leer el contrato se envuelve como NetworkActivationListenerError', async () => {
    pendingSignature.isContractUnsigned.mockRejectedValue(new Error('db caída'));

    await expect(listener.handle(activation())).rejects.toBeInstanceOf(
      NetworkActivationListenerError,
    );
    expect(port.record).not.toHaveBeenCalled();
  });
});
