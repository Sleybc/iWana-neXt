import {
  BillingDocumentInstallationBreakdownSchema,
  type BillingDocumentInstallationBreakdown,
  type BillingInstallationValueSource,
} from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import { formatCents, toCents } from './billing-installation-breakdown.math';

/** Fila del consumo de instalación por contrato; `position` null si la OT no tuvo ítems. */
export interface InstallationBreakdownReadRow {
  contract_id: string;
  execution_order_id: string;
  execution_order_number: string;
  execution_order_closed_at: Date | string;
  position: number | null;
  description: string | null;
  unit_of_measure: string | null;
  quantity: string | null;
  serial_numbers: unknown;
  is_loan: boolean | null;
  value_source: BillingInstallationValueSource | null;
  unit_reference_value: string | null;
  reference_value: string | null;
}

/** Línea del documento que interesa al desglose: solo su clase y total. */
export interface InstallationChargeLine {
  kind: string;
  total: string;
}

/**
 * Consumo de instalación de los contratos dados (spec MOD14 2026-11-13 R3, R5). Solo tablas de
 * MOD14. El vínculo es el contrato: una OT cerrada después de generar el documento aparece igual.
 */
export async function installationBreakdownRowsByContract(
  manager: EntityManager,
  tenantId: string,
  contractIds: readonly string[],
): Promise<Map<string, InstallationBreakdownReadRow[]>> {
  const byContract = new Map<string, InstallationBreakdownReadRow[]>();
  if (!contractIds.length) return byContract;
  const rows = (await manager.query(
    `SELECT b.contract_id::text, b.execution_order_id::text, b.execution_order_number,
            b.execution_order_closed_at, i.position, i.description, i.unit_of_measure,
            i.quantity::text AS quantity, i.serial_numbers, i.is_loan, i.value_source,
            i.unit_reference_value::numeric(14,2)::text AS unit_reference_value,
            i.reference_value::numeric(14,2)::text AS reference_value
       FROM billing_installation_breakdowns b
       LEFT JOIN billing_installation_breakdown_items i
         ON i.breakdown_id = b.id AND i.tenant_id = b.tenant_id
      WHERE b.tenant_id = $1 AND b.contract_id = ANY($2::uuid[])
      ORDER BY b.execution_order_closed_at, b.execution_order_id, i.position`,
    [tenantId, [...new Set(contractIds)]],
  )) as InstallationBreakdownReadRow[];
  for (const row of rows) {
    const grouped = byContract.get(row.contract_id) ?? [];
    grouped.push(row);
    byContract.set(row.contract_id, grouped);
  }
  return byContract;
}

export function hasInstallationLine(lines: readonly InstallationChargeLine[]): boolean {
  return lines.some((line) => line.kind === 'INSTALACION');
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serials(value: unknown): string[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed)
    ? parsed.filter((serial): serial is string => typeof serial === 'string' && serial.length > 0)
    : [];
}

/**
 * Arma el desglose informativo de un documento (R3, R4). Devuelve null si el documento no lleva
 * línea `INSTALACION` o el contrato no tiene consumo registrado. Con `protectSerials` (titular
 * bloqueado sin permiso del lector, o anonimizado) omite los seriales del equipo.
 */
export function buildDocumentInstallationBreakdown(
  rows: readonly InstallationBreakdownReadRow[] | undefined,
  lines: readonly InstallationChargeLine[],
  protectSerials: boolean,
): BillingDocumentInstallationBreakdown | null {
  if (!rows?.length || !hasInstallationLine(lines)) return null;
  const orders = new Map<string, { executionOrderNumber: string; closedAt: string }>();
  const items: BillingDocumentInstallationBreakdown['items'] = [];
  let realCents = 0;
  let withoutValue = 0;
  for (const row of rows) {
    if (!orders.has(row.execution_order_id))
      orders.set(row.execution_order_id, {
        executionOrderNumber: row.execution_order_number,
        closedAt: iso(row.execution_order_closed_at),
      });
    if (row.position === null || row.value_source === null) continue;
    const referenceCents = toCents(row.reference_value);
    if (row.value_source === 'SIN_VALOR' || referenceCents === null) withoutValue += 1;
    else realCents += referenceCents;
    items.push({
      executionOrderNumber: row.execution_order_number,
      position: row.position,
      description: row.description ?? '',
      quantity: row.quantity ?? '0',
      unitOfMeasure: row.unit_of_measure ?? '',
      unitReferenceValue: row.value_source === 'SIN_VALOR' ? null : row.unit_reference_value,
      referenceValue: row.value_source === 'SIN_VALOR' ? null : row.reference_value,
      valueSource: row.value_source,
      isLoan: row.is_loan === true,
      serialNumbers: protectSerials ? [] : serials(row.serial_numbers),
    });
  }
  const chargedCents = lines
    .filter((line) => line.kind === 'INSTALACION')
    .reduce((sum, line) => sum + (toCents(line.total) ?? 0), 0);
  return BillingDocumentInstallationBreakdownSchema.parse({
    executionOrders: [...orders.values()],
    items,
    realValue: formatCents(realCents),
    chargedValue: formatCents(chargedCents),
    itemsWithoutValue: withoutValue,
    serialsProtected: protectSerials,
  });
}
