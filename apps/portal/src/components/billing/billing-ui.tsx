'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { BillingErrorCode, ListMeta } from '@iwana/shared';
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
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';

export const billingInputClass =
  'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-white';

/** Errores de cortesías (spec MOD14 2026-11-12 R4, R5). */
const COURTESY_ERRORS: Record<string, string> = {
  BILLING_COURTESY_EXCEEDS_BALANCE:
    'La cortesía supera el saldo pendiente de la factura. Usa un valor menor o igual al saldo.',
  BILLING_COURTESY_MIXED_VAT:
    'Esta factura tiene conceptos con IVA distinto. Otorga la cortesía con «Regalar una línea».',
  BILLING_COURTESY_LINE_NOT_ELIGIBLE:
    'Esa línea ya no se puede regalar: no tiene valor o ya tiene una cortesía. Actualiza la factura.',
  BILLING_COURTESY_DOCUMENT_NOT_ELIGIBLE: 'Una factura anulada no admite cortesías.',
  BILLING_COURTESY_NOT_FOUND: 'No encontramos esta cortesía. Actualiza la factura.',
  BILLING_COURTESY_ALREADY_VOIDED: 'Esta cortesía ya estaba anulada.',
  BILLING_COURTESY_NOT_VOIDABLE:
    'Esta cortesía ya forma parte de una factura emitida y no se puede anular.',
};

/** Recibos, desasociar y envíos por correo (spec MOD05↔MOD14 2026-11-13 D3–D6, CA-6, CA-7). */
const RECEIPT_AND_EMAIL_ERRORS: Record<string, string> = {
  BILLING_ALLOCATION_NOT_UNLINKABLE:
    'No se puede desasociar: la factura está anulada o es una factura histórica de UISP.',
  BILLING_ALLOCATION_HAS_WITHHOLDING:
    'Este pago tiene una retención sobre la factura. Para corregirlo, anula el pago.',
  BILLING_ALLOCATION_NOT_FOUND:
    'Esta aplicación ya no está vigente. Actualiza el detalle del pago.',
  BILLING_PAYMENT_VOIDED: 'El pago está anulado.',
  BILLING_PAYMENT_NOT_FOUND: 'No se encontró el pago. Actualiza la información de facturación.',
  BILLING_RECEIPT_NOT_AVAILABLE: 'Este pago se importó de otro sistema y no tiene recibo de iWana.',
  BILLING_RECEIPT_UNAVAILABLE: 'El recibo no está disponible en este momento. Intenta más tarde.',
  BILLING_DOCUMENT_NOT_ISSUED: 'Solo se pueden enviar facturas emitidas.',
  BILLING_EMAIL_IMPORTED_NOT_SENDABLE: 'Una factura histórica de UISP no se envía por correo.',
  BILLING_EMAIL_QUEUE_UNAVAILABLE:
    'El envío de correos no está disponible en este momento. Intenta en unos minutos.',
  BILLING_PRIVACY_UNAVAILABLE:
    'No fue posible verificar los datos protegidos del titular. Intenta en unos minutos.',
};

/** Emisión, aplicación de pagos, PDF histórico y reintentos: nunca el código crudo. */
const DOCUMENT_ERRORS: Record<string, string> = {
  BILLING_ISSUER_INCOMPLETE:
    'Faltan la razón social o el NIT de la empresa. Complétalos en la configuración de la empresa antes de emitir.',
  BILLING_DOCUMENT_BLOCKED:
    'Esta factura tiene datos pendientes y no se puede emitir. Completa los datos del cliente e inténtalo de nuevo.',
  BILLING_DOCUMENT_NOT_DRAFT: 'Esta factura ya no está en borrador. Actualiza la lista.',
  BILLING_POLICY_INCOMPATIBLE:
    'El momento del cobro y el modo de corte elegidos no son compatibles. Revisa la política.',
  BILLING_ALLOCATION_EXCEEDS_BALANCE:
    'El valor aplicado supera el saldo pendiente de la factura. Revisa la distribución del pago.',
  BILLING_IMPORTED_PDF_RESTRICTED:
    'El PDF de esta factura histórica no se muestra porque los datos del titular están protegidos.',
  BILLING_IMPORTED_PDF_UNREADABLE:
    'No pudimos abrir el PDF de esta factura histórica. Intenta de nuevo más tarde.',
  IDEMPOTENCY_KEY_REUSED:
    'Esta operación ya se envió con otros datos. Actualiza la página e inténtalo de nuevo.',
};

/** Códigos de retención del contrato compartido (`BILLING_ERROR_CODES`). */
type WithholdingErrorCode = Extract<BillingErrorCode, `BILLING_WITHHOLDING_${string}`>;

