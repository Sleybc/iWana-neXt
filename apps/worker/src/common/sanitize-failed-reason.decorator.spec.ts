import { UnrecoverableError } from 'bullmq';
import { SanitizeFailedReason } from './sanitize-failed-reason.decorator';

describe('SanitizeFailedReason', () => {
  it('redacts BullMQ failedReason while preserving UnrecoverableError semantics', async () => {
    class ProcessorProbe {
      async process(): Promise<void> {
        throw new UnrecoverableError('driver detail CENTINELA-PII-0002');
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(ProcessorProbe.prototype, 'process');
    if (!descriptor) throw new Error('process method descriptor is missing');
    const decoratedDescriptor = { ...descriptor };
    SanitizeFailedReason()(ProcessorProbe.prototype, 'process', decoratedDescriptor);
    Object.defineProperty(ProcessorProbe.prototype, 'process', decoratedDescriptor);

    const thrown = await new ProcessorProbe().process().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(UnrecoverableError);
    expect(thrown).toMatchObject({ message: 'class=UnrecoverableError sqlstate=none' });
    expect(thrown).not.toHaveProperty('driverError');
    expect(thrown).not.toHaveProperty('query');
    expect(thrown).not.toHaveProperty('parameters');
    expect(String(thrown)).not.toContain('CENTINELA-PII-0002');
  });

  it('preserves a safe domain error name while redacting its message', async () => {
    class ProcessorProbe {
      async process(): Promise<void> {
        const error = new Error('tenant detail CENTINELA-PII-0005');
        error.name = 'InventoryTenantNotActiveError';
        throw error;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(ProcessorProbe.prototype, 'process');
    if (!descriptor) throw new Error('process method descriptor is missing');
    const decoratedDescriptor = { ...descriptor };
    SanitizeFailedReason()(ProcessorProbe.prototype, 'process', decoratedDescriptor);
    Object.defineProperty(ProcessorProbe.prototype, 'process', decoratedDescriptor);

    const thrown = await new ProcessorProbe().process().catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      name: 'InventoryTenantNotActiveError',
      message: 'class=Error sqlstate=none',
    });
    expect(String(thrown)).not.toContain('CENTINELA-PII-0005');
  });
});
