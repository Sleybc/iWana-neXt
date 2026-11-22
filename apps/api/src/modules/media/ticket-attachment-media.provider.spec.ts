import { BUSINESS_JOB_REMOVE_ON_FAIL } from '@iwana/shared';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { DataSource, EntityManager } from 'typeorm';
import { MediaUsage } from '@iwana/db';
import type { StoragePort } from '@iwana/storage';
import { TicketAttachmentMediaProvider } from './ticket-attachment-media.provider';
import { syntheticPdf, syntheticPng } from './testing/synthetic-files';

const SCHEMA = 'tenant_test';
const ASSET = '11111111-1111-4111-8111-111111111111';

function config(values: Record<string, unknown> = {}): ConfigService {
  const all: Record<string, unknown> = { STORAGE_DRIVER: 'minio', NODE_ENV: 'test', ...values };
  return { get: (key: string, fallback?: unknown) => all[key] ?? fallback } as ConfigService;
}

function build(overrides: { config?: ConfigService; query?: jest.Mock } = {}) {
  const storage = {
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn().mockResolvedValue('https://minio.test/firmado'),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const query = overrides.query ?? jest.fn().mockResolvedValue([]);
  const provider = new TicketAttachmentMediaProvider(
    { query } as unknown as DataSource,
    storage as unknown as StoragePort,
    overrides.config ?? config(),
    queue as unknown as Queue,
  );
  return { provider, storage, queue, query };
}

describe('TicketAttachmentMediaProvider', () => {
  it('guarda el activo QUARANTINED con nombre opaco y sube el objeto sin el nombre del cliente', async () => {
    const { provider, storage } = build();
    const insert = jest.fn().mockResolvedValue(undefined);
    const manager = { getRepository: () => ({ insert }) } as unknown as EntityManager;
    const file = {
      buffer: syntheticPng(),
      declaredContentType: 'image/png',
      originalName: 'Juan Pérez.png',
    };
    const accepted = provider.inspect(file);
    if (!accepted.ok) throw new Error('fixture inválido');

    const { mediaAssetId } = await provider.store(
      { manager, tenantSchema: SCHEMA, actorId: ASSET, initialStatus: 'QUARANTINED' },
      file,
      accepted,
    );

    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      id: mediaAssetId,
      usage: MediaUsage.TICKET_ATTACHMENT,
      assetStatus: 'QUARANTINED',
      mimeType: 'image/png',
      publicUrl: null,
      originalFilename: `${mediaAssetId}.png`,
      objectKey: `${SCHEMA}/ticket_attachment/${mediaAssetId}`,
    });
    expect(row['checksumSha256']).toMatch(/^[0-9a-f]{64}$/u);
    const [key, , options] = storage.putObject.mock.calls[0] as [
      string,
      Buffer,
      { metadata: object },
    ];
    expect(key).toBe(`${SCHEMA}/ticket_attachment/${mediaAssetId}`);
    expect(JSON.stringify(options)).not.toContain('Juan');
  });

  it('no guarda si la inspección no corresponde a los bytes', async () => {
    const { provider, storage } = build();
    const insert = jest.fn();
    const manager = { getRepository: () => ({ insert }) } as unknown as EntityManager;
    await expect(
      provider.store(
        { manager, tenantSchema: SCHEMA, actorId: ASSET, initialStatus: 'QUARANTINED' },
        { buffer: syntheticPng(), originalName: 'x.png' },
        { ok: true, contentType: 'application/pdf', sizeBytes: 10, filename: 'x.pdf' },
      ),
    ).rejects.toThrow('TICKET_ATTACHMENT_INSPECTION_MISMATCH');
    expect(insert).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it.each([
    ['driver local', { STORAGE_DRIVER: 'local' }],
    ['bucket público', { S3_BUCKET_PUBLIC: 'true' }],
    ['base pública en producción', { NODE_ENV: 'production', S3_PUBLIC_BASE_URL: 'https://cdn' }],
  ])('falla cerrado (503) con %s', async (_label, values) => {
    const { provider } = build({ config: config(values) });
    const manager = { getRepository: () => ({ insert: jest.fn() }) } as unknown as EntityManager;
    const file = { buffer: syntheticPdf(), originalName: 'acta.pdf' };
    const accepted = provider.inspect(file);
    if (!accepted.ok) throw new Error('fixture inválido');
    await expect(
      provider.store(
        { manager, tenantSchema: SCHEMA, actorId: ASSET, initialStatus: 'QUARANTINED' },
        file,
        accepted,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('firma solo AVAILABLE del uso ticket_attachment, 300 s, con tipo y disposición forzados', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { object_key: `${SCHEMA}/ticket_attachment/${ASSET}`, mime_type: 'application/pdf' },
      ]);
    const { provider, storage } = build({ query });
    const signed = await provider.signDownload(SCHEMA, ASSET, {
      filename: 'Acta ñ.pdf',
      contentType: 'application/pdf',
      disposition: 'attachment',
    });
    expect(signed?.url).toBe('https://minio.test/firmado');
    expect(query.mock.calls[0]?.[0]).toContain(`asset_status = 'AVAILABLE'`);
    expect(query.mock.calls[0]?.[1]).toEqual([ASSET, SCHEMA, MediaUsage.TICKET_ATTACHMENT]);
    expect(storage.getSignedUrl).toHaveBeenCalledWith(`${SCHEMA}/ticket_attachment/${ASSET}`, 300, {
      responseContentType: 'application/pdf',
      responseContentDisposition: `attachment; filename="Acta n.pdf"; filename*=UTF-8''Acta%20%C3%B1.pdf`,
    });
  });

  it('no firma un activo ausente, en cuarentena o rechazado', async () => {
    const { provider, storage } = build({ query: jest.fn().mockResolvedValue([]) });
    await expect(
      provider.signDownload(SCHEMA, ASSET, {
        filename: 'a.png',
        contentType: 'image/png',
        disposition: 'inline',
      }),
    ).resolves.toBeNull();
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('borra solo objetos cuyo activo ya no existe o está retirado', async () => {
    const live = '22222222-2222-4222-8222-222222222222';
    const { provider, storage } = build({ query: jest.fn().mockResolvedValue([{ id: live }]) });
    await expect(provider.removeObjects(SCHEMA, [ASSET, live])).resolves.toBe(0);
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(`${SCHEMA}/ticket_attachment/${ASSET}`);
  });

  it('encola el análisis de cuarentena con jobId propio y no lanza si Redis falla', async () => {
    const { provider, queue } = build();
    queue.add.mockRejectedValueOnce(new Error('redis caído'));
    await expect(provider.startAnalysis(SCHEMA, [ASSET])).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledWith(
      'analyze-evidence-asset',
      { tenantSchema: SCHEMA, mediaAssetId: ASSET, correlationId: ASSET },
      expect.objectContaining({ jobId: `ticket-attachment-analysis-${ASSET}` }),
    );
  });

  it('lee estados solo del uso ticket_attachment no retirados', async () => {
    const query = jest.fn().mockResolvedValue([{ id: ASSET, asset_status: 'AVAILABLE' }]);
    const { provider } = build({ query });
    const statuses = await provider.readStatuses(SCHEMA, [ASSET, ASSET]);
    expect(statuses.get(ASSET)).toBe('AVAILABLE');
    expect(query.mock.calls[0]?.[1]).toEqual([[ASSET], SCHEMA, MediaUsage.TICKET_ATTACHMENT]);
  });

  it('retira con el manager del llamante y rechaza un schema que no es tenant', async () => {
    const { provider } = build();
    const managerQuery = jest.fn().mockResolvedValue([[{ id: ASSET }], 1]);
    await expect(
      provider.retire({ query: managerQuery } as unknown as EntityManager, SCHEMA, [ASSET]),
    ).resolves.toBe(1);
    expect(managerQuery.mock.calls[0]?.[0]).toContain('SET deleted_at');
    await expect(provider.readStatuses('public', [ASSET])).rejects.toThrow(
      'TICKET_ATTACHMENT_INVALID_TENANT_SCHEMA',
    );
  });

  it('B(b) familia N: el análisis de adjuntos conserva los fallidos 14 días', async () => {
    const { provider, queue } = build();
    await provider.startAnalysis(SCHEMA, [ASSET]);
    expect(queue.add).toHaveBeenCalledWith(
      'analyze-evidence-asset',
      expect.anything(),
      expect.objectContaining({ removeOnFail: BUSINESS_JOB_REMOVE_ON_FAIL }),
    );
  });
});
