import { TenantContext } from '@iwana/db';
import { AuditAction, CustomerSegment, InventoryDisposition } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import type { AuditService } from '../../audit/audit.service';
import type { InstalledEquipmentReadPort } from '../../inventory/ports/installed-equipment-read.port';
import type { InstallationConsumptionValuationReadPort } from '../../inventory/ports/installation-consumption-valuation-read.port';
import type {
  ClosedInstallationConsumption,
  ExecutionOrderConsumptionReadPort,
} from '../../tasks/ports/execution-order-consumption-read.port';
import type { InstallationContractReadPort } from '../ports/installation-contract-read.port';
import { BillingInstallationBreakdownService } from './billing-installation-breakdown.service';

const query = jest.fn();
const manager = { query };

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    runInTenantSchema: jest.fn(
      async (_ds: unknown, _schema: string, work: (qr: unknown) => unknown) =>
        work({ query, manager }),
    ),
  };
});

const TENANT = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  schemaName: 'tenant_acme',
  tenantSlug: 'acme',
};
const ORDER_ID = 'a0000000-0000-4000-8000-000000000001';
const SUBSCRIBER_ID = 'b0000000-0000-4000-8000-000000000001';
const CONTRACT_ID = 'c0000000-0000-4000-8000-000000000001';
const ROUTER = '22222222-2222-4222-8222-222222222222';

const consumption = (
  overrides: Partial<ClosedInstallationConsumption> = {},
): ClosedInstallationConsumption => ({
  executionOrderId: ORDER_ID,
  executionOrderNumber: 'OT-2026-0001',
  subscriberId: SUBSCRIBER_ID,
  closedAt: '2026-11-13T15:00:00.000Z',
  lines: [
    {
      itemId: ROUTER,
      quantity: 1,
      serialNumber: 'SN-1',
      finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
    },
  ],
  ...overrides,
});

