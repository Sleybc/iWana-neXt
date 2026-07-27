import { ConfigService } from '@nestjs/config';
import { ExecutionOrderReliabilityService } from '../services/execution-order-reliability.service';
import { ConflictException } from '@nestjs/common';

describe('ExecutionOrderReliabilityService', () => {
  const config = {
    get: jest.fn().mockReturnValue('test-secret-not-production'),
  } as unknown as ConfigService;
  let service: ExecutionOrderReliabilityService;

  beforeEach(() => {
    service = new ExecutionOrderReliabilityService(config);
  });

  it('crea intentId y devuelve replay para la misma clave/payload', async () => {
    let stored: Record<string, unknown> | null = null;
    const manager = {
      findOne: jest.fn().mockImplementation(async () => stored),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => {
        stored = { ...value, intentId: 'intent-001' };
        return stored;
      }),
    } as never;

    const first = await service.beginIdempotent(
      manager,
      'tenant-001',
      'execution_order.start',
      'key-00000000000001',
      { value: 'x' },
    );
    expect(first?.replay).toBe(false);
    expect(first?.intentId).toBe('intent-001');
    const second = await service.beginIdempotent(
      manager,
      'tenant-001',
      'execution_order.start',
      'key-00000000000001',
      { value: 'x' },
    );
    expect(second).toEqual(expect.objectContaining({ intentId: 'intent-001', replay: true }));
    expect((manager as { findOne: jest.Mock }).findOne.mock.calls[0][1].where.keyHmac).toHaveLength(
      64,
    );
  });

  it('rechaza payload distinto con la misma clave', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        intentId: 'intent-001',
        payloadHmac: 'different',
        resourceRef: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
        expiresAt: new Date(Date.now() + 10000),
        tombstonedAt: null,
      }),
    } as never;
    await expect(
      service.beginIdempotent(
        manager,
        'tenant-001',
        'execution_order.start',
        'key-00000000000001',
        { value: 'x' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propaga fallo de audit-intent y fuerza rollback de la transacción llamadora', async () => {
    const manager = {
      create: jest.fn(),
      save: jest.fn().mockRejectedValue(new Error('audit store unavailable')),
    } as never;
    await expect(
      service.appendAuditIntent(manager, {
        tenantId: 'tenant-001',
        intentId: 'intent-001',
        operation: 'execution_order.close',
        resourceRef: 'eo-001',
        resultCode: 'ACCEPTED',
        correlationId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('audit store unavailable');
  });
});
