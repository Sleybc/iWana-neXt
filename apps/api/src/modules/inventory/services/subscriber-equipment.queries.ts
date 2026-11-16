import type { QueryRunner } from 'typeorm';
import {
  AssetLifecycleEventType,
  SerializedAssetStatus,
  StockLocationType,
  type SubscriberEquipmentHistoryItem,
  type SubscriberEquipmentItem,
  type SubscriberMaterialItem,
} from '@iwana/shared';
import { calculateUsefulLife } from './serialized-asset-useful-life.util';

/**
 * Consultas de solo lectura de `GET /inventory/subscribers/:id/equipment`
 * (spec 2026-11-16-mod05-mod12-equipos-del-suscriptor §2.1).
 *
 * - Toda consulta filtra por `tenant_id` ($1, del `TenantContext`) además del
 *   `search_path` del schema tenant; SQL parametrizado, cada `$n` con un único tipo.
 * - Las filas se mapean campo por campo: nunca se leen `notes` del evento ni las
 *   notas o referencias internas del movimiento.
 * - No se registra nada en logs (serial y MAC ligados al suscriptor).
 */
export type SubscriberEquipmentQueryRunner = Pick<QueryRunner, 'query'>;

/** Contexto origen de los movimientos de OT; fuente única (lo usa también stock-ledger.service.ts). */
export const EXECUTION_ORDER_ORIGIN_CONTEXT = 'tasks.execution-order';

export interface SubscriberEquipmentPageResult<TItem> {
  items: TItem[];
  total: number;
}

interface EquipmentRow {
  loan_id: string;
  asset_id: string;
  item_name: string;
  model: string | null;
  serial_number: string | null;
  mac_address: string | null;
  status: SerializedAssetStatus;
  installed_at: Date;
  removed_at: Date | null;
  execution_order_ref_id: string | null;
  contract_ref_id: string | null;
  useful_life_months: number | null;
  purchase_date: string | null;
  warranty_until: string | null;
}

interface MaterialRow {
  movement_id: string;
  movement_number: string;
  occurred_at: Date;
  item_name: string;
  quantity: string;
  unit_of_measure: string;
  execution_order_ref_id: string | null;
}

interface HistoryRow {
  id: string;
  asset_id: string;
  serial_number: string | null;
  event_type: AssetLifecycleEventType;
  occurred_at: Date;
}

interface CountRow {
  total: string;
}

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toTotal(rows: CountRow[]): number {
  return Number(rows[0]?.total ?? 0);
}

/**
 * Comodatos del suscriptor (abiertos y cerrados), sin paginar: abiertos primero,
 * luego `installed_at` descendente. Usa `idx_asset_loan_assignments_tenant_subscriber`.
 */
export async function loadSubscriberEquipment(
  runner: SubscriberEquipmentQueryRunner,
  tenantId: string,
  subscriberRefId: string,
  referenceDate?: Date,
): Promise<SubscriberEquipmentItem[]> {
  const rows = (await runner.query(
    `SELECT l.id::text AS loan_id,
            l.serialized_asset_id::text AS asset_id,
            i.name AS item_name,
            i.model AS model,
            a.serial_number AS serial_number,
            a.mac_address AS mac_address,
            a.current_status::text AS status,
            l.installed_at AS installed_at,
            l.removed_at AS removed_at,
            l.execution_order_ref_id::text AS execution_order_ref_id,
            l.contract_ref_id::text AS contract_ref_id,
            a.useful_life_months AS useful_life_months,
            a.purchase_date::text AS purchase_date,
            a.warranty_until::text AS warranty_until
       FROM asset_loan_assignments l
       JOIN serialized_assets a
         ON a.id = l.serialized_asset_id AND a.tenant_id = l.tenant_id
       JOIN inventory_items i
         ON i.id = a.inventory_item_id AND i.tenant_id = a.tenant_id
      WHERE l.tenant_id = $1
        AND l.subscriber_ref_id = $2
      ORDER BY (l.removed_at IS NULL) DESC, l.installed_at DESC, l.id DESC`,
    [tenantId, subscriberRefId],
  )) as EquipmentRow[];

  return rows.map((row) => ({
    loanId: row.loan_id,
    assetId: row.asset_id,
    itemName: row.item_name,
    model: row.model,
    serialNumber: row.serial_number,
    macAddress: row.mac_address,
    status: row.status,
    installedAt: toIso(row.installed_at),
    removedAt: row.removed_at === null ? null : toIso(row.removed_at),
    executionOrderRefId: row.execution_order_ref_id,
    contractRefId: row.contract_ref_id,
    usefulLife: calculateUsefulLife({
      usefulLifeMonths: row.useful_life_months,
      purchaseDate: row.purchase_date,
      warrantyUntil: row.warranty_until,
      ...(referenceDate ? { referenceDate } : {}),
    }),
  }));
}

/**
 * Filtro común de materiales: líneas positivas, no serializadas, en una ubicación
 * `CUSTOMER_SITE` cuyo responsable es el suscriptor. Excluye los movimientos
 * reversados y los reversos, para no mostrar material que se devolvió por reverso.
 */
const MATERIALS_FROM = `
       FROM stock_locations loc
       JOIN stock_movement_lines line
         ON line.location_id = loc.id AND line.tenant_id = loc.tenant_id
       JOIN stock_movements m
         ON m.id = line.movement_id AND m.tenant_id = line.tenant_id
       JOIN inventory_items i
         ON i.id = line.item_id AND i.tenant_id = line.tenant_id
      WHERE loc.tenant_id = $1
        AND loc.responsible_ref_id = $2
        AND loc.type = $3
        AND line.quantity > 0
        AND line.serialized_asset_id IS NULL
        AND m.is_reversal = false
        AND m.reversed_by_movement_id IS NULL`;

