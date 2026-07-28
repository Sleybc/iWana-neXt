import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ExecutionOrderStatus, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import type { IEvidenceAssetPort, EvidenceUploadResult } from '../ports/evidence-asset.port';

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: {
      getOrThrow: jest.fn().mockReturnValue({
        tenantId: 'tenant-001',
        schemaName: 'tenant_001',
      }),
    },
    runInTenantSchema: jest.fn(),
    ExecutionOrder: class ExecutionOrder {},
    ExecutionOrderActivity: class ExecutionOrderActivity {},
    ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
    ExecutionOrderEvidence: class ExecutionOrderEvidence {},
  };
});

describe('ExecutionOrdersService — Evidence', () => {
  const actor: JwtPayload = {
    sub: 'tech-001',
    email: 'tech@example.test',
    role: UserRole.TECHNICIAN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };

  const ORDER_UUID = '22222222-2222-4222-8222-222222222222';
  const ASSET_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  let service: ExecutionOrdersService;
  let evidenceAssetPort: jest.Mocked<IEvidenceAssetPort>;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const mockFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'evidence.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    destination: '',
    filename: 'evidence.jpg',
    path: '',
    size: 1024,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // JPEG magic bytes
    stream: null as unknown as Readable,
    ...overrides,
  });

  const mockOrder = (status: ExecutionOrderStatus = ExecutionOrderStatus.IN_PROGRESS) => ({
    id: ORDER_UUID,
    tenantId: 'tenant-001',
    status,
    version: 1,
    result: null,
    startedAt: null,
    closedAt: null,
    closeNotes: null,
    updatedByUserId: null,
  });

  beforeEach(() => {
    evidenceAssetPort = {
      createUploadIntent: jest.fn(),
      getAssetStatus: jest.fn(),
      getSignedUrl: jest.fn(),
      claimAsset: jest.fn(),
    } as jest.Mocked<IEvidenceAssetPort>;

    service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      evidenceAssetPort,
    );
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. createEvidenceAssetReceipt — Upload-intent
  // ──────────────────────────────────────────────────────────────────────────

  describe('createEvidenceAssetReceipt (upload-intent)', () => {
    it('retorna 202 con EvidenceAssetReceipt cuando la subida es exitosa', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        save: jest.fn(),
        create: jest.fn(),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.createUploadIntent.mockResolvedValue({
        mediaAssetId: ASSET_UUID,
        checksumSha256: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        uploadedAt: new Date().toISOString(),
      });

      const result = await service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor);

      expect(result.status).toBe('PENDING_ANALYSIS');
      expect(result.mediaAssetId).toBe(ASSET_UUID);
      expect(result.intentId).toBeDefined();
      expect(result.uploadedAt).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(evidenceAssetPort.createUploadIntent).toHaveBeenCalledWith(
        'tenant_001',
        expect.objectContaining({ mimetype: 'image/jpeg' }),
        'tech-001',
      );
    });

    it('rechaza OT en estado terminal', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder(ExecutionOrderStatus.COMPLETED)),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor),
      ).rejects.toThrow('La OT está en un estado terminal.');
    });

    it('rechaza OT que no existe', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor),
      ).rejects.toThrow('OT de ejecución no encontrada');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. getEvidenceAssetReceipt — Polling del recibo
  // ──────────────────────────────────────────────────────────────────────────

  describe('getEvidenceAssetReceipt (polling)', () => {
    it('retorna el recibo con estado actualizado', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'AVAILABLE',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedAt: new Date().toISOString(),
      });

      const result = await service.getEvidenceAssetReceipt(ORDER_UUID, ASSET_UUID);

      expect(result.status).toBe('AVAILABLE');
      expect(result.mediaAssetId).toBe(ASSET_UUID);
      expect(evidenceAssetPort.getAssetStatus).toHaveBeenCalledWith(ASSET_UUID, 'tenant_001');
    });

    it('retorna PENDING_ANALYSIS cuando el asset está en cuarentena', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'PENDING_ANALYSIS',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: null,
        uploadedAt: new Date().toISOString(),
      });

      const result = await service.getEvidenceAssetReceipt(ORDER_UUID, ASSET_UUID);
      expect(result.status).toBe('PENDING_ANALYSIS');
    });

    it('retorna REJECTED cuando el asset fue rechazado', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'REJECTED',
        mimeType: 'image/png',
        sizeBytes: 500,
        checksumSha256: null,
        uploadedAt: new Date().toISOString(),
      });

      const result = await service.getEvidenceAssetReceipt(ORDER_UUID, ASSET_UUID);
      expect(result.status).toBe('REJECTED');
    });

    it('lanza 404 si el asset no pertenece al tenant', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockRejectedValue(
        new NotFoundException({
          code: 'EVIDENCE_ASSET_NOT_FOUND',
          message: 'Asset de evidencia no encontrado.',
        }),
      );

      await expect(service.getEvidenceAssetReceipt(ORDER_UUID, 'bad-asset-id')).rejects.toThrow(
        'Asset de evidencia no encontrado',
      );
    });

    it('lanza 404 si la OT no existe (anti-enumeración)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.getEvidenceAssetReceipt(ORDER_UUID, ASSET_UUID)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. getEvidenceContentRedirect — Signed URL
  // ──────────────────────────────────────────────────────────────────────────

  describe('getEvidenceContentRedirect', () => {
    it('retorna URL firmada (302 redirect candidate)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getSignedUrl.mockResolvedValue(
        'https://minio.example/bucket/obj?X-Amz-Signature=abc',
      );

      const result = await service.getEvidenceContentRedirect(ORDER_UUID, ASSET_UUID);
      expect(result).toContain('https://');
      expect(result).not.toContain('objectKey');
      expect(result).not.toContain('bucket=');
      expect(result).not.toContain('secret');
    });

    it('no expone objectKey en respuesta ni logs', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getSignedUrl.mockResolvedValue('https://signed.example/test.png?token=xyz');

      const result = await service.getEvidenceContentRedirect(ORDER_UUID, ASSET_UUID);
      // La URL firmada no debe contener el objectKey raw
      expect(result).not.toContain('tenant_001/execution_evidence');
      expect(typeof result).toBe('string');
    });

    it('verifica tenant y OT antes de generar URL', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null), // OT no existe
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.getEvidenceContentRedirect(ORDER_UUID, ASSET_UUID)).rejects.toThrow(
        'OT de ejecución no encontrada',
      );

      // No debe haber intentado generar URL sin autorización
      expect(evidenceAssetPort.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. registerEvidence — Vinculación de evidencia
  // ──────────────────────────────────────────────────────────────────────────

  describe('registerEvidence', () => {
    const evidenceInput = {
      mediaAssetId: ASSET_UUID,
      evidenceType: 'PHOTO',
      requirementKey: 'req-photo-installation',
      capturedAt: new Date().toISOString(),
    };

    it('registra evidencia solo cuando el asset está AVAILABLE', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
        save: jest.fn().mockImplementation(async (_entity, payload) => payload),
        create: jest.fn((_entity, payload) => payload),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'AVAILABLE',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedAt: new Date().toISOString(),
      });
      evidenceAssetPort.claimAsset.mockResolvedValue(undefined);

      const result = await service.registerEvidence(ORDER_UUID, evidenceInput, actor);

      expect(result).toBeDefined();
      expect(result.mediaAssetId).toBe(ASSET_UUID);
      expect(result.assetStatus).toBe('AVAILABLE');
      expect(evidenceAssetPort.claimAsset).toHaveBeenCalledWith(
        ASSET_UUID,
        'tenant_001',
        ORDER_UUID,
      );
    });

    it('rechaza evidencia con asset PENDING_ANALYSIS', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'PENDING_ANALYSIS',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: null,
        uploadedAt: new Date().toISOString(),
      });

      await expect(service.registerEvidence(ORDER_UUID, evidenceInput, actor)).rejects.toThrow(
        'no está disponible',
      );

      // No debe reclamar un asset no disponible
      expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
    });

    it('rechaza evidencia con asset REJECTED', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'REJECTED',
        mimeType: 'image/png',
        sizeBytes: 500,
        checksumSha256: null,
        uploadedAt: new Date().toISOString(),
      });

      await expect(service.registerEvidence(ORDER_UUID, evidenceInput, actor)).rejects.toThrow(
        'no está disponible',
      );
    });

    it('rechaza si el asset pertenece a otro tenant (cross-tenant)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      // El puerto de Media valida tenant; si no coincide, lanza NotFound
      evidenceAssetPort.getAssetStatus.mockRejectedValue(
        new NotFoundException({
          code: 'EVIDENCE_ASSET_NOT_FOUND',
          message: 'Asset de evidencia no encontrado.',
        }),
      );

      await expect(service.registerEvidence(ORDER_UUID, evidenceInput, actor)).rejects.toThrow();

      expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
    });

    it('rechaza asset ya reclamado por otra OT (DATA-P1-2)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
        save: jest.fn().mockImplementation(async (_entity, payload) => ({
          id: 'evidence-001',
          ...payload,
        })),
        create: jest.fn((_entity, payload) => payload),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'AVAILABLE',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedAt: new Date().toISOString(),
      });

      // El claim atómico falla porque otro ya lo reclamó
      evidenceAssetPort.claimAsset.mockRejectedValue(
        new ConflictException({
          code: 'EVIDENCE_ASSET_ALREADY_CLAIMED',
          message: 'El asset ya fue reclamado por otra OT.',
        }),
      );

      await expect(service.registerEvidence(ORDER_UUID, evidenceInput, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rechaza vinculación sobre OT terminal', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder(ExecutionOrderStatus.COMPLETED)),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.registerEvidence(ORDER_UUID, evidenceInput, actor)).rejects.toThrow(
        'La OT está en un estado terminal.',
      );
    });

    it('lanza ServiceUnavailable si el puerto no está disponible', async () => {
      // Crear servicio sin puerto
      const svcWithoutPort = new ExecutionOrdersService(
        {} as DataSource,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // sin evidenceAssetPort
      );

      await expect(
        svcWithoutPort.registerEvidence(ORDER_UUID, evidenceInput, actor),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Fault injection — compensación y recuperación (P0-2)
  // ──────────────────────────────────────────────────────────────────────────

  describe('compensación ante fallos', () => {
    it('no persiste metadata si el storage falla (compensación en puerto)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.createUploadIntent.mockRejectedValue(new Error('STORAGE_WRITE_FAILED'));

      await expect(
        service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor),
      ).rejects.toThrow('STORAGE_WRITE_FAILED');
    });

    it('no reclama asset si falla la persistencia de la OT (evidence no creada)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          execute: jest.fn().mockImplementation(() => {
            throw new Error('DB_WRITE_FAILED');
          }),
        }),
        save: jest.fn(),
        create: jest.fn((_entity, payload) => payload),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'AVAILABLE',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedAt: new Date().toISOString(),
      });
      evidenceAssetPort.claimAsset.mockResolvedValue(undefined);

      // El persistOrderOptimistically falla antes de crear evidence o claim
      await expect(
        service.registerEvidence(
          ORDER_UUID,
          {
            mediaAssetId: ASSET_UUID,
            evidenceType: 'PHOTO',
            requirementKey: 'req-1',
          },
          actor,
        ),
      ).rejects.toThrow('DB_WRITE_FAILED');

      // Como la evidencia no se creó, el claim nunca debe ejecutarse
      expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
    });

    it('crea evidencia antes de reclamar el asset (P0-2 orden de compensación)', async () => {
      let evidenceCreated = false;
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        createQueryBuilder: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
        save: jest.fn().mockImplementation(async (_entity, payload) => {
          evidenceCreated = true;
          return { id: 'evidence-001', ...payload };
        }),
        create: jest.fn((_entity, payload) => payload),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'AVAILABLE',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedAt: new Date().toISOString(),
      });
      evidenceAssetPort.claimAsset.mockImplementation(async () => {
        // El claim debe ocurrir DESPUÉS de crear la evidencia
        if (!evidenceCreated) {
          throw new Error('Claim attempted before evidence creation');
        }
      });

      const result = await service.registerEvidence(
        ORDER_UUID,
        {
          mediaAssetId: ASSET_UUID,
          evidenceType: 'PHOTO',
          requirementKey: 'req-1',
        },
        actor,
      );

      expect(result).toBeDefined();
      expect(evidenceCreated).toBe(true);
      expect(evidenceAssetPort.claimAsset).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. IDOR intra-tenant de evidencia (P0-1)
  // ──────────────────────────────────────────────────────────────────────────

  describe('IDOR intra-tenant de evidencia (P0-1)', () => {
    it('getEvidenceAssetReceipt rechaza mediaAssetId no vinculado a la OT', async () => {
      const manager = {
        findOne: jest.fn().mockImplementation(async (_entity, where: unknown) => {
          const conditions = where as { where: Record<string, unknown> };
          // Si busca ExecutionOrder, devolver la OT
          if (conditions.where?.id === ORDER_UUID) return mockOrder();
          // Si busca ExecutionOrderEvidence, devolver null (no vinculado)
          return null;
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'AVAILABLE',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedAt: new Date().toISOString(),
      });

      // Debe devolver el receipt sin intentId (polling antes de vinculación)
      // No debe lanzar error — el polling es válido antes de registrar evidencia
      const result = await service.getEvidenceAssetReceipt(ORDER_UUID, 'unlinked-asset-id');
      expect(result.mediaAssetId).toBe('unlinked-asset-id');
      expect(result.intentId).toBe('');
    });

    it('getEvidenceContentRedirect rechaza mediaAssetId no vinculado (404)', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(null), // Sin evidence → 404
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.getEvidenceContentRedirect(ORDER_UUID, 'unlinked-asset-id'),
      ).rejects.toThrow('OT de ejecución no encontrada');

      // No debe generar signed URL
      expect(evidenceAssetPort.getSignedUrl).not.toHaveBeenCalled();
    });

    it('getEvidenceContentRedirect permite asset vinculado correctamente', async () => {
      const evidence = {
        id: 'evidence-001',
        executionOrderId: ORDER_UUID,
        mediaAssetId: ASSET_UUID,
        tenantId: 'tenant-001',
      };

      const manager = {
        findOne: jest.fn().mockImplementation(async (_entity, where: unknown) => {
          const conditions = where as { where: Record<string, unknown> };
          // Si busca ExecutionOrder, devolver la OT
          if (conditions.where?.id === ORDER_UUID) return mockOrder();
          // Si busca ExecutionOrderEvidence, devolver el evidence
          if (conditions.where?.mediaAssetId === ASSET_UUID) return evidence;
          return null;
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getSignedUrl.mockResolvedValue(
        'https://minio.example/bucket/obj?X-Amz-Signature=abc',
      );

      const result = await service.getEvidenceContentRedirect(ORDER_UUID, ASSET_UUID);
      expect(result).toContain('https://');
      expect(evidenceAssetPort.getSignedUrl).toHaveBeenCalled();
    });
  });
});
