// MOD05 Cierre de venta · W0 · Inventario de no regresión de los motivos comerciales (AI-SR-QA).
//
// Fija los motivos ACTUALES de `commercialActivationStatus` que registra el listener de
// aprovisionamiento (spec H4, ADR-098 D8). El bloque F agrega `CONTRACT_UNSIGNED`: este
// inventario no limita el catálogo a estos tres valores; exige que cada uno siga saliendo
// en su caso y que el adaptador los persista y audite.
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ExpedienteStatus, SubscriberStatus } from '@iwana/shared';
import { ServiceProvisioningActivatedEvent } from '../../../network/events/service-provisioning-activated.event';
import { NetworkActivationListenerError } from '../../../network/events/network-activation-listener.error';
import { ServiceProvisioningCommercialStatusAdapter } from '../../../network/adapters/service-provisioning-commercial-status.adapter';
import type { ServiceProvisioningCommercialStatusDetail } from '../../ports/service-provisioning-commercial-status.port';
import { ServiceProvisioningActivationListener } from './service-provisioning-activation.listener';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
}));

const context = {
  tenantId: '11111111-1111-4111-8111-1111111111aa',
  tenantSlug: 'w0-cierre-venta',
  schemaName: 'tenant_w0_cierre_venta',
};
const PROVISIONING_ID = '22222222-2222-4222-8222-2222222222aa';
const EXPEDIENTE_ID = '44444444-4444-4444-8444-4444444444aa';

function activation(expedienteId: string | null = EXPEDIENTE_ID) {
  return new ServiceProvisioningActivatedEvent(
    context.tenantId,
    context.schemaName,
    PROVISIONING_ID,
    '33333333-3333-4333-8333-3333333333aa',
    expedienteId,
    '66666666-6666-4666-8666-6666666666aa',
    '55555555-5555-4555-8555-5555555555aa',
    null,
  );
}

const withContact = { emailEncrypted: 'ciphertext-ficticio', phoneEncrypted: null };

describe('W0 listener de aprovisionamiento — motivos de commercialActivationStatus', () => {
  let expedienteService: { transitionStatus: jest.Mock };
  let subscribersService: { findByExpedienteId: jest.Mock };
  let port: { record: jest.Mock };
  let listener: ServiceProvisioningActivationListener;

  beforeEach(() => {
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
    expedienteService = { transitionStatus: jest.fn().mockResolvedValue(undefined) };
    subscribersService = { findByExpedienteId: jest.fn() };
    port = { record: jest.fn().mockResolvedValue(undefined) };
    listener = new ServiceProvisioningActivationListener(
      expedienteService as never,
      subscribersService as never,
      port as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('NO_EXPEDIENTE: sin expediente queda BLOCKED y no toca CRM', async () => {
    await listener.handle(activation(null));

    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'BLOCKED', 'NO_EXPEDIENTE');
    expect(expedienteService.transitionStatus).not.toHaveBeenCalled();
  });

  it('CONTACT_REQUIRED: el expediente rechaza CLIENTE_ACTIVO por falta de contacto', async () => {
    expedienteService.transitionStatus.mockRejectedValue({
      response: { code: 'EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED' },
    });

    await listener.handle(activation());

    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'BLOCKED', 'CONTACT_REQUIRED');
  });

  it('CONTACT_REQUIRED: el suscriptor del expediente no tiene contacto real', async () => {
    subscribersService.findByExpedienteId.mockResolvedValue({
      status: SubscriberStatus.ACTIVE,
      emailEncrypted: null,
      phoneEncrypted: null,
    });

    await listener.handle(activation());

    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'BLOCKED', 'CONTACT_REQUIRED');
  });

  it('FISCAL_INCOMPLETE: con contacto pero suscriptor no activo', async () => {
    subscribersService.findByExpedienteId.mockResolvedValue({
      status: SubscriberStatus.PROSPECT,
      ...withContact,
    });

    await listener.handle(activation());

    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'BLOCKED', 'FISCAL_INCOMPLETE');
  });

  it('DONE: pasa el expediente a CLIENTE_ACTIVO como network-worker y no deja motivo', async () => {
    subscribersService.findByExpedienteId.mockResolvedValue({
      status: SubscriberStatus.ACTIVE,
      ...withContact,
    });

    await listener.handle(activation());

    expect(expedienteService.transitionStatus).toHaveBeenCalledWith(
      EXPEDIENTE_ID,
      { targetStatus: ExpedienteStatus.CLIENTE_ACTIVO },
      'network-worker',
    );
    expect(port.record).toHaveBeenCalledWith(PROVISIONING_ID, 'DONE', null);
  });

  it('registra exactamente un estado por activación', async () => {
    subscribersService.findByExpedienteId.mockResolvedValue({
      status: SubscriberStatus.PROSPECT,
      ...withContact,
    });

    await listener.handle(activation());

    expect(port.record).toHaveBeenCalledTimes(1);
  });

  it('un evento de otro tenant falla con NetworkActivationListenerError y no registra nada', async () => {
    const foreign = new ServiceProvisioningActivatedEvent(
      '99999999-9999-4999-8999-9999999999aa',
      'tenant_otro',
      PROVISIONING_ID,
      '33333333-3333-4333-8333-3333333333aa',
      EXPEDIENTE_ID,
      null,
      '55555555-5555-4555-8555-5555555555aa',
      null,
    );

    await expect(listener.handle(foreign)).rejects.toBeInstanceOf(NetworkActivationListenerError);
    expect(port.record).not.toHaveBeenCalled();
  });
});

describe('W0 adaptador de estado comercial — persiste y audita cada motivo actual', () => {
  const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each<ServiceProvisioningCommercialStatusDetail>([
    'NO_EXPEDIENTE',
    'CONTACT_REQUIRED',
    'FISCAL_INCOMPLETE',
  ])('BLOCKED con %s queda guardado con versión nueva y auditoría', async (detail) => {
    const service = {
      id: PROVISIONING_ID,
      tenantId: context.tenantId,
      commercialActivationStatus: 'PENDING',
      commercialActivationDetail: null,
      version: 3,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(service),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    };
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ manager } as never),
    );
    const auditService = { logWithin: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ServiceProvisioningCommercialStatusAdapter(
      {} as never,
      auditService as never,
    );

    await adapter.record(PROVISIONING_ID, 'BLOCKED', detail);

    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        commercialActivationStatus: 'BLOCKED',
        commercialActivationDetail: detail,
        version: 4,
      }),
    );
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'ServiceProvisioning',
        entityId: PROVISIONING_ID,
        newValue: { action: 'COMMERCIAL_STATUS', status: 'BLOCKED', detail },
      }),
      manager,
    );
  });
});
