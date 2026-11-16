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
  it('retira el activo de los adjuntos de tickets del titular (uso ticket_attachment)', async () => {
    const participant = new MediaTitularErasureParticipant();
    const assetId = '60000000-0000-4000-8000-0000000000a1';
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ present: true }])
      .mockResolvedValueOnce([{ id: assetId, deleted_at: null }])
      .mockResolvedValueOnce([[{ id: assetId }], 1])
      .mockResolvedValueOnce([{ count: 0 }]);

    const result = await participant.apply(
      {
        partyId: null,
        subscriberIds: [],
        expedienteIds: [],
        userIds: [],
        tenantSchema: 'tenant_fixture',
        relatedIds: { ticketAttachmentMediaIds: [assetId, assetId] },
      },
      { query } as unknown as QueryRunner,
      'apply',
    );

    expect(result.find((row) => row.table === 'media_assets:ticket_attachment')).toEqual({
      table: 'media_assets:ticket_attachment',
      category: 'EVIDENCIA_DOCUMENTAL',
      selected: 1,
      changed: 1,
      residual: 0,
    });
    // Solo el uso del adjunto, del schema del titular, y sin borrar la fila: el objeto lo
    // purga el worker `evidence-orphan-detection` (fase 4) a partir de `deleted_at`.
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('FOR UPDATE'), [
      [assetId],
      'tenant_fixture',
      'ticket_attachment',
    ]);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)'),
      [[assetId], 'tenant_fixture', 'ticket_attachment'],
    );
    expect(query.mock.calls.some(([sql]) => /DELETE\s+FROM/i.test(String(sql)))).toBe(false);
  });

  it('en dry-run cuenta los adjuntos sin retirarlos', async () => {
    const participant = new MediaTitularErasureParticipant();
    const assetId = '60000000-0000-4000-8000-0000000000a2';
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ present: true }])
      .mockResolvedValueOnce([{ id: assetId, deleted_at: null }])
      .mockResolvedValueOnce([{ count: 1 }]);

    const result = await participant.plan(
      {
        partyId: null,
        subscriberIds: [],
        expedienteIds: [],
        userIds: [],
        tenantSchema: 'tenant_fixture',
        relatedIds: { ticketAttachmentMediaIds: [assetId] },
      },
      { query } as unknown as QueryRunner,
    );

    expect(result.find((row) => row.table === 'media_assets:ticket_attachment')).toMatchObject({
      selected: 1,
      changed: 1,
    });
    expect(
      query.mock.calls.some(([sql]) => /UPDATE\s+public\.media_assets/.test(String(sql))),
    ).toBe(false);
  });
});