/** Materiales del suscriptor, una fila por movimiento e ítem (suma los lotes). */
export async function loadSubscriberMaterials(
  runner: SubscriberEquipmentQueryRunner,
  tenantId: string,
  subscriberRefId: string,
  page: number,
  limit: number,
): Promise<SubscriberEquipmentPageResult<SubscriberMaterialItem>> {
  const baseParams = [tenantId, subscriberRefId, StockLocationType.CUSTOMER_SITE];

  const countRows = (await runner.query(
    `SELECT count(*)::text AS total
       FROM (SELECT 1 ${MATERIALS_FROM} GROUP BY m.id, i.id) grouped`,
    baseParams,
  )) as CountRow[];
  const total = toTotal(countRows);
  if (total === 0) {
    return { items: [], total };
  }

  const rows = (await runner.query(
    `SELECT m.id::text AS movement_id,
            m.movement_number AS movement_number,
            m.created_at AS occurred_at,
            i.name AS item_name,
            sum(line.quantity)::text AS quantity,
            i.unit_of_measure AS unit_of_measure,
            CASE WHEN m.origin_context = $4 THEN m.origin_ref_id END AS execution_order_ref_id
     ${MATERIALS_FROM}
      GROUP BY m.id, i.id
      ORDER BY m.created_at DESC, m.id DESC, i.name ASC, i.id ASC
      LIMIT $5 OFFSET $6`,
    [...baseParams, EXECUTION_ORDER_ORIGIN_CONTEXT, limit, (page - 1) * limit],
  )) as MaterialRow[];

  return {
    total,
    items: rows.map((row) => ({
      movementId: row.movement_id,
      movementNumber: row.movement_number,
      occurredAt: toIso(row.occurred_at),
      itemName: row.item_name,
      quantity: row.quantity,
      unitOfMeasure: row.unit_of_measure,
      executionOrderRefId: row.execution_order_ref_id,
    })),
  };
}

/**
 * Filtro común del historial. Un evento entra si su activo tuvo un comodato con
 * el suscriptor y:
 * - cae en el periodo `[installed_at, removed_at]` (bordes incluidos; el evento de
 *   cierre comparte transacción con `removed_at` y queda dentro), o
 * - pertenece al movimiento que abrió ese comodato (el evento de instalación se
 *   graba con la hora de inicio de la transacción, antes de `installed_at`).
 *
 * El `= ANY(ARRAY(...))` deja usar `idx_asset_lifecycle_events_asset` (ver EXPLAIN
 * de A2); el `EXISTS` aplica el recorte por periodo. `historyAssetId` ajeno a los
 * comodatos del suscriptor no encuentra filas: nunca expone el historial completo.
 */
function historyWhere(withAssetFilter: boolean): string {
  return `
      WHERE e.tenant_id = $1
        AND e.serialized_asset_id = ANY (ARRAY(
          SELECT l0.serialized_asset_id
            FROM asset_loan_assignments l0
           WHERE l0.tenant_id = $1 AND l0.subscriber_ref_id = $2))
        AND EXISTS (
          SELECT 1
            FROM asset_loan_assignments l
           WHERE l.tenant_id = $1
             AND l.subscriber_ref_id = $2
             AND l.serialized_asset_id = e.serialized_asset_id
             AND (
               (e.created_at >= l.installed_at
                 AND (l.removed_at IS NULL OR e.created_at <= l.removed_at))
               OR e.stock_movement_id = l.stock_movement_id))
        ${withAssetFilter ? 'AND e.serialized_asset_id = $3' : ''}`;
}

/** Historial de los equipos del suscriptor, del más reciente al más antiguo. */
export async function loadSubscriberHistory(
  runner: SubscriberEquipmentQueryRunner,
  tenantId: string,
  subscriberRefId: string,
  page: number,
  limit: number,
  historyAssetId?: string,
): Promise<SubscriberEquipmentPageResult<SubscriberEquipmentHistoryItem>> {
  const withAssetFilter = historyAssetId !== undefined;
  const baseParams: unknown[] = withAssetFilter
    ? [tenantId, subscriberRefId, historyAssetId]
    : [tenantId, subscriberRefId];
  const where = historyWhere(withAssetFilter);

  const countRows = (await runner.query(
    `SELECT count(*)::text AS total FROM asset_lifecycle_events e ${where}`,
    baseParams,
  )) as CountRow[];
  const total = toTotal(countRows);
  if (total === 0) {
    return { items: [], total };
  }

  const limitIndex = baseParams.length + 1;
  const rows = (await runner.query(
    `SELECT e.id::text AS id,
            e.serialized_asset_id::text AS asset_id,
            a.serial_number AS serial_number,
            e.event_type::text AS event_type,
            e.created_at AS occurred_at
       FROM asset_lifecycle_events e
       JOIN serialized_assets a
         ON a.id = e.serialized_asset_id AND a.tenant_id = e.tenant_id
     ${where}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
    [...baseParams, limit, (page - 1) * limit],
  )) as HistoryRow[];

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      serialNumber: row.serial_number,
      eventType: row.event_type,
      occurredAt: toIso(row.occurred_at),
    })),
  };
}
