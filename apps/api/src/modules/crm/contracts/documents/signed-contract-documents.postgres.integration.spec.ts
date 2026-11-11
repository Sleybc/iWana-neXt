import { TenantStatus } from '@iwana/shared';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditLog, TenantContext, dataSourceOptions, runInTenantSchema } from '@iwana/db';
import {
  AccessPermissionKey,
  NetworkType,
  SIGNED_CONTRACT_DOCUMENT_RESTRICTED_CODE,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';
import { encryptObjectBuffer, type StoragePort } from '@iwana/storage';
import { AuditService } from '../../../audit/audit.service';
import { PlatformAuditService } from '../../../audit/platform-audit.service';
import { Contract } from '../entities/contract.entity';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { ContractsService } from '../contracts.service';
import { ContractSignatureService } from './contract-signature.service';
import { ContractSignedCopyProcessor } from './contract-signed-copy.processor';
import { SignedContractDocumentsService } from './signed-contract-documents.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithDb = dbAvailable && safeDatabaseName ? describe : describe.skip;

const KEY_HEX = '4ef6bb844c9e858d2a93b5585599d419f79148fc24b5d9b0e03f5a53fa146d27';
const KEY = Buffer.from(KEY_HEX, 'hex');

/**
 * Bloque G (spec §5 G; CA-4, CA-9) contra PostgreSQL real: lista y descarga del contrato
 * firmado con y sin `crm.subscribers.document.read`, huella alterada, titular anonimizado y
 * copia por correo idempotente por firma (migración 189).
 */
describeWithDb('Contrato firmado en Documentos y copia por correo: PostgreSQL real', () => {
  let dataSource: DataSource;
  let documents: SignedContractDocumentsService;
  let processor: ContractSignedCopyProcessor;
  const tenantId = randomUUID();
  const reader = randomUUID();
  const schemaName = 'tenant_signed_docs_' + randomUUID().replace(/-/g, '');
  const quote = (identifier: string) => '"' + identifier.replace(/"/g, '""') + '"';
  const context = { tenantId, schemaName, tenantSlug: 'signed-docs-it' };
  const inContext = <T>(callback: () => Promise<T>) => TenantContext.run(context, callback);
  const objects = new Map<string, Buffer>();
  const storage = {
    putObject: async (key: string, body: Buffer) => void objects.set(key, Buffer.from(body)),
    getObject: async (key: string) => {
      const value = objects.get(key);
      if (!value) throw new Error('Objeto inexistente.');
      return value;
    },
  } as unknown as StoragePort;
  let granted: string[] = [];
  const emails = new Map<string, string | null>();
  const sendMail = jest.fn(async (_options: unknown) => undefined);

  const rows = <T>(sql: string, params: unknown[] = []) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.query(sql, params) as Promise<T[]>);

  async function fixture(email: string | null = 'titular@example.invalid') {
    const subscriberId = randomUUID();
    const contractId = randomUUID();
    const generationId = randomUUID();
    const signatureId = randomUUID();
    const signed = Buffer.from(`%PDF-1.7 contrato firmado ${contractId}`);
    const signedSha = createHash('sha256').update(signed).digest('hex');
    const objectKey = `${schemaName}/contracts/${contractId}/${generationId}.signed.pdf.enc`;
    await storage.putObject(objectKey, encryptObjectBuffer(signed, KEY), {
      contentType: 'application/octet-stream',
    });
    await rows(
      `INSERT INTO subscribers (
         id, tenant_id, person_type, customer_segment, document_type, nit, business_name,
         vat_treatment, tax_regime, vat_responsibility, rut_responsibilities, address,
         created_by
       ) VALUES ($1, $2, 'JURIDICA', 'PYME', 'NIT', '900000001', 'Adquirente de prueba',
         'STANDARD', 'COMMON', 'RESPONSABLE', ARRAY[]::text[], 'Dirección de prueba', $3)`,
      [subscriberId, tenantId, reader],
    );
    await rows(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status,
                              alias, service_usage, billing_cycle_day, fiscal_document)
       VALUES ($1, $2, $3, 'plan-1', $4::jsonb, 'ACTIVE', 'Servicio sintético', 'NON_RESIDENTIAL',
               15, '900000001')`,
      [contractId, tenantId, subscriberId, JSON.stringify({ id: 'plan-1', name: 'Plan hogar' })],
    );
    await rows(
      `INSERT INTO contract_document_generations
         (id, tenant_id, contract_id, execution_order_id, status, template_legal_text_id,
          template_version, snapshot_encrypted, snapshot_sha256, document_object_key,
          document_sha256, requested_by, completed_at)
       VALUES ($1, $2, $3, $4, 'READY', $5, '1.0', 'cifrado', $6, $7, $6, $8, now())`,
      [generationId, tenantId, contractId, randomUUID(), randomUUID(), 'e'.repeat(64), 'k', reader],
    );
    await rows(
      `INSERT INTO contract_signatures
         (id, tenant_id, contract_id, generation_id, idempotency_key, execution_order_id,
          technician_id, signed_at, signer_encrypted, template_legal_text_id, template_version,
          unsigned_document_sha256, signed_document_sha256, signature_asset_id,
          signature_object_key, signed_document_asset_id, signed_document_object_key,
          billing_start_date, device_user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-11-10T15:00:00Z', 'cifrado', $8, '1.0',
               $9, $10, $11, 'firma', $12, $13, '2026-11-10', 'jest')`,
      [
        signatureId,
        tenantId,
        contractId,
        generationId,
        randomUUID(),
        randomUUID(),
        reader,
        randomUUID(),
        'e'.repeat(64),
        signedSha,
        randomUUID(),
        randomUUID(),
        objectKey,
      ],
    );
    emails.set(subscriberId, email);
    return { subscriberId, contractId, signatureId, signed, objectKey };
  }

  const payload = (signatureId: string) => ({ ...context, signatureId });
  const copyStatus = async (signatureId: string) =>
    (
      await rows<{ copy_email_status: string | null }>(
        `SELECT copy_email_status FROM contract_signatures WHERE id = $1`,
        [signatureId],
      )
    )[0]?.copy_email_status ?? null;

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Contract, Subscriber, AuditLog],
      migrations: [],
      logging: false,
      extra: { max: 10, min: 1, application_name: schemaName },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Signed docs synthetic', $2, $3, 'ACTIVE', 'signed-docs@example.invalid')`,
      [tenantId, `signed-docs-${tenantId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query('CREATE SCHEMA ' + quote(schemaName));
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, context.tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const config = new ConfigService({
      NODE_ENV: 'test',
      PII_ENCRYPTION_KEY: KEY_HEX,
      MFA_ENCRYPTION_KEY: KEY_HEX,
    });
    const audit = new AuditService(dataSource, {
      log: jest.fn(),
    } as unknown as PlatformAuditService);
    const tenantSettings = { getTimezone: jest.fn(async () => 'America/Bogota') };
    const contracts = new ContractsService(
      dataSource,
      {
        getPlanById: jest.fn(async () => ({
          id: 'plan-1',
          vatConcept: VatConcept.INTERNET_ACCESS,
          networkType: NetworkType.FIXED,
        })),
      } as never,
      {
        resolve: jest.fn(() => ({
          status: 'RESOLVED',
          treatment: VatTreatment.EXEMPT,
          legalBasis: VatLegalBasis.ET_481_H,
          ratePercent: 0,
          requiresAccountantReview: false,
        })),
      } as never,
      audit,
      {} as never,
      config,
      {} as never,
      {} as never,
      undefined,
      { activeMarks: jest.fn(async () => ({})) } as never,
      tenantSettings as never,
    );
    const signature = new ContractSignatureService(
      dataSource,
      {} as never,
      storage,
      contracts,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      tenantSettings as never,
      audit,
      config,
    );
    documents = new SignedContractDocumentsService(
      dataSource,
      contracts,
      signature,
      { getEffectivePermissionsForUser: jest.fn(async () => granted) } as never,
      audit,
    );
    processor = new ContractSignedCopyProcessor(
      dataSource,
      signature,
      contracts,
      {
        findById: jest.fn(async (id: string) => ({ id, email: emails.get(id) ?? null })),
      } as never,
      tenantSettings as never,
      { sendMail } as never,
      audit,
      {
        findTenantLifecycleById: jest.fn(async (id: string) =>
          id === tenantId
            ? {
                id,
                schemaName,
                slug: context.tenantSlug,
                status: TenantStatus.ACTIVE,
                deletedAt: null,
              }
            : null,
        ),
      } as never,
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (!/^tenant_signed_docs_[a-f0-9]{32}$/.test(schemaName))
        throw new Error('Schema inválido.');
      await dataSource.query('DROP SCHEMA IF EXISTS ' + quote(schemaName) + ' CASCADE');
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    granted = [];
    sendMail.mockReset();
    sendMail.mockResolvedValue(undefined);
  });

  it('CA-9: lista el contrato firmado y marca la descarga según el permiso del documento', async () => {
    const f = await fixture();
    const without = await inContext(() =>
      documents.listForSubscriber(f.subscriberId, { sub: reader } as never),
    );
    expect(without).toEqual([
      {
        contractId: f.contractId,
        signedAt: '2026-11-10T15:00:00.000Z',
        templateVersion: '1.0',
        downloadable: false,
        restriction: 'DOCUMENT_NUMBER_RESTRICTED',
      },
    ]);
    granted = [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ];
    const withPermission = await inContext(() =>
      documents.listForSubscriber(f.subscriberId, { sub: reader } as never),
    );
    expect(withPermission[0]).toMatchObject({ downloadable: true, restriction: null });
  });

  it('descarga con permiso: devuelve el PDF verificado y audita el acceso', async () => {
    const f = await fixture();
    granted = [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ];
    const pdf = await inContext(() => documents.download(f.contractId, { sub: reader } as never));
    expect(pdf.equals(f.signed)).toBe(true);
    const audits = await rows<{ action: string; new_value: { purpose?: string } }>(
      `SELECT action, new_value FROM audit_logs WHERE entity_id = $1`,
      [f.contractId],
    );
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'RECORD_ACCESS',
          new_value: expect.objectContaining({ purpose: 'SIGNED_CONTRACT_DOWNLOAD' }),
        }),
      ]),
    );
  });

  it('sin crm.subscribers.document.read: 403 con código propio y sin auditoría de acceso', async () => {
    const f = await fixture();
    const error = await inContext(() =>
      documents.download(f.contractId, { sub: reader } as never),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: SIGNED_CONTRACT_DOCUMENT_RESTRICTED_CODE,
    });
    const audits = await rows(`SELECT 1 FROM audit_logs WHERE entity_id = $1`, [f.contractId]);
    expect(audits).toHaveLength(0);
  });

  it('CA-4: huella alterada → 409 CONTRACT_DOCUMENT_INTEGRITY_FAILED', async () => {
    const f = await fixture();
    granted = [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ];
    await storage.putObject(f.objectKey, encryptObjectBuffer(Buffer.from('%PDF alterado'), KEY), {
      contentType: 'application/octet-stream',
    });
    const error = await inContext(() =>
      documents.download(f.contractId, { sub: reader } as never),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'CONTRACT_DOCUMENT_INTEGRITY_FAILED',
    });
  });

  it('titular anonimizado: la lista no ofrece descarga y la descarga se rechaza', async () => {
    const f = await fixture();
    granted = [AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ];
    await rows(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [f.subscriberId, randomUUID()],
    );
    const list = await inContext(() =>
      documents.listForSubscriber(f.subscriberId, { sub: reader } as never),
    );
    expect(list[0]).toMatchObject({ downloadable: false, restriction: 'TITULAR_RESTRICTED' });
    await expect(
      inContext(() => documents.download(f.contractId, { sub: reader } as never)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('CA-9: la copia por correo sale una sola vez por firma, aun con trabajos simultáneos', async () => {
    const f = await fixture();
    const results = await Promise.all([
      processor.send(payload(f.signatureId)),
      processor.send(payload(f.signatureId)),
    ]);
    expect(results).toEqual(['SENT', 'SENT']);
    expect(await processor.send(payload(f.signatureId))).toBe('SENT');
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0]?.[0] as unknown as {
      to: string;
      text: string;
      attachments: Array<{ content: Buffer; contentType: string }>;
    };
    expect(mail.to).toBe('titular@example.invalid');
    expect(mail.text).toContain('10/11/2026');
    expect(mail.attachments[0]?.contentType).toBe('application/pdf');
    expect(mail.attachments[0]?.content.equals(f.signed)).toBe(true);
    expect(await copyStatus(f.signatureId)).toBe('SENT');
  });

  it('sin correo del titular: no envía y deja NO_EMAIL registrado', async () => {
    const f = await fixture(null);
    expect(await processor.send(payload(f.signatureId))).toBe('NO_EMAIL');
    expect(sendMail).not.toHaveBeenCalled();
    expect(await copyStatus(f.signatureId)).toBe('NO_EMAIL');
    const audits = await rows<{ new_value: { copyEmailStatus?: string } }>(
      `SELECT new_value FROM audit_logs WHERE entity_id = $1`,
      [f.signatureId],
    );
    expect(audits[0]?.new_value.copyEmailStatus).toBe('NO_EMAIL');
  });

  it('si el envío falla no queda registrado y el reintento lo envía', async () => {
    const f = await fixture();
    sendMail.mockRejectedValueOnce(new Error('smtp caído'));
    await expect(processor.send(payload(f.signatureId))).rejects.toThrow('smtp caído');
    expect(await copyStatus(f.signatureId)).toBeNull();
    expect(await processor.send(payload(f.signatureId))).toBe('SENT');
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('titular anonimizado: no envía la copia', async () => {
    const f = await fixture();
    await rows(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [f.subscriberId, randomUUID()],
    );
    expect(await processor.send(payload(f.signatureId))).toBe('TITULAR_RESTRICTED');
    expect(sendMail).not.toHaveBeenCalled();
  });
});
