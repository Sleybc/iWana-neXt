'use client';

import { useCallback, useState } from 'react';
import {
  AccessPermissionKey,
  VoidPaymentCommandSchema,
  type BillingPaymentResponse,
} from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
} from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { BillingPaymentDialog } from './BillingPaymentDialog';
import {
  formatBillingMoney,
  PAYMENT_METHODS,
  PAYMENT_VOID_REASONS,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
  WITHHOLDING_TAX_CODES,
  withholdingAmountOrNull,
} from './billing-copy';
import {
  BillingLoadState,
  BillingPager,
  BillingTable,
  billingPage,
  useBillingLoad,
  useBillingUrl,
} from './billing-ui';

const RESOURCE = { singular: 'pago', plural: 'pagos' };
const LIMIT_OPTIONS = [10, 20, 50] as const;

export function BillingPaymentsClient() {
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const [register, setRegister] = useState(false);
  const { params, update } = useBillingUrl();
  const page = billingPage(params.get('page'));
  const requestedLimit = Number(params.get('pageSize'));
  const limit = LIMIT_OPTIONS.find((value) => value === requestedLimit) ?? 20;
  const load = useCallback(() => billingApi.payments({ page, limit }), [page, limit]);
  const { data, loading, error, reload } = useBillingLoad(load);
  const registerAction = canRegister ? (
    <Button className="min-h-11" onClick={() => setRegister(true)}>
      Registrar pago
    </Button>
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagos"
        subtitle="Consulta los pagos registrados y su aplicación a documentos de cobro."
        actions={registerAction}
      />
      <PortalPanel title="Pagos registrados" contentClassName="space-y-4" busy={loading}>
        <BillingLoadState loading={loading} error={error} onRetry={reload} />
        {data?.data.length ? (
          <>
            <div className="flex justify-end">
              <PortalPageSizeSelect
                value={limit}
                options={LIMIT_OPTIONS}
                onChange={(size) => update({ pageSize: String(size), page: '' })}
              />
            </div>
            <BillingPaymentTable payments={data.data} onChanged={reload} showSubscriber />
            <BillingPager
              meta={data.meta}
              resource={RESOURCE}
              onPage={(next) => update({ page: String(next) }, false)}
            />
          </>
        ) : data ? (
          <PortalEmptyState
            title="Aún no hay pagos registrados"
            description="Los pagos recibidos aparecerán en esta lista."
            action={registerAction}
          />
        ) : null}
      </PortalPanel>
      {register ? (
        <BillingPaymentDialog
          onClose={() => setRegister(false)}
          onSaved={() => {
            setRegister(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

export function BillingPaymentTable({
  payments,
  onChanged,
  showSubscriber = false,
}: {
  payments: BillingPaymentResponse[];
  onChanged: () => void;
  showSubscriber?: boolean;
}) {
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const [voiding, setVoiding] = useState<BillingPaymentResponse>();
  // La columna solo aparece si algún pago tiene retenciones (spec MOD14 2026-11-13 R8).
  const showWithholdings = payments.some((payment) => payment.withholdings?.length);
  return (
    <>
      {showSubscriber && payments.some((payment) => payment.subscriberProtected) ? (
        <PortalAlert variant="info" title="Datos protegidos" description={PROTECTED_NOTICE} />
      ) : null}
      <BillingTable
        label="Pagos registrados"
        columns={[
          ...(showSubscriber ? ['Suscriptor'] : []),
          'Fecha',
          'Método',
          'Referencia',
          'Monto recibido',
          ...(showWithholdings ? ['Retenciones'] : []),
          'Monto aplicado',
          'Remanente',
          'Estado',
          'Acciones',
        ]}
        rows={payments.map((payment) => ({
          id: payment.id,
          cells: [
            ...(showSubscriber
              ? [
                  payment.subscriberProtected
                    ? PROTECTED_LABEL
                    : (payment.subscriberDisplayName ?? 'No disponible'),
                ]
              : []),
            formatBillingDate(payment.paidAt),
            PAYMENT_METHODS[payment.method],
            payment.reference ?? '—',
            formatBillingMoney(payment.amount),
            ...(showWithholdings ? [<PaymentWithholdingsCell payment={payment} />] : []),
            payment.allocatedAmount == null ? '—' : formatBillingMoney(payment.allocatedAmount),
            payment.unallocatedAmount == null ? '—' : formatBillingMoney(payment.unallocatedAmount),
            <Badge variant={payment.status === 'ANULADO' ? 'error' : 'success'}>
              {payment.status === 'ANULADO' ? 'Anulado' : 'Registrado'}
            </Badge>,
            canRegister && payment.status === 'REGISTRADO' ? (
              <Button
                className="min-h-11"
                type="button"
                variant="ghost"
                onClick={() => setVoiding(payment)}
              >
                Anular pago
              </Button>
            ) : (
              '—'
            ),
          ],
        }))}
      />
      {voiding ? (
        <BillingConfirmation
          title="Anular pago"
          description={`Las aplicaciones sobre documentos se revertirán y el saldo de los documentos volverá a estar pendiente o vencido.${
            withholdingAmountOrNull(voiding.withholdingAmount)
              ? ' Sus retenciones también se anularán.'
              : ''
          }`}
          confirm="Confirmar anulación"
          reasons={PAYMENT_VOID_REASONS}
          onClose={() => setVoiding(undefined)}
          onConfirm={async (key, reasonCode, note) => {
            await billingApi.voidPayment(
              voiding.id,
              VoidPaymentCommandSchema.parse({ reasonCode, ...(note ? { note } : {}) }),
              key,
            );
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

/** Retenciones del pago: valor vigente y tipos; las de un pago anulado se ven como anuladas. */
function PaymentWithholdingsCell({ payment }: { payment: BillingPaymentResponse }) {
  const lines = payment.withholdings ?? [];
  if (!lines.length) return <>—</>;
  const voided = lines.every((line) => line.voidedAt != null);
  const total = withholdingAmountOrNull(payment.withholdingAmount);
  const types = [...new Set(lines.map((line) => WITHHOLDING_TAX_CODES[line.taxCode]))];
  return (
    <div className="space-y-0.5">
      <p>{voided || !total ? 'Anuladas' : formatBillingMoney(total)}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">{types.join(' · ')}</p>
    </div>
  );
}
