import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  StockLocationType,
} from '@iwana/shared';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  InventoryItem,
  SerializedAsset,
  StockIssue,
  StockIssueLine,
  StockIssueLineSerial,
  StockLocation,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  CreateStockIssueInput,
  CreateStockIssueSchema,
  DispatchStockIssueInput,
  DispatchStockIssueSchema,
  ListStockIssuesQueryInput,
  ListStockIssuesQuerySchema,
  UpdateStockIssueInput,
  UpdateStockIssueSchema,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StockBalanceService, formatInsufficientAvailableMessage } from './stock-balance.service';
import { InventoryDomainEventPublisher } from './inventory-domain-event-publisher.service';
import { StockLedgerService } from './stock-ledger.service';
import {
  assertExclusivePageCursor,
  buildCursorMeta,
  buildPageMeta,
  clampInventoryLimit,
  dateIdDescCursorParams,
  dateIdDescCursorWhere,
  sliceDateIdDescPage,
} from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import type { ListResponse } from '@iwana/shared';

/** Serial de una línea en la lectura del detalle (MOD12 S2 §5.5): id + número legible. */
export interface StockIssueLineSerialRef {
  id: string;
  serialNumber: string;
}

/** Línea del detalle de una salida: entidad + grupo de seriales legible. */
export type StockIssueDetailLine = StockIssueLine & {
  serializedAssets: StockIssueLineSerialRef[];
};

export type StockIssueDetail = StockIssue & { lines: StockIssueDetailLine[] };

/** Modos de seguimiento que exigen activo serializado concreto en la salida (D2). */
const SERIALIZED_TRACKING_MODES: ReadonlySet<InventoryTrackingMode> = new Set([
  InventoryTrackingMode.SERIALIZED,
  InventoryTrackingMode.FIXED_ASSET,
]);

/** Estados del activo que permiten su salida (coherente con el conteo de picking B1). */
const SERIAL_DISPATCHABLE_STATUSES: SerializedAssetStatus[] = [
  SerializedAssetStatus.AVAILABLE,
  SerializedAssetStatus.AVAILABLE_REFURBISHED,
];

/** Estados terminales: una salida en ellos ya no compromete seriales (coherente con update/dispatch). */
const SERIAL_COMMIT_TERMINAL_STATUSES: StockIssueStatus[] = [
  StockIssueStatus.CANCELLED,
  StockIssueStatus.DISPATCHED,
  StockIssueStatus.RECEIVED,
];

interface SerializedGroupLineInput {
  itemId: string;
  requestedQty: string | number;
  serializedAssetIds: string[];
}

interface DispatchLedgerLine {
  itemId: string;
  quantity: number;
  lotId: string | null;
  serializedAssetId: string | null;
  serialNumber: null;
  condition: StockBalanceCondition;
}

