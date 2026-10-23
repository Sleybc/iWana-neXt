import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NetworkInboxEvent, IpAssignment, ServiceProvisioning, runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  canonicalizeNetworkExecutionEvent,
  type NetworkExecutionEvent,
} from '@iwana/shared';
import { createHmac, randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { NetworkActivationListenerError } from './events/network-activation-listener.error';
import { NetworkExecutionEventProcessor } from './network-execution-event.processor';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
}));

const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
const signingKey = Buffer.alloc(32, 19).toString('base64');
const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'mod13-event-test',
  schema_name: 'tenant_mod13_event_test',
};
const executionOrderId = '22222222-2222-4222-8222-222222222222';

function makeEvent(
  eventType: NetworkExecutionEvent['eventType'] = 'ExecutionOrderClosedV1',
  result: NetworkExecutionEvent['result'] = 'EXECUTED',
): NetworkExecutionEvent {
  return {
    eventId: randomUUID(),
    eventType,
    executionOrderId,
    aggregateVersion: 1,
    result,
    occurredAt: '2026-10-23T12:00:00.000Z',
  };
}

function signed(tenantId: string, envelope: NetworkExecutionEvent, secret = signingKey) {
  const signature = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(canonicalizeNetworkExecutionEvent(tenantId, envelope))
    .digest('hex');
  return { tenantId, envelope, signature };
}

function createHarness(input?: {
  inbox?: Partial<NetworkInboxEvent>;
  service?: Partial<ServiceProvisioning> | null;
  assignment?: Partial<IpAssignment> | null;
  snapshot?: unknown;
  tenantRows?: unknown[];
  emitAsync?: jest.Mock;
}) {
  const eventId = randomUUID();
  const envelope = makeEvent();
  envelope.eventId = eventId;
  const inbox = {
    tenantId: tenant.id,
    eventId,
    eventType: envelope.eventType,
    executionOrderId: envelope.executionOrderId,
    processedAt: null,
    lastErrorCode: null,
    ...input?.inbox,
  } as NetworkInboxEvent;
  const service =
    input?.service === null
      ? null
      : ({
          id: '33333333-3333-4333-8333-333333333333',
          tenantId: tenant.id,
          executionOrderId,
          subscriberId: '44444444-4444-4444-8444-444444444444',
          expedienteId: null,
          contractId: null,
          cpeSerialNumber: null,
          status: 'CERTIFIED',
          version: 3,
          commercialActivationStatus: 'PENDING',
          commercialActivationDetail: null,
          ...input?.service,
        } as ServiceProvisioning);
  const assignment =
    input?.assignment === null
      ? null
      : ({
          id: '55555555-5555-4555-8555-555555555555',
          tenantId: tenant.id,
          serviceProvisioningId: service?.id,
          status: 'RESERVED',
          ip: '192.0.2.10',
          ...input?.assignment,
        } as IpAssignment);
  const manager = {
    query: jest.fn(async (sql: string) =>
      sql.includes('INSERT INTO network_inbox_events') ? [{ id: 'inbox-id' }] : [],
    ),
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === NetworkInboxEvent) return inbox;
      if (entity === ServiceProvisioning) return service;
      if (entity === IpAssignment) return assignment;
      return null;
    }),
    save: jest.fn(async (_entity: unknown, value: unknown) => value),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const transactionQuery = jest.fn().mockResolvedValue([]);
  runInTenant.mockImplementation(async (_source, _schema, operation) =>
    operation({ manager, query: transactionQuery } as never),
  );
  const dataSource = {
    query: jest.fn().mockResolvedValue(input?.tenantRows ?? [tenant]),
  } as unknown as DataSource;
  const config = {
    get: jest.fn((key: string) => (key === 'INTERNAL_QUEUE_SIGNING_KEY' ? signingKey : undefined)),
  } as unknown as ConfigService;
  const executionOrderReadPort = {
    getExecutionSnapshot: jest
      .fn()
      .mockResolvedValue(
        input && Object.hasOwn(input, 'snapshot') ? input.snapshot : { id: executionOrderId },
      ),
  };
  const auditService = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const eventEmitter = { emitAsync: input?.emitAsync ?? jest.fn().mockResolvedValue([]) };
  const processor = new NetworkExecutionEventProcessor(
    dataSource,
    config,
    eventEmitter as never,
    executionOrderReadPort as never,
    auditService as never,
  );
  return {
    processor,
    dataSource,
    config,
    manager,
    transactionQuery,
    inbox,
    service,
    assignment,
    executionOrderReadPort,
    auditService,
    eventEmitter,
    envelope,
    job: { data: signed(tenant.id, envelope) } as never,
  };
}

