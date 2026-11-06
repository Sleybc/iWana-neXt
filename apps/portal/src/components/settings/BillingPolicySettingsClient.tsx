'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  BillingPolicyPreviewRequestSchema,
  BillingPolicyUpdateSchema,
  type BillingPolicy,
  type BillingPolicyPreview,
  type BillingPolicyPreviewRequest,
} from '@iwana/shared';
import { Button } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalCheckboxClassName,
  portalFieldClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { ApiError, billingApi } from '@/lib/api-client';
import { AccessPermissionKey } from '@iwana/shared';

const PAGE_SUBTITLE =
  'Define las reglas de emisión de cobro, plazos de vencimiento y cálculo de cortes para la cartera de tus suscriptores';
const INCOMPATIBLE_CUTOFF_COPY =
  'El corte en día fijo solo es compatible con cobro anticipado, porque en cobro vencido el corte ocurriría antes de emitir el cobro. Utilice corte por plazo de pago más gracia.';
const CONFLICT_COPY =
  'La política fue modificada recientemente por otro usuario. Se recargaron los valores más recientes para evitar sobrescrituras';

type BillingPolicyDraft = {
  periodTiming: BillingPolicy['periodTiming'];
  generationLeadDays: number | '';
  prorationMethod: BillingPolicy['prorationMethod'];
  firstPeriodMode: BillingPolicy['firstPeriodMode'];
  cutoffMode: BillingPolicy['cutoffMode'];
  paymentTermDays: number | '';
  graceDays: number | '';
  cutoffEnabled: boolean;
  minimumUnpaidForCutoff: string;
  automaticGeneration: boolean;
  approvalMode: BillingPolicy['approvalMode'];
  generationHour: number | '';
  autoApplyCredit: boolean;
  documentPrefix: string;
};

type NumericDraftField = 'generationLeadDays' | 'paymentTermDays' | 'graceDays' | 'generationHour';

function toDraft(policy: BillingPolicy): BillingPolicyDraft {
  return {
    periodTiming: policy.periodTiming,
    generationLeadDays: policy.generationLeadDays,
    prorationMethod: policy.prorationMethod,
    firstPeriodMode: policy.firstPeriodMode,
    cutoffMode: policy.cutoffMode,
    paymentTermDays: policy.paymentTermDays,
    graceDays: policy.graceDays,
    cutoffEnabled: policy.cutoffEnabled,
    minimumUnpaidForCutoff: String(policy.minimumUnpaidForCutoff),
    automaticGeneration: policy.automaticGeneration,
    approvalMode: policy.approvalMode,
    generationHour: policy.generationHour,
    autoApplyCredit: policy.autoApplyCredit,
    documentPrefix: policy.documentPrefix,
  };
}

function expectedVersion(policy: BillingPolicy): string | null {
  if (typeof policy.updatedAt === 'string') return policy.updatedAt;
  if (policy.updatedAt instanceof Date) return policy.updatedAt.toISOString();
  return null;
}

function isIncompatible(draft: BillingPolicyDraft): boolean {
  return draft.periodTiming === 'VENCIDO' && draft.cutoffMode === 'DIA_FIJO_CICLO';
}

function isPolicyConflict(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 409 || error.code === 'BILLING_POLICY_CHANGED')
  );
}

