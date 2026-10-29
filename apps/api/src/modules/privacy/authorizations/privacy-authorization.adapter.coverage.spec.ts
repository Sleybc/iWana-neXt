import { BadRequestException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { ConsentChannel } from '@iwana/shared';
import { EntityManager } from 'typeorm';
import { DataAuthorizationEntity } from '../entities/data-authorization.entity';
import { LegalTextEntity } from '../entities/legal-text.entity';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { PrivacyAuthorizationAdapter } from './privacy-authorization.adapter';

const partyId = '74000000-0000-4000-8000-000000000001';
const legalTextId = '74000000-0000-4000-8000-000000000002';
const authorizationId = '74000000-0000-4000-8000-000000000003';
const actorId = '74000000-0000-4000-8000-000000000004';

describe('PrivacyAuthorizationAdapter — ramas de lectura y persistencia', () => {
  const authorizationRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((input: Partial<DataAuthorizationEntity>) => input),
    save: jest.fn(),
  };
  const legalTextRepository = { findOne: jest.fn() };
  const manager = {
    query: jest.fn().mockResolvedValue([{ enabled: true }]),
    getRepository: jest.fn((entity: unknown) =>
      entity === DataAuthorizationEntity ? authorizationRepository : legalTextRepository,
    ),
  };
  let adapter: PrivacyAuthorizationAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    authorizationRepository.find.mockReset();
    authorizationRepository.findOne.mockReset();
    authorizationRepository.create.mockReset().mockImplementation((input) => input);
    authorizationRepository.save.mockReset();
    legalTextRepository.findOne.mockReset();
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);
    adapter = new PrivacyAuthorizationAdapter({} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('representa ausencia y revocación como autorización inactiva', async () => {
    authorizationRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: authorizationId,
      granted: false,
      kind: 'REVOCATION',
      legalTextId: null,
    });

    await expect(adapter.hasActive(partyId, 'TRATAMIENTO_CONTRACTUAL' as never)).resolves.toEqual({
      active: false,
      authorizationId: null,
      legalTextVersion: null,
      legacyUnverified: false,
    });
    await expect(adapter.hasActive(partyId, 'TRATAMIENTO_CONTRACTUAL' as never)).resolves.toEqual({
      active: false,
      authorizationId: null,
      legalTextVersion: null,
      legacyUnverified: false,
    });
    expect(legalTextRepository.findOne).not.toHaveBeenCalled();
  });

  it('expone el texto vigente y marca importaciones históricas sin verificar', async () => {
    authorizationRepository.findOne
      .mockResolvedValueOnce({
        id: authorizationId,
        granted: true,
        kind: 'LEGACY_IMPORT',
        legalTextId: null,
      })
      .mockResolvedValueOnce({
        id: authorizationId,
        granted: true,
        kind: 'GRANT',
        legalTextId,
      });
    legalTextRepository.findOne.mockResolvedValue({ version: '3.0' });

    await expect(adapter.hasActive(partyId, 'TRATAMIENTO_CONTRACTUAL' as never)).resolves.toEqual({
      active: true,
      authorizationId,
      legalTextVersion: null,
      legacyUnverified: true,
    });
    await expect(adapter.hasActive(partyId, 'TRATAMIENTO_CONTRACTUAL' as never)).resolves.toEqual({
      active: true,
      authorizationId,
      legalTextVersion: '3.0',
      legacyUnverified: false,
    });
    expect(legalTextRepository.findOne).toHaveBeenCalledWith({ where: { id: legalTextId } });
  });

  it('proyecta una lista vacía y convierte fechas de la lista a ISO', async () => {
    authorizationRepository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: authorizationId,
        partyId,
        purpose: 'TRATAMIENTO_CONTRACTUAL',
        kind: 'GRANT',
        granted: true,
        channel: ConsentChannel.TELEFONO,
        legalTextId,
        capturedAt: new Date('2026-10-14T15:00:00.000Z'),
      },
    ]);

    await expect(adapter.listForParty(partyId)).resolves.toEqual([]);
    await expect(adapter.listForParty(partyId)).resolves.toEqual([
      {
        id: authorizationId,
        partyId,
        purpose: 'TRATAMIENTO_CONTRACTUAL',
        kind: 'GRANT',
        granted: true,
        channel: ConsentChannel.TELEFONO,
        legalTextId,
        capturedAt: '2026-10-14T15:00:00.000Z',
      },
    ]);
  });

  it('rechaza un texto omitido salvo en importación histórica', async () => {
    await expect(
      adapter.record(
        {
          partyId,
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId: null,
          actorId,
        } as never,
        { ip: null, userAgent: null, manager: manager as unknown as EntityManager },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza fechas inválidas y fechas futuras de captura', async () => {
    await expect(
      adapter.record(
        {
          partyId,
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId,
          capturedAt: 'not-a-date',
          actorId,
        } as never,
        { ip: null, userAgent: null, manager: manager as unknown as EntityManager },
      ),
    ).rejects.toThrow('capturedAt debe ser una fecha válida no futura');

    const future = new Date(Date.now() + 60_000).toISOString();
    await expect(
      adapter.record(
        {
          partyId,
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId,
          capturedAt: future,
          actorId,
        } as never,
        { ip: null, userAgent: null, manager: manager as unknown as EntityManager },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authorizationRepository.save).not.toHaveBeenCalled();
  });

  it('recupera una carrera de sourceRef único cuando otra transacción ya insertó', async () => {
    const conflict = Object.assign(new Error('duplicate source'), {
      driverError: { code: '23505' },
    });
    authorizationRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: authorizationId });
    authorizationRepository.save.mockRejectedValue(conflict);

    await expect(
      adapter.record(
        {
          partyId,
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId,
          sourceRef: 'e2e:synthetic:1',
          actorId,
        } as never,
        { ip: null, userAgent: null, manager: manager as unknown as EntityManager },
      ),
    ).resolves.toEqual({ authorizationId, created: false });
  });

  it('propaga una colisión sin referencia idempotente o sin fila previa', async () => {
    const conflict = Object.assign(new Error('duplicate source'), {
      driverError: { code: '23505' },
    });
    authorizationRepository.save.mockRejectedValue(conflict);

    await expect(
      adapter.record(
        {
          partyId,
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId,
          actorId,
        } as never,
        { ip: null, userAgent: null, manager: manager as unknown as EntityManager },
      ),
    ).rejects.toBe(conflict);

    authorizationRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      adapter.record(
        {
          partyId,
          purpose: 'TRATAMIENTO_CONTRACTUAL',
          granted: true,
          channel: ConsentChannel.TELEFONO,
          legalTextId,
          sourceRef: 'e2e:synthetic:2',
          actorId,
        } as never,
        { ip: null, userAgent: null, manager: manager as unknown as EntityManager },
      ),
    ).rejects.toBe(conflict);
  });
});
