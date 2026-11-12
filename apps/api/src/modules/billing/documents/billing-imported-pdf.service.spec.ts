import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '@iwana/db';
import { encryptObjectBuffer } from '@iwana/storage';
import { AuditAction } from '@iwana/shared';
import { BillingImportedPdfService } from './billing-imported-pdf.service';

/** PDF histórico IMPORTADO: cifrado en reposo, auditado y con guarda de DATOS_BLOQUEADOS (H1, H5, H6). */
describe('BillingImportedPdfService', () => {
  const KEY_HEX = '9a'.repeat(32);
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: KEY_HEX,
    MFA_ENCRYPTION_KEY: '8b'.repeat(32),
    NODE_ENV: 'test',
  });
  const PDF = Buffer.from('%PDF-1.4 histórico');
  const tenant = { tenantId: 't-1', schemaName: 'tenant_x' };
  let key: string | null;
  const qr = { query: jest.fn(async () => [{ external_pdf_key: key }]), manager: {} };
  const dataSource = {
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      query: qr.query,
      manager: qr.manager,
    }),
  };
  const storage = { getObject: jest.fn() };
  const audit = { logWithin: jest.fn() };
  const service = new BillingImportedPdfService(
    dataSource as never,
    storage as never,
    config,
    audit as never,
  );
  const read = (buyerProtected = false) =>
    TenantContext.run({ ...tenant, tenantSlug: 'x' } as never, () =>
      service.read('doc-1', { actorId: 'u-1', buyerProtected }),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    key = 'tenant_x/billing-imported/uisp_invoice_1.pdf';
    storage.getObject.mockResolvedValue(encryptObjectBuffer(PDF, Buffer.from(KEY_HEX, 'hex')));
  });

  it('descifra el objeto IWE1 y audita RECORD_ACCESS', async () => {
    await expect(read()).resolves.toEqual(PDF);
    expect(storage.getObject).toHaveBeenCalledWith(key);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.RECORD_ACCESS, entityId: 'doc-1' }),
      qr.manager,
    );
  });

  it('DATOS_BLOQUEADOS sin permiso: 409 sin leer storage', async () => {
    await expect(read(true)).rejects.toBeInstanceOf(ConflictException);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('sin PDF: 404', async () => {
    key = null;
    await expect(read()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('H6: clave de otro schema no se pide al storage', async () => {
    key = 'tenant_otro/billing-imported/a.pdf';
    await expect(read()).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('un objeto en claro (sin IWE1) no se entrega', async () => {
    storage.getObject.mockResolvedValue(PDF);
    await expect(read()).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
