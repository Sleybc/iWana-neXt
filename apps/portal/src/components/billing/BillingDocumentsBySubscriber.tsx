'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Eye, FileText } from 'lucide-react';
import type { BillingSubscriberDocumentsSummary } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { formatBillingShortDate } from '@/components/crm/subscribers/billing-cycle-ui';
import {
  PortalEmptyState,
  PortalPageSizeSelect,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import {
  PortalRowActions,
  PortalRowIconButton,
  PortalRowIconLink,
} from '@/components/shared/portal-row-actions';
import { billingApi, type BillingDocumentsQuery } from '@/lib/api-client';
import { formatBillingMoney, PROTECTED_LABEL } from './billing-copy';
import { BillingLoadState, BillingPager, BillingTable, useBillingLoad } from './billing-ui';

const RESOURCE = { singular: 'cliente', plural: 'clientes' };

/**
 * Vista «Por cliente» de Facturas (usuario 2026-11-14): cuánto debe cada cliente, cuántas
 * facturas tiene vencidas y desde cuándo, con los mismos filtros de la lista. La API pagina por
 * cliente, así que la suma de cada uno incluye todas sus facturas que cumplen el filtro.
 */
export function BillingDocumentsBySubscriber({
  query,
  limitOptions,
  filtered,
  onPage,
  onPageSize,
  onShowDocuments,
  onClearFilters,
}: {
  query: Omit<BillingDocumentsQuery, 'subscriberId'>;
  limitOptions: readonly number[];
  filtered: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** Pasa a la vista por factura filtrada por ese cliente. */
  onShowDocuments: (summary: BillingSubscriberDocumentsSummary) => void;
  onClearFilters: () => void;
}) {
  const queryKey = JSON.stringify(query);
  const load = useCallback(
    () => billingApi.documentsBySubscriber(JSON.parse(queryKey) as typeof query),
    [queryKey],
  );
  const { data, loading, error, reload } = useBillingLoad(load);

  return (
    <>
      <BillingLoadState loading={loading} error={error} onRetry={reload} />
      {data?.data.length ? (
        <>
          <div className="flex justify-end">
            <PortalPageSizeSelect
              value={query.limit ?? 20}
              options={limitOptions}
              onChange={onPageSize}
            />
          </div>
          <BillingTable
            label="Facturas por cliente"
            columns={[
              'Cliente',
              'Facturas',
              'Vencidas',
              'Vence desde',
              'Total',
              'Saldo',
              'Acciones',
            ]}
            alignEnd={['Facturas', 'Vencidas', 'Total', 'Saldo']}
            rows={data.data.map((summary) => {
              const name = summary.buyerProtected
                ? PROTECTED_LABEL
                : (summary.displayName ?? 'No disponible');
              return {
                id: summary.subscriberId,
                cells: [
                  summary.buyerProtected ? (
                    name
                  ) : (
                    <Link
                      href={`/dashboard/crm/subscribers/${encodeURIComponent(summary.subscriberId)}?tab=facturacion&sub=facturas`}
                      className={portalInlineTextLinkClassName}
                    >
                      {name}
                    </Link>
                  ),
                  summary.documentCount,
                  summary.overdueCount ? (
                    <Badge variant="warning">{summary.overdueCount}</Badge>
                  ) : (
                    '0'
                  ),
                  summary.oldestPendingDueDate
                    ? formatBillingShortDate(summary.oldestPendingDueDate)
                    : '—',
                  formatBillingMoney(summary.total),
                  <span className="font-semibold">
                    {formatBillingMoney(summary.pendingAmount)}
                  </span>,
                  <PortalRowActions>
                    <PortalRowIconButton
                      label={`Ver las facturas de ${name}`}
                      hint="Ver facturas"
                      onClick={() => onShowDocuments(summary)}
                    >
                      <FileText className="h-4 w-4" aria-hidden />
                    </PortalRowIconButton>
                    {summary.buyerProtected ? null : (
                      <PortalRowIconLink
                        label={`Abrir la ficha de ${name}`}
                        hint="Abrir ficha"
                        href={`/dashboard/crm/subscribers/${encodeURIComponent(summary.subscriberId)}?tab=facturacion&sub=facturas`}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </PortalRowIconLink>
                    )}
                  </PortalRowActions>,
                ],
              };
            })}
          />
          <BillingPager meta={data.meta} resource={RESOURCE} onPage={onPage} />
        </>
      ) : data ? (
        <PortalEmptyState
          title={filtered ? 'No encontramos clientes con estos filtros' : 'Aún no hay facturas'}
          description={
            filtered
              ? 'Ajusta los filtros para ampliar la búsqueda.'
              : 'Las facturas aparecerán aquí cuando generes la primera o se ejecute el proceso diario.'
          }
          {...(filtered
            ? {
                action: (
                  <Button className="min-h-11" variant="secondary" onClick={onClearFilters}>
                    Limpiar filtros
                  </Button>
                ),
              }
            : {})}
        />
      ) : null}
    </>
  );
}
