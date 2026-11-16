import { MigrationPromotionService } from './migration-promotion.service';

/**
 * Revalidación del complemento dentro del savepoint del titular (spec 2026-11-15 §2.3). El
 * camino completo contra PostgreSQL lo cubre migration-promotion.postgres.integration.
 */
const subscriberId = '11111111-1111-4111-8111-111111111111';
const clientId = '7';
const hmac = 'hmac-documento';

function build(overrides: {
  target?: unknown;
  byHmac?: Map<string, string>;
  mapping?: string | null;
}) {
  const titularLookup = {
    titularTarget: jest
      .fn()
      .mockResolvedValue(
        'target' in overrides
          ? overrides.target
          : { subscriberId, externalId: null, restricted: false },
      ),
    lookup: jest.fn().mockResolvedValue({
      subscriberIdByHmac: overrides.byHmac ?? new Map([[hmac, subscriberId]]),
    }),
  };
  const crm = {
    linkComplement: jest.fn().mockResolvedValue(true),
    fillEmptyFields: jest.fn().mockResolvedValue({
      filled: [{ field: 'email', hmac: 'h' }],
      differing: ['phone'],
      contactIds: ['c-1'],
    }),
    createSubscriber: jest.fn(),
  };
  const tags = { assignForImport: jest.fn().mockResolvedValue({ assigned: true }) };
  const service = new MigrationPromotionService(
    {} as never,
    {} as never,
    {} as never,
    { documentHmac: jest.fn().mockReturnValue(hmac) } as never,
    {} as never,
    titularLookup as never,
    crm as never,
    {} as never,
    {} as never,
    tags as never,
    {} as never,
    {} as never,
  );
  const qr = { query: jest.fn().mockResolvedValue([]), manager: {} };
  const row = {
    id: 'staging-1',
    entity: 'SUSCRIPTOR',
    external_id: `uisp:client:${clientId}`,
    status: 'VALIDO',
    rejection_reason: null,
    payload: {
      source: { fileIndex: 0 },
      raw: { contacts: [{ isContact: true, email: 'a@example.invalid', phone: '300' }] },
      derived: { documentNumber: '123', complementSubscriberId: subscriberId, tagRefs: ['9'] },
    },
  };
  const mappingTarget = 'mapping' in overrides ? overrides.mapping : subscriberId;
  const mappings = new Map([
    ['TITULAR', new Map([[clientId, { action: 'EQUIVALE', target: mappingTarget }]])],
    ['ETIQUETA', new Map([['9', { action: 'EQUIVALE', target: 'tag-1' }]])],
  ]);
  const ctx = { manager: {}, tenantId: 't', schemaName: 's', batchId: 'b', actorId: 'a' };
  const promote = () =>
    (
      service as unknown as {
        promoteComplement: (...args: unknown[]) => Promise<string>;
      }
    ).promoteComplement(qr, ctx, row, mappings, subscriberId);
  return { promote, crm, qr, tags };
}

describe('MigrationPromotionService — complemento de titular existente', () => {
  it('pasa la revalidación: enlaza, completa, asigna etiquetas y registra meta sin valores', async () => {
    const { promote, crm, qr, tags } = build({});
    await expect(promote()).resolves.toBe(subscriberId);
    expect(crm.createSubscriber).not.toHaveBeenCalled();
    expect(crm.linkComplement).toHaveBeenCalledWith(
      expect.anything(),
      subscriberId,
      'uisp:client:7',
    );
    expect(tags.assignForImport).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId, importBatchId: 'b' }),
      expect.anything(),
    );
    const [, params] = qr.query.mock.calls.find(([sql]) =>
      String(sql).includes('promotion_meta = $3'),
    )!;
    const meta = JSON.parse(String((params as unknown[])[2]));
    expect(meta).toMatchObject({
      mode: 'COMPLEMENTO',
      existing: true,
      subscriberId,
      linkedExternalId: 'uisp:client:7',
      filled: [{ field: 'email', hmac: 'h' }],
      differing: ['phone'],
      contactIds: ['c-1'],
      tags: 1,
    });
    expect(JSON.stringify(meta)).not.toContain('a@example.invalid');
  });

  it.each([
    ['el suscriptor ya no existe', { target: null }, 'TITULAR_EXISTENTE'],
    [
      'tiene datos bloqueados',
      { target: { subscriberId, externalId: null, restricted: true } },
      'TITULAR_EXISTENTE',
    ],
    [
      'quedó enlazado a otro cliente de UISP',
      { target: { subscriberId, externalId: 'uisp:client:99', restricted: false } },
      'TITULAR_VINCULADO_A_OTRO_CLIENTE',
    ],
    [
      'el documento ya apunta a otro suscriptor',
      { byHmac: new Map([[hmac, 'otro']]) },
      'TITULAR_EXISTENTE',
    ],
    ['el documento ya no resuelve a ningún suscriptor', { byHmac: new Map() }, 'TITULAR_EXISTENTE'],
    ['la equivalencia TITULAR cambió', { mapping: 'otro' }, 'TITULAR_EXISTENTE'],
  ])('rechaza si %s', async (_case, overrides, reason) => {
    const { promote, crm } = build(overrides as never);
    await expect(promote()).rejects.toMatchObject({ reason });
    expect(crm.linkComplement).not.toHaveBeenCalled();
    expect(crm.fillEmptyFields).not.toHaveBeenCalled();
  });
});
