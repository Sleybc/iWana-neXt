import { DataSource } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ExecutionOrderStatus, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersService } from '../services/execution-orders.service';
import type { IEvidenceAssetPort, EvidenceUploadResult } from '../ports/evidence-asset.port';
import { EvidenceAssetProvider } from '../../media/evidence-asset.provider';
import { ExecutionOrderEvidenceUploadIntent, MediaAsset } from '@iwana/db';

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
    ExecutionOrderEvidenceUploadIntent: class ExecutionOrderEvidenceUploadIntent {},
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
  let reliabilityService: {
    beginIdempotent: jest.Mock;
    completeIdempotency: jest.Mock;
    appendAuditIntent: jest.Mock;
  };
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

  const currentUploadIntent = (
    overrides: Partial<{
      status: string;
      expiresAt: Date | null;
    }> = {},
  ) => ({
    id: 'intent-001',
    executionOrderId: ORDER_UUID,
    tenantId: 'tenant-001',
    mediaAssetId: ASSET_UUID,
    status: 'PENDING_ANALYSIS',
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });

  beforeEach(() => {
    evidenceAssetPort = {
      createUploadIntent: jest.fn(),
      getAssetStatus: jest.fn(),
      getSignedUrl: jest.fn(),
      claimAsset: jest.fn(),
    } as jest.Mocked<IEvidenceAssetPort>;

    reliabilityService = {
      beginIdempotent: jest.fn().mockResolvedValue(null),
      completeIdempotency: jest.fn().mockResolvedValue(undefined),
      appendAuditIntent: jest.fn().mockResolvedValue(undefined),
    };

    service = new ExecutionOrdersService(
      {} as DataSource,
      undefined,
      undefined,
      undefined,
      reliabilityService as never,
      undefined,
      undefined,
      evidenceAssetPort,
    );
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    jest.clearAllMocks();
  });

  describe('listEvidences', () => {
    it('verifica la OT y devuelve solo el contrato mínimo ordenado y paginado', async () => {
      const capturedAt = new Date('2026-07-27T15:00:00.000Z');
      const receivedAt = new Date('2026-07-27T15:01:00.000Z');
      const evidence = {
        id: 'evidence-001',
        executionOrderId: ORDER_UUID,
        tenantId: 'tenant-001',
        evidenceType: 'PHOTO',
        mediaAssetId: ASSET_UUID,
        requirementKey: 'req-photo-install',
        assetStatus: 'AVAILABLE',
        capturedAt,
        createdAt: receivedAt,
        actorUserId: 'actor-001',
      };
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[evidence], 1]),
      };
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const result = await service.listEvidences(ORDER_UUID, { page: 1, limit: 100 });

      expect(manager.findOne).toHaveBeenCalledWith(expect.anything(), {
        where: { id: ORDER_UUID, tenantId: 'tenant-001' },
      });
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('evidence.created_at', 'ASC');
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('evidence.id', 'ASC');
      expect(queryBuilder.take).toHaveBeenCalledWith(100);
      expect(result.data).toEqual([
        {
          id: 'evidence-001',
          mediaAssetId: ASSET_UUID,
          evidenceType: 'PHOTO',
          requirementKey: 'req-photo-install',
          capturedAt: capturedAt.toISOString(),
          receivedAt: receivedAt.toISOString(),
          status: 'AVAILABLE',
          assetStatus: 'AVAILABLE',
          createdAt: receivedAt.toISOString(),
        },
      ]);
      expect(result.data[0]).not.toHaveProperty('tenantId');
      expect(result.data[0]).not.toHaveProperty('actorUserId');
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 100, hasMore: false });
    });

    it('rechaza una OT inexistente antes de consultar evidencias', async () => {
      const queryBuilder = { getManyAndCount: jest.fn() };
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.listEvidences(ORDER_UUID, { page: 1, limit: 25 })).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('rechaza una página que excede la cota de offset', async () => {
      await expect(service.listEvidences(ORDER_UUID, { page: 100, limit: 100 })).rejects.toThrow(
        'El número de página excede el límite permitido',
      );
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });
  });

  describe('listActivities y listItemUsage', () => {
    it('devuelve actividades paginadas con actorRef y sin campos tenant-owned', async () => {
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 'activity-001',
              activityType: 'INSTALLATION',
              description: 'Actividad autorizada',
              actorUserId: 'actor-001',
              createdAt: new Date('2026-07-27T15:00:00.000Z'),
              tenantId: 'tenant-001',
            },
          ],
          3,
        ]),
      };
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const result = await service.listActivities(ORDER_UUID, { page: 2, limit: 1 });

      expect(result).toEqual({
        data: [
          {
            id: 'activity-001',
            activityType: 'INSTALLATION',
            description: 'Actividad autorizada',
            actorRef: { type: 'USER', id: 'actor-001' },
            createdAt: '2026-07-27T15:00:00.000Z',
          },
        ],
        meta: expect.objectContaining({ total: 3, page: 2, limit: 1, totalPages: 3 }),
      });
      expect(result.data[0]).not.toHaveProperty('tenantId');
    });

    it('devuelve consumos paginados con quantity entero y forma de contrato', async () => {
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 'usage-001',
              itemId: 'item-001',
              quantity: 2,
              serialNumber: null,
              action: 'CONSUME',
              finalDisposition: 'INTERNAL_CONSUMPTION',
              inventoryRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              movementStatus: 'PENDING',
              createdAt: new Date('2026-07-27T15:01:00.000Z'),
            },
          ],
          1,
        ]),
      };
      const manager = {
        findOne: jest.fn().mockResolvedValue(mockOrder()),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      const result = await service.listItemUsage(ORDER_UUID, { page: 1, limit: 25 });

      expect(result.data).toEqual([
        {
          id: 'usage-001',
          itemId: 'item-001',
          quantity: 2,
          action: 'CONSUME',
          finalDisposition: 'INTERNAL_CONSUMPTION',
          inventoryRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          movementStatus: 'PENDING',
          createdAt: '2026-07-27T15:01:00.000Z',
        },
      ]);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 25 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. createEvidenceAssetReceipt — Upload-intent
  // ──────────────────────────────────────────────────────────────────────────

  describe('createEvidenceAssetReceipt (upload-intent)', () => {
    it('retorna 202 con EvidenceAssetReceipt cuando la subida es exitosa', async () => {
      const intentId = '11111111-1111-4111-8111-111111111111';
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder()) // requireOrder
          .mockResolvedValueOnce(null), // findOne(ExecutionOrderEvidenceUploadIntent) — aún no creado
        save: jest.fn().mockResolvedValue({
          id: intentId,
          executionOrderId: ORDER_UUID,
          tenantId: 'tenant-001',
          mediaAssetId: null,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        }),
        create: jest.fn().mockReturnValue({}),
        update: jest.fn().mockResolvedValue(undefined),
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

    it('crea un único intent con headers de comando e idempotencia tenant-aware', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(mockOrder()),
        save: jest.fn().mockResolvedValue({
          id: 'intent-first-001',
          executionOrderId: ORDER_UUID,
          tenantId: 'tenant-001',
          mediaAssetId: null,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          actorUserId: actor.sub,
        }),
        create: jest.fn().mockImplementation((_entity, value) => value),
        update: jest.fn().mockResolvedValue(undefined),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      reliabilityService.beginIdempotent.mockResolvedValue({
        intentId: 'idempotency-intent-001',
        replay: false,
        resourceRef: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
      });
      evidenceAssetPort.createUploadIntent.mockResolvedValue({
        mediaAssetId: ASSET_UUID,
        checksumSha256: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        uploadedAt: '2026-07-30T12:00:00.000Z',
      });

      const result = await service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
        idempotencyKey: 'evidence-upload-key-001',
        ifMatch: '1',
        requireIdempotency: true,
        requireIfMatch: true,
        correlationId: '00000000-0000-4000-8000-000000000001',
      });

      expect(result).toEqual(
        expect.objectContaining({ intentId: 'intent-first-001', mediaAssetId: ASSET_UUID }),
      );
      expect(reliabilityService.beginIdempotent).toHaveBeenCalledWith(
        manager,
        'tenant-001',
        'execution_order.evidence_asset',
        'evidence-upload-key-001',
        expect.objectContaining({
          tenantId: 'tenant-001',
          payload: expect.objectContaining({ executionOrderId: ORDER_UUID }),
        }),
      );
      expect(evidenceAssetPort.createUploadIntent).toHaveBeenCalledTimes(1);
      expect(reliabilityService.completeIdempotency).toHaveBeenCalledTimes(2);
    });

    it('reproduce el recibo original sin validar If-Match ni crear otro asset', async () => {
      const createdAt = new Date('2026-07-30T12:00:00.000Z');
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce({
            id: 'intent-first-001',
            executionOrderId: ORDER_UUID,
            tenantId: 'tenant-001',
            mediaAssetId: ASSET_UUID,
            status: 'PENDING_ANALYSIS',
            expiresAt: new Date('2026-07-31T12:00:00.000Z'),
            createdAt,
          }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      reliabilityService.beginIdempotent.mockResolvedValue({
        intentId: 'idempotency-intent-001',
        replay: true,
        resourceRef: 'intent-first-001',
        resultStatus: 'COMPLETED',
        resourceVersion: 1,
      });

      const result = await service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
        idempotencyKey: 'evidence-upload-key-001',
        ifMatch: '0',
        requireIdempotency: true,
        requireIfMatch: true,
        correlationId: '00000000-0000-4000-8000-000000000001',
      });

      expect(result).toEqual({
        intentId: 'intent-first-001',
        mediaAssetId: ASSET_UUID,
        status: 'PENDING_ANALYSIS',
        uploadedAt: createdAt.toISOString(),
        expiresAt: '2026-07-31T12:00:00.000Z',
      });
      expect(evidenceAssetPort.createUploadIntent).not.toHaveBeenCalled();
      expect(reliabilityService.completeIdempotency).not.toHaveBeenCalled();
    });

    it('replay con intent FAILED devuelve resultado terminal, no EVIDENCE_UPLOAD_IN_PROGRESS', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce({
            id: 'intent-failed-001',
            executionOrderId: ORDER_UUID,
            tenantId: 'tenant-001',
            mediaAssetId: null,
            status: 'FAILED',
            expiresAt: new Date(Date.now() + 60_000),
          }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      reliabilityService.beginIdempotent.mockResolvedValue({
        intentId: 'idempotency-intent-001',
        replay: true,
        resourceRef: 'intent-failed-001',
        evidenceUploadIntentId: 'intent-failed-001',
        resultStatus: 'PENDING',
        resourceVersion: 1,
      });

      await expect(
        service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
          idempotencyKey: 'evidence-upload-key-failed-001',
          ifMatch: '1',
          requireIdempotency: true,
          requireIfMatch: true,
          correlationId: '00000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_UPLOAD_FAILED' } });
      expect(evidenceAssetPort.createUploadIntent).not.toHaveBeenCalled();
    });

    it('replay con intent purgado y registro vivo devuelve resultado terminal, no EVIDENCE_UPLOAD_IN_PROGRESS', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder()) // requireOrder
          .mockResolvedValueOnce(null), // intent purgado por el worker
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      reliabilityService.beginIdempotent.mockResolvedValue({
        intentId: 'idempotency-intent-002',
        replay: true,
        resourceRef: 'intent-purged-001',
        evidenceUploadIntentId: 'intent-purged-001',
        resultStatus: 'PENDING',
        resourceVersion: 1,
      });

      await expect(
        service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
          idempotencyKey: 'evidence-upload-key-purged-001',
          ifMatch: '1',
          requireIdempotency: true,
          requireIfMatch: true,
          correlationId: '00000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toMatchObject({ response: { code: 'EVIDENCE_UPLOAD_INTENT_PURGED' } });
      expect(evidenceAssetPort.createUploadIntent).not.toHaveBeenCalled();
    });

    it('replay legacy con evidenceUploadIntentId null cae al fallback resourceRef', async () => {
      const createdAt = new Date('2026-07-30T12:00:00.000Z');
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder()) // requireOrder
          .mockResolvedValueOnce({
            id: 'intent-legacy-001',
            executionOrderId: ORDER_UUID,
            tenantId: 'tenant-001',
            mediaAssetId: ASSET_UUID,
            status: 'PENDING_ANALYSIS',
            expiresAt: new Date('2026-07-31T12:00:00.000Z'),
            createdAt,
          }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      // Registro anterior a la migración: columna evidence_upload_intent_id null
      reliabilityService.beginIdempotent.mockResolvedValue({
        intentId: 'idempotency-intent-003',
        replay: true,
        resourceRef: 'intent-legacy-001',
        evidenceUploadIntentId: null,
        resultStatus: 'COMPLETED',
        resourceVersion: 1,
      });

      const result = await service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
        idempotencyKey: 'evidence-upload-key-legacy-001',
        ifMatch: '1',
        requireIdempotency: true,
        requireIfMatch: true,
        correlationId: '00000000-0000-4000-8000-000000000001',
      });

      expect(result.intentId).toBe('intent-legacy-001');
      expect(result.mediaAssetId).toBe(ASSET_UUID);
      expect(manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: expect.objectContaining({ id: 'intent-legacy-001' }),
        }),
      );
      expect(evidenceAssetPort.createUploadIntent).not.toHaveBeenCalled();
    });

    it('persiste evidenceUploadIntentId (relación tipada) al crear el recibo', async () => {
      const intentId = '44444444-4444-4444-8444-444444444444';
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(mockOrder()).mockResolvedValueOnce(null), // intent aún no creado
        save: jest.fn().mockResolvedValue({
          id: intentId,
          executionOrderId: ORDER_UUID,
          tenantId: 'tenant-001',
          mediaAssetId: null,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          actorUserId: actor.sub,
        }),
        create: jest.fn().mockImplementation((_entity, value) => value),
        update: jest.fn().mockResolvedValue(undefined),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      reliabilityService.beginIdempotent.mockResolvedValue({
        intentId: 'idempotency-intent-004',
        replay: false,
        resourceRef: null,
        evidenceUploadIntentId: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
      });
      evidenceAssetPort.createUploadIntent.mockResolvedValue({
        mediaAssetId: ASSET_UUID,
        checksumSha256: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        uploadedAt: '2026-07-30T12:00:00.000Z',
      });

      await service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
        idempotencyKey: 'evidence-upload-key-typed-001',
        ifMatch: '1',
        requireIdempotency: true,
        requireIfMatch: true,
        correlationId: '00000000-0000-4000-8000-000000000001',
      });

      // El registro de idempotencia se vincula tipado al intent en el mismo
      // completeIdempotency que escribe resourceRef (compatibilidad).
      expect(reliabilityService.completeIdempotency).toHaveBeenCalledWith(
        manager,
        'idempotency-intent-004',
        expect.objectContaining({
          resourceRef: intentId,
          evidenceUploadIntentId: intentId,
          resultCode: 'UPLOAD_INTENT_CREATED',
        }),
      );
    });

    it('completa el enlace con Media limpiando la reserva del intent (expiresAt null)', async () => {
      const intentId = '55555555-5555-4555-8555-555555555555';
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(mockOrder()).mockResolvedValueOnce(null),
        save: jest.fn().mockResolvedValue({
          id: intentId,
          executionOrderId: ORDER_UUID,
          tenantId: 'tenant-001',
          mediaAssetId: null,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          actorUserId: actor.sub,
        }),
        create: jest.fn().mockImplementation((_entity, value) => value),
        update: jest.fn().mockResolvedValue(undefined),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      evidenceAssetPort.createUploadIntent.mockResolvedValue({
        mediaAssetId: ASSET_UUID,
        checksumSha256: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        uploadedAt: '2026-07-30T12:00:00.000Z',
      });

      await service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor);

      // El intent vinculado pierde la reserva de 24h: la retención futura la
      // gobierna el registro de idempotencia, no la reserva original.
      expect(manager.update).toHaveBeenCalledWith(
        ExecutionOrderEvidenceUploadIntent,
        intentId,
        expect.objectContaining({ status: 'PENDING_ANALYSIS', expiresAt: null }),
      );
    });

    it('devuelve 409 si la misma clave llega con fingerprint distinto', async () => {
      const manager = { findOne: jest.fn().mockResolvedValueOnce(mockOrder()) };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      reliabilityService.beginIdempotent.mockRejectedValue(
        new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' }),
      );

      await expect(
        service.createEvidenceAssetReceipt(
          ORDER_UUID,
          mockFile({ buffer: Buffer.from('different-content') }),
          actor,
          {
            idempotencyKey: 'evidence-upload-key-001',
            ifMatch: '1',
            requireIdempotency: true,
            requireIfMatch: true,
            correlationId: '00000000-0000-4000-8000-000000000001',
          },
        ),
      ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
      expect(evidenceAssetPort.createUploadIntent).not.toHaveBeenCalled();
    });

    it('rechaza el primer request por If-Match obsoleto antes de crear intent o asset', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(mockOrder()),
        save: jest.fn(),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );
      reliabilityService.beginIdempotent.mockResolvedValue({
        intentId: 'idempotency-intent-002',
        replay: false,
        resourceRef: null,
        resultStatus: 'PENDING',
        resourceVersion: null,
      });

      await expect(
        service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
          idempotencyKey: 'evidence-upload-key-002',
          ifMatch: '2',
          requireIdempotency: true,
          requireIfMatch: true,
          correlationId: '00000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
      expect(manager.save).not.toHaveBeenCalled();
      expect(evidenceAssetPort.createUploadIntent).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'Idempotency-Key', idempotencyKey: undefined, ifMatch: '1' },
      { label: 'If-Match', idempotencyKey: 'evidence-upload-key-003', ifMatch: undefined },
    ])('rechaza upload sin $label', async ({ idempotencyKey, ifMatch }) => {
      const manager = { findOne: jest.fn().mockResolvedValueOnce(mockOrder()) };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.createEvidenceAssetReceipt(ORDER_UUID, mockFile(), actor, {
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(ifMatch ? { ifMatch } : {}),
          requireIdempotency: true,
          requireIfMatch: true,
          correlationId: '00000000-0000-4000-8000-000000000001',
        }),
      ).rejects.toMatchObject({ response: { code: expect.stringMatching(/REQUIRED/u) } });
      expect(evidenceAssetPort.createUploadIntent).not.toHaveBeenCalled();
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder()) // requireOrder
          .mockResolvedValueOnce({ id: 'ev-001' }) // evidence found
          .mockResolvedValueOnce(null), // intent not found
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce({ id: 'ev-002' })
          .mockResolvedValueOnce(null),
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce({ id: 'ev-003' })
          .mockResolvedValueOnce(null),
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(null) // no evidence link
          .mockResolvedValueOnce(null), // no intent link  ← P0-1: no consulta Media
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.getEvidenceAssetReceipt(ORDER_UUID, 'bad-asset-id')).rejects.toThrow(
        'OT de ejecución no encontrada',
      );
      expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
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
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      capturedAt: new Date().toISOString(),
    };

    it.each([null, 'not-a-date', new Date(Date.now() - 1).toISOString()])(
      'rechaza expiresAt ausente, inválido o vencido antes de consultar Media (%s)',
      async (expiresAt) => {
        await expect(
          service.registerEvidence(
            ORDER_UUID,
            { ...evidenceInput, expiresAt: expiresAt as unknown as string },
            actor,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'EVIDENCE_EXPIRES_AT_INVALID' }),
        });
        expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
        expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
      },
    );

    // NOTA: `null` ya no es inválido para un intent vinculado: al completar el
    // enlace con Media la reserva de 24h se limpia (expires_at null) y la
    // retención pasa a regirse por el registro de idempotencia (ver el test
    // 'permite intent vinculado con reserva limpia (expiresAt null)').
    it.each([undefined, new Date(Number.NaN), new Date(Date.now())])(
      'rechaza intent con expiresAt no futuro (%s)',
      async (expiresAt) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(mockOrder())
            .mockResolvedValueOnce(currentUploadIntent({ expiresAt: expiresAt as Date | null })),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.registerEvidence(ORDER_UUID, evidenceInput, actor),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'EVIDENCE_UPLOAD_INTENT_EXPIRED' }),
        });
        expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
        expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
      },
    );

    it('permite intent vinculado con reserva limpia (expiresAt null tras el enlace)', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent({ expiresAt: null })),
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

      expect(result.assetStatus).toBe('AVAILABLE');
      expect(evidenceAssetPort.getAssetStatus).toHaveBeenCalled();
      expect(evidenceAssetPort.claimAsset).toHaveBeenCalled();
    });

    it('registra evidencia solo cuando el asset está AVAILABLE', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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
      expect(result).not.toHaveProperty('tenantId');
      expect(result).not.toHaveProperty('actorUserId');
      expect(evidenceAssetPort.claimAsset).toHaveBeenCalledWith(
        ASSET_UUID,
        'tenant_001',
        ORDER_UUID,
      );
    });

    it('recorre upload, análisis y registro usando el estado real de Media', async () => {
      const asset = new MediaAsset();
      asset.tenantSchema = 'tenant_001';
      asset.assetStatus = 'QUARANTINED';
      asset.mimeType = 'image/jpeg';
      asset.sizeBytes = 1024;
      asset.checksumSha256 = 'a'.repeat(64);
      asset.deletedAt = null;
      asset.createdAt = new Date();
      const repo = {
        create: jest.fn((value: Partial<MediaAsset>) => Object.assign(asset, value)),
        save: jest.fn().mockResolvedValue(asset),
        findOne: jest.fn().mockResolvedValue(asset),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      };
      const analysisQueue = { add: jest.fn().mockResolvedValue(undefined) };
      const provider = new EvidenceAssetProvider(
        { getRepository: jest.fn().mockReturnValue(repo) } as unknown as DataSource,
        { putObject: jest.fn().mockResolvedValue(undefined) } as never,
        { get: jest.fn() } as never,
        analysisQueue as never,
      );
      const uploaded = await provider.createUploadIntent(
        'tenant_001',
        mockFile({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]) }),
        actor.sub,
      );
      expect(analysisQueue.add).toHaveBeenCalledWith(
        'analyze-evidence-asset',
        expect.objectContaining({
          mediaAssetId: uploaded.mediaAssetId,
          tenantSchema: 'tenant_001',
        }),
        expect.objectContaining({ attempts: 3 }),
      );

      asset.assetStatus = 'AVAILABLE';
      (service as unknown as { evidenceAssetPort: IEvidenceAssetPort }).evidenceAssetPort =
        provider;
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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

      const result = await service.registerEvidence(
        ORDER_UUID,
        { ...evidenceInput, mediaAssetId: uploaded.mediaAssetId },
        actor,
      );
      expect(result.assetStatus).toBe('AVAILABLE');
      expect(repo.createQueryBuilder).toHaveBeenCalled();
    });

    it('rechaza evidencia con asset PENDING_ANALYSIS', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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

    it('rechaza intent expirado antes de consultar Media o reclamar', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(
            currentUploadIntent({
              expiresAt: new Date(Date.now() - 1),
            }),
          ),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(
        service.registerEvidence(ORDER_UUID, evidenceInput, actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EVIDENCE_UPLOAD_INTENT_EXPIRED' }),
      });
      expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
      expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
    });

    it.each(['EXPIRED', 'REJECTED', 'FAILED', 'UNKNOWN'])(
      'rechaza intent con status %s antes de consultar Media',
      async (status) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(mockOrder())
            .mockResolvedValueOnce(currentUploadIntent({ status })),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
          fn({ manager } as never),
        );

        await expect(
          service.registerEvidence(ORDER_UUID, evidenceInput, actor),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'EVIDENCE_UPLOAD_INTENT_NOT_ALLOWED' }),
        });
        expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
        expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
      },
    );

    it('rechaza si el asset pertenece a otro tenant (cross-tenant)', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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

    it('rechaza un asset AVAILABLE y no reclamado creado para otra OT del mismo tenant', async () => {
      const otherOrderId = '33333333-3333-4333-8333-333333333333';
      const manager = {
        findOne: jest
          .fn()
          .mockImplementation(async (_entity, options: { where?: Record<string, string> }) => {
            if (options.where?.['id'] === ORDER_UUID) {
              // La primera lectura es la OT; la segunda debe encontrar solo el
              // intent de la OT solicitada. El intent real pertenece a otra OT.
              return mockOrder();
            }
            if (
              options.where?.['executionOrderId'] === ORDER_UUID &&
              options.where?.['tenantId'] === 'tenant-001'
            ) {
              return null;
            }
            if (options.where?.['executionOrderId'] === otherOrderId) {
              return {
                executionOrderId: otherOrderId,
                tenantId: 'tenant-001',
                mediaAssetId: ASSET_UUID,
              };
            }
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

      await expect(
        service.registerEvidence(ORDER_UUID, evidenceInput, actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EVIDENCE_UPLOAD_INTENT_REQUIRED' }),
      });
      expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
      expect(evidenceAssetPort.claimAsset).not.toHaveBeenCalled();
      expect(manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: {
            mediaAssetId: ASSET_UUID,
            executionOrderId: ORDER_UUID,
            tenantId: 'tenant-001',
          },
        }),
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
        save: jest.fn().mockResolvedValue({
          id: 'intent-001',
          executionOrderId: ORDER_UUID,
          tenantId: 'tenant-001',
          mediaAssetId: null,
          status: 'PENDING',
          expiresAt: new Date(),
        }),
        create: jest.fn().mockReturnValue({}),
        update: jest.fn().mockResolvedValue(undefined),
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(currentUploadIntent()),
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
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
          if (conditions.where?.['id' as keyof object] === ORDER_UUID) return mockOrder();
          // Sin evidence ni intent vinculado → P0-1: rechazar sin consultar Media
          return null;
        }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      // P0-1: sin vínculo → NotFound, sin consultar Media
      await expect(
        service.getEvidenceAssetReceipt(ORDER_UUID, 'unlinked-asset-id'),
      ).rejects.toThrow('OT de ejecución no encontrada');
      expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
    });

    it('getEvidenceAssetReceipt permite consulta cuando existe intent vinculado', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder()) // requireOrder
          .mockResolvedValueOnce(null) // no evidence yet
          .mockResolvedValueOnce(currentUploadIntent()), // intent exists
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      evidenceAssetPort.getAssetStatus.mockResolvedValue({
        status: 'PENDING_ANALYSIS',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        uploadedAt: new Date().toISOString(),
      });

      const result = await service.getEvidenceAssetReceipt(ORDER_UUID, ASSET_UUID);
      expect(result.status).toBe('PENDING_ANALYSIS');
      expect(evidenceAssetPort.getAssetStatus).toHaveBeenCalled();
    });

    it('rechaza polling con intent expirado antes de consultar Media', async () => {
      const manager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockOrder())
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(currentUploadIntent({ expiresAt: new Date(Date.now() - 1) })),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
        fn({ manager } as never),
      );

      await expect(service.getEvidenceAssetReceipt(ORDER_UUID, ASSET_UUID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EVIDENCE_UPLOAD_INTENT_EXPIRED' }),
      });
      expect(evidenceAssetPort.getAssetStatus).not.toHaveBeenCalled();
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
