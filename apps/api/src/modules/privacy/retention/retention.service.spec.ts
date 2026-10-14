import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { RetentionPolicyEntity } from '../entities/retention-policy.entity';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { assertRetentionOnlyExtends, RetentionService } from './retention.service';

const policy = (years: number) =>
  ({
    category: 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR',
    years,
    startEvent: 'FIN_RELACION',
    legalBasis: 'Conservación legal',
    isLegalMinimum: true,
  }) as RetentionPolicyEntity;

describe('RetentionService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lista el catálogo y proyecta sus campos públicos', async () => {
    const repository = { find: jest.fn().mockResolvedValue([policy(5)]) };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);
    const service = new RetentionService({} as never);

    await expect(service.list()).resolves.toEqual([
      {
        category: 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR',
        years: 5,
        startEvent: 'FIN_RELACION',
        legalBasis: 'Conservación legal',
        isLegalMinimum: true,
      },
    ]);
    expect(repository.find).toHaveBeenCalledWith({ order: { category: 'ASC' } });
  });

  it('rechaza una categoría inexistente y cualquier reducción del mínimo', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(policy(5)),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new RetentionService({} as never);

    await expect(
      service.extend({
        category: 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR',
        years: 6,
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.extend({
        category: 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR',
        years: 4,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findOne).toHaveBeenCalledTimes(2);
  });

  it('deja intacto un periodo igual y persiste un periodo más largo', async () => {
    const existing = policy(5);
    const longer = policy(7);
    const repository = {
      findOne: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(existing),
      save: jest.fn().mockResolvedValue(longer),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const service = new RetentionService({} as never);

    await expect(
      service.extend({ category: existing.category, years: 5 } as never),
    ).resolves.toMatchObject({ years: 5 });
    expect(repository.save).not.toHaveBeenCalled();

    await expect(
      service.extend({ category: existing.category, years: 7 } as never),
    ).resolves.toMatchObject({ years: 7 });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ years: 7 }));
  });

  it('mantiene la regla pública de solo alargar', () => {
    expect(() => assertRetentionOnlyExtends(2, 2)).not.toThrow();
    expect(() => assertRetentionOnlyExtends(2, 3)).not.toThrow();
    expect(() => assertRetentionOnlyExtends(3, 2)).toThrow(BadRequestException);
  });
});
