import * as tenantQuery from '../ports/privacy-tenant-query';
import { PrivacyAuthorizationAdapter } from './privacy-authorization.adapter';

const partyA = '71000000-0000-4000-8000-000000000021';

/**
 * CA-5 (D3): `hasActive` con `ctx` usa el manager del llamante y no pide otra
 * conexión al pool; sin `ctx` mantiene la transacción propia.
 */
describe('PrivacyAuthorizationAdapter.hasActive · contexto de transacción', () => {
  afterEach(() => jest.restoreAllMocks());

  it('usa el manager del llamante y no abre ni pide otra conexión', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'authorization-1',
        granted: true,
        legalTextId: null,
        kind: 'GRANT',
      }),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const dataSource = {
      createQueryRunner: jest.fn(() => {
        throw new Error('no debe abrir una conexión propia');
      }),
    };
    const tenantSpy = jest.spyOn(tenantQuery, 'withPrivacyTenant');
    const adapter = new PrivacyAuthorizationAdapter(dataSource as never);

    await expect(
      adapter.hasActive(partyA, 'TRATAMIENTO_CONTRACTUAL', { manager: manager as never }),
    ).resolves.toEqual({
      active: true,
      authorizationId: 'authorization-1',
      legalTextVersion: null,
      legacyUnverified: false,
    });
    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(tenantSpy).not.toHaveBeenCalled();
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('marca las autorizaciones heredadas como no verificadas', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'authorization-legacy',
        granted: true,
        legalTextId: null,
        kind: 'LEGACY_IMPORT',
      }),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    const adapter = new PrivacyAuthorizationAdapter({} as never);

    await expect(
      adapter.hasActive(partyA, 'TRATAMIENTO_CONTRACTUAL', { manager: manager as never }),
    ).resolves.toMatchObject({ active: true, legacyUnverified: true });
  });

  it('sin ctx conserva la transacción propia con withPrivacyTenant', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const manager = { getRepository: jest.fn(() => repository) };
    const tenantSpy = jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const dataSource = { createQueryRunner: jest.fn() };
    const adapter = new PrivacyAuthorizationAdapter(dataSource as never);

    await expect(adapter.hasActive(partyA, 'TRATAMIENTO_CONTRACTUAL')).resolves.toEqual({
      active: false,
      authorizationId: null,
      legalTextVersion: null,
      legacyUnverified: false,
    });
    expect(tenantSpy).toHaveBeenCalledTimes(1);
    expect(repository.findOne).toHaveBeenCalled();
  });
});
