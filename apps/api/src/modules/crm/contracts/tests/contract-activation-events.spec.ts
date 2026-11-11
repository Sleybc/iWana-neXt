import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import {
  AccessPermissionKey,
  CONTRACT_ACTIVATED_EVENT_TYPE,
  ContractActivatedEnvelopeSchema,
  PlatformRole,
  UserRole,
} from '@iwana/shared';
import { PERMISSIONS_KEY } from '../../../access-control/decorators/permissions.decorator';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import {
  ContractActivationEventsPublisher,
  appendContractActivatedEvent,
} from '../contract-activation-events';
import { ContractsController } from '../contracts.controller';
import { ContractsBlockedTitularGuard } from '../guards/contracts-blocked-titular.guard';

const TENANT = { tenantId: randomUUID(), schemaName: 'tenant_cae_unit' };
let pending: Array<{ id: string; envelope: unknown }> = [];
const updates: Array<{ sql: string; params: unknown[] }> = [];

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: () => TENANT },
    runInTenantSchema: async (_ds: unknown, _schema: string, cb: (qr: unknown) => unknown) =>
      cb({
        query: async (sql: string, params: unknown[] = []) => {
          if (sql.startsWith('SELECT')) return pending;
          updates.push({ sql, params });
          return [];
        },
      }),
  };
});

function input() {
  return {
    tenantId: TENANT.tenantId,
    contractId: randomUUID(),
    subscriberId: randomUUID(),
    activatedAt: new Date('2026-11-11T20:00:00.000Z'),
    billingStartDate: '2026-11-10',
    source: 'SIGNATURE' as const,
  };
}

describe('outbox crm.contract.activated', () => {
  it('escribe un envelope válido, solo con ids, y no duplica por contrato', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'x' }])
      .mockResolvedValueOnce([]);
    const data = input();
    const first = await appendContractActivatedEvent({ query } as never, data);
    const second = await appendContractActivatedEvent({ query } as never, data);

    expect(ContractActivatedEnvelopeSchema.parse(first)).toMatchObject({
      eventType: CONTRACT_ACTIVATED_EVENT_TYPE,
      aggregateId: data.contractId,
      payload: { billingStartDate: '2026-11-10', source: 'SIGNATURE' },
    });
    expect(second).toBeNull();
    expect(String(query.mock.calls[0]?.[0])).toContain('ON CONFLICT (tenant_id, contract_id)');
  });

  it('publica con jobId = eventId, sin ":", y marca published_at', async () => {
    const data = input();
    const envelope = await appendContractActivatedEvent(
      { query: jest.fn().mockResolvedValue([{ id: 'x' }]) } as never,
      data,
    );
    pending = [{ id: envelope!.eventId, envelope }];
    updates.length = 0;
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const publisher = new ContractActivationEventsPublisher({} as never, queue as never);

    await expect(publisher.publishForContract(data.contractId)).resolves.toBe(true);

    const [name, payload, opts] = queue.add.mock.calls[0] as [string, unknown, { jobId: string }];
    expect(name).toBe(CONTRACT_ACTIVATED_EVENT_TYPE);
    expect(payload).toEqual(envelope);
    expect(opts.jobId).toBe(envelope!.eventId);
    expect(opts.jobId).not.toContain(':');
    expect(updates[0]?.sql).toContain('SET published_at = now()');
  });

  it('un fallo de Redis deja el evento pendiente con el error y no lanza', async () => {
    const envelope = await appendContractActivatedEvent(
      { query: jest.fn().mockResolvedValue([{ id: 'x' }]) } as never,
      input(),
    );
    pending = [{ id: envelope!.eventId, envelope }];
    updates.length = 0;
    const queue = { add: jest.fn().mockRejectedValue(new Error('redis caído')) };
    const publisher = new ContractActivationEventsPublisher({} as never, queue as never);

    await expect(publisher.publishPending()).resolves.toBe(false);
    expect(updates[0]?.sql).toContain('last_error = $3');
    expect(updates[0]?.sql).not.toContain('published_at = now()');
  });
});

describe('activación manual con motivo (CA-8)', () => {
  const handler = ContractsController.prototype.activateManual;

  it('expone POST crm/contracts/:id/activate-manual solo para ADMIN y SYSTEM_ADMIN', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('crm/contracts/:id/activate-manual');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      UserRole.ADMIN,
      PlatformRole.SYSTEM_ADMIN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(ContractsBlockedTitularGuard);
  });

  it('activate y activate-manual publican el outbox tras activar', async () => {
    const service = {
      activate: jest.fn().mockResolvedValue({ id: 'c' }),
      activateManual: jest.fn().mockResolvedValue({ id: 'c' }),
    };
    const publisher = { publishForContract: jest.fn() };
    const controller = new ContractsController(service as never, {} as never, publisher as never);
    const actor = { sub: 'actor' } as never;

    await controller.activate('c', undefined, actor);
    await controller.activateManual('c', { reason: 'Activación sin firma autorizada' }, actor);

    expect(service.activateManual).toHaveBeenCalledWith('c', 'actor', {
      reason: 'Activación sin firma autorizada',
    });
    expect(publisher.publishForContract).toHaveBeenCalledTimes(2);
  });
});
