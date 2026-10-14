import { AuditAction } from '@iwana/shared';
import { TenantContext } from '@iwana/db';
import { BadRequestException } from '@nestjs/common';
import { PrivacyEvidenceController } from './privacy-evidence.controller';

describe('PrivacyEvidenceController A16', () => {
  afterEach(() => jest.restoreAllMocks());

  it('carga evidencia mediante el flujo dedicado y audita solo el ID opaco', async () => {
    const asset = {
      id: '10000000-0000-4000-8000-000000000001',
      mimeType: 'application/pdf',
      sizeBytes: 512,
      publicUrl: null,
    };
    const mediaService = { uploadPrivacyEvidence: jest.fn().mockResolvedValue(asset) };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ schemaName: 'tenant_test' } as never);
    const controller = new PrivacyEvidenceController(mediaService as never, auditService as never);
    const file = {
      mimetype: 'application/pdf',
      size: 512,
      buffer: Buffer.from('%PDF-'),
    } as Express.Multer.File;

    await expect(
      controller.upload({ sub: '20000000-0000-4000-8000-000000000001' } as never, file),
    ).resolves.toEqual({
      data: { mediaId: asset.id, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes },
    });
    expect(mediaService.uploadPrivacyEvidence).toHaveBeenCalledWith(
      'tenant_test',
      file,
      '20000000-0000-4000-8000-000000000001',
    );
    expect(auditService.log).toHaveBeenCalledWith({
      action: AuditAction.CREATE,
      entityType: 'PrivacyEvidence',
      entityId: asset.id,
      userId: '20000000-0000-4000-8000-000000000001',
    });
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('buffer');
  });

  it('rechaza una petición sin archivo antes de consultar tenant o almacenamiento', async () => {
    const mediaService = { uploadPrivacyEvidence: jest.fn() };
    const auditService = { log: jest.fn() };
    const controller = new PrivacyEvidenceController(mediaService as never, auditService as never);

    await expect(
      controller.upload({ sub: '20000000-0000-4000-8000-000000000001' } as never, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mediaService.uploadPrivacyEvidence).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
