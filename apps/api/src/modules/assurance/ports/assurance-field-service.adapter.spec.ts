import { BUSINESS_JOB_REMOVE_ON_FAIL } from '@iwana/shared';
import { AssuranceFieldServiceAdapter } from './assurance-field-service.adapter';

describe('AssuranceFieldServiceAdapter — retención B(b)', () => {
  it('la solicitud de visita conserva los fallidos 14 días (familia N, antes para siempre)', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    await new AssuranceFieldServiceAdapter(queue as never).requestFieldService({
      tenantId: 't-1',
      ticketId: 'k-1',
    } as never);
    expect(queue.add).toHaveBeenCalledWith(
      'request-field-service',
      expect.anything(),
      expect.objectContaining({
        jobId: 'assurance-field-service-t-1-k-1',
        removeOnFail: BUSINESS_JOB_REMOVE_ON_FAIL,
      }),
    );
  });
});
