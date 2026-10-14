import { TenantContext } from '@iwana/db';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { LegalTextsService } from './legal-texts.service';

describe('LegalTextsService A14', () => {
  afterEach(() => jest.restoreAllMocks());

  it('elige el texto vigente por fecha de publicación más reciente', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        id: '10000000-0000-4000-8000-000000000001',
        type: 'AUTORIZACION',
        version: '2.0',
        sha256: 'a'.repeat(64),
        content: 'Texto vigente.',
        publishedAt: new Date('2026-10-14T12:00:00.000Z'),
        url: null,
      }),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ schemaName: 'tenant_test' } as never);
    const service = new LegalTextsService({} as never, {} as never);

    await expect(service.current('AUTORIZACION')).resolves.toEqual({
      id: '10000000-0000-4000-8000-000000000001',
      version: '2.0',
      sha256: 'a'.repeat(64),
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { type: 'AUTORIZACION' },
      order: { publishedAt: 'DESC', id: 'DESC' },
    });
  });

  it('marca isCurrent solo en la publicación más reciente de cada tipo', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          id: '10000000-0000-4000-8000-000000000002',
          type: 'AUTORIZACION',
          version: '2.0',
          sha256: 'b'.repeat(64),
          content: 'Texto nuevo.',
          publishedAt: new Date('2026-10-14T12:00:00.000Z'),
          url: null,
        },
        {
          id: '10000000-0000-4000-8000-000000000001',
          type: 'AUTORIZACION',
          version: '1.0',
          sha256: 'a'.repeat(64),
          content: 'Texto anterior.',
          publishedAt: new Date('2026-10-13T12:00:00.000Z'),
          url: null,
        },
      ]),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ schemaName: 'tenant_test' } as never);
    const service = new LegalTextsService({} as never, {} as never);

    const result = await service.list();

    expect(result.map((text) => text.isCurrent)).toEqual([true, false]);
  });

  it('resuelve la versión exacta solicitada para conversiones idempotentes', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue({ id: 'legal-text-id' }) };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ schemaName: 'tenant_test' } as never);
    const service = new LegalTextsService({} as never, {} as never);

    await expect(service.findByVersion('AUTORIZACION', '1.0')).resolves.toEqual({
      id: 'legal-text-id',
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { type: 'AUTORIZACION', version: '1.0' },
      select: { id: true },
    });
  });
});