describe('BillingInstallationBreakdownService', () => {
  let orders: { getClosedInstallationConsumption: jest.Mock };
  let contracts: { findByExecutionOrder: jest.Mock };
  let valuations: { describeItems: jest.Mock };
  let installed: { listInstalledAtCustomer: jest.Mock };
  let audit: { logWithin: jest.Mock };
  let service: BillingInstallationBreakdownService;
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(TENANT, fn);

  beforeEach(() => {
    query.mockReset();
    orders = { getClosedInstallationConsumption: jest.fn().mockResolvedValue(consumption()) };
    contracts = {
      findByExecutionOrder: jest
        .fn()
        .mockResolvedValue({ contractId: CONTRACT_ID, customerSegment: CustomerSegment.PYME }),
    };
    valuations = {
      describeItems: jest.fn().mockResolvedValue([
        {
          itemId: ROUTER,
          name: 'Router',
          unitOfMeasure: 'UND',
          averageCost: '100000.00000',
          commercialProduct: {
            id: 'p1',
            name: 'Router',
            isLoan: false,
            currentBasePrice: '250000.00',
          },
        },
      ]),
    };
    installed = {
      listInstalledAtCustomer: jest
        .fn()
        .mockResolvedValue([{ serialNumber: 'SN-1', macAddress: null, model: null }]),
    };
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    service = new BillingInstallationBreakdownService(
      {} as DataSource,
      audit as unknown as AuditService,
      orders as unknown as ExecutionOrderConsumptionReadPort,
      contracts as unknown as InstallationContractReadPort,
      valuations as unknown as InstallationConsumptionValuationReadPort,
      installed as unknown as InstalledEquipmentReadPort,
    );
  });

  it('registra cabecera, ítems valorados y auditoría (actor sistema)', async () => {
    query
      .mockResolvedValueOnce([]) // exists
      .mockResolvedValueOnce([{ id: 'bd-1' }]) // INSERT cabecera
      .mockResolvedValueOnce([]); // INSERT ítem

    await expect(run(() => service.capture(ORDER_ID))).resolves.toBe('recorded');

    expect(valuations.describeItems).toHaveBeenCalledWith([ROUTER], CustomerSegment.PYME);
    expect(installed.listInstalledAtCustomer).toHaveBeenCalledWith(ORDER_ID, SUBSCRIBER_ID);
    const header = query.mock.calls[1] as [string, unknown[]];
    expect(header[0]).toContain('ON CONFLICT (tenant_id, execution_order_id) DO NOTHING');
    expect(header[1]).toEqual([
      TENANT.tenantId,
      CONTRACT_ID,
      SUBSCRIBER_ID,
      ORDER_ID,
      'OT-2026-0001',
      '2026-11-13T15:00:00.000Z',
      'PYME',
    ]);
    const item = query.mock.calls[2] as [string, unknown[]];
    expect(item[1]).toEqual([
      TENANT.tenantId,
      'bd-1',
      1,
      ROUTER,
      'Router',
      'UND',
      1,
      '["SN-1"]',
      true,
      'p1',
      'PRECIO_COMERCIAL',
      '250000.00',
      '250000.00',
    ]);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        entityType: 'BillingInstallationBreakdown',
        entityId: 'bd-1',
        userId: null,
        newValue: expect.objectContaining({ items: 1, valuedItems: 1, contractId: CONTRACT_ID }),
      }),
      manager,
    );
  });

  it('ya registrado: no relee la OT ni revalora', async () => {
    query.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(run(() => service.capture(ORDER_ID))).resolves.toBe('existing');
    expect(orders.getClosedInstallationConsumption).not.toHaveBeenCalled();
    expect(valuations.describeItems).not.toHaveBeenCalled();
  });

  it('carrera con otro registro: el INSERT no devuelve fila y no escribe ítems ni auditoría', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(run(() => service.capture(ORDER_ID))).resolves.toBe('existing');
    expect(query).toHaveBeenCalledTimes(2);
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('OT que no aplica, sin titular o sin contrato: no escribe nada', async () => {
    query.mockResolvedValue([]);
    orders.getClosedInstallationConsumption.mockResolvedValueOnce(null);
    await expect(run(() => service.capture(ORDER_ID))).resolves.toBe('notApplicable');

    orders.getClosedInstallationConsumption.mockResolvedValueOnce(
      consumption({ subscriberId: null }),
    );
    await expect(run(() => service.capture(ORDER_ID))).resolves.toBe('withoutSubscriber');

    contracts.findByExecutionOrder.mockResolvedValueOnce(null);
    await expect(run(() => service.capture(ORDER_ID))).resolves.toBe('withoutContract');

    expect(query.mock.calls.every(([sql]) => !String(sql).includes('INSERT'))).toBe(true);
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('contrato sin segmento o con uno desconocido: precio RESIDENTIAL', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'bd-1' }])
      .mockResolvedValue([]);
    contracts.findByExecutionOrder.mockResolvedValueOnce({
      contractId: CONTRACT_ID,
      customerSegment: 'OTRO',
    });
    await run(() => service.capture(ORDER_ID));
    expect(valuations.describeItems).toHaveBeenCalledWith([ROUTER], CustomerSegment.RESIDENTIAL);
  });

  it('sin seriales no consulta equipos instalados; sin consumo registra solo la cabecera', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'bd-2' }]);
    orders.getClosedInstallationConsumption.mockResolvedValueOnce(consumption({ lines: [] }));
    valuations.describeItems.mockResolvedValueOnce([]);

    await expect(run(() => service.capture(ORDER_ID))).resolves.toBe('recorded');
    expect(installed.listInstalledAtCustomer).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ items: 0 }) }),
      manager,
    );
  });

  it('un fallo de un puerto se propaga (el job se reintenta)', async () => {
    query.mockResolvedValueOnce([]);
    valuations.describeItems.mockRejectedValueOnce(new Error('catálogo caído'));
    await expect(run(() => service.capture(ORDER_ID))).rejects.toThrow('catálogo caído');
  });
});
