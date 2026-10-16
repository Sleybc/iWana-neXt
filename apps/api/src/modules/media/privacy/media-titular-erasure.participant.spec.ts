import type { QueryRunner } from 'typeorm';
import { MediaTitularErasureParticipant } from './media-titular-erasure.participant';

describe('MediaTitularErasureParticipant', () => {
  it('no retira evidencia de autorización aunque reciba un ID de privacidad', async () => {
    const participant = new MediaTitularErasureParticipant();
    const query = jest.fn();
    const result = await participant.apply(
      {
        partyId: '60000000-0000-4000-8000-000000000001',
        subscriberIds: [],
        expedienteIds: [],
        userIds: [],
        tenantSchema: 'tenant_fixture',
        relatedIds: {
          privacyEvidenceMediaIds: ['60000000-0000-4000-8000-000000000002'],
        },
      },
      {
        query: query
          .mockResolvedValueOnce([{ present: true }])
          .mockResolvedValueOnce([
            {
              id: '60000000-0000-4000-8000-000000000002',
              deleted_at: null,
            },
          ])
          .mockResolvedValueOnce([{ id: '60000000-0000-4000-8000-000000000002' }])
          .mockResolvedValueOnce([{ count: 0 }]),
      } as unknown as QueryRunner,
      'apply',
    );

    expect(result[0]).toEqual({
      table: 'media_assets:privacy_evidence',
      category: 'EVIDENCIA_DOCUMENTAL',
      selected: 0,
      changed: 0,
      residual: 0,
    });
    expect(query).not.toHaveBeenCalled();
  });
});
