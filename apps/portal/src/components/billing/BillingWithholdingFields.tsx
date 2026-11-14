'use client';

import { useId, type ReactNode } from 'react';
import {
  BILLING_WITHHOLDING_MAX_LINES,
  type BillingDocumentResponse,
  type BillingWithholdingOptionsResponse,
} from '@iwana/shared';
import { Button } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  documentReference,
  formatBillingMoneyExact,
  formatWithholdingRate,
  WITHHOLDING_ELIGIBILITY,
  WITHHOLDING_TAX_CODES,
} from './billing-copy';
import { billingInputClass } from './billing-ui';
import {
  editableRate,
  rateAboveSuggested,
  suggestedWithholdingAmount,
  type WithholdingDraft,
  type WithholdingErrors,
  type WithholdingField,
} from './billing-withholdings';

const errorTextClass = 'text-xs text-red-700 dark:text-red-300';
const hintTextClass = 'text-xs text-gray-600 dark:text-gray-400';
const warningTextClass = 'text-xs text-amber-700 dark:text-amber-300';

/**
 * Retenciones del registro de pago (spec MOD14 2026-11-13 R6, R7). Solo se monta si el titular
 * es agente de retención (O-23 en su RUT); la lógica de cálculo vive en `billing-withholdings`.
 */
export function BillingWithholdingFields({
  options,
  lines,
  documents,
  errors,
  showErrors,
  canExceedRate = false,
  onAdd,
  onChange,
  onRemove,
}: {
  options: BillingWithholdingOptionsResponse;
  lines: readonly WithholdingDraft[];
  documents: readonly BillingDocumentResponse[];
  errors: Readonly<Record<string, WithholdingErrors>>;
  showErrors: boolean;
  /** Permiso de cortesías: autoriza una tarifa por encima de la sugerida. */
  canExceedRate?: boolean;
  onAdd: () => void;
  onChange: (key: string, next: WithholdingDraft) => void;
  onRemove: (key: string) => void;
}) {
  const headingId = useId();
  const full = lines.length >= BILLING_WITHHOLDING_MAX_LINES;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="space-y-1">
        <h3 id={headingId} className="text-sm font-semibold">
          Retenciones
        </h3>
        <p className={hintTextClass}>
          {options.eligibility ? `${WITHHOLDING_ELIGIBILITY[options.eligibility]} ` : ''}
          Registra lo que el cliente retuvo con su certificado: el valor recibido más las
          retenciones salda las facturas.
        </p>
      </div>
      {options.options.length ? (
        <>
          {lines.map((line, index) => (
            <WithholdingLine
              key={line.key}
              index={index}
              line={line}
              options={options}
              documents={documents}
              errors={showErrors ? (errors[line.key] ?? {}) : {}}
              canExceedRate={canExceedRate}
              onChange={(next) => onChange(line.key, next)}
              onRemove={() => onRemove(line.key)}
            />
          ))}
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={full}
            onClick={onAdd}
          >
            Agregar retención
          </Button>
          {full ? (
            <p className={hintTextClass} role="status">
              Un pago admite hasta {BILLING_WITHHOLDING_MAX_LINES} retenciones.
            </p>
          ) : null}
        </>
      ) : (
        <PortalAlert
          variant="info"
          title="No hay tipos de retención disponibles"
          description="Configura la retención en la fuente o la de ICA en Tributación para registrarlas con el pago."
        />
      )}
    </section>
  );
}

