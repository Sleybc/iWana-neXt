import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  StockLocationType,
} from '@iwana/shared';
import { DataSource, EntityManager } from 'typeorm';
import {
  StockBalance,
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
import { StockLedgerService } from './stock-ledger.service';

export type StockIssueDetail = StockIssue & { lines: StockIssueLine[] };

@Injectable()
export class StockIssueService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockLedgerService: StockLedgerService,
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

  private async getAvailableQuantity(
    manager: EntityManager,
    tenantId: string,
    input: {
      itemId: string;
      locationId: string;
      lotId?: string | null;
      condition?: StockBalanceCondition;
    },
  ): Promise<number> {
    const balances = await manager.find(StockBalance, {
      where: {
        tenantId,
        itemId: input.itemId,
        locationId: input.locationId,
        condition: input.condition ?? StockBalanceCondition.NEW,
      },
    });

    return balances
      .filter((balance) => (balance.lotId ?? null) === (input.lotId ?? null))
      .reduce((total, balance) => total + this.toNumeric(balance.quantityOnHand), 0);
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

        return { ...issue, lines };
      }),
    );
  }

  async list(query: ListStockIssuesQueryInput): Promise<StockIssue[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListStockIssuesQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(StockIssue, 'issue')
        .where('issue.tenant_id = :tenantId', { tenantId })
        .orderBy('issue.created_at', 'DESC');

      qb.addSelect((subQuery) => {
        return subQuery
          .select('COUNT(1)', 'count')
          .from(StockIssueLine, 'line')
          .where('line.tenant_id = issue.tenant_id')
          .andWhere('line.issue_id = issue.id');
      }, 'lines_count');

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

      const { entities, raw } = await qb.getRawAndEntities();
      return entities.map((entity, index) => {
        const count = raw[index]?.lines_count;
        (entity as unknown as { linesCount?: number }).linesCount =
          typeof count === 'string' ? Number.parseInt(count, 10) : Number(count ?? 0);
        return entity;
      });
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

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.transaction(async (manager) => {
        const issue = await manager.findOne(StockIssue, { where: { id, tenantId } });

        if (!issue) {
          throw new NotFoundException('La salida solicitada no existe.');
        }

        if (issue.stockMovementId) {
          const existingLines = await manager.find(StockIssueLine, {
            where: { issueId: id, tenantId },
            order: { createdAt: 'ASC' },
          });
          return { ...issue, lines: existingLines, stockMovementId: issue.stockMovementId };
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
          const quantity = line.serializedAssetId ? 1 : requestedQty;

          if (line.serializedAssetId && requestedQty !== 1) {
            throw new BadRequestException(
              'Las líneas con activo serializado deben solicitar cantidad 1.',
            );
          }

          const available = await this.getAvailableQuantity(manager, tenantId, {
            itemId: line.itemId,
            locationId: sourceLocation.id,
            lotId: line.lotId ?? null,
            condition: line.condition ?? StockBalanceCondition.NEW,
          });

          if (available < quantity) {
            throw new BadRequestException(
              'La cantidad solicitada excede el saldo disponible en la ubicación origen.',
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
          ...savedIssue,
          lines: finalLines,
          stockMovementId: savedIssue.stockMovementId!,
        };
      }),
    );
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
          await manager.delete(StockIssueLine, { tenantId, issueId: id });
          await manager.save(
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

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const issue = await qr.manager.findOne(StockIssue, { where: { id, tenantId } });

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

      issue.status = StockIssueStatus.CANCELLED;
      issue.closedAt = new Date();

      return qr.manager.save(StockIssue, issue);
    });
  }
}
