'use client';

import { useCallback, useState } from 'react';
import {
  AccessPermissionKey,
  VoidPaymentCommandSchema,
  type BillingPaymentResponse,
} from '@iwana/shared';
import Link from 'next/link';
import { Badge, Button } from '@iwana/ui';
import { Ban, Download, Eye, Mail } from 'lucide-react';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  formatBillingDate,
  formatBillingShortDate,
} from '@/components/crm/subscribers/billing-cycle-ui';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { BillingEmailSendResult, useBillingEmailSend } from './BillingEmailLog';
import { downloadPaymentReceipt } from './BillingPaymentDetail';
import { PortalRowActions, PortalRowIconButton } from '@/components/shared/portal-row-actions';
import { FilterSelect } from './BillingDocumentsClient';
import { BillingPaymentDialog } from './BillingPaymentDialog';
import { BillingSubscriberPicker } from './BillingSubscriberPicker';
import {
  formatBillingMoney,
  PAYMENT_METHODS,
  PAYMENT_VOID_REASONS,
  paymentReceiptLabel,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
  WITHHOLDING_TAX_CODES,
  withholdingAmountOrNull,
} from './billing-copy';
import {
  BillingLoadState,
  BillingPager,
  BillingTable,
  billingError,
  billingInputClass,
  billingPage,
  useBillingLoad,
  useBillingUrl,
} from './billing-ui';

const RESOURCE = { singular: 'pago', plural: 'pagos' };
const EMPTY_FILTERS = { subscriberId: '', method: '', status: '', from: '', to: '', page: '' };
const PAYMENT_STATUS_LABELS: Record<BillingPaymentResponse['status'], string> = {
  REGISTRADO: 'Registrado',
  ANULADO: 'Anulado',
};
const LIMIT_OPTIONS = [10, 20, 50] as const;

