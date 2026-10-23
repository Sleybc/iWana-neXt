import { TenantContext } from '@iwana/db';
import { ExpedienteStatus, SubscriberStatus } from '@iwana/shared';
import { NetworkActivationListenerError } from '../../../network/events/network-activation-listener.error';
import { ServiceProvisioningActivatedEvent } from '../../../network/events/service-provisioning-activated.event';
import { ServiceProvisioningActivationListener } from './service-provisioning-activation.listener';

describe('ServiceProvisioningActivationListener', () => {
  const context = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    tenantSlug: 'mod13-crm-test',
    schemaName: 'tenant_mod13_crm_test',
  };
  const event = () =>
    new ServiceProvisioningActivatedEvent(
      context.tenantId,
      context.schemaName,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      null,
      '55555555-5555-4555-8555-555555555555',
      null,
    );

  let expedienteService: { transitionStatus: jest.Mock };
  let subscribersService: { findByExpedienteId: jest.Mock };
  let commercialStatusPort: { record: jest.Mock };
  let listener: ServiceProvisioningActivationListener;

  beforeEach(() => {
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
    expedienteService = { transitionStatus: jest.fn().mockResolvedValue(undefined) };
    subscribersService = { findByExpedienteId: jest.fn() };
    commercialStatusPort = { record: jest.fn().mockResolvedValue(undefined) };
    listener = new ServiceProvisioningActivationListener(
      expedienteService as never,
      subscribersService as never,
      commercialStatusPort as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('registra el motivo NO_EXPEDIENTE cuando el evento no tiene expediente', async () => {
    const withoutExpediente = new ServiceProvisioningActivatedEvent(
      context.tenantId,
      context.schemaName,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      null,
      null,
      '55555555-5555-4555-8555-555555555555',
      null,
    );

    await listener.handle(withoutExpediente);

    expect(commercialStatusPort.record).toHaveBeenCalledWith(
      withoutExpediente.serviceProvisioningId,
      'BLOCKED',
      'NO_EXPEDIENTE',
    );
    expect(expedienteService.transitionStatus).not.toHaveBeenCalled();
  });

  it('activa el expediente y registra DONE para un suscriptor activo con contacto', async () => {
    const activation = event();
    subscribersService.findByExpedienteId.mockResolvedValue({
      status: SubscriberStatus.ACTIVE,
      emailEncrypted: 'fixture-ciphertext',
      phoneEncrypted: null,
    });

    await listener.handle(activation);

    expect(expedienteService.transitionStatus).toHaveBeenCalledWith(
      activation.expedienteId,
      { targetStatus: ExpedienteStatus.CLIENTE_ACTIVO },
      'network-worker',
    );
    expect(commercialStatusPort.record).toHaveBeenCalledWith(
      activation.serviceProvisioningId,
      'DONE',
      null,
    );
  });

  it.each([
    ['sin suscriptor', null],
    [
      'sin contacto real',
      { status: SubscriberStatus.PROSPECT, emailEncrypted: null, phoneEncrypted: null },
    ],
  ])('registra CONTACT_REQUIRED cuando queda %s', async (_label, subscriber) => {
    const activation = event();
    subscribersService.findByExpedienteId.mockResolvedValue(subscriber);

    await listener.handle(activation);

    expect(commercialStatusPort.record).toHaveBeenCalledWith(
      activation.serviceProvisioningId,
      'BLOCKED',
      'CONTACT_REQUIRED',
    );
  });

  it('registra FISCAL_INCOMPLETE si el suscriptor conserva contacto pero no está activo', async () => {
    const activation = event();
    subscribersService.findByExpedienteId.mockResolvedValue({
      status: SubscriberStatus.PROSPECT,
      emailEncrypted: 'fixture-ciphertext',
      phoneEncrypted: null,
    });

    await listener.handle(activation);

    expect(commercialStatusPort.record).toHaveBeenCalledWith(
      activation.serviceProvisioningId,
      'BLOCKED',
      'FISCAL_INCOMPLETE',
    );
  });

  it('convierte el error de completitud de contacto del expediente en CONTACT_REQUIRED', async () => {
    const activation = event();
    expedienteService.transitionStatus.mockRejectedValue({
      response: { code: 'EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED' },
    });

    await listener.handle(activation);

    expect(subscribersService.findByExpedienteId).not.toHaveBeenCalled();
    expect(commercialStatusPort.record).toHaveBeenCalledWith(
      activation.serviceProvisioningId,
      'BLOCKED',
      'CONTACT_REQUIRED',
    );
  });

  it('propaga el código de activación al fallar un puerto comercial', async () => {
    const activation = new ServiceProvisioningActivatedEvent(
      context.tenantId,
      context.schemaName,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      null,
      null,
      '55555555-5555-4555-8555-555555555555',
      null,
    );
    commercialStatusPort.record.mockRejectedValue(new Error('fixture failure'));

    await expect(listener.handle(activation)).rejects.toMatchObject({
      code: 'CRM_LISTENER_FAILED',
    });
  });

  it('envuelve en CRM_LISTENER_FAILED una transición no clasificada', async () => {
    expedienteService.transitionStatus.mockRejectedValue(new Error('fixture failure'));

    await expect(listener.handle(event())).rejects.toMatchObject({ code: 'CRM_LISTENER_FAILED' });
  });
});
