import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  AssetLifecycleEventType,
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockLocationType,
  StockMovementOrigin,
} from '@iwana/shared';
import type { SerializedAssetDetailRecord } from '@/lib/api-client';
import { SerializedAssetDetailDrawer } from './SerializedAssetDetailDrawer';
import { formatInventoryOpaqueRef } from './inventory-labels';

function buildAssetDetail(
  overrides: Partial<SerializedAssetDetailRecord> = {},
): SerializedAssetDetailRecord {
  return {
    id: 'asset-001',
    tenantId: 'tenant-1',
    inventoryItemId: 'item-001',
    serialNumber: 'SN-001',
    normalizedSerialNumber: 'SN-001',
    macAddress: 'AA:BB:CC:DD:EE:01',
    normalizedMacAddress: 'AA:BB:CC:DD:EE:01',
    assetTag: 'TAG-001',
    currentStatus: SerializedAssetStatus.AVAILABLE,
    currentLocationId: 'loc-main',
    currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
    currentResponsibleRefId: 'loc-main',
    subscriberRefId: null,
    contractRefId: null,
    purchaseOrderRef: 'PO-001',
    purchaseDate: '2026-01-15',
    usefulLifeMonths: 36,
    warrantyUntil: '2027-01-15',
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    item: {
      id: 'item-001',
      sku: 'ONT-001',
      name: 'ONT WiFi 6',
      categoryName: 'CPE',
    },
    currentLocation: {
      id: 'loc-main',
      code: 'BOD-01',
      name: 'Bodega principal',
      type: StockLocationType.MAIN_WAREHOUSE,
    },
    purchaseOrigin: {
      purchaseOrderId: 'po-001',
      purchaseOrderNumber: 'OC-0001',
      goodsReceiptId: 'gr-001',
      receivedAt: '2026-01-15T10:00:00.000Z',
      supplierPartyRefId: 'party-001',
      supplierDisplayName: 'Proveedor Alfa',
      unitCost: '120000',
    },
    usefulLife: {
      monthsTotal: 36,
      monthsElapsed: 6,
      monthsRemaining: 30,
      warrantyUntil: '2027-01-15',
      status: 'vigente',
    },
    lifecycle: {
      data: [
        {
          id: 'evt-1',
          eventType: AssetLifecycleEventType.RECEIVED,
          fromStatus: SerializedAssetStatus.IN_RECEIVING,
          toStatus: SerializedAssetStatus.AVAILABLE,
          locationId: 'loc-main',
          locationName: 'Bodega principal',
          responsibleRefId: null,
          actorUserId: 'user-1',
          notes: null,
          occurredAt: '2026-01-15T10:00:00.000Z',
          stockMovementId: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    },
    movements: {
      data: [
        {
          id: 'mov-1',
          movementNumber: 'MOV-0001',
          origin: StockMovementOrigin.PURCHASE_RECEIPT,
          originContext: 'GOODS_RECEIPT',
          originRefId: 'gr-001',
          adjustmentReason: null,
          notes: null,
          actorUserId: 'user-1',
          isReversal: false,
          createdAt: '2026-01-15T10:00:00.000Z',
          lines: [
            {
              id: 'line-1',
              itemId: 'item-001',
              itemName: 'ONT WiFi 6',
              itemSku: 'ONT-001',
              locationId: 'loc-main',
              locationName: 'Bodega principal',
              lotId: null,
              lotNumber: null,
              serializedAssetId: 'asset-001',
              quantity: '1',
              unitCost: '120000',
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    },
    loans: { data: [], total: 0 },
    ...overrides,
  };
}

describe('SerializedAssetDetailDrawer · ficha 360 Fase 05A', () => {
  it('renderiza las siete secciones con datos compuestos', () => {
    render(
      <SerializedAssetDetailDrawer
        open
        detail={buildAssetDetail()}
        onClose={jest.fn()}
        onOpenKardex={jest.fn()}
      />,
    );

    expect(screen.getByTestId('asset-detail-section-header')).toBeInTheDocument();
    expect(screen.getByTestId('asset-detail-section-location')).toBeInTheDocument();
    expect(screen.getByTestId('asset-detail-section-purchase-origin')).toBeInTheDocument();
    expect(screen.getByTestId('asset-detail-section-useful-life')).toBeInTheDocument();
    expect(screen.getByTestId('asset-detail-section-lifecycle')).toBeInTheDocument();
    expect(screen.getByTestId('asset-detail-section-movements')).toBeInTheDocument();
    expect(screen.getByTestId('asset-detail-section-loans')).toBeInTheDocument();

    expect(screen.getByText('ONT-001 · ONT WiFi 6')).toBeInTheDocument();
    expect(screen.getByText('OC-0001')).toBeInTheDocument();
    expect(screen.getByText('Proveedor Alfa')).toBeInTheDocument();
    expect(screen.getByText('Recepción')).toBeInTheDocument();
    expect(screen.getByText('MOV-0001')).toBeInTheDocument();
  });

  it('muestra estados vacíos explicativos cuando faltan secciones', () => {
    render(
      <SerializedAssetDetailDrawer
        open
        detail={buildAssetDetail({
          purchaseOrigin: null,
          usefulLife: {
            monthsTotal: null,
            monthsElapsed: null,
            monthsRemaining: null,
            warrantyUntil: null,
            status: 'sin-dato',
          },
          lifecycle: { data: [], total: 0, page: 1, limit: 20 },
          movements: { data: [], total: 0, page: 1, limit: 20 },
          loans: { data: [], total: 0 },
        })}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Sin origen de compra registrado')).toBeInTheDocument();
    expect(screen.getByText('Sin datos de vida útil')).toBeInTheDocument();
    expect(screen.getByText('Sin eventos de ciclo de vida')).toBeInTheDocument();
    expect(screen.getByText('Sin movimientos registrados')).toBeInTheDocument();
    expect(screen.getByText('Sin comodatos registrados')).toBeInTheDocument();
  });

  it('muestra referencia opaca de suscriptor en sitio de cliente', () => {
    const subscriberRefId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    render(
      <SerializedAssetDetailDrawer
        open
        detail={buildAssetDetail({
          subscriberRefId,
          currentLocation: {
            id: 'loc-customer',
            code: 'CLI-01',
            name: 'Sitio cliente',
            type: StockLocationType.CUSTOMER_SITE,
          },
        })}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByText(
        `En sitio de cliente · ${formatInventoryOpaqueRef('subscriber', subscriberRefId)}`,
      ),
    ).toBeInTheDocument();
  });

  it('pagina ciclo de vida y movimientos con Ver más', () => {
    const onLoadMoreLifecycle = jest.fn();
    const onLoadMoreMovements = jest.fn();

    render(
      <SerializedAssetDetailDrawer
        open
        detail={buildAssetDetail({
          lifecycle: {
            data: [
              {
                id: 'evt-1',
                eventType: AssetLifecycleEventType.RECEIVED,
                fromStatus: null,
                toStatus: SerializedAssetStatus.AVAILABLE,
                locationId: null,
                locationName: null,
                responsibleRefId: null,
                actorUserId: null,
                notes: null,
                occurredAt: '2026-01-15T10:00:00.000Z',
                stockMovementId: null,
              },
            ],
            total: 3,
            page: 1,
            limit: 1,
          },
          movements: {
            data: [
              {
                id: 'mov-1',
                movementNumber: 'MOV-0001',
                origin: StockMovementOrigin.TRANSFER,
                originContext: 'TRANSFER',
                originRefId: null,
                adjustmentReason: null,
                notes: null,
                actorUserId: null,
                isReversal: false,
                createdAt: '2026-02-01T10:00:00.000Z',
                lines: [
                  {
                    id: 'line-1',
                    itemId: 'item-001',
                    itemName: 'ONT WiFi 6',
                    itemSku: 'ONT-001',
                    locationId: 'loc-main',
                    locationName: 'Bodega principal',
                    lotId: null,
                    lotNumber: null,
                    serializedAssetId: 'asset-001',
                    quantity: '-1',
                    unitCost: '120000',
                  },
                ],
              },
            ],
            total: 2,
            page: 1,
            limit: 1,
          },
        })}
        onClose={jest.fn()}
        onLoadMoreLifecycle={onLoadMoreLifecycle}
        onLoadMoreMovements={onLoadMoreMovements}
      />,
    );

    const lifecycleSection = screen.getByTestId('asset-detail-section-lifecycle');
    fireEvent.click(within(lifecycleSection).getByRole('button', { name: 'Ver más' }));
    expect(onLoadMoreLifecycle).toHaveBeenCalledTimes(1);

    const movementsSection = screen.getByTestId('asset-detail-section-movements');
    fireEvent.click(within(movementsSection).getByRole('button', { name: 'Ver más' }));
    expect(onLoadMoreMovements).toHaveBeenCalledTimes(1);
  });

  it('dispara apertura del kardex filtrado por activo', () => {
    const onOpenKardex = jest.fn();
    render(
      <SerializedAssetDetailDrawer
        open
        detail={buildAssetDetail()}
        onClose={jest.fn()}
        onOpenKardex={onOpenKardex}
      />,
    );

    fireEvent.click(screen.getByTestId('asset-detail-open-kardex'));
    expect(onOpenKardex).toHaveBeenCalledWith('asset-001');
  });

  it('muestra skeleton mientras carga', () => {
    render(<SerializedAssetDetailDrawer open isLoading onClose={jest.fn()} detail={null} />);
    expect(screen.getByTestId('asset-detail-loading')).toBeInTheDocument();
  });

  it('enlaza evento de ciclo de vida con movimiento cargado en la ficha', () => {
    render(
      <SerializedAssetDetailDrawer
        open
        detail={buildAssetDetail({
          lifecycle: {
            data: [
              {
                id: 'evt-linked',
                eventType: AssetLifecycleEventType.INSTALLED,
                fromStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
                toStatus: SerializedAssetStatus.INSTALLED_COMODATO,
                locationId: 'loc-customer',
                locationName: 'Sitio cliente',
                responsibleRefId: null,
                actorUserId: null,
                notes: null,
                occurredAt: '2026-03-01T10:00:00.000Z',
                stockMovementId: 'mov-linked',
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
          movements: {
            data: [
              {
                id: 'mov-linked',
                movementNumber: 'MOV-0099',
                origin: StockMovementOrigin.EXECUTION_ORDER,
                originContext: 'tasks.execution-order',
                originRefId: null,
                adjustmentReason: null,
                notes: null,
                actorUserId: null,
                isReversal: false,
                createdAt: '2026-03-01T10:00:00.000Z',
                lines: [],
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
        })}
        onClose={jest.fn()}
      />,
    );

    const link = screen.getByTestId('asset-detail-lifecycle-movement-link-evt-linked');
    expect(link).toBeInTheDocument();
    fireEvent.click(link);
    expect(screen.getByText('MOV-0099')).toBeInTheDocument();
  });

  it('muestra comodatos reales en la sección Comodatos', () => {
    const subscriberRefId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const contractRefId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

    render(
      <SerializedAssetDetailDrawer
        open
        detail={buildAssetDetail({
          loans: {
            total: 1,
            data: [
              {
                id: 'loan-001',
                serializedAssetId: 'asset-001',
                subscriberRefId,
                contractRefId,
                installedAt: '2026-06-01T10:00:00.000Z',
                removedAt: null,
                executionOrderRefId: 'eo-001',
                stockMovementId: 'mov-001',
                status: 'abierto',
              },
            ],
          },
        })}
        onClose={jest.fn()}
      />,
    );

    const loansSection = screen.getByTestId('asset-detail-section-loans');
    expect(
      within(loansSection).getByText(formatInventoryOpaqueRef('subscriber', subscriberRefId)),
    ).toBeInTheDocument();
    expect(
      within(loansSection).getByText(formatInventoryOpaqueRef('contract', contractRefId)),
    ).toBeInTheDocument();
    expect(within(loansSection).getByText('Abierto')).toBeInTheDocument();
  });
});
