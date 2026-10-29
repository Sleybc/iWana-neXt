import { TenantContext } from '@iwana/db';
import { QueryFailedError } from 'typeorm';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { LegalTextsService } from './legal-texts.service';

describe('LegalTextsService A14', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calcula la misma huella para el mismo contenido en ambos formatos', async () => {
    const repository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: '10000000-0000-4000-8000-000000000001' })),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new LegalTextsService({} as never, { log: jest.fn() } as never);
    const base = { type: 'AUTORIZACION' as const, content: 'Texto sintético', version: '1' };
    const plain = await service.create({ ...base, format: 'PLAIN' });
    const markdown = await service.create({ ...base, version: '2', format: 'MARKDOWN' });
    expect(markdown.sha256).toBe(plain.sha256);
    expect(markdown.format).toBe('MARKDOWN');
  });

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

  it('maneja listas y consultas sin publicaciones', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new LegalTextsService({} as never, {} as never);

    await expect(service.list()).resolves.toEqual([]);
    await expect(service.current('AUTORIZACION')).resolves.toBeNull();
    await expect(service.getCurrent('AUTORIZACION')).resolves.toBeNull();
    await expect(service.findByVersion('AUTORIZACION', 'inexistente')).resolves.toBeNull();
  });

  it('convierte la colisión de versión en conflicto y propaga otros errores', async () => {
    const duplicate = new QueryFailedError('insert', [], { code: '23505' } as never);
    const repository = {
      create: jest.fn((value) => value),
      save: jest.fn().mockRejectedValue(duplicate),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new LegalTextsService({} as never, {} as never);
    const input = {
      type: 'AUTORIZACION' as const,
      version: '1.0',
      content: 'Texto sintético',
      format: 'PLAIN' as const,
    };

    await expect(service.create(input)).rejects.toMatchObject({ status: 409 });

    const unexpected = new Error('Fallo sintético');
    repository.save.mockRejectedValueOnce(unexpected);
    await expect(service.create(input)).rejects.toBe(unexpected);
  });
});