function WithholdingLine({
  index,
  line,
  options,
  documents,
  errors,
  canExceedRate,
  onChange,
  onRemove,
}: {
  index: number;
  line: WithholdingDraft;
  options: BillingWithholdingOptionsResponse;
  documents: readonly BillingDocumentResponse[];
  errors: WithholdingErrors;
  canExceedRate: boolean;
  onChange: (next: WithholdingDraft) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const label = `Retención ${index + 1}`;
  const fieldId = (field: WithholdingField) => `${id}-${field}`;
  const describedBy = (field: WithholdingField, hint?: boolean) =>
    [errors[field] ? `${fieldId(field)}-error` : '', hint ? `${fieldId(field)}-hint` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const invalid = (field: WithholdingField) => (errors[field] ? true : undefined);
  // Base o tarifa nuevas recalculan el valor; el valor se puede ajustar a mano después.
  const recalculate = (patch: Partial<WithholdingDraft>) => {
    const next = { ...line, ...patch };
    onChange({ ...next, amount: suggestedWithholdingAmount(next.base, next.rate) });
  };
  const suggested = suggestedWithholdingAmount(line.base, line.rate);
  const suggestedRate =
    options.options.find((option) => option.taxCode === line.taxCode)?.suggestedRate ?? null;
  // Aviso, no error: la API admite una tolerancia y, por encima, el permiso de cortesías.
  const rateWarning =
    suggestedRate && rateAboveSuggested(line.rate, suggestedRate)
      ? `Supera la tarifa sugerida por Tributación (${formatWithholdingRate(suggestedRate)}). ${
          canExceedRate
            ? 'Tu permiso de cortesías te permite registrarla.'
            : 'Si la diferencia pasa el margen permitido, solo alguien con permiso de cortesías puede registrarla.'
        }`
      : undefined;

  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-dark-border">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-type`} label="Tipo de retención">
          <select
            id={`${id}-type`}
            className={billingInputClass}
            value={line.taxCode}
            onChange={(event) => {
              const option = options.options.find((item) => item.taxCode === event.target.value);
              if (option)
                recalculate({ taxCode: option.taxCode, rate: editableRate(option.suggestedRate) });
            }}
          >
            {options.options.map((option) => (
              <option key={option.taxCode} value={option.taxCode}>
                {WITHHOLDING_TAX_CODES[option.taxCode]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={fieldId('documentId')} label="Factura (opcional)" error={errors.documentId}>
          <select
            id={fieldId('documentId')}
            className={billingInputClass}
            value={line.documentId}
            aria-invalid={invalid('documentId')}
            aria-describedby={describedBy('documentId')}
            onChange={(event) => onChange({ ...line, documentId: event.target.value })}
          >
            <option value="">La primera que salda el pago</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {documentReference(document)}
              </option>
            ))}
          </select>
        </Field>
        <Field id={fieldId('base')} label="Base (COP)" error={errors.base}>
          <input
            id={fieldId('base')}
            className={billingInputClass}
            inputMode="decimal"
            value={line.base}
            aria-invalid={invalid('base')}
            aria-describedby={describedBy('base')}
            onChange={(event) => recalculate({ base: event.target.value })}
          />
        </Field>
        <Field
          id={fieldId('rate')}
          label="Tarifa (%)"
          hint="Sugerida por Tributación; puedes cambiarla."
          warning={rateWarning}
          error={errors.rate}
        >
          <input
            id={fieldId('rate')}
            className={billingInputClass}
            inputMode="decimal"
            value={line.rate}
            aria-invalid={invalid('rate')}
            aria-describedby={
              [describedBy('rate', true), rateWarning ? `${fieldId('rate')}-warning` : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            onChange={(event) => recalculate({ rate: event.target.value })}
          />
        </Field>
        <Field
          id={fieldId('amount')}
          label="Valor retenido (COP)"
          hint={
            suggested
              ? `Base × tarifa ajustado al peso: ${formatBillingMoneyExact(suggested)}.`
              : 'Se calcula con la base y la tarifa.'
          }
          error={errors.amount}
        >
          <input
            id={fieldId('amount')}
            className={billingInputClass}
            inputMode="numeric"
            value={line.amount}
            aria-invalid={invalid('amount')}
            aria-describedby={describedBy('amount', true)}
            onChange={(event) => onChange({ ...line, amount: event.target.value })}
          />
        </Field>
        <Field
          id={fieldId('certificateNumber')}
          label="Número de certificado"
          error={errors.certificateNumber}
        >
          <input
            id={fieldId('certificateNumber')}
            className={billingInputClass}
            maxLength={60}
            aria-required
            value={line.certificateNumber}
            aria-invalid={invalid('certificateNumber')}
            aria-describedby={describedBy('certificateNumber')}
            onChange={(event) => onChange({ ...line, certificateNumber: event.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          aria-label={`Quitar ${label.toLowerCase()}`}
          onClick={onRemove}
        >
          Quitar
        </Button>
      </div>
    </fieldset>
  );
}

/** Campo con etiqueta, ayuda y error fuera del label: el nombre accesible queda limpio. */
function Field({
  id,
  label,
  hint,
  warning,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  warning?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={id} className="block">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className={hintTextClass}>
          {hint}
        </p>
      ) : null}
      {warning ? (
        <p id={`${id}-warning`} className={warningTextClass}>
          {warning}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={errorTextClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
