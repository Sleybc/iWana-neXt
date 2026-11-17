'use client';

import { useCallback, useId, useState, type FormEvent } from 'react';
import {
  GenerateDocumentsCommandSchema,
  type BillingDocumentResponse,
  type BillingGenerationSummary,
  type BillingPeriodPaymentState,
} from '@iwana/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { AccessPermissionKey } from '@iwana/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalFilterChip,
  PortalPanel,
  portalFilterChipGroupClassName,
} from '@/components/shared/portal-ui';
import {
  billingApi,
  billingCyclesApi,
  contractsApi,
  type BillingDocumentsQuery,
} from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { BillingDocumentTable } from './BillingDocumentTable';
import { BillingDocumentsBySubscriber } from './BillingDocumentsBySubscriber';
import { BillingSubscriberPicker } from './BillingSubscriberPicker';
import {
  DOCUMENT_STATES,
  formatBillingMoney,
  fromMoneyCents,
  moneyCents,
  PAYMENT_STATES,
} from './billing-copy';
import {
  BillingLoadState,
  BillingPager,
  billingInputClass,
  billingPage,
  useBillingLoad,
  useBillingMutation,
  useBillingUrl,
} from './billing-ui';

const EMPTY_QUERY = {
  status: '',
  paymentState: '',
  cycleDay: '',
  subscriberId: '',
  from: '',
  to: '',
  page: '',
};
const RESOURCE = { singular: 'factura', plural: 'facturas' };

/** «1 factura» o «N facturas»: la cantidad concuerda con el sustantivo. */
function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
const LIMIT_OPTIONS = [10, 20, 50] as const;
const SUBSCRIBER_LIMIT_OPTIONS = [5, ...LIMIT_OPTIONS] as const;

export function BillingDocumentsClient() {
  return <BillingDocumentList />;
}