export function BillingPaymentsClient() {
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const [register, setRegister] = useState(false);
  const { params, update } = useBillingUrl();
  const page = billingPage(params.get('page'));
  const requestedLimit = Number(params.get('pageSize'));
  const limit = LIMIT_OPTIONS.find((value) => value === requestedLimit) ?? 20;
  // Filtros en la URL (como en Facturas): sobreviven a la recarga y al botón Atrás.
  const subscriberId = params.get('subscriberId') ?? '';
  const method = params.get('method') ?? '';
  const status = params.get('status') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const filtered = Boolean(subscriberId || method || status || from || to);
  const [subscriberOption, setSubscriberOption] = useState<{ id: string; label: string } | null>(
    null,
  );
  const load = useCallback(
    () =>
      billingApi.payments({
        page,
        limit,
        ...(subscriberId ? { subscriberId } : {}),
        ...(Object.hasOwn(PAYMENT_METHODS, method)
          ? { method: method as BillingPaymentResponse['method'] }
          : {}),
        ...(Object.hasOwn(PAYMENT_STATUS_LABELS, status)
          ? { status: status as BillingPaymentResponse['status'] }
          : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/u.test(from) ? { from } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/u.test(to) ? { to } : {}),
      }),
    [page, limit, subscriberId, method, status, from, to],
  );
  const filter = (key: string, value: string) => update({ [key]: value, page: '' });
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
        subtitle="Consulta los pagos registrados y su aplicación a facturas."
        actions={registerAction}
      />
      {/* Sin título propio: el encabezado de la página ya dice «Pagos». */}
      <PortalPanel contentClassName="space-y-4" busy={loading}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <BillingSubscriberPicker
              selected={
                subscriberId
                  ? subscriberOption?.id === subscriberId
                    ? subscriberOption
                    : { id: subscriberId, label: 'Cliente seleccionado' }
                  : null
              }
              onChange={(option) => {
                setSubscriberOption(option);
                filter('subscriberId', option?.id ?? '');
              }}
            />
            <FilterSelect
              id="payments-method"
              label="Método"
              value={method}
              onChange={(value) => filter('method', value)}
              options={Object.entries(PAYMENT_METHODS)}
            />
            <FilterSelect
              id="payments-status"
              label="Estado"
              value={status}
              onChange={(value) => filter('status', value)}
              options={Object.entries(PAYMENT_STATUS_LABELS)}
            />
            <label className="block space-y-1 text-sm">
              Desde
              <input
                type="date"
                className={billingInputClass}
                value={from}
                max={to || undefined}
                onChange={(event) => filter('from', event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              Hasta
              <input
                type="date"
                className={billingInputClass}
                value={to}
                min={from || undefined}
                onChange={(event) => filter('to', event.target.value)}
              />
            </label>
          </div>
          {/* Sin resultados, el mensaje vacío ya ofrece «Limpiar filtros»: no se duplica. */}
          {filtered && data?.data.length ? (
            <Button
              className="min-h-11"
              type="button"
              variant="ghost"
              onClick={() => update(EMPTY_FILTERS)}
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
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
            title={
              filtered ? 'No encontramos pagos con estos filtros' : 'Aún no hay pagos registrados'
            }
            description={
              filtered
                ? 'Ajusta los filtros para ampliar la búsqueda.'
                : 'Los pagos recibidos aparecerán en esta lista.'
            }
            action={
              filtered ? (
                <Button
                  className="min-h-11"
                  variant="secondary"
                  onClick={() => update(EMPTY_FILTERS)}
                >
                  Limpiar filtros
                </Button>
              ) : (
                registerAction
              )
            }
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
  showReceipt = false,
  paginate = false,
  onOpenDetail,
}: {
  payments: BillingPaymentResponse[];
  onChanged: () => void;
  showSubscriber?: boolean;
  /** Columna «Recibo»: consecutivo o referencia de origen del importado (spec 2026-11-13 D8). */
  showReceipt?: boolean;
  paginate?: boolean;
  /** Abre el detalle del pago (facturas cubiertas, retenciones, recibo y desasociar). */
  onOpenDetail?: (payment: BillingPaymentResponse) => void;
}) {
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const canReadPayments = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_READ);
  const [voiding, setVoiding] = useState<BillingPaymentResponse>();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const email = useBillingEmailSend();

  async function downloadReceipt(payment: BillingPaymentResponse) {
    if (downloading) return;
    setReceiptError(null);
    setDownloading(payment.id);
    try {
      await downloadPaymentReceipt(payment);
    } catch (cause) {
      setReceiptError(billingError(cause));
    } finally {
      setDownloading(null);
    }
  }
  // La columna solo aparece si algún pago tiene retenciones (spec MOD14 2026-11-13 R8).
  const showWithholdings = payments.some((payment) => payment.withholdings?.length);
  // La referencia solo ocupa columna si algún pago la tiene (en efectivo casi nunca hay).
  const showReference = payments.some((payment) => payment.reference?.trim());
  return (
    <>
      {showSubscriber && payments.some((payment) => payment.subscriberProtected) ? (
        <PortalAlert variant="info" title="Datos protegidos" description={PROTECTED_NOTICE} />
      ) : null}
      {receiptError ? <PortalAlert variant="error" title={receiptError} /> : null}
      <BillingEmailSendResult outcome={email.outcome} />
      <BillingTable
        paginate={paginate}
        label="Pagos registrados"
        columns={[
          ...(showSubscriber ? ['Cliente'] : []),
          ...(showReceipt ? ['Recibo'] : []),
          'Fecha',
          'Método',
          ...(showReference ? ['Referencia'] : []),
          'Recibido',
          ...(showWithholdings ? ['Retenciones'] : []),
          'Aplicado',
          'Saldo a favor',
          'Estado',
          'Acciones',
        ]}
        alignEnd={['Recibido', 'Retenciones', 'Aplicado', 'Saldo a favor']}
        rows={payments.map((payment) => ({
          id: payment.id,
          cells: [
            ...(showSubscriber
              ? [
                  payment.subscriberProtected ? (
                    PROTECTED_LABEL
                  ) : (
                    // El detalle, el recibo y su envío viven en la ficha del cliente (pestaña Pagos).
                    <Link
                      href={`/dashboard/crm/subscribers/${encodeURIComponent(payment.subscriberId)}?tab=facturacion&sub=pagos`}
                      className={portalInlineTextLinkClassName}
                    >
                      {payment.subscriberDisplayName ?? 'No disponible'}
                    </Link>
                  ),
                ]
              : []),
            ...(showReceipt ? [paymentReceiptLabel(payment)] : []),
            formatBillingShortDate(payment.paidAt),
            PAYMENT_METHODS[payment.method],
            ...(showReference ? [payment.reference?.trim() || '—'] : []),
            formatBillingMoney(payment.amount),
            ...(showWithholdings ? [<PaymentWithholdingsCell payment={payment} />] : []),
            payment.allocatedAmount == null ? '—' : formatBillingMoney(payment.allocatedAmount),
            payment.unallocatedAmount == null ? '—' : formatBillingMoney(payment.unallocatedAmount),
            <Badge variant={payment.status === 'ANULADO' ? 'error' : 'success'}>
              {payment.status === 'ANULADO' ? 'Anulado' : 'Registrado'}
            </Badge>,
            <PaymentActions
              payment={payment}
              canVoid={canRegister && payment.status === 'REGISTRADO'}
              onVoid={() => setVoiding(payment)}
              {...(onOpenDetail ? { onOpenDetail: () => onOpenDetail(payment) } : {})}
              {...(showReceipt && !payment.imported && canReadPayments
                ? {
                    download: {
                      busy: downloading === payment.id,
                      disabled: downloading !== null,
                      run: () => void downloadReceipt(payment),
                    },
                  }
                : {})}
              {...(showReceipt &&
              !payment.imported &&
              canRegister &&
              payment.status === 'REGISTRADO'
                ? {
                    sendEmail: {
                      busy: email.busy === payment.id,
                      disabled: email.busy !== null,
                      run: () =>
                        void email.send(payment.id, () => billingApi.sendReceiptEmail(payment.id)),
                    },
                  }
                : {})}
            />,
          ],
        }))}
      />
      {voiding ? (
        <BillingConfirmation
          title="Anular pago"
          description={`Las aplicaciones sobre facturas se revertirán y el saldo de esas facturas volverá a quedar pendiente o vencido.${
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

type RowAction = { busy: boolean; disabled: boolean; run: () => void };

/**
 * Acciones de la fila de un pago (`PortalRowActions`): detalle, recibo (descargar y enviar, solo
 * en la ficha y para pagos nativos) y anular, con el tono de peligro.
 */
function PaymentActions({
  payment,
  canVoid,
  onVoid,
  onOpenDetail,
  download,
  sendEmail,
}: {
  payment: BillingPaymentResponse;
  canVoid: boolean;
  onVoid: () => void;
  onOpenDetail?: () => void;
  download?: RowAction;
  sendEmail?: RowAction;
}) {
  if (!canVoid && !onOpenDetail && !download && !sendEmail) return <>—</>;
  const label = `${formatBillingDate(payment.paidAt)} por ${formatBillingMoney(payment.amount)}`;
  return (
    <PortalRowActions>
      {onOpenDetail ? (
        <PortalRowIconButton
          label={`Ver detalle del pago del ${label}`}
          hint="Ver detalle"
          onClick={onOpenDetail}
        >
          <Eye className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
      {download ? (
        <PortalRowIconButton
          label={`Descargar recibo del pago del ${label}`}
          hint="Descargar recibo"
          disabled={download.disabled}
          busy={download.busy}
          onClick={download.run}
        >
          <Download className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
      {sendEmail ? (
        <PortalRowIconButton
          label={`Enviar por correo el recibo del pago del ${label}`}
          hint="Enviar recibo"
          disabled={sendEmail.disabled}
          busy={sendEmail.busy}
          onClick={sendEmail.run}
        >
          <Mail className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
      {canVoid ? (
        <PortalRowIconButton
          label={`Anular el pago del ${label}`}
          hint="Anular pago"
          tone="danger"
          onClick={onVoid}
        >
          <Ban className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
    </PortalRowActions>
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