@Injectable()
export class StockIssueService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockLedgerService: StockLedgerService,
    private readonly stockBalanceService: StockBalanceService,
    private readonly domainEventPublisher: InventoryDomainEventPublisher,
  ) {}

  private toNumeric(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return value;
    }

    if (!value) {
      return 0;
    }

    return Number.parseFloat(value);
  }

  private assertDestinationCompatibility(
    type: StockIssueType,
    destinationLocationId: string | null,
  ) {
    if (
      (type === StockIssueType.SALE_DISPATCH || type === StockIssueType.INTERNAL_CONSUMPTION) &&
      destinationLocationId
    ) {
      throw new BadRequestException('Este tipo de salida no permite ubicación destino.');
    }

    if (!destinationLocationId) {
      switch (type) {
        case StockIssueType.TECHNICIAN_CUSTODY:
          throw new BadRequestException('La salida a custodia de técnico requiere destino.');
        case StockIssueType.CREW_CUSTODY:
          throw new BadRequestException('La salida a custodia de cuadrilla requiere destino.');
        case StockIssueType.OFFICE_REPLENISHMENT:
        case StockIssueType.NODE_REPLENISHMENT:
        case StockIssueType.WAREHOUSE_TO_WAREHOUSE:
          throw new BadRequestException('La salida requiere una ubicación destino.');
        default:
          return;
      }
    }
  }

  private assertCommercialRefs(
    type: StockIssueType,
    originRefId: string | null,
    commercialRefId: string | null,
  ) {
    if (type !== StockIssueType.SALE_DISPATCH) {
      return;
    }

    if (!originRefId && !commercialRefId) {
      throw new BadRequestException('Una salida por venta requiere originRefId o commercialRefId.');
    }
  }

  private assertInternalConsumption(
    type: StockIssueType,
    costCenter: string | null,
    reason: string | null,
  ) {
    if (type !== StockIssueType.INTERNAL_CONSUMPTION) {
      return;
    }

    if (!costCenter?.trim()) {
      throw new BadRequestException('El consumo interno requiere costCenter.');
    }

    if (!reason?.trim()) {
      throw new BadRequestException('El consumo interno requiere reason.');
    }
  }

  private async getAvailability(
    manager: EntityManager,
    tenantId: string,
    input: {
      itemId: string;
      locationId: string;
      lotId?: string | null;
      condition?: StockBalanceCondition;
    },
  ) {
    return this.stockBalanceService.getAvailabilityWithManager(manager, tenantId, input);
  }

  /**
   * MOD12 S2 · ajuste G1: la aritmética de cantidades la decide el tamaño del
   * grupo de seriales. El singular de transición (`serializedAssetId`) queda
   * fuera de esa aritmética: un grupo vacío es una línea no serializada y usa
   * la cantidad solicitada.
   */
  private resolveLineQuantity(
    line: { requestedQty: string | number },
    serializedAssetCount: number,
  ): number {
    const requestedQty = this.toNumeric(line.requestedQty);
    return serializedAssetCount > 0 ? serializedAssetCount : requestedQty;
  }

  private async reserveLineQuantity(
    manager: EntityManager,
    tenantId: string,
    sourceLocationId: string,
    line: {
      itemId: string;
      lotId?: string | null | undefined;
      condition?: StockBalanceCondition | null | undefined;
    },
    quantity: number,
  ): Promise<void> {
    const condition = line.condition ?? StockBalanceCondition.NEW;
    const availability = await this.getAvailability(manager, tenantId, {
      itemId: line.itemId,
      locationId: sourceLocationId,
      lotId: line.lotId ?? null,
      condition,
    });

    if (availability.available < quantity) {
      throw new BadRequestException(
        formatInsufficientAvailableMessage(availability.onHand, availability.reserved),
      );
    }

    await this.stockBalanceService.applyDeltaWithManager(manager, {
      tenantId,
      itemId: line.itemId,
      locationId: sourceLocationId,
      lotId: line.lotId ?? null,
      condition,
      delta: 0,
      reservedDelta: quantity,
    });
  }

  private async releaseLineQuantity(
    manager: EntityManager,
    tenantId: string,
    sourceLocationId: string,
    line: {
      itemId: string;
      lotId?: string | null | undefined;
      condition?: StockBalanceCondition | null | undefined;
    },
    quantity: number,
  ): Promise<void> {
    await this.stockBalanceService.applyDeltaWithManager(manager, {
      tenantId,
      itemId: line.itemId,
      locationId: sourceLocationId,
      lotId: line.lotId ?? null,
      condition: line.condition ?? StockBalanceCondition.NEW,
      delta: 0,
      reservedDelta: -quantity,
    });
  }

  /**
   * Integridad del grupo de seriales en la salida (MOD12 S2 · B3, extiende B3 de S1).
   *
   * Capa de servicio, no zod: necesita ítems y activos del tenant. Carga ítems
   * y activos en batch (`find` + `In`) dentro de la transacción del llamador,
   * nunca un query por serial. Las reglas por serial (pertenencia al ítem,
   * bodega origen, estado disponible) aplican uno a uno; los repetidos se
   * controlan dentro de la línea (ya en el schema) y entre líneas de la misma
   * salida. `excludeIssueId` evita que el `update` colisione con su propia
   * salida al reemplazar líneas o al cambiar de bodega.
   */
  private async assertSerializedGroupsIntegrity(
    manager: EntityManager,
    tenantId: string,
    lines: SerializedGroupLineInput[],
    sourceLocationId: string,
    excludeIssueId?: string,
  ): Promise<void> {
    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    if (itemIds.length === 0) {
      return;
    }

    const foundItems =
      (await manager.find(InventoryItem, {
        where: { tenantId, id: In(itemIds) },
      })) ?? [];
    const itemById = new Map(foundItems.map((item) => [item.id, item]));

    // Ítems inexistentes se omiten: la existencia del artículo no es parte de
    // esta validación y los specs históricos crean líneas sin maestro.
    const serializedLines = lines.filter((line) => {
      const trackingMode = itemById.get(line.itemId)?.trackingMode;
      return trackingMode !== undefined && SERIALIZED_TRACKING_MODES.has(trackingMode);
    });
    if (serializedLines.length === 0) {
      return;
    }

    // Regla B3.1: grupo no vacío y cantidad coherente con el número de seriales.
    for (const line of serializedLines) {
      const sku = itemById.get(line.itemId)?.sku ?? line.itemId;
      if (line.serializedAssetIds.length === 0) {
        throw new BadRequestException(
          `El ítem ${sku} exige seleccionar los activos serializados que salen.`,
        );
      }
      if (Number(line.requestedQty) !== line.serializedAssetIds.length) {
        throw new BadRequestException(
          `La cantidad solicitada del ítem ${sku} debe coincidir con el número de ` +
            `seriales seleccionados (${line.serializedAssetIds.length} seriales, ` +
            `cantidad ${Number(line.requestedQty)}).`,
        );
      }
    }

    const allAssetIds = serializedLines.flatMap((line) => line.serializedAssetIds);
    const foundAssets =
      (await manager.find(SerializedAsset, {
        where: { tenantId, id: In([...new Set(allAssetIds)]) },
      })) ?? [];
    const assetById = new Map(foundAssets.map((asset) => [asset.id, asset]));
    const assetLabel = (assetId: string): string => {
      const serial = assetById.get(assetId)?.serialNumber?.trim();
      return serial ? `El activo ${serial}` : 'El activo serializado seleccionado';
    };

    // Un serial no puede repetirse entre líneas de la misma salida
    // (el schema ya rechaza los repetidos dentro de una línea).
    const seenAssetIds = new Set<string>();
    let repeatedAssetId: string | null = null;
    for (const assetId of allAssetIds) {
      if (seenAssetIds.has(assetId)) {
        repeatedAssetId = assetId;
        break;
      }
      seenAssetIds.add(assetId);
    }
    if (repeatedAssetId) {
      throw new BadRequestException(`${assetLabel(repeatedAssetId)} está repetido en la salida.`);
    }

    // Regla B3.2: cada serial del grupo mantiene las validaciones de S1.
    for (const line of serializedLines) {
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
      }
    }

    // Regla B3.3: sin seriales comprometidos por otra salida no terminal.
    // Pre-chequeo amable sobre la tabla hija (autoritativa desde el backfill
    // de la migración 126); el 23505 del índice único parcial es el respaldo
    // de carrera y se traduce a 400 en español en `insertIssueLineSerials`.
    const committedQb = manager
      .createQueryBuilder(StockIssueLineSerial, 'serial')
      .select('serial.serialized_asset_id', 'serializedAssetId')
      .where('serial.tenant_id = :tenantId', { tenantId })
      .andWhere('serial.serialized_asset_id IN (:...serialAssetIds)', {
        serialAssetIds: [...seenAssetIds],
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

  /** Grupo de seriales de la salida: una consulta para todas sus líneas. */
  private async loadIssueSerials(
    manager: EntityManager,
    tenantId: string,
    issueId: string,
  ): Promise<StockIssueLineSerial[]> {
    return (
      (await manager.find(StockIssueLineSerial, {
        where: { tenantId, issueId },
        order: { createdAt: 'ASC' },
      })) ?? []
    );
  }

  private groupSerialAssetIdsByLine(serials: StockIssueLineSerial[]): Map<string, string[]> {
    const groupsByLine = new Map<string, string[]>();
    for (const row of serials) {
      const group = groupsByLine.get(row.lineId) ?? [];
      group.push(row.serializedAssetId);
      groupsByLine.set(row.lineId, group);
    }
    return groupsByLine;
  }

  private isUniqueViolationError(error: unknown): boolean {
    const directCode = (error as { code?: string } | null)?.code;
    if (directCode === '23505') {
      return true;
    }
    const driverCode = (error as { driverError?: { code?: string } } | null)?.driverError?.code;
    return driverCode === '23505';
  }

  /**
   * Inserta las filas hijas del grupo. El pre-chequeo de comprometidos es
   * amable; la carrera entre dos salidas la cierra el índice único parcial
   * (`23505`), que aquí se traduce a 400 en español.
   */
  private async insertIssueLineSerials(
    manager: EntityManager,
    serialRows: StockIssueLineSerial[],
  ): Promise<void> {
    if (serialRows.length === 0) {
      return;
    }

    try {
      await manager.save(StockIssueLineSerial, serialRows);
    } catch (error) {
      if (this.isUniqueViolationError(error)) {
        throw new BadRequestException('El activo serializado ya está comprometido en otra salida.');
      }
      throw error;
    }
  }

  /**
   * Sincroniza la espejo `issue_status` con la cabecera (set-based, un solo
   * UPDATE) dentro de la transacción del llamador. PostgreSQL no admite
   * predicados inter-tabla en índices parciales: la columna espejo de la propia
   * tabla es la que habilita `uq_stock_issue_line_serials_active_asset`.
   */
  private async syncSerialMirrorStatus(
    manager: EntityManager,
    issueId: string,
    status: StockIssueStatus,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(StockIssueLineSerial)
      .set({ issueStatus: status, updatedAt: new Date() })
      .where('issue_id = :issueId', { issueId })
      .execute();
  }

  /** Vista legible del grupo (id + número de serie) agrupada por línea. */
  private async buildLineSerialViews(
    manager: EntityManager,
    tenantId: string,
    serials: StockIssueLineSerial[],
  ): Promise<Map<string, StockIssueLineSerialRef[]>> {
    const assetIds = [...new Set(serials.map((row) => row.serializedAssetId))];
    const serialNumberById = new Map<string, string>();
    if (assetIds.length > 0) {
      const assets =
        (await manager.find(SerializedAsset, {
          where: { tenantId, id: In(assetIds) },
        })) ?? [];
      for (const asset of assets) {
        if (asset.serialNumber) {
          serialNumberById.set(asset.id, asset.serialNumber);
        }
      }
    }

    const viewsByLine = new Map<string, StockIssueLineSerialRef[]>();
    for (const row of serials) {
      const views = viewsByLine.get(row.lineId) ?? [];
      views.push({
        id: row.serializedAssetId,
        serialNumber: serialNumberById.get(row.serializedAssetId) ?? '',
      });
      viewsByLine.set(row.lineId, views);
    }
    return viewsByLine;
  }

  private withSerialAssets(
    lines: StockIssueLine[],
    viewsByLine: Map<string, StockIssueLineSerialRef[]>,
  ): StockIssueDetailLine[] {
    return lines.map((line) => ({ ...line, serializedAssets: viewsByLine.get(line.id) ?? [] }));
  }

  /**
   * MOD12 S2 · B4 (ajuste G1): el grupo de seriales explota en N inputs de
   * kardex (uno por serial, cantidad 1) y una línea por cada salida no
   * serializada. Preserva la granularidad del kardex y del `serializedAssetId`
   * en los eventos de dominio, sin tocar el ledger.
   */
  private buildDispatchLedgerLines(
    issueLines: StockIssueLine[],
    serialsByLineId: Map<string, string[]>,
  ): DispatchLedgerLine[] {
    const ledgerLines: DispatchLedgerLine[] = [];
    for (const line of issueLines) {
      const group = serialsByLineId.get(line.id) ?? [];
      const condition = line.condition ?? StockBalanceCondition.NEW;
      if (group.length > 0) {
        for (const serializedAssetId of group) {
          ledgerLines.push({
            itemId: line.itemId,
            quantity: 1,
            lotId: line.lotId ?? null,
            serializedAssetId,
            serialNumber: null,
            condition,
          });
        }
      } else {
        ledgerLines.push({
          itemId: line.itemId,
          quantity: this.toNumeric(line.requestedQty),
          lotId: line.lotId ?? null,
          serializedAssetId: null,
          serialNumber: null,
          condition,
        });
      }
    }
    return ledgerLines;
  }

  private async resolveLocation(
    manager: EntityManager,
    tenantId: string,
    locationId: string,
  ): Promise<StockLocation> {
    const location = await manager.findOne(StockLocation, { where: { id: locationId, tenantId } });

    if (!location) {
      throw new NotFoundException('La ubicación solicitada no existe.');
    }

    return location;
  }

  private assertSourceIsMainWarehouse(source: StockLocation) {
    if (source.type !== StockLocationType.MAIN_WAREHOUSE) {
      throw new BadRequestException(
        'Las salidas solo pueden originarse desde la bodega principal.',
      );
    }
  }

  private assertDistinctLocations(source: StockLocation, destination: StockLocation | null) {
    if (destination && source.id === destination.id) {
      throw new BadRequestException('La ubicación destino debe ser distinta del origen.');
    }
  }

  private assertDestinationTypeForDispatch(
    issueType: StockIssueType,
    destination: StockLocation | null,
  ) {
    if (
      issueType === StockIssueType.SALE_DISPATCH ||
      issueType === StockIssueType.INTERNAL_CONSUMPTION
    ) {
      if (destination) {
        throw new BadRequestException('Este tipo de salida no permite ubicación destino.');
      }
      return;
    }

    if (!destination) {
      throw new BadRequestException('La salida requiere una ubicación destino.');
    }

    if (destination.type === StockLocationType.CUSTOMER_SITE) {
      throw new BadRequestException('No se permiten salidas manuales hacia sitio de cliente.');
    }

    const type = destination.type;

    switch (issueType) {
      case StockIssueType.TECHNICIAN_CUSTODY:
        if (type !== StockLocationType.MOBILE_TECHNICIAN) {
          throw new BadRequestException(
            'La custodia de técnico requiere destino tipo MOBILE_TECHNICIAN.',
          );
        }
        return;
      case StockIssueType.CREW_CUSTODY:
        if (type !== StockLocationType.MOBILE_CREW) {
          throw new BadRequestException(
            'La custodia de cuadrilla requiere destino tipo MOBILE_CREW.',
          );
        }
        return;
      case StockIssueType.OFFICE_REPLENISHMENT:
        if (type !== StockLocationType.OFFICE_STOCK) {
          throw new BadRequestException(
            'La reposición a oficina requiere destino tipo OFFICE_STOCK.',
          );
        }
        return;
      case StockIssueType.NODE_REPLENISHMENT:
        if (type !== StockLocationType.NODE_STOCK) {
          throw new BadRequestException('La reposición a nodo requiere destino tipo NODE_STOCK.');
        }
        return;
      case StockIssueType.WAREHOUSE_TO_WAREHOUSE: {
        const allowed = new Set<StockLocationType>([
          StockLocationType.OFFICE_STOCK,
          StockLocationType.NODE_STOCK,
          StockLocationType.QUARANTINE,
          StockLocationType.REPAIR,
        ]);
        if (!allowed.has(type)) {
          throw new BadRequestException(
            'La transferencia entre bodegas requiere un destino permitido.',
          );
        }
        return;
      }
      default:
        return;
    }
  }

  async create(input: CreateStockIssueInput, actor: JwtPayload): Promise<StockIssueDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateStockIssueSchema.parse(input);

    this.assertCommercialRefs(
      validated.type,
      validated.originRefId ?? null,
      validated.commercialRefId ?? null,
    );
    this.assertInternalConsumption(
      validated.type,
      validated.costCenter ?? null,
      validated.reason ?? null,
    );
    this.assertDestinationCompatibility(validated.type, validated.destinationLocationId ?? null);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.transaction(async (manager) => {
        const sourceLocation = await this.resolveLocation(
          manager,
          tenantId,
          validated.sourceLocationId,
        );
        this.assertSourceIsMainWarehouse(sourceLocation);

        const destinationLocation = validated.destinationLocationId
          ? await this.resolveLocation(manager, tenantId, validated.destinationLocationId)
          : null;
        this.assertDistinctLocations(sourceLocation, destinationLocation);
        this.assertDestinationTypeForDispatch(validated.type, destinationLocation);

        // MOD12 S2 · B3: el grupo de seriales de un ítem serializado es bloqueante desde la creación.
        await this.assertSerializedGroupsIntegrity(
          manager,
          tenantId,
          validated.lines.map((line) => ({
            itemId: line.itemId,
            requestedQty: line.requestedQty,
            serializedAssetIds: line.serializedAssetIds ?? [],
          })),
          validated.sourceLocationId,
        );

        const issue = await manager.save(
          StockIssue,
          manager.create(StockIssue, {
            tenantId,
            type: validated.type,
            status: StockIssueStatus.REQUESTED,
            sourceLocationId: validated.sourceLocationId,
            destinationLocationId: validated.destinationLocationId ?? null,
            destinationRefId: validated.destinationRefId ?? null,
            originRefId: validated.originRefId ?? null,
            commercialRefId: validated.commercialRefId ?? null,
            reason: validated.reason ?? null,
            costCenter: validated.costCenter ?? null,
            createdByUserId: actor.sub,
          }),
        );

        // El singular de transición se alimenta con el PRIMER serial del grupo
        // (compatibilidad de lecturas); queda fuera de la aritmética de cantidades.
        const lines = await manager.save(
          StockIssueLine,
          validated.lines.map((line) =>
            manager.create(StockIssueLine, {
              tenantId,
              issueId: issue.id,
              itemId: line.itemId,
              requestedQty: line.requestedQty.toFixed(2),
              dispatchedQty: null,
              lotId: line.lotId ?? null,
              serializedAssetId: line.serializedAssetIds?.[0] ?? null,
              condition: line.condition,
            }),
          ),
        );

        // MOD12 S2 · B2: el grupo queda autoritativo en la tabla hija.
        const serialRows: StockIssueLineSerial[] = [];
        lines.forEach((savedLine, index) => {
          const group = validated.lines[index]?.serializedAssetIds ?? [];
          for (const serializedAssetId of group) {
            serialRows.push(
              manager.create(StockIssueLineSerial, {
                tenantId,
                lineId: savedLine.id,
                issueId: issue.id,
                issueStatus: issue.status,
                serializedAssetId,
              }),
            );
          }
        });
        await this.insertIssueLineSerials(manager, serialRows);

        for (const line of validated.lines) {
          // MOD12 S2 · ajuste G1: la reserva la decide el tamaño del grupo;
          // una línea sin seriales reserva su cantidad solicitada.
          await this.reserveLineQuantity(
            manager,
            tenantId,
            validated.sourceLocationId,
            line,
            this.resolveLineQuantity(line, line.serializedAssetIds?.length ?? 0),
          );
        }

        return { ...issue, lines: this.withSerialAssets(lines, new Map()) };
      }),
    );
  }

  async list(query: ListStockIssuesQueryInput): Promise<ListResponse<StockIssue>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockIssuesQuerySchema.parse(query);
    assertExclusivePageCursor(validated);
    const limit = clampInventoryLimit(validated.limit);
    const usePage = validated.page !== undefined;
    const page = usePage ? clampPage(validated.page!, limit).page : 1;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockIssue, 'issue')
        .where('issue.tenant_id = :tenantId', { tenantId });

      if (validated.type) {
        qb.andWhere('issue.type = :type', { type: validated.type });
      }

      if (validated.status) {
        qb.andWhere('issue.status = :status', { status: validated.status });
      }

      if (validated.sourceLocationId) {
        qb.andWhere('issue.source_location_id = :sourceLocationId', {
          sourceLocationId: validated.sourceLocationId,
        });
      }

      if (validated.destinationLocationId) {
        qb.andWhere('issue.destination_location_id = :destinationLocationId', {
          destinationLocationId: validated.destinationLocationId,
        });
      }

      const total = await qb.clone().getCount();

      qb.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(1)', 'count')
          .from(StockIssueLine, 'line')
          .where('line.tenant_id = issue.tenant_id')
          .andWhere('line.issue_id = issue.id');
      }, 'lines_count');

      qb.orderBy('issue.created_at', 'DESC').addOrderBy('issue.id', 'DESC');

      if (usePage) {
        const { entities, raw } = await qb
          .skip((page - 1) * limit)
          .take(limit)
          .getRawAndEntities();
        const data = entities.map((entity, index) => {
          const count = raw[index]?.lines_count;
          (entity as unknown as { linesCount?: number }).linesCount =
            typeof count === 'string' ? Number.parseInt(count, 10) : Number(count ?? 0);
          return entity;
        });
        return {
          data,
          meta: buildPageMeta({
            total,
            page,
            limit,
            randomAccess: false,
            sortableFields: [],
          }),
        };
      }

      if (validated.cursor) {
        qb.andWhere(
          dateIdDescCursorWhere('issue', 'created_at'),
          dateIdDescCursorParams(validated.cursor),
        );
      }

      const { entities, raw } = await qb.take(limit + 1).getRawAndEntities();
      const entitiesWithCount = entities.map((entity, index) => {
        const count = raw[index]?.lines_count;
        (entity as unknown as { linesCount?: number }).linesCount =
          typeof count === 'string' ? Number.parseInt(count, 10) : Number(count ?? 0);
        return entity;
      });

      const { data, nextCursor } = sliceDateIdDescPage(
        entitiesWithCount,
        limit,
        (row) => row.createdAt,
      );
      return {
        data,
        meta: buildCursorMeta({
          nextCursor,
          total,
          limit,
        }),
      };
    });
  }

  async getById(id: string): Promise<StockIssueDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const issue = await qr.manager.findOne(StockIssue, { where: { id, tenantId } });

      if (!issue) {
        throw new NotFoundException('La salida solicitada no existe.');
      }

      const lines = await qr.manager.find(StockIssueLine, {
        where: { issueId: id, tenantId },
        order: { createdAt: 'ASC' },
      });

      // MOD12 S2 · B5: el detalle devuelve el grupo de seriales de cada línea
      // (id + número de serie legible) para que la edición reconstruya el
      // grupo sin heurística de reagrupación.
      const issueSerials = await this.loadIssueSerials(qr.manager, tenantId, id);
      const viewsByLine = await this.buildLineSerialViews(qr.manager, tenantId, issueSerials);

      return { ...issue, lines: this.withSerialAssets(lines, viewsByLine) };
    });
  }

  async dispatch(
    id: string,
    input: DispatchStockIssueInput,
    actor: JwtPayload,
  ): Promise<StockIssueDetail & { stockMovementId: string }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = DispatchStockIssueSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const previewLines = await qr.manager.find(StockIssueLine, {
        where: { issueId: id, tenantId },
        order: { createdAt: 'ASC' },
      });
      const itemIds = [...new Set(previewLines.map((line) => line.itemId))];
      const beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
        qr.manager,
        tenantId,
        itemIds,
      );

      type DispatchTxResult = {
        detail: StockIssueDetail & { stockMovementId: string };
        movementResult: Awaited<
          ReturnType<StockLedgerService['recordStockIssueSaleWithManager']>
        > | null;
      };

      const dispatched = await qr.manager.transaction(
        async (manager): Promise<DispatchTxResult> => {
          const issue = await manager.findOne(StockIssue, { where: { id, tenantId } });

          if (!issue) {
            throw new NotFoundException('La salida solicitada no existe.');
          }

          if (issue.stockMovementId) {
            const existingLines = await manager.find(StockIssueLine, {
              where: { issueId: id, tenantId },
              order: { createdAt: 'ASC' },
            });
            const replaySerials = await this.loadIssueSerials(manager, tenantId, id);
            const replayViews = await this.buildLineSerialViews(manager, tenantId, replaySerials);
            return {
              detail: {
                ...issue,
                lines: this.withSerialAssets(existingLines, replayViews),
                stockMovementId: issue.stockMovementId,
              },
              movementResult: null,
            };
          }

          if (
            issue.status === StockIssueStatus.CANCELLED ||
            issue.status === StockIssueStatus.DISPATCHED ||
            issue.status === StockIssueStatus.RECEIVED
          ) {
            throw new BadRequestException('No se puede despachar una salida en estado terminal.');
          }

          const issueLines = await manager.find(StockIssueLine, {
            where: { issueId: id, tenantId },
            order: { createdAt: 'ASC' },
          });

          if (issueLines.length === 0) {
            throw new BadRequestException('La salida debe incluir al menos una línea.');
          }

          // MOD12 S2: grupo de seriales de la salida (una consulta para todas las líneas).
          const issueSerials = await this.loadIssueSerials(manager, tenantId, id);
          const serialsByLineId = this.groupSerialAssetIdsByLine(issueSerials);

          const sourceLocation = await this.resolveLocation(
            manager,
            tenantId,
            issue.sourceLocationId,
          );
          this.assertSourceIsMainWarehouse(sourceLocation);
          const destinationLocation = issue.destinationLocationId
            ? await this.resolveLocation(manager, tenantId, issue.destinationLocationId)
            : null;

          this.assertDistinctLocations(sourceLocation, destinationLocation);
          this.assertDestinationTypeForDispatch(issue.type, destinationLocation);

          // MOD12 S2 · B4: la verificación "cantidad 1 por serial" vive en el
          // elemento; a nivel de línea la coherencia es cantidad = tamaño del grupo.
          for (const line of issueLines) {
            const requestedQty = this.toNumeric(line.requestedQty);
            const groupSize = serialsByLineId.get(line.id)?.length ?? 0;

            if (groupSize > 0 && requestedQty !== groupSize) {
              throw new BadRequestException(
                'La cantidad solicitada no coincide con el número de seriales de la línea.',
              );
            }

            const quantity = this.resolveLineQuantity(line, groupSize);

            // Libera la reserva propia antes del ledger para que no bloquee su despacho (D-F3B-5/6).
            await this.releaseLineQuantity(manager, tenantId, sourceLocation.id, line, quantity);
          }

          for (const line of issueLines) {
            const groupSize = serialsByLineId.get(line.id)?.length ?? 0;
            const quantity = this.resolveLineQuantity(line, groupSize);
            const availability = await this.getAvailability(manager, tenantId, {
              itemId: line.itemId,
              locationId: sourceLocation.id,
              lotId: line.lotId ?? null,
              condition: line.condition ?? StockBalanceCondition.NEW,
            });

            if (availability.available < quantity) {
              throw new BadRequestException(
                formatInsufficientAvailableMessage(availability.onHand, availability.reserved),
              );
            }
          }

          const ledgerLines = this.buildDispatchLedgerLines(issueLines, serialsByLineId);
          const idempotencyKey = `stock-issue:${issue.id}`;
          const originRefId =
            issue.commercialRefId ??
            issue.originRefId ??
            issue.costCenter ??
            issue.destinationRefId ??
            issue.id;

          const movement =
            issue.type === StockIssueType.SALE_DISPATCH
              ? await this.stockLedgerService.recordStockIssueSaleWithManager(
                  manager,
                  tenantId,
                  {
                    locationId: sourceLocation.id,
                    commercialRefId: issue.commercialRefId ?? issue.originRefId ?? originRefId,
                    idempotencyKey,
                    notes: validated.handoffNotes ?? validated.handoffMethod,
                    lines: ledgerLines,
                  },
                  actor,
                )
              : issue.type === StockIssueType.INTERNAL_CONSUMPTION
                ? await this.stockLedgerService.recordStockIssueInternalConsumptionWithManager(
                    manager,
                    tenantId,
                    {
                      locationId: sourceLocation.id,
                      costCenterRefId: issue.costCenter ?? originRefId,
                      reason: issue.reason ?? 'Consumo interno',
                      idempotencyKey,
                      notes: validated.handoffNotes ?? validated.handoffMethod,
                      lines: ledgerLines,
                    },
                    actor,
                  )
                : await this.stockLedgerService.recordStockIssueTransferWithManager(
                    manager,
                    tenantId,
                    {
                      sourceLocationId: sourceLocation.id,
                      destinationLocationId: destinationLocation!.id,
                      idempotencyKey,
                      originRefId,
                      handoffReference: validated.handoffMethod,
                      handoffNotes: validated.handoffNotes ?? null,
                      notes: null,
                      lines: ledgerLines,
                    },
                    actor,
                  );

          issue.status = StockIssueStatus.DISPATCHED;
          issue.dispatchedByUserId = actor.sub;
          issue.handoffMethod = validated.handoffMethod;
          issue.handoffNotes = validated.handoffNotes ?? null;
          issue.handoffAttachments = validated.handoffAttachments ?? [];
          issue.stockMovementId = movement.movement.id;
          issue.closedAt = new Date();

          const savedIssue = await manager.save(StockIssue, issue);

          // MOD12 S2: la espejo issue_status se sincroniza en la misma transacción
          // (un solo UPDATE set-based); habilita el reciclaje del índice parcial.
          await this.syncSerialMirrorStatus(manager, savedIssue.id, StockIssueStatus.DISPATCHED);

          await manager.save(
            StockIssueLine,
            issueLines.map((line) => {
              const groupSize = serialsByLineId.get(line.id)?.length ?? 0;
              const quantity = this.resolveLineQuantity(line, groupSize);
              return { ...line, dispatchedQty: quantity.toFixed(2) };
            }),
          );

          const finalLines = await manager.find(StockIssueLine, {
            where: { issueId: id, tenantId },
            order: { createdAt: 'ASC' },
          });
          const viewsByLine = await this.buildLineSerialViews(manager, tenantId, issueSerials);

          return {
            detail: {
              ...savedIssue,
              lines: this.withSerialAssets(finalLines, viewsByLine),
              stockMovementId: savedIssue.stockMovementId!,
            },
            movementResult: movement,
          };
        },
      );

      if (dispatched.movementResult) {
        const afterByItem = await this.domainEventPublisher.captureItemSnapshots(
          qr.manager,
          tenantId,
          itemIds,
        );
        this.domainEventPublisher.publishAfterCommittedMovement({
          tenantId,
          actorUserId: actor.sub,
          beforeByItem,
          afterByItem,
          movement: dispatched.movementResult.movement,
          lines: dispatched.movementResult.lines,
          created: dispatched.movementResult.created,
        });
      }

      return dispatched.detail;
    });
  }

  async update(
    id: string,
    input: UpdateStockIssueInput,
    actor: JwtPayload,
  ): Promise<StockIssueDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateStockIssueSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.transaction(async (manager) => {
        const issue = await manager.findOne(StockIssue, { where: { id, tenantId } });

        if (!issue) {
          throw new NotFoundException('La salida solicitada no existe.');
        }

        if (
          issue.status === StockIssueStatus.CANCELLED ||
          issue.status === StockIssueStatus.DISPATCHED ||
          issue.status === StockIssueStatus.RECEIVED
        ) {
          throw new BadRequestException('No se puede actualizar una salida en estado terminal.');
        }

        const nextType = validated.type ?? issue.type;
        const nextDestinationLocationId =
          validated.destinationLocationId !== undefined
            ? (validated.destinationLocationId ?? null)
            : issue.destinationLocationId;
        const nextOriginRefId =
          validated.originRefId !== undefined ? (validated.originRefId ?? null) : issue.originRefId;
        const nextCommercialRefId =
          validated.commercialRefId !== undefined
            ? (validated.commercialRefId ?? null)
            : issue.commercialRefId;
        const nextCostCenter =
          validated.costCenter !== undefined ? (validated.costCenter ?? null) : issue.costCenter;
        const nextReason =
          validated.reason !== undefined ? (validated.reason ?? null) : issue.reason;

        this.assertCommercialRefs(nextType, nextOriginRefId, nextCommercialRefId);
        this.assertInternalConsumption(nextType, nextCostCenter, nextReason);
        this.assertDestinationCompatibility(nextType, nextDestinationLocationId);

        const previousSourceLocationId = issue.sourceLocationId;
        const previousLines = await manager.find(StockIssueLine, {
          where: { tenantId, issueId: id },
          order: { createdAt: 'ASC' },
        });
        // Grupo vigente antes de reemplazar: libera por el tamaño real del grupo,
        // no por el singular de transición (MOD12 S2 · ajuste G1).
        const previousSerials = await this.loadIssueSerials(manager, tenantId, id);
        const previousGroups = this.groupSerialAssetIdsByLine(previousSerials);

        issue.type = nextType;
        issue.sourceLocationId = validated.sourceLocationId ?? issue.sourceLocationId;
        issue.destinationLocationId = nextDestinationLocationId;
        issue.destinationRefId =
          validated.destinationRefId !== undefined
            ? (validated.destinationRefId ?? null)
            : issue.destinationRefId;
        issue.originRefId = nextOriginRefId;
        issue.commercialRefId = nextCommercialRefId;
        issue.costCenter = nextCostCenter;
        issue.reason = nextReason;
        issue.status = validated.status ?? issue.status;

        const nextSourceLocation = await this.resolveLocation(
          manager,
          tenantId,
          issue.sourceLocationId,
        );
        this.assertSourceIsMainWarehouse(nextSourceLocation);

        const destinationLocation = nextDestinationLocationId
          ? await this.resolveLocation(manager, tenantId, nextDestinationLocationId)
          : null;
        this.assertDistinctLocations(nextSourceLocation, destinationLocation);
        this.assertDestinationTypeForDispatch(nextType, destinationLocation);

        const saved = await manager.save(StockIssue, issue);

        if (validated.lines) {
          // MOD12 S2 · B3: al reemplazar líneas se revalida el grupo contra la
          // bodega NUEVA, excluyendo la propia salida del chequeo de comprometidos.
          await this.assertSerializedGroupsIntegrity(
            manager,
            tenantId,
            validated.lines.map((line) => ({
              itemId: line.itemId,
              requestedQty: line.requestedQty,
              serializedAssetIds: line.serializedAssetIds ?? [],
            })),
            saved.sourceLocationId,
            id,
          );

          for (const line of previousLines) {
            await this.releaseLineQuantity(
              manager,
              tenantId,
              previousSourceLocationId,
              line,
              this.resolveLineQuantity(line, previousGroups.get(line.id)?.length ?? 0),
            );
          }

          // El delete de líneas arrastra las filas hijas por ON DELETE CASCADE:
          // el reemplazo que reusa seriales de la misma salida no auto-colisiona.
          await manager.delete(StockIssueLine, { tenantId, issueId: id });
          const nextLines = await manager.save(
            StockIssueLine,
            validated.lines.map((line) =>
              manager.create(StockIssueLine, {
                tenantId,
                issueId: id,
                itemId: line.itemId,
                requestedQty: line.requestedQty.toFixed(2),
                dispatchedQty: null,
                lotId: line.lotId ?? null,
                serializedAssetId: line.serializedAssetIds?.[0] ?? null,
                condition: line.condition,
              }),
            ),
          );

          // MOD12 S2 · B2: la reinsertión de la hija sincroniza la espejo con el
          // estado actual de la cabecera (no terminal: los estados terminales
          // entran solo por despacho o cancelación).
          const serialRows: StockIssueLineSerial[] = [];
          nextLines.forEach((savedLine, index) => {
            const group = validated.lines?.[index]?.serializedAssetIds ?? [];
            for (const serializedAssetId of group) {
              serialRows.push(
                manager.create(StockIssueLineSerial, {
                  tenantId,
                  lineId: savedLine.id,
                  issueId: id,
                  issueStatus: saved.status,
                  serializedAssetId,
                }),
              );
            }
          });
          await this.insertIssueLineSerials(manager, serialRows);

          for (const line of validated.lines) {
            // MOD12 S2 · ajuste G1: la reserva la decide el tamaño del grupo.
            await this.reserveLineQuantity(
              manager,
              tenantId,
              saved.sourceLocationId,
              line,
              this.resolveLineQuantity(line, line.serializedAssetIds?.length ?? 0),
            );
          }
        } else if (
          validated.sourceLocationId &&
          validated.sourceLocationId !== previousSourceLocationId
        ) {
          // MOD12 S1 · B3: al cambiar de bodega las líneas vigentes deben seguir
          // cumpliendo contra la bodega NUEVA (el serial pudo quedar en el origen anterior).
          await this.assertSerializedGroupsIntegrity(
            manager,
            tenantId,
            previousLines.map((line) => ({
              itemId: line.itemId,
              requestedQty: line.requestedQty,
              serializedAssetIds: previousGroups.get(line.id) ?? [],
            })),
            saved.sourceLocationId,
            id,
          );

          for (const line of previousLines) {
            const quantity = this.resolveLineQuantity(
              line,
              previousGroups.get(line.id)?.length ?? 0,
            );
            await this.releaseLineQuantity(
              manager,
              tenantId,
              previousSourceLocationId,
              line,
              quantity,
            );
            await this.reserveLineQuantity(
              manager,
              tenantId,
              saved.sourceLocationId,
              line,
              quantity,
            );
          }
        }

        const lines = await manager.find(StockIssueLine, {
          where: { tenantId, issueId: id },
          order: { createdAt: 'ASC' },
        });
        const currentSerials = await this.loadIssueSerials(manager, tenantId, id);
        const viewsByLine = await this.buildLineSerialViews(manager, tenantId, currentSerials);

        return {
          ...saved,
          lines: this.withSerialAssets(lines, viewsByLine),
          createdByUserId: saved.createdByUserId ?? actor.sub,
        };
      }),
    );
  }

  async cancel(id: string, _actor: JwtPayload): Promise<StockIssue> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.transaction(async (manager) => {
        const issue = await manager.findOne(StockIssue, { where: { id, tenantId } });

        if (!issue) {
          throw new NotFoundException('La salida solicitada no existe.');
        }

        if (
          issue.status === StockIssueStatus.DISPATCHED ||
          issue.status === StockIssueStatus.RECEIVED ||
          issue.status === StockIssueStatus.CANCELLED
        ) {
          throw new BadRequestException('No se puede cancelar una salida en estado terminal.');
        }

        const lines = await manager.find(StockIssueLine, {
          where: { tenantId, issueId: id },
          order: { createdAt: 'ASC' },
        });

        // MOD12 S2 · ajuste G1: libera por el tamaño real del grupo de seriales.
        const issueSerials = await this.loadIssueSerials(manager, tenantId, id);
        const serialsByLineId = this.groupSerialAssetIdsByLine(issueSerials);
        for (const line of lines) {
          await this.releaseLineQuantity(
            manager,
            tenantId,
            issue.sourceLocationId,
            line,
            this.resolveLineQuantity(line, serialsByLineId.get(line.id)?.length ?? 0),
          );
        }

        issue.status = StockIssueStatus.CANCELLED;
        issue.closedAt = new Date();

        const savedIssue = await manager.save(StockIssue, issue);

        // MOD12 S2: espejo sincronizada en la misma transacción; libera el
        // compromiso de los seriales (reciclaje del índice parcial).
        await this.syncSerialMirrorStatus(manager, id, StockIssueStatus.CANCELLED);

        return savedIssue;
      }),
    );
  }
}
