import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { BillingTitularContactReadAdapter } from './billing-titular-contact-read.adapter';

describe('BillingTitularContactReadAdapter', () => {
  const key = Buffer.from(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'hex',
  );
  const subscriberId = '00000000-0000-4000-8000-000000000011';
  let query: jest.Mock;
  let adapter: BillingTitularContactReadAdapter;

  beforeEach(() => {
    query = jest.fn();
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query,
      manager: { query } as unknown as EntityManager,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({
      tenantId: '00000000-0000-4000-8000-000000000001',
      schemaName: 'tenant_billing_test',
      tenantSlug: 'billing-test',
    });
    adapter = new BillingTitularContactReadAdapter(
      dataSource,
      new ConfigService({
        PII_ENCRYPTION_KEY: key.toString('hex'),
        MFA_ENCRYPTION_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  /** La consulta de la fila del suscriptor (las demás son SET LOCAL del runner). */
  const answerWith = (rows: unknown[]) =>
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM subscribers') ? rows : undefined,
    );

  it('descifra el correo registrado del titular en memoria', async () => {
    answerWith([
      {
        party_id: '00000000-0000-4000-8000-000000000021',
        email_encrypted: encryptAes256Gcm('titular@ejemplo.test', key),
        anonymized_at: null,
        anonymized_request_id: null,
      },
    ]);
    await expect(adapter.findTitularEmail(subscriberId)).resolves.toEqual({
      exists: true,
      anonymized: false,
      partyId: '00000000-0000-4000-8000-000000000021',
      email: 'titular@ejemplo.test',
    });
    const select = query.mock.calls.find(([sql]) => String(sql).includes('FROM subscribers'));
    expect(select?.[0]).toContain('deleted_at IS NULL');
    expect(select?.[1]).toEqual(['00000000-0000-4000-8000-000000000001', subscriberId]);
  });

  it('no existe si no hay fila', async () => {
    answerWith([]);
    await expect(adapter.findTitularEmail(subscriberId)).resolves.toEqual({
      exists: false,
      anonymized: false,
      partyId: null,
      email: null,
    });
  });

  it('un titular anonimizado o con supresión en curso no entrega correo', async () => {
    answerWith([
      {
        party_id: null,
        email_encrypted: encryptAes256Gcm('titular@ejemplo.test', key),
        anonymized_at: null,
        anonymized_request_id: '00000000-0000-4000-8000-000000000031',
      },
    ]);
    await expect(adapter.findTitularEmail(subscriberId)).resolves.toMatchObject({
      exists: true,
      anonymized: true,
      email: null,
    });
  });

  it('sin correo, o con un cifrado ilegible, queda sin correo y el log solo lleva el id', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    answerWith([
      { party_id: null, email_encrypted: null, anonymized_at: null, anonymized_request_id: null },
    ]);
    await expect(adapter.findTitularEmail(subscriberId)).resolves.toMatchObject({ email: null });
    answerWith([
      {
        party_id: null,
        email_encrypted: 'no-es-cifrado',
        anonymized_at: null,
        anonymized_request_id: null,
      },
    ]);
    await expect(adapter.findTitularEmail(subscriberId)).resolves.toMatchObject({ email: null });
    expect(warn).toHaveBeenCalledWith(
      `billing.titular_email.decrypt_failed subscriberId=${subscriberId}`,
    );
  });
});
