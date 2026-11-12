'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ListMeta } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { ApiError } from '@/lib/api-client';
import { ensureIdempotencyKey } from '@/lib/idempotency-key';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalSkeletonBlock,
  PortalTablePager,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';

export const billingInputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-white';

export function billingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PRIVACY_TITULAR_ANONYMIZED')
      return 'No es posible registrar pagos para una cuenta anonimizada.';
    if (error.code === 'PRIVACY_AUDIT_UNAVAILABLE')
      return 'No fue posible auditar la consulta de datos protegidos. Por seguridad, la información permanece oculta.';
    if (error.code === 'BILLING_SUBSCRIBER_NOT_FOUND')
      return 'No se encontró el estado de cuenta de este titular.';
    if (error.code === 'BILLING_POLICY_CHANGED')
      return 'La política fue modificada recientemente. Vuelve a abrirla para consultar los valores vigentes.';
    // Primer cobro (spec 2026-11-11 R3).
    if (error.code === 'CONTRACT_NOT_FOUND')
      return 'No encontramos este contrato. Actualiza la página e inténtalo de nuevo.';
    if (error.code === 'CONTRACT_NOT_ACTIVE')
      return 'El contrato ya no está activo, así que no se puede generar su primer cobro.';
    if (error.code === 'ACTIVATION_DATE_UNKNOWN')
      return 'El contrato no tiene una fecha de activación registrada, así que no podemos calcular desde cuándo cobrar.';
  }
  return 'No pudimos completar la operación de facturación.';
}

export function useBillingLoad<T>(load: () => Promise<T>, sourceRevision = 0) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    load: typeof load;
    revision: number;
    sourceRevision: number;
    data: T | null;
    error: string | null;
  }>();
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void load().then(
      (data) => {
        if (active) setSnapshot({ load, revision, sourceRevision, data, error: null });
      },
      (cause: unknown) => {
        if (active)
          setSnapshot({ load, revision, sourceRevision, data: null, error: billingError(cause) });
      },
    );
    return () => {
      active = false;
    };
  }, [load, revision, sourceRevision]);
  const result =
    snapshot?.load === load &&
    snapshot.revision === revision &&
    snapshot.sourceRevision === sourceRevision
      ? snapshot
      : undefined;
  return { data: result?.data ?? null, error: result?.error ?? null, loading: !result, reload };
}

export function useBillingMutation() {
  const running = useRef(false);
  const attemptBody = useRef<string | null>(null);
  const attemptKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(
    payload: object,
    send: (key: string) => Promise<T>,
    onSuccess: (data: T) => void,
  ) {
    if (running.current) return;
    const body = JSON.stringify(payload);
    if (attemptBody.current !== body) {
      attemptBody.current = body;
      attemptKey.current = null;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await send(ensureIdempotencyKey(attemptKey));
      attemptBody.current = null;
      attemptKey.current = null;
      onSuccess(data);
    } catch (cause) {
      setError(billingError(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { busy, error, run, setError };
}

export function BillingLoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div role="status" aria-label="Cargando información de facturación" className="space-y-3">
        {[0, 1, 2].map((index) => (
          <PortalSkeletonBlock key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  if (error)
    return (
      <PortalAlert
        variant="error"
        title="No pudimos cargar la información de facturación"
        description={error}
        action={
          <Button className="min-h-11" variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    );
  return null;
}

export function BillingTable({
  columns,
  rows,
}: {
  columns: readonly string[];
  rows: readonly { id: string; cells: ReactNode[] }[];
}) {
  return (
    <div className={portalDataTableShellClassName}>
      <table className="w-full min-w-max border-collapse text-left">
        <thead className={portalDataTableHeadRowClassName}>
          <tr>
            {columns.map((column) => (
              <PortalDataTableHead key={column}>{column}</PortalDataTableHead>
            ))}
          </tr>
        </thead>
        <tbody className={portalDataTableBodyClassName}>
          {rows.map(({ id, cells }) => (
            <tr key={id}>
              {cells.map((cell, index) => (
                <td key={columns[index]} className={`${portalDataTableCellClassName} tabular-nums`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BillingPager({
  meta,
  onPage,
  resource,
}: {
  meta: ListMeta;
  onPage: (page: number) => void;
  resource: { singular: string; plural: string };
}) {
  if (!meta.total || !meta.capabilities.randomAccess) return null;
  const page = meta.page ?? 1;
  return (
    <PortalTablePager
      page={page}
      pageCount={meta.totalPages ?? 1}
      onPageChange={onPage}
      from={(page - 1) * meta.limit + 1}
      to={Math.min(page * meta.limit, meta.total)}
      total={meta.total}
      resource={resource}
    />
  );
}

export function useBillingUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  function update(values: Record<string, string>, replace = true) {
    const next = new URLSearchParams(
      typeof window === 'undefined' ? params.toString() : window.location.search,
    );
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }

  return { params, update };
}

export function billingPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