export function BillingDocumentList({
  subscriberId,
  revision = 0,
  onDocumentsChanged,
}: {
  subscriberId?: string;
  revision?: number;
  onDocumentsChanged?: () => void;
}) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(AccessPermissionKey.BILLING_INVOICES_MANAGE);
  const { params, update } = useBillingUrl();
  const pageKey = subscriberId ? 'documentPage' : 'page';
  const sizeKey = subscriberId ? 'documentPageSize' : 'pageSize';
  const page = billingPage(params.get(pageKey));
  const requestedLimit = Number(params.get(sizeKey));
  const limitOptions = subscriberId ? SUBSCRIBER_LIMIT_OPTIONS : LIMIT_OPTIONS;
  const limit = limitOptions.find((value) => value === requestedLimit) ?? (subscriberId ? 5 : 20);
  const status = subscriberId ? '' : (params.get('status') ?? '');
  const paymentState = subscriberId ? '' : (params.get('paymentState') ?? '');
  const cycleDay = subscriberId ? '' : (params.get('cycleDay') ?? '');
  const from = subscriberId ? '' : (params.get('from') ?? '');
  const to = subscriberId ? '' : (params.get('to') ?? '');
  const filterSubscriberId = subscriberId ?? params.get('subscriberId') ?? '';
  // Vista «Por cliente» (solo en el módulo): agrupa con los mismos filtros, en la URL.
  const byClient = !subscriberId && params.get('vista') === 'clientes';
  const filtered = !!(
    status ||
    paymentState ||
    cycleDay ||
    from ||
    to ||
    (!subscriberId && filterSubscriberId)
  );
  const filterKey = JSON.stringify([
    status,
    paymentState,
    cycleDay,
    from,
    to,
    filterSubscriberId,
    revision,
  ]);
  const load = useCallback(() => {
    const query: BillingDocumentsQuery = {
      page,
      limit,
      ...(Object.hasOwn(DOCUMENT_STATES, status)
        ? { status: status as BillingDocumentResponse['status'] }
        : {}),
      ...(Object.hasOwn(PAYMENT_STATES, paymentState)
        ? { paymentState: paymentState as BillingPeriodPaymentState }
        : {}),
      ...(/^(?:[1-9]|1\d|2[0-8])$/u.test(cycleDay) ? { cycleDay: Number(cycleDay) } : {}),
      ...(filterSubscriberId ? { subscriberId: filterSubscriberId } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/u.test(from) ? { from } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/u.test(to) ? { to } : {}),
    };
    return byClient ? Promise.resolve(null) : billingApi.documents(query);
  }, [page, limit, status, paymentState, cycleDay, from, to, filterSubscriberId, byClient]);
  const { data, loading, error, reload } = useBillingLoad(load, revision);
  const [selection, setSelection] = useState<{
    key: string;
    documents: Map<string, BillingDocumentResponse>;
  }>();
  const selected =
    selection?.key === filterKey ? selection.documents : new Map<string, BillingDocumentResponse>();
  const [confirm, setConfirm] = useState(false);
  const [generate, setGenerate] = useState(false);
  const [summary, setSummary] = useState<BillingGenerationSummary>();
  const [subscriberOption, setSubscriberOption] = useState<{ id: string; label: string } | null>(
    null,
  );
  const filters = (key: string, value: string) => update({ [key]: value, [pageKey]: '' });
  const onChanged = () => {
    setSelection(undefined);
    if (onDocumentsChanged) onDocumentsChanged();
    else reload();
  };
  const generateAction =
    canManage && !subscriberId ? (
      <Button className="min-h-11" onClick={() => setGenerate(true)}>
        Generar facturas
      </Button>
    ) : undefined;

  const blockedInList = data?.data.filter((document) => document.blockingReason).length ?? 0;

  const groupedQuery = {
    page,
    limit,
    ...(Object.hasOwn(DOCUMENT_STATES, status)
      ? { status: status as BillingDocumentResponse['status'] }
      : {}),
    ...(Object.hasOwn(PAYMENT_STATES, paymentState)
      ? { paymentState: paymentState as BillingPeriodPaymentState }
      : {}),
    ...(/^(?:[1-9]|1\d|2[0-8])$/u.test(cycleDay) ? { cycleDay: Number(cycleDay) } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/u.test(from) ? { from } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/u.test(to) ? { to } : {}),
  };
  const groupedFiltered = Boolean(status || paymentState || cycleDay || from || to);

  const viewToggle = !subscriberId ? (
    <div role="group" aria-label="Ver facturas" className={portalFilterChipGroupClassName}>
      <PortalFilterChip active={!byClient} onClick={() => update({ vista: '', [pageKey]: '' })}>
        Por factura
      </PortalFilterChip>
      <PortalFilterChip
        active={byClient}
        onClick={() => update({ vista: 'clientes', subscriberId: '', [pageKey]: '' })}
      >
        Por cliente
      </PortalFilterChip>
    </div>
  ) : null;

  const groupedView = byClient ? (
    <BillingDocumentsBySubscriber
      query={groupedQuery}
      limitOptions={LIMIT_OPTIONS}
      filtered={groupedFiltered}
      onPage={(next) => update({ [pageKey]: String(next) }, false)}
      onPageSize={(size) => update({ [sizeKey]: String(size), [pageKey]: '' })}
      onShowDocuments={(summary) => {
        setSubscriberOption(
          summary.buyerProtected
            ? null
            : { id: summary.subscriberId, label: summary.displayName ?? 'Cliente seleccionado' },
        );
        update({ vista: '', subscriberId: summary.subscriberId, [pageKey]: '' });
      }}
      onClearFilters={() => update({ ...EMPTY_QUERY, vista: 'clientes' })}
    />
  ) : null;

  const table = (
    <>
      {viewToggle}
      {!subscriberId ? (
        <DocumentFilters
          hideSubscriber={byClient}
          status={status}
          paymentState={paymentState}
          cycleDay={cycleDay}
          from={from}
          to={to}
          subscriber={
            filterSubscriberId
              ? subscriberOption?.id === filterSubscriberId
                ? subscriberOption
                : { id: filterSubscriberId, label: 'Cliente seleccionado' }
              : null
          }
          onSubscriber={(option) => {
            setSubscriberOption(option);
            filters('subscriberId', option?.id ?? '');
          }}
          onFilter={filters}
          {...(filtered && data?.data.length ? { onClear: () => update(EMPTY_QUERY) } : {})}
        />
      ) : null}
      {summary ? (
        <PortalAlert
          variant={summary.failed || summary.blocked ? 'warning' : 'success'}
          title={`Facturas generadas: ${summary.generated}`}
          description={`Ya existían: ${summary.existing}. Con datos incompletos: ${summary.blocked}. Con errores: ${summary.failed}. Aún no tocaba generarlas: ${summary.notDue}. Sin ciclo de facturación: ${summary.withoutCycle}. Omitidas por suplantación: ${summary.omittedImpersonation}. Omitidas por terminación del contrato: ${summary.omittedTermination}.`}
        />
      ) : null}
      {groupedView}
      {byClient ? null : <BillingLoadState loading={loading} error={error} onRetry={reload} />}
      {!byClient && data?.data.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selected.size ? (
              <Button className="min-h-11" onClick={() => setConfirm(true)}>
                Emitir {countLabel(selected.size, 'factura seleccionada', 'facturas seleccionadas')}
              </Button>
            ) : (
              <span />
            )}
            <PortalPageSizeSelect
              value={limit}
              options={limitOptions}
              onChange={(value) => update({ [sizeKey]: String(value), [pageKey]: '' })}
            />
          </div>
          <BillingDocumentTable
            documents={data.data}
            onChanged={onChanged}
            {...(subscriberId ? { subscriberId } : {})}
            {...(canManage
              ? {
                  selection: new Set(selected.keys()),
                  onSelectionChange: (id, checked) => {
                    const next = new Map(selected);
                    const document = data.data.find((row) => row.id === id);
                    if (checked && document && next.size < 100) next.set(id, document);
                    else next.delete(id);
                    setSelection({ key: filterKey, documents: next });
                  },
                }
              : {})}
          />
          <BillingPager
            meta={data.meta}
            resource={RESOURCE}
            onPage={(next) => update({ [pageKey]: String(next) }, false)}
          />
        </>
      ) : !byClient && data ? (
        <PortalEmptyState
          title={filtered ? 'No encontramos facturas con estos filtros' : 'Aún no hay facturas'}
          description={
            filtered
              ? 'Ajusta los filtros para ampliar la búsqueda.'
              : 'Las facturas aparecerán aquí cuando generes la primera o se ejecute el proceso diario.'
          }
          action={
            filtered ? (
              <Button className="min-h-11" variant="secondary" onClick={() => update(EMPTY_QUERY)}>
                Limpiar filtros
              </Button>
            ) : (
              generateAction
            )
          }
        />
      ) : null}
      {confirm && selected.size ? (
        <BillingConfirmation
          title={`Emitir ${countLabel(selected.size, 'factura', 'facturas')}`}
          description={`${selected.size === 1 ? 'Se emitirá 1 borrador válido' : `Se emitirán ${selected.size} borradores válidos`}${blockedInList > 0 ? `. ${blockedInList === 1 ? '1 borrador tiene datos incompletos y debe corregirse' : `${blockedInList} borradores tienen datos incompletos y deben corregirse`}` : ''}. Total: ${formatBillingMoney(fromMoneyCents([...selected.values()].reduce((sum, document) => sum + moneyCents(document.total), 0)))}. Las facturas recibirán un número consecutivo definitivo que no se puede cambiar.`}
          confirm="Confirmar emisión"
          onClose={() => setConfirm(false)}
          onConfirm={async (key) => {
            await billingApi.issue({ documentIds: [...selected.keys()] }, key);
            onChanged();
          }}
        />
      ) : null}
      {generate ? (
        <GenerateDocumentsDialog
          onClose={() => setGenerate(false)}
          onGenerated={(next) => {
            setSummary(next);
            onChanged();
            setGenerate(false);
          }}
        />
      ) : null}
    </>
  );

  if (subscriberId) {
    return (
      <PortalPanel title="Facturas" contentClassName="space-y-4" busy={loading}>
        {table}
      </PortalPanel>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturas"
        subtitle="Consulta, emite y gestiona las facturas de la empresa."
        actions={generateAction}
      />
      {/* Sin título propio: el encabezado de la página ya dice «Facturas» y el pie da el total. */}
      <PortalPanel contentClassName="space-y-4" busy={loading}>
        {table}
      </PortalPanel>
    </div>
  );
}

