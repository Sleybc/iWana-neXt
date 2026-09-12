import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { InventoryItem, SerializedAsset, StockIssueLineSerial } from '@iwana/db';
import { assertSerialGroupQty } from './serial-group.utils';
import {
  SERIAL_COMMIT_TERMINAL_STATUSES,
  SERIAL_DISPATCHABLE_STATUSES,
  SERIALIZED_TRACKING_MODES,
} from './stock-issue-serial.constants';

export interface SerializedGroupLineInput {
  itemId: string;
  requestedQty: string | number;
  serializedAssetIds: string[];
  /**
   * Lote de la línea. Participa de la tupla (ítem, lote, condición) contra la
   * que reservan y descuentan la salida y el despacho, así que debe ser el
   * lote al que pertenecen los seriales del grupo.
   */
  lotId?: string | null;
}

export interface SerializedGroupEntry {
  line: SerializedGroupLineInput;
  item: InventoryItem;
}

/**
 * Validador inyectable de grupos de seriales (MOD12 S2.1 · B2).
 *
 * Extrae `assertSerializedGroupsIntegrity` del servicio en pasos testeables
 * por separado: cada paso es una función pequeña sobre datos ya cargados y
 * solo el orquestador (`assertGroupsIntegrity`) toca la base. Capa de
 * servicio, no zod: necesita ítems y activos del tenant. Carga ítems y
 * activos en batch (`find` + `In`) dentro de la transacción del llamador,
 * nunca un query por serial.
 */
@Injectable()
export class SerializedGroupValidator {
  /**
   * Carga los ítems y se queda con las líneas de seguimiento serializado. Los
   * ítems inexistentes se omiten: la existencia del artículo no es parte de
   * esta validación y los specs históricos crean líneas sin maestro.
   */
  async loadSerializedEntries(
    manager: EntityManager,
    tenantId: string,
    lines: SerializedGroupLineInput[],
  ): Promise<SerializedGroupEntry[]> {
    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    if (itemIds.length === 0) {
      return [];
    }

    const foundItems =
      (await manager.find(InventoryItem, {
        where: { tenantId, id: In(itemIds) },
      })) ?? [];
    const itemById = new Map(foundItems.map((item) => [item.id, item]));

    const entries: SerializedGroupEntry[] = [];
    for (const line of lines) {
      const item = itemById.get(line.itemId);
      if (item && SERIALIZED_TRACKING_MODES.has(item.trackingMode)) {
        entries.push({ line, item });
      }
    }
    return entries;
  }

  /**
   * Regla B3.1: grupo no vacío y cantidad entera coherente con el número de
   * seriales (CA-S2.1-BE04, vía `assertSerialGroupQty`).
   */
  assertGroupQuantities(entries: SerializedGroupEntry[]): void {
    for (const { line, item } of entries) {
      if (line.serializedAssetIds.length === 0) {
        throw new BadRequestException(
          `El ítem ${item.sku} exige seleccionar los activos serializados que salen.`,
        );
      }
      assertSerialGroupQty(line.requestedQty, line.serializedAssetIds.length, item.sku);
    }
  }

  /** Un serial no puede repetirse entre líneas de la misma salida. */
  assertNoRepeatedAssets(allAssetIds: string[], assetLabel: (assetId: string) => string): void {
    const seenAssetIds = new Set<string>();
    for (const assetId of allAssetIds) {
      if (seenAssetIds.has(assetId)) {
        throw new BadRequestException(`${assetLabel(assetId)} está repetido en la salida.`);
      }
      seenAssetIds.add(assetId);
    }
  }