const WITHHOLDING_RATE_ERROR =
  'La tarifa de una retención supera la sugerida por Tributación más el margen permitido. Para registrarla necesitas el permiso de cortesías; si no, usa la tarifa sugerida.';
const WITHHOLDING_DUPLICATE_ERROR =
  'Una factura ya tiene una retención vigente de ese tipo. Registra una sola por factura y tipo.';
const WITHHOLDING_BASE_ERROR =
  'La base de una retención supera el subtotal antes de IVA de su factura. Revisa la base de cada retención.';

/**
 * Retenciones del registro de pago (spec MOD14 2026-11-13 R6, R7, H-1; 422). Guarda de
 * exhaustividad: un código `BILLING_WITHHOLDING_*` nuevo en `@iwana/shared` rompe la compilación
 * hasta traducirlo aquí.
 */
const WITHHOLDING_ERRORS: Readonly<Record<WithholdingErrorCode, string>> = {
  BILLING_WITHHOLDING_NOT_ALLOWED:
    'Este cliente no puede practicar retenciones: solo puede hacerlo un agente de retención según su RUT. Quita las retenciones y registra el valor recibido.',
  BILLING_WITHHOLDING_NOT_ATTRIBUTABLE:
    'Cada retención debe corresponder a una factura que este pago salda. Revisa la factura de cada retención o la distribución del pago.',
  BILLING_WITHHOLDING_DUPLICATE: WITHHOLDING_DUPLICATE_ERROR,
  BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL: WITHHOLDING_BASE_ERROR,
  BILLING_WITHHOLDING_RATE_ABOVE_CEILING: WITHHOLDING_RATE_ERROR,
};

function isWithholdingErrorCode(code: string): code is WithholdingErrorCode {
  return Object.hasOwn(WITHHOLDING_ERRORS, code);
}

/**
 * Un código `BILLING_WITHHOLDING_*` que la API devuelva antes de llegar al contrato compartido se
 * traduce por su texto; si no se reconoce, con un mensaje genérico de retenciones.
 */
const WITHHOLDING_ERRORS_BY_TEXT: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:^|_)(?:RATE|CEILING)(?:_|$)/u, WITHHOLDING_RATE_ERROR],
  [/(?:^|_)(?:DUPLICATED?|ALREADY|UNIQUE|EXISTS)(?:_|$)/u, WITHHOLDING_DUPLICATE_ERROR],
  [/(?:^|_)(?:BASE|SUBTOTAL)(?:_|$)/u, WITHHOLDING_BASE_ERROR],
];

function withholdingError(code: string): string | null {
  if (isWithholdingErrorCode(code)) return WITHHOLDING_ERRORS[code];
  if (!code.startsWith('BILLING_WITHHOLDING_')) return null;
  const match = WITHHOLDING_ERRORS_BY_TEXT.find(([pattern]) => pattern.test(code));
  return match
    ? match[1]
    : 'No pudimos registrar las retenciones de este pago. Revisa el tipo, la base, la tarifa y la factura de cada una.';
}

export function billingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PRIVACY_TITULAR_ANONYMIZED')
      return 'Los datos del titular fueron anonimizados: no se pueden emitir facturas ni registrar pagos.';
    if (error.code === 'PRIVACY_AUDIT_UNAVAILABLE')
      return 'No fue posible auditar la consulta de datos protegidos. Por seguridad, la información permanece oculta.';
    if (error.code === 'BILLING_SUBSCRIBER_NOT_FOUND')
      return 'No se encontró el estado de cuenta de este cliente.';
    if (error.code === 'BILLING_POLICY_CHANGED')
      return 'La política fue modificada recientemente. Vuelve a abrirla para consultar los valores vigentes.';
    if (error.code === 'BILLING_IMPORTED_PDF_NOT_AVAILABLE')
      return 'El PDF de esta factura histórica no se trajo en la importación.';
    const receiptOrEmail = RECEIPT_AND_EMAIL_ERRORS[error.code];
    if (receiptOrEmail) return receiptOrEmail;
    const documentError = DOCUMENT_ERRORS[error.code];
    if (documentError) return documentError;
    const courtesy = COURTESY_ERRORS[error.code];
    if (courtesy) return courtesy;
    const withholding = withholdingError(error.code);
    if (withholding) return withholding;
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

/**
 * Tabla de facturación. El contenedor desplaza en horizontal cuando las columnas no caben (panel
 * lateral, móvil): es una región con nombre y enfocable para que se pueda desplazar con teclado
 * (WCAG 2.1.1; axe `scrollable-region-focusable`).
 */
export function BillingTable({
  label,
  columns,
  rows,
}: {
  label: string;
  columns: readonly string[];
  rows: readonly { id: string; cells: ReactNode[] }[];
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`${portalDataTableShellClassName} ${interactiveFocusClassName}`}
    >
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
