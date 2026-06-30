import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { SerializedAsset, TenantContext, runInTenantSchema } from '@iwana/db';
import { InventoryResponsibleType, SerializedAssetStatus } from '@iwana/shared';
import { ListSerializedAssetsQueryInput, ListSerializedAssetsQuerySchema } from '../dto';

interface CreateReceivedAssetInput {
  tenantId: string;
  inventoryItemId: string;
  serialNumber?: string | null;
  macAddress?: string | null;
  assetTag?: string | null;
  purchaseOrderRef?: string | null;
  purchaseDate?: string | null;
  usefulLifeMonths?: number | null;
  warrantyUntil?: string | null;
  currentLocationId?: string | null;
}

interface TransitionAssetInput {
  tenantId: string;
  serializedAssetId?: string | null | undefined;
  serialNumber?: string | null | undefined;
  toStatus: SerializedAssetStatus;
  currentLocationId?: string | null | undefined;
  currentResponsibleType?: InventoryResponsibleType | undefined;
  currentResponsibleRefId?: string | null | undefined;
  subscriberRefId?: string | null | undefined;
  contractRefId?: string | null | undefined;
}

const ALLOWED_STATUS_TRANSITIONS: Record<SerializedAssetStatus, SerializedAssetStatus[]> = {
  [SerializedAssetStatus.ORDERED]: [SerializedAssetStatus.IN_RECEIVING],
  [SerializedAssetStatus.IN_RECEIVING]: [SerializedAssetStatus.AVAILABLE],
  [SerializedAssetStatus.AVAILABLE]: [
    SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
    SerializedAssetStatus.SOLD,
    SerializedAssetStatus.INTERNAL_CONSUMED,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN]: [
    SerializedAssetStatus.INSTALLED_COMODATO,
    SerializedAssetStatus.AVAILABLE,
    SerializedAssetStatus.IN_TRANSIT,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.INSTALLED_COMODATO]: [
    SerializedAssetStatus.IN_TRANSIT,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.IN_TRANSIT]: [
    SerializedAssetStatus.IN_TESTING,
    SerializedAssetStatus.AVAILABLE,
  ],
  [SerializedAssetStatus.IN_TESTING]: [
    SerializedAssetStatus.AVAILABLE_REFURBISHED,
    SerializedAssetStatus.IN_REPAIR,
    SerializedAssetStatus.WRITTEN_OFF,
  ],
  [SerializedAssetStatus.AVAILABLE_REFURBISHED]: [
    SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
    SerializedAssetStatus.SOLD,
    SerializedAssetStatus.INTERNAL_CONSUMED,
    SerializedAssetStatus.LOST,
  ],
  [SerializedAssetStatus.IN_REPAIR]: [
    SerializedAssetStatus.AVAILABLE_REFURBISHED,
    SerializedAssetStatus.WRITTEN_OFF,
  ],
  [SerializedAssetStatus.SOLD]: [],
  [SerializedAssetStatus.INTERNAL_CONSUMED]: [],
  [SerializedAssetStatus.WRITTEN_OFF]: [],
  [SerializedAssetStatus.LOST]: [],
};

