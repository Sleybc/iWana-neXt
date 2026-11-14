import { useId } from 'react';
import {
  getInventoryUnitOfMeasureLabel,
  type BillingDocumentInstallationBreakdown,
  type BillingInstallationBreakdownItem,
} from '@iwana/shared';
import { Badge } from '@iwana/ui';
import { formatBillingMoneyExact, INSTALLATION_VALUE_SOURCES } from './billing-copy';
import { BillingTable } from './billing-ui';

const captionClass = 'text-xs text-gray-600 dark:text-gray-400';

/** «UND» es la unidad de respaldo del cálculo; se muestra como unidad del catálogo. */
function unitLabel(code: string): string {
  return getInventoryUnitOfMeasureLabel(code === 'UND' || !code ? 'UNIT' : code);
}

const closedAtFormat = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatQuantity(quantity: string): string {
  return Number(quantity).toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function itemsWithoutValueNote(count: number): string {
  return count === 1
    ? '1 ítem no tiene valor de referencia y no suma en el valor real.'
    : `${count} ítems no tienen valor de referencia y no suman en el valor real.`;
}

/**
 * Valor real de la instalación (spec MOD14 2026-11-13 R3, R4): materiales y equipos que el técnico
 * registró en la OT, con su valor de referencia congelado. Es informativo: no cambia el total.
 */
export function BillingInstallationBreakdown({
  breakdown,
}: {
  breakdown: BillingDocumentInstallationBreakdown;
}) {
  const headingId = useId();
  const orders = breakdown.executionOrders
    .map(
      (order) =>
        `${order.executionOrderNumber} (cerrada el ${closedAtFormat.format(new Date(order.closedAt))})`,
    )
    .join(', ');
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="space-y-1">
        <h3 id={headingId} className="text-sm font-semibold">
          Valor real de la instalación (informativo, no se cobra)
        </h3>
        <p className={captionClass}>
          Materiales y equipos registrados en{' '}
          {breakdown.executionOrders.length === 1 ? 'la orden' : 'las órdenes'} {orders}. No cambia
          el total de la factura.
        </p>
      </div>
      {breakdown.items.length ? (
        <BillingTable
          label="Materiales y equipos de la instalación"
          columns={['Descripción', 'Cantidad', 'Unidad', 'Valor unitario', 'Total']}
          rows={breakdown.items.map((item) => ({
            id: `${item.executionOrderNumber}-${item.position}`,
            cells: [
              <ItemDescription item={item} serialsProtected={breakdown.serialsProtected} />,
              formatQuantity(item.quantity),
              unitLabel(item.unitOfMeasure),
              item.unitReferenceValue == null ? (
                INSTALLATION_VALUE_SOURCES.SIN_VALOR
              ) : (
                <div className="space-y-0.5">
                  <p>{formatBillingMoneyExact(item.unitReferenceValue)}</p>
                  <p className={captionClass}>{INSTALLATION_VALUE_SOURCES[item.valueSource]}</p>
                </div>
              ),
              item.referenceValue == null ? '—' : formatBillingMoneyExact(item.referenceValue),
            ],
          }))}
        />
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          La orden no registró materiales ni equipos.
        </p>
      )}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-dark-border">
          <dt className="font-medium">Valor real</dt>
          <dd className="tabular-nums text-base font-semibold">
            {formatBillingMoneyExact(breakdown.realValue)}
          </dd>
        </div>
        <div className="rounded-xl border border-gray-200 px-3 py-2 dark:border-dark-border">
          <dt className="font-medium">Valor cobrado</dt>
          <dd className="tabular-nums text-base font-semibold">
            {formatBillingMoneyExact(breakdown.chargedValue)}
          </dd>
        </div>
      </dl>
      {breakdown.itemsWithoutValue > 0 ? (
        <p className={captionClass}>{itemsWithoutValueNote(breakdown.itemsWithoutValue)}</p>
      ) : null}
      {breakdown.items.some((item) => item.isLoan) ? (
        <p className={captionClass}>
          Los equipos en comodato suman su valor de referencia, pero se devuelven al terminar el
          servicio.
        </p>
      ) : null}
      {breakdown.serialsProtected ? (
        <p className={captionClass}>
          Los seriales no se muestran porque los datos del titular están protegidos.
        </p>
      ) : null}
    </section>
  );
}

function ItemDescription({
  item,
  serialsProtected,
}: {
  item: BillingInstallationBreakdownItem;
  serialsProtected: boolean;
}) {
  return (
    <div className="space-y-0.5 whitespace-normal">
      <p>
        {item.description}
        {item.isLoan ? (
          <>
            {' '}
            <Badge variant="info">En comodato</Badge>
          </>
        ) : null}
      </p>
      {!serialsProtected && item.serialNumbers.length ? (
        <p className={captionClass}>
          {item.serialNumbers.length === 1 ? 'Serial' : 'Seriales'}: {item.serialNumbers.join(', ')}
        </p>
      ) : null}
    </div>
  );
}