function Field({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-100"
      >
        {label}
      </label>
      {children}
      {description ? (
        <p
          id={`${id}-description`}
          className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400"
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{children}</h3>;
}

function CheckboxField({
  id,
  checked,
  disabled,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className={portalWellClassName}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className={portalCheckboxClassName}
        />
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {label}
          </label>
          {description ? (
            <p
              id={`${id}-description`}
              className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400"
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  minimum,
  maximum,
  disabled,
  onChange,
  unit,
  description,
}: {
  id: string;
  label: string;
  value: number | '';
  minimum: number;
  maximum: number;
  disabled: boolean;
  onChange: (value: number | '') => void;
  unit?: string;
  description?: ReactNode;
}) {
  return (
    <Field id={id} label={label} description={description}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={minimum}
          max={maximum}
          step={1}
          value={value}
          disabled={disabled}
          aria-describedby={description ? `${id}-description` : undefined}
          onChange={(event) =>
            onChange(event.target.value === '' ? '' : Number(event.target.value))
          }
          className={portalFieldClassName}
        />
        {unit ? (
          <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{unit}</span>
        ) : null}
      </div>
    </Field>
  );
}

function SelectField({
  id,
  label,
  value,
  disabled,
  onChange,
  children,
  description,
}: {
  id: string;
  label: string;
  value: string | number;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Field id={id} label={label} description={description}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={portalFieldClassName}
      >
        {children}
      </select>
    </Field>
  );
}

export function BillingPolicySettingsClient() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission(AccessPermissionKey.BILLING_POLICY_MANAGE);
  const [draft, setDraft] = useState<BillingPolicyDraft | null>(null);
  const [baseline, setBaseline] = useState<BillingPolicyDraft | null>(null);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [emptyPolicy, setEmptyPolicy] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<BillingPolicyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);

  const applyPolicy = useCallback((policy: BillingPolicy) => {
    const nextDraft = toDraft(policy);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setExpectedUpdatedAt(expectedVersion(policy));
    setEmptyPolicy(false);
    setLoadError(false);
  }, []);

  const loadPolicy = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const policy = await billingApi.getPolicy();
      if (!policy) {
        setEmptyPolicy(true);
        setDraft(null);
        setBaseline(null);
        setExpectedUpdatedAt(null);
        return;
      }
      applyPolicy(policy);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [applyPolicy]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const incompatible = draft ? isIncompatible(draft) : false;
  const previewPeriodTiming = draft?.periodTiming;
  const previewGenerationLeadDays = draft?.generationLeadDays;
  const previewCutoffMode = draft?.cutoffMode;
  const previewPaymentTermDays = draft?.paymentTermDays;
  const previewGraceDays = draft?.graceDays;
  const previewCutoffEnabled = draft?.cutoffEnabled;
  const previewInput = useMemo<BillingPolicyPreviewRequest | null>(() => {
    if (
      previewPeriodTiming === undefined ||
      incompatible ||
      previewGenerationLeadDays === undefined ||
      previewGenerationLeadDays === '' ||
      previewCutoffMode === undefined ||
      previewPaymentTermDays === undefined ||
      previewPaymentTermDays === '' ||
      previewGraceDays === undefined ||
      previewGraceDays === '' ||
      previewCutoffEnabled === undefined
    ) {
      return null;
    }
    const result = BillingPolicyPreviewRequestSchema.safeParse({
      policy: {
        periodTiming: previewPeriodTiming,
        generationLeadDays: previewGenerationLeadDays,
        cutoffMode: previewCutoffMode,
        paymentTermDays: previewPaymentTermDays,
        graceDays: previewGraceDays,
        cutoffEnabled: previewCutoffEnabled,
      },
    });
    return result.success ? result.data : null;
  }, [
    previewPeriodTiming,
    previewGenerationLeadDays,
    previewCutoffMode,
    previewPaymentTermDays,
    previewGraceDays,
    previewCutoffEnabled,
    incompatible,
  ]);

  useEffect(() => {
    if (!previewInput) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewError(false);
      return;
    }

    let isCurrent = true;
    setPreview(null);
    setPreviewLoading(true);
    setPreviewError(false);
    const timeoutId = window.setTimeout(() => {
      void billingApi
        .preview(previewInput)
        .then((result) => {
          if (isCurrent) setPreview(result);
        })
        .catch(() => {
          if (isCurrent) setPreviewError(true);
        })
        .finally(() => {
          if (isCurrent) setPreviewLoading(false);
        });
    }, 250);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeoutId);
    };
  }, [previewInput, previewRetry]);

  function updateDraft<K extends keyof BillingPolicyDraft>(key: K, value: BillingPolicyDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setSaveError(false);
    setSaveSuccess(false);
    setConflictMessage(null);
  }

  function updateNumber(key: NumericDraftField, value: number | '') {
    updateDraft(key, value);
  }

  const changed = Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline));
  const updatePayload = useMemo(() => {
    if (!draft || !expectedUpdatedAt) return null;
    return BillingPolicyUpdateSchema.safeParse({ ...draft, expectedUpdatedAt });
  }, [draft, expectedUpdatedAt]);
  const canSave =
    canEdit &&
    Boolean(changed && expectedUpdatedAt && updatePayload?.success && !incompatible && !isSaving);

  async function reloadAfterConflict() {
    try {
      const latest = await billingApi.getPolicy();
      if (!latest) {
        setConflictMessage(
          'La política cambió, pero no se pudo cargar una versión vigente. Intenta recargar la página.',
        );
        return;
      }
      applyPolicy(latest);
      setConflictMessage(CONFLICT_COPY);
      setSaveError(false);
      setSaveSuccess(false);
    } catch {
      setConflictMessage(
        'La política cambió y no pudimos recargar sus valores. Intenta nuevamente.',
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !expectedUpdatedAt || !canEdit || incompatible) return;
    const parsed = BillingPolicyUpdateSchema.safeParse({ ...draft, expectedUpdatedAt });
    if (!parsed.success) {
      setSaveError(true);
      return;
    }

    setIsSaving(true);
    setSaveError(false);
    setSaveSuccess(false);
    setConflictMessage(null);
    try {
      const updated = await billingApi.updatePolicy(parsed.data);
      applyPolicy(updated);
      setSaveSuccess(true);
    } catch (error) {
      if (isPolicyConflict(error)) {
        await reloadAfterConflict();
      } else {
        setSaveError(true);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function controlDisabled(additional = false): boolean {
    return !canEdit || isSaving || additional;
  }

  const saveButton = (
    <Button
      type="submit"
      form="billing-policy-form"
      variant="primary"
      size="lg"
      disabled={!canSave}
    >
      {isSaving ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Facturación" subtitle={PAGE_SUBTITLE} actions={saveButton} />

      {isLoading ? (
        <div
          className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.85fr)]"
          aria-busy="true"
        >
          <div className="space-y-4">
            <PortalSkeletonBlock className="h-64" />
            <PortalSkeletonBlock className="h-72" />
          </div>
          <PortalSkeletonBlock className="h-96" />
        </div>
      ) : loadError ? (
        <PortalAlert
          variant="error"
          title="No pudimos cargar la política de facturación"
          description="Intenta nuevamente en unos segundos."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadPolicy()}>
              Reintentar
            </Button>
          }
        />
      ) : emptyPolicy || !draft ? (
        <PortalPanel title="Política de facturación" labelled>
          <PortalEmptyState
            embedded
            title="No hay una política disponible"
            description="La empresa todavía no tiene una política de facturación para consultar."
          />
        </PortalPanel>
      ) : (
        <>
          {conflictMessage ? <PortalAlert variant="warning" title={conflictMessage} /> : null}
          {saveError ? (
            <PortalAlert
              variant="error"
              title="No pudimos guardar los cambios"
              description="Revisa la conexión e intenta nuevamente."
            />
          ) : null}
          {saveSuccess ? (
            <PortalAlert
              variant="success"
              title="Cambios guardados"
              description="La política de facturación se actualizó."
            />
          ) : null}
          {canEdit ? null : (
            <PortalAlert
              variant="info"
              title="Acceso de solo lectura"
              description="Puedes consultar la política, pero no tienes permiso para modificarla."
            />
          )}
          {!expectedUpdatedAt ? (
            <PortalAlert
              variant="warning"
              title="No se puede guardar la política"
              description="La respuesta no incluyó una versión vigente para proteger cambios simultáneos."
            />
          ) : null}
          {!incompatible && updatePayload && !updatePayload.success && changed ? (
            <PortalAlert
              variant="warning"
              title="Hay campos por corregir"
              description="Revisa los valores permitidos antes de guardar los cambios."
            />
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.85fr)]">
            <form id="billing-policy-form" onSubmit={handleSubmit} noValidate className="space-y-4">
              <fieldset
                disabled={!canEdit || isSaving}
                className="m-0 min-w-0 space-y-4 border-0 p-0"
              >
                <PortalPanel title="Periodo y momento de cobro" labelled>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField
                      id="billing-period-timing"
                      label="Momento del cobro"
                      value={draft.periodTiming}
                      disabled={controlDisabled()}
                      onChange={(value) =>
                        updateDraft('periodTiming', value as BillingPolicyDraft['periodTiming'])
                      }
                    >
                      <option value="ANTICIPADO">Cobro anticipado</option>
                      <option value="VENCIDO">Cobro al final del periodo</option>
                    </SelectField>
                    <NumberField
                      id="billing-generation-lead-days"
                      label="Días de anticipación para generar"
                      value={draft.generationLeadDays}
                      minimum={0}
                      maximum={15}
                      unit="días"
                      description="De 0 a 15 días."
                      disabled={controlDisabled()}
                      onChange={(value) => updateNumber('generationLeadDays', value)}
                    />
                    <SelectField
                      id="billing-proration-method"
                      label="Prorrateo de fracción de mes"
                      value={draft.prorationMethod}
                      disabled={controlDisabled()}
                      onChange={(value) =>
                        updateDraft(
                          'prorationMethod',
                          value as BillingPolicyDraft['prorationMethod'],
                        )
                      }
                    >
                      <option value="DIAS_REALES">Días calendario reales</option>
                      <option value="MES_30">Mes comercial de 30 días</option>
                    </SelectField>
                    <SelectField
                      id="billing-first-period-mode"
                      label="Primer periodo incompleto"
                      value={draft.firstPeriodMode}
                      disabled={controlDisabled()}
                      onChange={(value) =>
                        updateDraft(
                          'firstPeriodMode',
                          value as BillingPolicyDraft['firstPeriodMode'],
                        )
                      }
                    >
                      <option value="SEPARADO">Documento inicial separado</option>
                      <option value="JUNTO_AL_SIGUIENTE">Unir al siguiente periodo</option>
                    </SelectField>
                  </div>
                </PortalPanel>

                <PortalPanel title="Vencimiento y corte" labelled>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField
                      id="billing-cutoff-mode"
                      label="Modo de fecha de corte"
                      value={draft.cutoffMode}
                      disabled={controlDisabled()}
                      description={incompatible ? INCOMPATIBLE_CUTOFF_COPY : undefined}
                      onChange={(value) =>
                        updateDraft('cutoffMode', value as BillingPolicyDraft['cutoffMode'])
                      }
                    >
                      <option value="DIA_FIJO_CICLO" disabled={draft.periodTiming === 'VENCIDO'}>
                        Corte en día fijo del ciclo
                      </option>
                      <option value="VENCIMIENTO_MAS_GRACIA">
                        Corte por plazo de pago más gracia
                      </option>
                    </SelectField>
                    <NumberField
                      id="billing-payment-term-days"
                      label="Plazo para pagar"
                      value={draft.paymentTermDays}
                      minimum={0}
                      maximum={60}
                      unit="días"
                      disabled={controlDisabled(draft.cutoffMode === 'DIA_FIJO_CICLO')}
                      description={
                        draft.cutoffMode === 'DIA_FIJO_CICLO'
                          ? 'De 0 a 60 días. En el modo de día fijo, el corte se toma del día definido para cada ciclo.'
                          : 'De 0 a 60 días.'
                      }
                      onChange={(value) => updateNumber('paymentTermDays', value)}
                    />
                    <NumberField
                      id="billing-grace-days"
                      label="Días de gracia tras vencimiento"
                      value={draft.graceDays}
                      minimum={0}
                      maximum={30}
                      unit="días"
                      description="De 0 a 30 días."
                      disabled={controlDisabled()}
                      onChange={(value) => updateNumber('graceDays', value)}
                    />
                    <Field id="billing-minimum-unpaid" label="Monto mínimo impago para corte">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="text-sm text-gray-500 dark:text-gray-400"
                        >
                          $
                        </span>
                        <input
                          id="billing-minimum-unpaid"
                          type="number"
                          min="0"
                          max="999999999999.99"
                          step="0.01"
                          inputMode="decimal"
                          value={draft.minimumUnpaidForCutoff}
                          disabled={controlDisabled()}
                          onChange={(event) =>
                            updateDraft('minimumUnpaidForCutoff', event.target.value)
                          }
                          className={portalFieldClassName}
                        />
                        <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
                          COP
                        </span>
                      </div>
                    </Field>
                    <div className="md:col-span-2">
                      <CheckboxField
                        id="billing-cutoff-enabled"
                        checked={draft.cutoffEnabled}
                        disabled={controlDisabled()}
                        onChange={(checked) => updateDraft('cutoffEnabled', checked)}
                        label="Habilitar corte programado"
                        description="Incluye contratos con deuda en la agenda de corte."
                      />
                    </div>
                  </div>
                </PortalPanel>

                <PortalPanel title="Automatización y emisión" labelled>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <CheckboxField
                        id="billing-automatic-generation"
                        checked={draft.automaticGeneration}
                        disabled={controlDisabled()}
                        onChange={(checked) => updateDraft('automaticGeneration', checked)}
                        label="Generación automática diaria"
                        description="Cuando está activa, el proceso diario prepara los documentos según esta política."
                      />
                    </div>
                    <SelectField
                      id="billing-approval-mode"
                      label="Aprobación de documentos generados"
                      value={draft.approvalMode}
                      disabled={controlDisabled()}
                      onChange={(value) =>
                        updateDraft('approvalMode', value as BillingPolicyDraft['approvalMode'])
                      }
                    >
                      <option value="BORRADOR">En borrador (revisión manual obligatoria)</option>
                      <option value="AUTOMATICA">Aprobación automática (emisión directa)</option>
                    </SelectField>
                    <SelectField
                      id="billing-generation-hour"
                      label="Hora de ejecución del proceso diario"
                      value={draft.generationHour}
                      disabled={controlDisabled()}
                      description="Hora local de Colombia."
                      onChange={(value) =>
                        updateNumber('generationHour', value === '' ? '' : Number(value))
                      }
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {String(hour).padStart(2, '0')}:00
                        </option>
                      ))}
                    </SelectField>
                    <div className="md:col-span-2">
                      <CheckboxField
                        id="billing-auto-apply-credit"
                        checked={draft.autoApplyCredit}
                        disabled={controlDisabled()}
                        onChange={(checked) => updateDraft('autoApplyCredit', checked)}
                        label="Aplicación automática de saldo a favor"
                        description="Aplica el saldo remanente del suscriptor a nuevos documentos al emitirlos."
                      />
                    </div>
                    <Field
                      id="billing-document-prefix"
                      label="Prefijo de documentos de cobro"
                      description="De 1 a 10 caracteres."
                    >
                      <input
                        id="billing-document-prefix"
                        type="text"
                        minLength={1}
                        maxLength={10}
                        aria-describedby="billing-document-prefix-description"
                        value={draft.documentPrefix}
                        disabled={controlDisabled()}
                        onChange={(event) => updateDraft('documentPrefix', event.target.value)}
                        className={portalFieldClassName}
                      />
                    </Field>
                  </div>
                </PortalPanel>
              </fieldset>
            </form>

            <aside className="min-w-0 xl:sticky xl:top-4">
              <PortalPanel
                title="Vista previa de fechas"
                labelled
                description="Fechas calculadas según la zona horaria configurada para esta empresa."
              >
                {incompatible ? (
                  <PortalEmptyState
                    embedded
                    title="Ajusta el modo de corte"
                    description="La vista previa estará disponible cuando selecciones un modo de corte compatible."
                  />
                ) : previewLoading ? (
                  <div className="space-y-3" aria-busy="true" aria-label="Calculando vista previa">
                    <p role="status" aria-live="polite" className="sr-only">
                      Calculando vista previa
                    </p>
                    <PortalSkeletonBlock className="h-28" />
                    <PortalSkeletonBlock className="h-28" />
                  </div>
                ) : previewError ? (
                  <PortalAlert
                    variant="error"
                    title="No pudimos calcular la vista previa"
                    description="Intenta nuevamente."
                    action={
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setPreviewRetry((value) => value + 1)}
                      >
                        Reintentar
                      </Button>
                    }
                  />
                ) : preview?.cycles.length ? (
                  <div className="space-y-3">
                    <p role="status" aria-live="polite" className="sr-only">
                      Vista previa actualizada para {preview.cycles.length}{' '}
                      {preview.cycles.length === 1 ? 'ciclo' : 'ciclos'}.
                    </p>
                    {preview.cycles.map((cycle) => (
                      <section
                        key={`${cycle.cycleDay}-${cycle.cutoffDay}`}
                        className={portalWellClassName}
                        aria-label={`Ciclo día ${cycle.cycleDay}`}
                      >
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          Ciclo día {cycle.cycleDay} · corte día {cycle.cutoffDay}
                        </h3>
                        <ol className="mt-3 space-y-3">
                          {cycle.items.map((item, index) => (
                            <li
                              key={`${item.periodStart}-${item.periodEnd}-${index}`}
                              className="border-t border-gray-200 pt-3 first:border-0 first:pt-0 dark:border-dark-border"
                            >
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Periodo {index + 1}
                              </p>
                              <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
                                <dt className="text-gray-600 dark:text-gray-300">Cobertura</dt>
                                <dd className="text-right font-medium text-gray-900 dark:text-white">
                                  {item.periodStart} a {item.periodEnd}
                                </dd>
                                <dt className="text-gray-600 dark:text-gray-300">Generación</dt>
                                <dd className="text-right font-medium text-gray-900 dark:text-white">
                                  {item.generationDate}
                                </dd>
                                <dt className="text-gray-600 dark:text-gray-300">Vencimiento</dt>
                                <dd className="text-right font-medium text-gray-900 dark:text-white">
                                  {item.dueDate}
                                </dd>
                                <dt className="text-gray-600 dark:text-gray-300">
                                  Corte programado
                                </dt>
                                <dd className="text-right font-medium text-gray-900 dark:text-white">
                                  {item.cutoffDate ?? 'No programado'}
                                </dd>
                              </dl>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ))}
                  </div>
                ) : preview ? (
                  <PortalEmptyState
                    embedded
                    title="No hay ciclos activos para previsualizar"
                    description="Cuando la empresa tenga ciclos de facturación activos, sus próximas fechas aparecerán aquí."
                  />
                ) : (
                  <PortalEmptyState
                    embedded
                    title="Vista previa no disponible"
                    description="La vista previa se calculará con los valores actuales de la política."
                  />
                )}
              </PortalPanel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