  async loadAssetsById(
    manager: EntityManager,
    tenantId: string,
    assetIds: string[],
  ): Promise<Map<string, SerializedAsset>> {
    const uniqueIds = [...new Set(assetIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const foundAssets =
      (await manager.find(SerializedAsset, {
        where: { tenantId, id: In(uniqueIds) },
      })) ?? [];
    return new Map(foundAssets.map((asset) => [asset.id, asset]));
  }

  /** Etiqueta legible del activo para mensajes (número de serie, nunca PII). */
  buildAssetLabel(assetById: Map<string, SerializedAsset>): (assetId: string) => string {
    return (assetId: string): string => {
      const serial = assetById.get(assetId)?.serialNumber?.trim();
      return serial ? `El activo ${serial}` : 'El activo serializado seleccionado';
    };
  }

  /**
   * Regla B3.2: cada serial del grupo mantiene las validaciones de S1
   * (existencia en la bodega, pertenencia al ítem, bodega origen, estado
   * disponible para salida).
   */
  assertAssetsEligible(
    entries: SerializedGroupEntry[],
    assetById: Map<string, SerializedAsset>,
    sourceLocationId: string,
  ): void {
    const assetLabel = this.buildAssetLabel(assetById);

    for (const { line } of entries) {
      for (const assetId of line.serializedAssetIds) {
        const asset = assetById.get(assetId);
        if (!asset) {
          throw new BadRequestException(
            'El activo serializado seleccionado no existe en la bodega de origen.',
          );
        }
        if (asset.inventoryItemId !== line.itemId) {
          throw new BadRequestException(
            `${assetLabel(assetId)} pertenece a otro artículo y no puede salir en esta línea.`,
          );
        }
        if (asset.currentLocationId !== sourceLocationId) {
          throw new BadRequestException(
            `${assetLabel(assetId)} no está en la bodega de origen de la salida.`,
          );
        }
        if (!SERIAL_DISPATCHABLE_STATUSES.includes(asset.currentStatus)) {
          throw new BadRequestException(
            `${assetLabel(assetId)} no está disponible para salida (estado ${asset.currentStatus}).`,
          );
        }
        // Coherencia serial ↔ lote: la línea reserva y descuenta de la tupla
        // (ítem, lote, condición), de modo que un serial de otro lote haría
        // caer el saldo equivocado. Solo se contrasta cuando ambos lados
        // tienen lote: un activo con `lotId` nulo es un ingreso cuyo
        // movimiento de entrada no llevaba lote (el backfill de la migración
        // 129 no inventa valores) y no hay nada contra lo que compararlo.
        const lineLotId = line.lotId ?? null;
        if (lineLotId && asset.lotId && asset.lotId !== lineLotId) {
          throw new BadRequestException(
            `${assetLabel(assetId)} pertenece a otro lote y no puede salir en esta línea.`,
          );
        }
      }
    }
  }

  /**
   * Regla B3.3: sin seriales comprometidos por otra salida no terminal.
   * Pre-chequeo amable sobre la tabla hija (autoritativa desde el backfill
   * de la migración 126); el 23505 del índice único parcial es el respaldo
   * de carrera. `excludeIssueId` evita que el `update` colisione con su
   * propia salida al reemplazar líneas o al cambiar de bodega.
   */
  async assertNotCommittedElsewhere(
    manager: EntityManager,
    tenantId: string,
    assetIds: string[],
    excludeIssueId: string | undefined,
    assetLabel: (assetId: string) => string,
  ): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }

    const committedQb = manager
      .createQueryBuilder(StockIssueLineSerial, 'serial')
      .select('serial.serialized_asset_id', 'serializedAssetId')
      .where('serial.tenant_id = :tenantId', { tenantId })
      .andWhere('serial.serialized_asset_id IN (:...serialAssetIds)', {
        serialAssetIds: [...new Set(assetIds)],
      })
      .andWhere('serial.issue_status NOT IN (:...serialTerminalStatuses)', {
        serialTerminalStatuses: SERIAL_COMMIT_TERMINAL_STATUSES,
      });
    if (excludeIssueId) {
      committedQb.andWhere('serial.issue_id != :excludeSerialIssueId', {
        excludeSerialIssueId: excludeIssueId,
      });
    }
    const committed = await committedQb.getRawMany<{ serializedAssetId: string }>();
    const firstCommitted = committed[0];
    if (firstCommitted) {
      throw new BadRequestException(
        `${assetLabel(firstCommitted.serializedAssetId)} ya está comprometido en otra salida.`,
      );
    }
  }

  /**
   * Orquestador: ejecuta los pasos en orden sobre la transacción del llamador.
   */
  async assertGroupsIntegrity(
    manager: EntityManager,
    tenantId: string,
    lines: SerializedGroupLineInput[],
    sourceLocationId: string,
    excludeIssueId?: string,
  ): Promise<void> {
    const entries = await this.loadSerializedEntries(manager, tenantId, lines);
    if (entries.length === 0) {
      return;
    }

    this.assertGroupQuantities(entries);

    const allAssetIds = entries.flatMap((entry) => entry.line.serializedAssetIds);
    const assetById = await this.loadAssetsById(manager, tenantId, allAssetIds);
    const assetLabel = this.buildAssetLabel(assetById);

    this.assertNoRepeatedAssets(allAssetIds, assetLabel);
    this.assertAssetsEligible(entries, assetById, sourceLocationId);
    await this.assertNotCommittedElsewhere(
      manager,
      tenantId,
      allAssetIds,
      excludeIssueId,
      assetLabel,
    );
  }
}
