import { TenantContext } from '@iwana/db';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { PrivacyMarksAdapter } from './privacy-marks.adapter';

const partyA = '71000000-0000-4000-8000-000000000011';
const partyB = '71000000-0000-4000-8000-000000000012';

/**
 * CA-5: con `ctx` el adaptador usa el manager recibido y no pide una conexión
 * nueva; sin `ctx` conserva la transacción propia de `withPrivacyTenant`.
 */
describe('PrivacyMarksAdapter.activeMarks · contexto de transacción', () => {
  afterEach(() => jest.restoreAllMocks());

  it('usa el manager del llamante y no abre ni pide otra conexión', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        { partyId: partyA, mark: 'DATOS_BLOQUEADOS', event: 'OPEN' },
        { partyId: partyB, mark: 'DATOS_BLOQUEADOS', event: 'CLOSE' },
      ]),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const dataSource = {
      createQueryRunner: jest.fn(() => {
        throw new Error('no debe abrir una conexión propia');
      }),
    };
    const tenantSpy = jest.spyOn(tenantQuery, 'withPrivacyTenant');
    const adapter = new PrivacyMarksAdapter(dataSource as never);

    await expect(
      adapter.activeMarks([partyA, partyB], { manager: manager as never }),
    ).resolves.toEqual({
      [partyA]: ['DATOS_BLOQUEADOS'],
      [partyB]: [],
    });
    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(tenantSpy).not.toHaveBeenCalled();
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('sin ctx conserva la transacción propia con withPrivacyTenant', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) };
    const manager = { getRepository: jest.fn(() => repository) };
    const tenantSpy = jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const dataSource = { createQueryRunner: jest.fn() };
    const adapter = new PrivacyMarksAdapter(dataSource as never);

    await expect(adapter.activeMarks([partyA])).resolves.toEqual({ [partyA]: [] });
    expect(tenantSpy).toHaveBeenCalledTimes(1);
    expect(repository.find).toHaveBeenCalled();
  });

  it('con ctx no consulta el contexto de tenant para resolver el schema', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) };
    const manager = { getRepository: jest.fn(() => repository) };
    const tenantContextSpy = jest.spyOn(TenantContext, 'getOrThrow');
    const adapter = new PrivacyMarksAdapter({} as never);

    await adapter.activeMarks([partyA], { manager: manager as never });

    expect(tenantContextSpy).not.toHaveBeenCalled();
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partyId: expect.anything() } }),
    );
  });
});