function DocumentFilters({
  status,
  paymentState,
  cycleDay,
  from,
  to,
  subscriber,
  onSubscriber,
  onFilter,
  hideSubscriber = false,
  onClear,
}: {
  status: string;
  paymentState: string;
  cycleDay: string;
  from: string;
  to: string;
  subscriber: { id: string; label: string } | null;
  onSubscriber: (value: { id: string; label: string } | null) => void;
  onFilter: (key: string, value: string) => void;
  /** En la vista «Por cliente» no se filtra por un cliente: se oculta su buscador. */
  hideSubscriber?: boolean;
  /** Solo con filtros activos: sin ellos «Limpiar filtros» no hace nada. */
  onClear?: (() => void) | undefined;
}) {
  const cycles = useBillingLoad(billingCyclesApi.list);
  const id = useId();
  const days = [
    ...new Set([
      ...(cycles.data?.map(({ cycleDay: day }) => String(day)) ?? []),
      ...(cycleDay ? [cycleDay] : []),
    ]),
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hideSubscriber ? null : (
          <BillingSubscriberPicker selected={subscriber} onChange={onSubscriber} />
        )}
        <FilterSelect
          id={`${id}-status`}
          label="Estado de la factura"
          value={status}
          onChange={(value) => onFilter('status', value)}
          options={Object.entries(DOCUMENT_STATES).map(([key, item]) => [key, item.label])}
        />
        <FilterSelect
          id={`${id}-payment`}
          label="Estado de pago"
          value={paymentState}
          onChange={(value) => onFilter('paymentState', value)}
          options={Object.entries(PAYMENT_STATES)
            .filter(([key]) => key !== 'SIN_DOCUMENTO')
            .map(([key, item]) => [key, item.label])}
        />
        <FilterSelect
          id={`${id}-cycle`}
          label="Ciclo de facturación"
          value={cycleDay}
          onChange={(value) => onFilter('cycleDay', value)}
          options={days.map((day) => [day, `Día ${day}`])}
        />
        <label className="block space-y-1 text-sm">
          Desde
          <input
            type="date"
            className={billingInputClass}
            value={from}
            onChange={(event) => onFilter('from', event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Hasta
          <input
            type="date"
            className={billingInputClass}
            value={to}
            onChange={(event) => onFilter('to', event.target.value)}
          />
        </label>
      </div>
      {cycles.error ? (
        <BillingLoadState loading={false} error={cycles.error} onRetry={cycles.reload} />
      ) : null}
      {onClear ? (
        <Button className="min-h-11" type="button" variant="ghost" onClick={onClear}>
          Limpiar filtros
        </Button>
      ) : null}
    </div>
  );
}

export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label htmlFor={id} className="block space-y-1 text-sm">
      <span>{label}</span>
      <select
        id={id}
        className={billingInputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Todos</option>
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function GenerateDocumentsDialog({
  onClose,
  onGenerated,
}: {
  onClose: () => void;
  onGenerated: (summary: BillingGenerationSummary) => void;
}) {
  const [date, setDate] = useState('');
  const [contractId, setContractId] = useState('');
  const [subscriber, setSubscriber] = useState<{ id: string; label: string } | null>(null);
  const [contractPage, setContractPage] = useState(1);
  const loadContracts = useCallback(
    () =>
      subscriber
        ? contractsApi.listBySubscriber(subscriber.id, { page: contractPage, limit: 20 })
        : Promise.resolve(null),
    [subscriber, contractPage],
  );
  const contracts = useBillingLoad(loadContracts);
  const mutation = useBillingMutation();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (subscriber && !contractId) return;
    const parsed = GenerateDocumentsCommandSchema.safeParse({
      ...(date ? { date } : {}),
      ...(contractId ? { contractId } : {}),
    });
    if (!parsed.success) {
      mutation.setError('Verifica la fecha y el contrato seleccionados.');
      return;
    }
    void mutation.run(parsed.data, (key) => billingApi.generate(parsed.data, key), onGenerated);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar facturas</DialogTitle>
          <DialogDescription>
            Selecciona una fecha o deja el campo vacío para usar la fecha de la empresa.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block space-y-1 text-sm">
            Fecha de generación
            <input
              type="date"
              className={billingInputClass}
              value={date}
              disabled={mutation.busy}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <BillingSubscriberPicker
            label="Buscar cliente para elegir un contrato (opcional)"
            selected={subscriber}
            onChange={(option) => {
              setSubscriber(option);
              setContractId('');
              setContractPage(1);
            }}
            disabled={mutation.busy}
          />
          {subscriber ? (
            <>
              <BillingLoadState
                loading={contracts.loading}
                error={contracts.error}
                onRetry={contracts.reload}
              />
              {contracts.data ? (
                <>
                  <label className="block space-y-1 text-sm">
                    Contrato
                    <select
                      className={billingInputClass}
                      required
                      value={contractId}
                      disabled={mutation.busy}
                      onChange={(event) => setContractId(event.target.value)}
                    >
                      <option value="">Selecciona un contrato</option>
                      {contracts.data.data.map((contract) => (
                        <option key={contract.id} value={contract.id}>
                          {contract.alias}
                        </option>
                      ))}
                    </select>
                  </label>
                  <BillingPager
                    meta={contracts.data.meta}
                    resource={{ singular: 'contrato', plural: 'contratos' }}
                    onPage={(page) => {
                      setContractId('');
                      setContractPage(page);
                    }}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {mutation.error ? <PortalAlert variant="error" title={mutation.error} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              className="min-h-11"
              type="button"
              variant="secondary"
              disabled={mutation.busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              className="min-h-11"
              type="submit"
              loading={mutation.busy}
              disabled={mutation.busy || (!!subscriber && !contractId)}
            >
              Generar facturas
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
