import type { EntityManager } from 'typeorm';
import { CrmPersonalDataErasureAdapter } from './crm-personal-data-erasure.adapter';

describe('B3 — bloqueo de proveedor', () => {
  const participant = () => ({
    plan: jest.fn().mockResolvedValue([]),
    apply: jest.fn().mockResolvedValue([]),
  });
  function setup(linked: boolean) {
    const supplier = { hasSupplierProfile: jest.fn().mockResolvedValue(linked) };
    const crm = { ...participant(), findSubscriberIds: jest.fn().mockResolvedValue([]) };
    const users = {
      ...participant(),
      findUserIds: jest.fn().mockResolvedValue([]),
      activeAccountCount: jest.fn().mockResolvedValue(0),
    };
    const adapter = Reflect.construct(CrmPersonalDataErasureAdapter, [
      crm,
      participant(),
      users,
      participant(),
      participant(),
      participant(),
      participant(),
      participant(),
      participant(),
      participant(),
      supplier,
    ]) as CrmPersonalDataErasureAdapter;
    const qr = { isTransactionActive: true, query: jest.fn().mockResolvedValue([]) };
    const manager = { queryRunner: qr } as unknown as EntityManager;
    return { adapter, supplier, manager, qr };
  }
  it.each([true, false])('la vista previa refleja proveedor=%s', async (linked) => {
    const { adapter, manager, supplier, qr } = setup(linked);
    const plan = await adapter.plan(
      { requestId: 'request', partyId: 'party', requesterDocumentHmac: null },
      { manager },
    );
    expect(plan.blockers).toEqual(linked ? ['SUPPLIER_PROFILE_LINKED'] : []);
    expect(supplier.hasSupplierProfile).toHaveBeenCalledWith('party', qr);
  });
  it('sin Party no consulta proveedores', async () => {
    const { adapter, manager, supplier } = setup(true);
    expect(
      (
        await adapter.plan(
          { requestId: 'request', partyId: null, requesterDocumentHmac: null },
          { manager },
        )
      ).blockers,
    ).toEqual([]);
    expect(supplier.hasSupplierProfile).not.toHaveBeenCalled();
  });
  it('anonymize rechaza con 409 sin aplicar participantes', async () => {
    const { adapter, manager } = setup(true);
    await expect(
      adapter.anonymize(
        {
          requestId: 'request',
          partyId: 'party',
          requesterDocumentHmac: null,
          expedienteIds: [],
          actorId: 'actor',
        },
        { manager },
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PRIVACY_ERASURE_SUPPLIER_PROFILE' },
    });
  });
  it('el CLI tampoco aplica sobre un Party proveedor', async () => {
    const { adapter, qr } = setup(true);
    await expect(
      adapter.applyScope(
        { partyId: 'party', subscriberIds: [], expedienteIds: [], userIds: [] },
        qr as never,
        'apply',
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PRIVACY_ERASURE_SUPPLIER_PROFILE' },
    });
  });
});
