import { ConflictException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryResponsibleType, SerializedAssetStatus } from '@iwana/shared';
import { SerializedAssetService } from '../services/serialized-asset.service';

jest.mock('@iwana/db', () => ({
  SerializedAsset: class SerializedAsset {},
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

describe('SerializedAssetService', () => {
  let service: SerializedAssetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SerializedAssetService({} as DataSource);
  });

  it('normalizes serial numbers using trim and uppercase', () => {
    expect(service.normalizeSerial('  abC-123  ')).toBe('ABC-123');
  });

  it('rejects duplicate serials per tenant when receiving assets', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'asset-existing' }),
      create: jest.fn((_entity, payload) => payload),
      save: jest.fn(),
    };

    await expect(
      service.createReceivedAssetWithManager(manager as never, {
        tenantId: 'tenant-001',
        inventoryItemId: 'item-001',
        serialNumber: 'ser-001',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks invalid serialized asset transitions', async () => {
    const asset = {
      id: 'asset-001',
      tenantId: 'tenant-001',
      currentStatus: SerializedAssetStatus.ORDERED,
      currentLocationId: 'loc-001',
      currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
      currentResponsibleRefId: null,
      subscriberRefId: null,
      contractRefId: null,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(asset),
      save: jest.fn(),
    };

    await expect(
      service.transitionAssetWithManager(manager as never, {
        tenantId: 'tenant-001',
        serializedAssetId: 'asset-001',
        toStatus: SerializedAssetStatus.SOLD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows valid serialized asset transitions from receiving to available', async () => {
    const asset = {
      id: 'asset-001',
      tenantId: 'tenant-001',
      currentStatus: SerializedAssetStatus.IN_RECEIVING,
      currentLocationId: 'loc-001',
      currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
      currentResponsibleRefId: null,
      subscriberRefId: null,
      contractRefId: null,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(asset),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
    };

    const result = await service.transitionAssetWithManager(manager as never, {
      tenantId: 'tenant-001',
      serializedAssetId: 'asset-001',
      toStatus: SerializedAssetStatus.AVAILABLE,
      currentLocationId: 'loc-warehouse',
      currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
      currentResponsibleRefId: null,
    });

    expect(result.currentStatus).toBe(SerializedAssetStatus.AVAILABLE);
    expect(result.currentLocationId).toBe('loc-warehouse');
  });
});