@Injectable()
export class SerializedAssetService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: ListSerializedAssetsQueryInput): Promise<SerializedAsset[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListSerializedAssetsQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(SerializedAsset, 'asset')
        .where('asset.tenant_id = :tenantId', { tenantId })
        .orderBy('asset.updated_at', 'DESC');

      if (validated.itemId) {
        qb.andWhere('asset.inventory_item_id = :itemId', { itemId: validated.itemId });
      }

      if (validated.status) {
        qb.andWhere('asset.current_status = :status', { status: validated.status });
      }

      if (validated.locationId) {
        qb.andWhere('asset.current_location_id = :locationId', {
          locationId: validated.locationId,
        });
      }

      if (validated.serialNumber) {
        qb.andWhere('asset.normalized_serial_number = :serialNumber', {
          serialNumber: this.normalizeSerial(validated.serialNumber),
        });
      }

      return qb.getMany();
    });
  }

  async getById(id: string): Promise<SerializedAsset> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const asset = await qr.manager.findOne(SerializedAsset, { where: { id, tenantId } });
      if (!asset) {
        throw new NotFoundException('Activo serializado no encontrado.');
      }
      return asset;
    });
  }

  normalizeSerial(serialNumber: string): string {
    return serialNumber.trim().toUpperCase();
  }

  async createReceivedAssetWithManager(
    manager: EntityManager,
    input: CreateReceivedAssetInput,
  ): Promise<SerializedAsset> {
    const normalizedSerial = input.serialNumber ? this.normalizeSerial(input.serialNumber) : null;

    if (normalizedSerial) {
      const duplicate = await manager.findOne(SerializedAsset, {
        where: {
          tenantId: input.tenantId,
          normalizedSerialNumber: normalizedSerial,
        },
      });

      if (duplicate) {
        throw new ConflictException(`El serial ${normalizedSerial} ya existe en el tenant.`);
      }
    }

    return manager.save(
      SerializedAsset,
      manager.create(SerializedAsset, {
        tenantId: input.tenantId,
        inventoryItemId: input.inventoryItemId,
        serialNumber: input.serialNumber?.trim() ?? null,
        normalizedSerialNumber: normalizedSerial,
        macAddress: input.macAddress?.trim() ?? null,
        normalizedMacAddress: input.macAddress ? this.normalizeSerial(input.macAddress) : null,
        assetTag: input.assetTag?.trim() ?? null,
        currentStatus: SerializedAssetStatus.IN_RECEIVING,
        currentLocationId: input.currentLocationId ?? null,
        currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
        currentResponsibleRefId: null,
        subscriberRefId: null,
        contractRefId: null,
        purchaseOrderRef: input.purchaseOrderRef ?? null,
        purchaseDate: input.purchaseDate ?? null,
        usefulLifeMonths: input.usefulLifeMonths ?? null,
        warrantyUntil: input.warrantyUntil ?? null,
      }),
    );
  }

  async resolveForMovementWithManager(
    manager: EntityManager,
    tenantId: string,
    identifiers: {
      serializedAssetId?: string | null | undefined;
      serialNumber?: string | null | undefined;
    },
  ): Promise<SerializedAsset | null> {
    if (identifiers.serializedAssetId) {
      const asset = await manager.findOne(SerializedAsset, {
        where: { id: identifiers.serializedAssetId, tenantId },
      });

      if (!asset) {
        throw new NotFoundException('Activo serializado no encontrado.');
      }

      return asset;
    }

    if (identifiers.serialNumber) {
      const normalizedSerial = this.normalizeSerial(identifiers.serialNumber);
      const asset = await manager.findOne(SerializedAsset, {
        where: { tenantId, normalizedSerialNumber: normalizedSerial },
      });

      if (!asset) {
        throw new NotFoundException('Activo serializado no encontrado.');
      }

      return asset;
    }

    return null;
  }

  async transitionAssetWithManager(
    manager: EntityManager,
    input: TransitionAssetInput,
  ): Promise<SerializedAsset> {
    const asset = await this.resolveForMovementWithManager(manager, input.tenantId, {
      serializedAssetId: input.serializedAssetId,
      serialNumber: input.serialNumber,
    });

    if (!asset) {
      throw new NotFoundException('Activo serializado no encontrado.');
    }

    this.assertStatusTransition(asset.currentStatus, input.toStatus);
    asset.currentStatus = input.toStatus;

    if (input.currentLocationId !== undefined) {
      asset.currentLocationId = input.currentLocationId;
    }

    if (input.currentResponsibleType !== undefined) {
      asset.currentResponsibleType = input.currentResponsibleType;
    }

    if (input.currentResponsibleRefId !== undefined) {
      asset.currentResponsibleRefId = input.currentResponsibleRefId;
    }

    if (input.subscriberRefId !== undefined) {
      asset.subscriberRefId = input.subscriberRefId;
    }

    if (input.contractRefId !== undefined) {
      asset.contractRefId = input.contractRefId;
    }

    return manager.save(SerializedAsset, asset);
  }

  private assertStatusTransition(
    currentStatus: SerializedAssetStatus,
    nextStatus: SerializedAssetStatus,
  ): void {
    if (currentStatus === nextStatus) {
      return;
    }

    if (!ALLOWED_STATUS_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `La transición ${currentStatus} -> ${nextStatus} no está permitida para el activo.`,
      );
    }
  }
}