describe('NetworkExecutionEventProcessor.process', () => {
  beforeEach(() => jest.clearAllMocks());

  it('activa servicio e IP certificados, audita, emite activación y marca el inbox', async () => {
    const state = createHarness();

    await expect(state.processor.process(state.job)).resolves.toBeUndefined();

    expect(state.assignment).toMatchObject({ status: 'ACTIVE' });
    expect(state.service).toMatchObject({ status: 'ACTIVE', version: 4 });
    expect(state.auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        newValue: expect.objectContaining({ action: 'ACTIVATE', toStatus: 'ACTIVE' }),
      }),
      state.manager,
    );
    expect(state.eventEmitter.emitAsync).toHaveBeenCalledWith(
      'network.service-provisioning.activated',
      expect.objectContaining({ serviceProvisioningId: state.service?.id }),
    );
    expect(state.manager.update).toHaveBeenCalledWith(
      NetworkInboxEvent,
      { tenantId: tenant.id, eventId: state.envelope.eventId },
      expect.objectContaining({ lastErrorCode: null }),
    );
  });

  it('no vuelve a procesar un evento cuyo inbox ya está marcado', async () => {
    const state = createHarness({ inbox: { processedAt: new Date() } });

    await state.processor.process(state.job);

    expect(state.manager.save).not.toHaveBeenCalled();
    expect(state.auditService.logWithin).not.toHaveBeenCalled();
    expect(state.eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('marca el inbox si ya no existe un servicio asociado a la OT', async () => {
    const state = createHarness({ service: null });

    await state.processor.process(state.job);

    expect(state.manager.save).toHaveBeenCalledWith(NetworkInboxEvent, state.inbox);
    expect(state.inbox.processedAt).toBeInstanceOf(Date);
    expect(state.auditService.logWithin).not.toHaveBeenCalled();
  });

  it('marca FAILED una ejecución cerrada sin certificación', async () => {
    const state = createHarness({ service: { status: 'RESERVED' } });

    await state.processor.process(state.job);

    expect(state.service).toMatchObject({
      status: 'FAILED',
      failureReason: 'CLOSED_WITHOUT_CERTIFICATION',
      version: 4,
    });
    expect(state.auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ action: 'FAIL' }) }),
      state.manager,
    );
    expect(state.eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['cancelled', 'ExecutionOrderCancelledV1', null, 'CANCELLED'],
    ['annulled', 'ExecutionOrderAnnulledV1', null, 'ANNULLED'],
    ['not executed', 'ExecutionOrderClosedV1', 'NOT_EXECUTED', 'NOT_EXECUTED'],
  ] as const)('libera una reserva ante evento %s', async (_label, eventType, result, reason) => {
    const state = createHarness({ service: { status: 'RESERVED' } });
    const envelope = makeEvent(eventType, result);
    envelope.eventId = state.envelope.eventId;
    state.inbox.eventType = eventType;
    const job = { data: signed(tenant.id, envelope) } as never;

    await state.processor.process(job);

    expect(state.assignment).toMatchObject({ status: 'RELEASED', releaseReason: reason });
    expect(state.service).toMatchObject({ status: 'RELEASED', releaseReason: reason });
    expect(state.auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ action: 'RELEASE' }) }),
      state.manager,
    );
  });

  it('persiste ORDER_NOT_FOUND y relanza cuando tasks no encuentra la OT', async () => {
    const state = createHarness({ snapshot: null });

    await expect(state.processor.process(state.job)).rejects.toThrow();

    expect(state.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO network_inbox_events'),
      expect.arrayContaining([tenant.id, state.envelope.eventId, 'ORDER_NOT_FOUND']),
    );
  });

  it('persiste una identidad de firma inválida sin registrar sus identificadores en el log', async () => {
    const state = createHarness();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const invalidPayload = signed(tenant.id, state.envelope);
    invalidPayload.signature = '0'.repeat(64);
    const invalidJob = { data: invalidPayload } as never;

    await expect(state.processor.process(invalidJob)).rejects.toThrow();

    expect(state.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining("'SIGNATURE_INVALID'"),
      expect.arrayContaining([tenant.id, state.envelope.eventId]),
    );
    expect(warn).toHaveBeenCalledWith(
      '[network-execution-events] retry code=omitted event=omitted tenant=omitted',
    );
  });

  it('no usa identidad del payload si su estructura no permite persistir el error de firma', async () => {
    const state = createHarness();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      state.processor.process({
        data: { tenantId: tenant.id, envelope: [], signature: 'bad' },
      } as never),
    ).rejects.toThrow();

    expect(state.transactionQuery).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[network-execution-events] retry code=omitted event=omitted tenant=omitted',
    );
  });

  it('reintenta y registra CRM_LISTENER_FAILED si el listener arroja su error tipado', async () => {
    const failure = new NetworkActivationListenerError('CRM_LISTENER_FAILED');
    const state = createHarness({ emitAsync: jest.fn().mockRejectedValue(failure) });

    await expect(state.processor.process(state.job)).rejects.toThrow();

    expect(state.transactionQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'DO UPDATE SET processed_at = NULL, last_error_code = EXCLUDED.last_error_code',
      ),
      expect.arrayContaining([tenant.id, state.envelope.eventId, 'CRM_LISTENER_FAILED']),
    );
  });

  it('rechaza un tenant cuyo schema no es válido sin persistir en un schema arbitrario', async () => {
    const state = createHarness({ tenantRows: [{ ...tenant, schema_name: 'schema;drop' }] });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(state.processor.process(state.job)).rejects.toThrow();

    expect(runInTenant).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[network-execution-events] retry code=omitted event=omitted tenant=omitted',
    );
  });
});
