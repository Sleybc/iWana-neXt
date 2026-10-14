import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ConsentChannel, DataPurpose } from '@iwana/shared';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { PrivacyAuthorizationAdapter } from './privacy-authorization.adapter';

describe('PrivacyAuthorizationAdapter', () => {
  it('guarda IP y user agent tomados del contexto confiable del servidor', async () => {
    const id = '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4';
    const repository = {
      create: jest.fn((input: Partial<DataAuthorizationEntity>) => input),
      save: jest.fn(async (input: Partial<DataAuthorizationEntity>) => ({ ...input, id })),
    };
    const manager = {
      getRepository: jest.fn(() => repository),
    } as unknown as EntityManager;
    const adapter = new PrivacyAuthorizationAdapter({} as never);

    const result = await adapter.record(
      {
        partyId: '6f199f37-a724-437b-a1e1-723410ec87ee',
        purpose: 'TRATAMIENTO_CONTRACTUAL' satisfies DataPurpose,
        granted: true,
        channel: ConsentChannel.EMAIL,
        legalTextId: 'f72016bd-f450-45c0-8b64-90216a7e0e9c',
        actorId: 'fd869e12-5bca-48be-8dc9-46005e95fd48',
      },
      { ip: '192.0.2.9', userAgent: 'trusted server header', manager },
    );

    expect(result).toEqual({ authorizationId: id, created: true });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'GRANT',
        ip: '192.0.2.9',
        userAgent: 'trusted server header',
      }),
    );
    expect('update' in adapter).toBe(false);
  });

  it('rechaza un canal histórico si la fila no es LEGACY_IMPORT', async () => {
    const repository = { create: jest.fn(), save: jest.fn() };
    const manager = { getRepository: jest.fn(() => repository) } as unknown as EntityManager;
    const adapter = new PrivacyAuthorizationAdapter({} as never);

    await expect(
      adapter.record(
        {
          partyId: '6f199f37-a724-437b-a1e1-723410ec87ee',
          purpose: 'TRATAMIENTO_CONTRACTUAL' as DataPurpose,
          granted: true,
          channel: 'CRM_CONVERSION' as unknown as ConsentChannel,
          legalTextId: 'f72016bd-f450-45c0-8b64-90216a7e0e9c',
          actorId: 'fd869e12-5bca-48be-8dc9-46005e95fd48',
        },
        { ip: null, userAgent: null, manager },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('conserva un canal histórico cuando kind es LEGACY_IMPORT', async () => {
    const id = '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4';
    const repository = {
      create: jest.fn((input: Partial<DataAuthorizationEntity>) => input),
      save: jest.fn(async (input: Partial<DataAuthorizationEntity>) => ({ ...input, id })),
    };
    const manager = { getRepository: jest.fn(() => repository) } as unknown as EntityManager;
    const adapter = new PrivacyAuthorizationAdapter({} as never);

    await expect(
      adapter.record(
        {
          partyId: '6f199f37-a724-437b-a1e1-723410ec87ee',
          purpose: 'TRATAMIENTO_CONTRACTUAL' as DataPurpose,
          granted: true,
          channel: 'CRM_CONVERSION',
          legalTextId: null,
          kind: 'LEGACY_IMPORT',
          actorId: 'fd869e12-5bca-48be-8dc9-46005e95fd48',
        },
        { ip: null, userAgent: null, manager },
      ),
    ).resolves.toEqual({ authorizationId: id, created: true });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'LEGACY_IMPORT',
        channel: 'CRM_CONVERSION',
      }),
    );
  });

  it('conserva la fecha, finalidad y referencia idempotente del origen', async () => {
    const id = '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4';
    const input = {
      partyId: '6f199f37-a724-437b-a1e1-723410ec87ee',
      purpose: 'TRATAMIENTO_CONTRACTUAL' as DataPurpose,
      granted: true,
      kind: 'GRANT' as const,
      channel: ConsentChannel.TELEFONO,
      legalTextId: 'f72016bd-f450-45c0-8b64-90216a7e0e9c',
      capturedAt: '2026-10-13T12:00:00.000Z',
      sourceRef: 'consent_records:record-1',
      actorId: 'fd869e12-5bca-48be-8dc9-46005e95fd48',
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((values: Partial<DataAuthorizationEntity>) => values),
      save: jest.fn(async (values: Partial<DataAuthorizationEntity>) => ({ ...values, id })),
    };
    const manager = { getRepository: jest.fn(() => repository) } as unknown as EntityManager;
    const adapter = new PrivacyAuthorizationAdapter({} as never);

    await expect(adapter.record(input, { ip: null, userAgent: null, manager })).resolves.toEqual({
      authorizationId: id,
      created: true,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        capturedAt: new Date(input.capturedAt),
        sourceRef: input.sourceRef,
      }),
    );
  });

  it('devuelve la autorización previa para el mismo sourceRef sin duplicarla', async () => {
    const id = '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4';
    const repository = {
      findOne: jest.fn().mockResolvedValue({ id }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const manager = { getRepository: jest.fn(() => repository) } as unknown as EntityManager;
    const adapter = new PrivacyAuthorizationAdapter({} as never);

    await expect(
      adapter.record(
        {
          partyId: '6f199f37-a724-437b-a1e1-723410ec87ee',
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId: 'f72016bd-f450-45c0-8b64-90216a7e0e9c',
          sourceRef: 'consent_records:record-1',
          actorId: 'fd869e12-5bca-48be-8dc9-46005e95fd48',
        },
        { ip: null, userAgent: null, manager },
      ),
    ).resolves.toEqual({ authorizationId: id, created: false });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
