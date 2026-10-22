import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { createHmac } from 'node:crypto';
import { canonicalizeNetworkExecutionEvent } from '@iwana/shared';
import { verifySignedNetworkExecutionEvent } from './network-execution-event.processor';

describe('verifySignedNetworkExecutionEvent', () => {
  const signingKey = Buffer.alloc(32, 9).toString('base64');
  const config = {
    get: jest.fn((name: string) =>
      name === 'INTERNAL_QUEUE_SIGNING_KEY' ? signingKey : undefined,
    ),
  } as unknown as ConfigService;

  it('rechaza la firma antes de validar la forma del evento', () => {
    expect(() =>
      verifySignedNetworkExecutionEvent(
        {
          tenantId: '10000000-0000-4000-8000-000000000001',
          envelope: { payload: 'no-validar-antes-de-firmar' },
          signature: 'a'.repeat(64),
        },
        config,
      ),
    ).toThrow(UnrecoverableError);
  });

  it('clasifica una firma incorrecta para persistir SIGNATURE_INVALID en el inbox', () => {
    const candidate = {
      tenantId: '10000000-0000-4000-8000-000000000001',
      envelope: {
        eventId: 'e0000000-0000-4000-8000-000000000001',
        eventType: 'ExecutionOrderCancelledV1',
        executionOrderId: 'a0000000-0000-4000-8000-000000000001',
        aggregateVersion: 1,
        result: null,
        occurredAt: '2026-10-22T12:00:00.000Z',
      },
      signature: 'a'.repeat(64),
    };
    let thrown: unknown;
    try {
      verifySignedNetworkExecutionEvent(candidate, config);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnrecoverableError);
    expect(thrown).toMatchObject({ name: 'NetworkSignatureVerificationError' });
  });

  it('acepta una firma HMAC canónica válida antes de la validación Zod', () => {
    const event = {
      eventId: 'e0000000-0000-4000-8000-000000000001',
      eventType: 'ExecutionOrderCancelledV1' as const,
      executionOrderId: 'a0000000-0000-4000-8000-000000000001',
      aggregateVersion: 1,
      result: null,
      occurredAt: '2026-10-22T12:00:00.000Z',
    };
    const signature = createHmac('sha256', Buffer.from(signingKey, 'base64'))
      .update(canonicalizeNetworkExecutionEvent('10000000-0000-4000-8000-000000000001', event))
      .digest('hex');
    const candidate = {
      tenantId: '10000000-0000-4000-8000-000000000001',
      envelope: event,
      signature,
    };

    expect(verifySignedNetworkExecutionEvent(candidate, config)).toBe(candidate);
  });
});
