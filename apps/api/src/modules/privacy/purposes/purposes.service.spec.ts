import { PurposesService } from './purposes.service';
import * as tenantQuery from '../ports/privacy-tenant-query';

describe('PurposesService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lista las finalidades configuradas dentro del contexto tenant', async () => {
    const expected = [
      { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
      { purpose: 'CONTACTO_COMERCIAL', enabled: false },
    ];
    const manager = { query: jest.fn().mockResolvedValue(expected) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new PurposesService({} as never, {} as never);

    await expect(service.list()).resolves.toEqual(expected);
    await expect(service.enabledPurposes()).resolves.toEqual(['TRATAMIENTO_CONTRACTUAL']);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT purpose, enabled FROM privacy_purpose_settings ORDER BY purpose',
    );
  });

  it('rechaza la desactivación de la finalidad obligatoria', async () => {
    const service = new PurposesService({} as never, {} as never);
    await expect(
      service.update({ items: [{ purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: false }] }, 'actor'),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_PURPOSE_REQUIRED' } });
  });

  it('guarda el antes y después en la misma transacción', async () => {
    const before = [{ purpose: 'DATOS_BIOMETRICOS', enabled: true }];
    const after = [{ purpose: 'DATOS_BIOMETRICOS', enabled: false }];
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(after),
    };
    const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new PurposesService({} as never, audit as never);
    await expect(
      service.update({ items: [{ purpose: 'DATOS_BIOMETRICOS', enabled: false }] }, 'actor'),
    ).resolves.toEqual(after);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'PrivacyPurposeSetting',
        oldValue: { items: before },
        newValue: { items: after },
      }),
      manager,
    );
  });
});
