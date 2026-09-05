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

export type StockIssueDetail = StockIssue & { lines: StockIssueLine[] };

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

interface SerialIntegrityLineInput {
  itemId: string;
  requestedQty: string | number;
  serializedAssetId?: string | null;
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

  private async reserveLineQuantity(
    manager: EntityManager,
    tenantId: string,
    sourceLocationId: string,
    line: {
      itemId: string;
      requestedQty: string | number;
      lotId?: string | null;
      condition?: StockBalanceCondition | null;
      serializedAssetId?: string | null;
    },
  ): Promise<void> {
    const requestedQty = this.toNumeric(line.requestedQty);
    const quantity = line.serializedAssetId ? 1 : requestedQty;
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
      requestedQty: string | number;
      lotId?: string | null;
      condition?: StockBalanceCondition | null;
      serializedAssetId?: string | null;
    },
  ): Promise<void> {
    const requestedQty = this.toNumeric(line.requestedQty);
    const quantity = line.serializedAssetId ? 1 : requestedQty;

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
   * Integridad de serial en la salida (MOD12 S1 · B3, D2 bloqueante).
   *
   * Capa de servicio, no zod: necesita ítems y activos del tenant. Carga en
   * batch (`find` + `In`) dentro de la transacción del llamador, nunca un
   * query por línea. `excludeIssueId` evita que el `update` colisione con sus
   * propias líneas al reemplazarlas o al cambiar de bodega.
   */
  private async assertSerializedLineIntegrity(
    manager: EntityManager,
    tenantId: string,
    lines: SerialIntegrityLineInput[],
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

    for (const line of serializedLines) {
      if (!line.serializedAssetId) {
        const sku = itemById.get(line.itemId)?.sku ?? line.itemId;
        throw new BadRequestException(
          `El ítem ${sku} exige seleccionar el activo serializado que sale.`,
        );
      }
      if (Number(line.requestedQty) !== 1) {
        throw new BadRequestException(
          'Las líneas con activo serializado deben solicitar cantidad 1.',
        );
      }
    }

    const assetIds = [...new Set(serializedLines.map((line) => line.serializedAssetId as string))];
    const foundAssets =
      (await manager.find(SerializedAsset, {
        where: { tenantId, id: In(assetIds) },
      })) ?? [];
    const assetById = new Map(foundAssets.map((asset) => [asset.id, asset]));
    const assetLabel = (assetId: string): string => {
      const serial = assetById.get(assetId)?.serialNumber?.trim();
      return serial ? `El activo ${serial}` : 'El activo serializado seleccionado';
    };

    const seenAssetIds = new Set<string>();
    for (const line of serializedLines) {
      const assetId = line.serializedAssetId as string;
      if (seenAssetIds.has(assetId)) {
        throw new BadRequestException(`${assetLabel(assetId)} está repetido en la salida.`);
      }
      seenAssetIds.add(assetId);
    }

    for (const line of serializedLines) {
      const assetId = line.serializedAssetId as string;
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

    const committedQb = manager
      .createQueryBuilder(StockIssueLine, 'line')
      .innerJoin(
        StockIssue,
        'issue',
        'issue.id = line.issue_id AND issue.tenant_id = line.tenant_id',
      )
      .select('line.serialized_asset_id', 'serializedAssetId')
      .where('line.tenant_id = :tenantId', { tenantId })
      .andWhere('line.serialized_asset_id IN (:...serialAssetIds)', {
        serialAssetIds: assetIds,
      })
      .andWhere('issue.status NOT IN (:...serialTerminalStatuses)', {
        serialTerminalStatuses: SERIAL_COMMIT_TERMINAL_STATUSES,
      });
    if (excludeIssueId) {
      committedQb.andWhere('issue.id != :excludeSerialIssueId', {
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

        // MOD12 S1 · B3: el serial de un ítem serializado es bloqueante desde la creación.
        await this.assertSerializedLineIntegrity(
          manager,
          tenantId,
          validated.lines.map((line) => ({
            itemId: line.itemId,
            requestedQty: line.requestedQty,
            serializedAssetId: line.serializedAssetId ?? null,
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
              serializedAssetId: line.serializedAssetId ?? null,
              condition: line.condition,
            }),
          ),
        );

        for (const line of lines) {
          await this.reserveLineQuantity(manager, tenantId, validated.sourceLocationId, line);
        }

        return { ...issue, lines };
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

      return { ...issue, lines };
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
            return {
              detail: { ...issue, lines: existingLines, stockMovementId: issue.stockMovementId },
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

          for (const line of issueLines) {
            const requestedQty = this.toNumeric(line.requestedQty);

            if (line.serializedAssetId && requestedQty !== 1) {
              throw new BadRequestException(
                'Las líneas con activo serializado deben solicitar cantidad 1.',
              );
            }

            // Libera la reserva propia antes del ledger para que no bloquee su despacho (D-F3B-5/6).
            await this.releaseLineQuantity(manager, tenantId, sourceLocation.id, line);
          }

          for (const line of issueLines) {
            const quantity = line.serializedAssetId ? 1 : this.toNumeric(line.requestedQty);
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
                    lines: issueLines.map((line) => ({
                      itemId: line.itemId,
                      quantity: line.serializedAssetId ? 1 : this.toNumeric(line.requestedQty),
                      lotId: line.lotId ?? null,
                      serializedAssetId: line.serializedAssetId ?? null,
                      serialNumber: null,
                      condition: line.condition ?? StockBalanceCondition.NEW,
                    })),
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
                      lines: issueLines.map((line) => ({
                        itemId: line.itemId,
                        quantity: line.serializedAssetId ? 1 : this.toNumeric(line.requestedQty),
                        lotId: line.lotId ?? null,
                        serializedAssetId: line.serializedAssetId ?? null,
                        serialNumber: null,
                        condition: line.condition ?? StockBalanceCondition.NEW,
                      })),
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
                      lines: issueLines.map((line) => ({
                        itemId: line.itemId,
                        quantity: line.serializedAssetId ? 1 : this.toNumeric(line.requestedQty),
                        lotId: line.lotId ?? null,
                        serializedAssetId: line.serializedAssetId ?? null,
                        serialNumber: null,
                        condition: line.condition ?? StockBalanceCondition.NEW,
                      })),
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

          await manager.save(
            StockIssueLine,
            issueLines.map((line) => {
              const requestedQty = this.toNumeric(line.requestedQty);
              const quantity = line.serializedAssetId ? 1 : requestedQty;
              return { ...line, dispatchedQty: quantity.toFixed(2) };
            }),
          );

          const finalLines = await manager.find(StockIssueLine, {
            where: { issueId: id, tenantId },
            order: { createdAt: 'ASC' },
          });

          return {
            detail: {
              ...savedIssue,
              lines: finalLines,
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
          // MOD12 S1 · B3: al reemplazar líneas se revalida contra la bodega NUEVA,
          // excluyendo la propia salida del chequeo de comprometidos.
          await this.assertSerializedLineIntegrity(
            manager,
            tenantId,
            validated.lines.map((line) => ({
              itemId: line.itemId,
              requestedQty: line.requestedQty,
              serializedAssetId: line.serializedAssetId ?? null,
            })),
            saved.sourceLocationId,
            id,
          );

          for (const line of previousLines) {
            await this.releaseLineQuantity(manager, tenantId, previousSourceLocationId, line);
          }

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
                serializedAssetId: line.serializedAssetId ?? null,
                condition: line.condition,
              }),
            ),
          );

          for (const line of nextLines) {
            await this.reserveLineQuantity(manager, tenantId, saved.sourceLocationId, line);
          }
        } else if (
          validated.sourceLocationId &&
          validated.sourceLocationId !== previousSourceLocationId
        ) {
          // MOD12 S1 · B3: al cambiar de bodega las líneas vigentes deben seguir
          // cumpliendo contra la bodega NUEVA (el serial pudo quedar en el origen anterior).
          await this.assertSerializedLineIntegrity(
            manager,
            tenantId,
            previousLines.map((line) => ({
              itemId: line.itemId,
              requestedQty: line.requestedQty,
              serializedAssetId: line.serializedAssetId,
            })),
            saved.sourceLocationId,
            id,
          );

          for (const line of previousLines) {
            await this.releaseLineQuantity(manager, tenantId, previousSourceLocationId, line);
            await this.reserveLineQuantity(manager, tenantId, saved.sourceLocationId, line);
          }
        }

        const lines = await manager.find(StockIssueLine, {
          where: { tenantId, issueId: id },
          order: { createdAt: 'ASC' },
        });

        return { ...saved, lines, createdByUserId: saved.createdByUserId ?? actor.sub };
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

        for (const line of lines) {
          await this.releaseLineQuantity(manager, tenantId, issue.sourceLocationId, line);
        }

        issue.status = StockIssueStatus.CANCELLED;
        issue.closedAt = new Date();

        return manager.save(StockIssue, issue);
      }),
    );
  }
}
