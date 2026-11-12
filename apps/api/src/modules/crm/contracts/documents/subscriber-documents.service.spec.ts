import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '@iwana/db';
import { encryptObjectBuffer } from '@iwana/storage';
import { AccessPermissionKey } from '@iwana/shared';
import { SubscriberDocumentsService } from './subscriber-documents.service';

/** Soportes importados: cifrados en reposo (H1), clave del schema (H6) y guarda de titular. */
describe('SubscriberDocumentsService', () => {
  const KEY_HEX = '9a'.repeat(32);
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: KEY_HEX,
    MFA_ENCRYPTION_KEY: '8b'.repeat(32),
    NODE_ENV: 'test',
  });
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const row = (storage_key: string) => ({
    id: '71000000-0000-4000-8000-000000000001',
    subscriber_id: '72000000-0000-4000-8000-000000000001',
    kind: 'IMAGEN',
    content_type: 'image/jpeg',
    size_bytes: 4,
    origin: 'IMPORTADO',
    visibility: 'INTERNA',
    document_date: null,
    created_at: '2026-11-12T00:00:00.000Z',
    storage_key,
  });
  let rows = [row('tenant_x/subscriber-documents/uisp_document_1.jpg')];
  const dataSource = {
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      query: jest.fn(async () => rows),
      manager: {},
    }),
  };
  const storage = { getObject: jest.fn() };
  const contracts = { assertSubscriberNotBlockedForMutation: jest.fn() };
  const permissions = {
    getEffectivePermissionsForUser: jest.fn(async () => [
      AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ,
    ]),
  };
  const audit = { log: jest.fn() };
  const service = new SubscriberDocumentsService(
    dataSource as never,
    storage as never,
    contracts as never,
    permissions as never,
    audit as never,
    config,
  );
  const inTenant = <T>(run: () => Promise<T>) =>
    TenantContext.run({ tenantId: 't-1', schemaName: 'tenant_x', tenantSlug: 'x' } as never, run);
  const actor = { sub: 'u-1' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    rows = [row('tenant_x/subscriber-documents/uisp_document_1.jpg')];
    contracts.assertSubscriberNotBlockedForMutation.mockResolvedValue(undefined);
    storage.getObject.mockResolvedValue(encryptObjectBuffer(JPG, Buffer.from(KEY_HEX, 'hex')));
  });

  it('descarga descifrando el objeto IWE1', async () => {
    await expect(inTenant(() => service.download('s-1', 'd-1', actor))).resolves.toEqual({
      content: JPG,
      contentType: 'image/jpeg',
    });
  });

  it('H6: una clave de otro schema no se pide al storage', async () => {
    rows = [row('tenant_otro/subscriber-documents/a.jpg')];
    await expect(inTenant(() => service.download('s-1', 'd-1', actor))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('el listado aplica la misma guarda de titular bloqueado o anonimizado', async () => {
    contracts.assertSubscriberNotBlockedForMutation.mockRejectedValue(new ConflictException({}));
    await expect(inTenant(() => service.listForSubscriber('s-1'))).rejects.toMatchObject({
      response: { code: 'SUBSCRIBER_DOCUMENT_TITULAR_RESTRICTED' },
    });
  });

  it('el listado de un titular sin restricción devuelve los soportes sin la clave', async () => {
    const list = await inTenant(() => service.listForSubscriber('s-1'));
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('storage');
  });
});
