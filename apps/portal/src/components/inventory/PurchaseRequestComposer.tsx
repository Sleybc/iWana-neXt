'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select } from '@iwana/ui';
import { PurchaseRequestPriority, PurchaseRequestType } from '@iwana/shared';
import { useMinWidth } from '@/lib/useMinWidth';
import type {
  CreatePurchaseRequestDto,
  InventoryCatalogOptionRecord,
  PurchaseRequestLineRecord,
  UpdatePurchaseRequestDto,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalPanel,
  PortalSectionHeader,
  CreateModeSummaryFooter,
  CreateModeMobileCaptureFooter,
  CreateModeMobileStepIndicator,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  getPurchaseRequestPriorityLabel,
  getPurchaseRequestTypeHelperLabel,
  getPurchaseRequestTypeLabel,
} from './inventory-labels';
import { toDateFromLocalDateValue, toLocalDateValue } from './inventory-date';
import { createEmptyPurchaseDraft, purchaseRequestLinesToDraft } from './purchase-request-draft';
import { buildCatalogUnitCostMap, estimatePurchaseDraftTotal } from './purchase-draft-estimate';
import { focusElementById, focusFirstMatchingInput } from './line-focus';
import {
  buildCreatePurchaseRequestPayload,
  mapDraftLinesToUpdatePayload,
} from './purchase-request-submit';
import { usePurchaseLinesEditorSections } from './PurchaseLinesEditor';

interface PurchaseComposerSubmitResult {
  ok: boolean;
  requestId?: string;
}

export interface PurchaseComposerInitialValues {
  title: string;
  requestType: PurchaseRequestType;
  priority: PurchaseRequestPriority;
  requestingArea: string | null;
  justification: string | null;
  neededByDate: string | null;
  lines: PurchaseRequestLineRecord[];
  /** Labels de proveedor para el draft (p. ej. preferidos desde Reposición). */
  supplierLabels?: Record<string, string>;
}

interface PurchaseRequestComposerProps {
  catalogOptions: InventoryCatalogOptionRecord[];
  supplierLabels?: Record<string, string>;
  isCatalogSearching?: boolean;
  isSubmitting: boolean;
  error: string | null;
  layout?: 'panel' | 'embedded';
  presentation?: 'default' | 'create-mode';
  onDirtyChange?: (isDirty: boolean) => void;
  onDraftLineCountChange?: (lineCount: number) => void;
  onCatalogSearch?: (search: string) => void;
  initialValues?: PurchaseComposerInitialValues;
  onUpdate?: (payload: UpdatePurchaseRequestDto) => Promise<{ ok: boolean }>;
  onSubmit: (payload: CreatePurchaseRequestDto) => Promise<PurchaseComposerSubmitResult>;
}

const TYPE_OPTIONS = Object.values(PurchaseRequestType).map((value) => ({
  value,
  label: getPurchaseRequestTypeLabel(value),
}));

const PRIORITY_OPTIONS = Object.values(PurchaseRequestPriority).map((value) => ({
  value,
  label: getPurchaseRequestPriorityLabel(value),
}));

export function PurchaseRequestComposer({
  catalogOptions,
  supplierLabels = {},
  isCatalogSearching = false,
  isSubmitting,
  error,
  layout = 'panel',
  presentation = 'default',
  onDirtyChange,
  onDraftLineCountChange,
  onCatalogSearch,
  initialValues,
  onUpdate,
  onSubmit,
}: PurchaseRequestComposerProps) {
  const [title, setTitle] = useState(() => initialValues?.title ?? '');
  const [requestType, setRequestType] = useState<PurchaseRequestType>(
    () => initialValues?.requestType ?? PurchaseRequestType.REPLENISHMENT,
  );
  const [priority, setPriority] = useState<PurchaseRequestPriority>(
    () => initialValues?.priority ?? PurchaseRequestPriority.NORMAL,
  );
  const [requestingArea, setRequestingArea] = useState(() => initialValues?.requestingArea ?? '');
  const [justification, setJustification] = useState(() => initialValues?.justification ?? '');
  const [neededByDate, setNeededByDate] = useState(() => initialValues?.neededByDate ?? '');
  const [draft, setDraft] = useState(() =>
    initialValues
      ? purchaseRequestLinesToDraft(initialValues.lines, supplierLabels, catalogOptions)
      : createEmptyPurchaseDraft(),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<'capture' | 'review'>('capture');
  /**
   * Preferencia explícita del disclosure de justificación (Fase 27).
   * `null` = auto: colapsada si está vacía, expandida con contenido.
   */
  const [justificationPreference, setJustificationPreference] = useState<boolean | null>(null);
  const justificationId = 'purchase-justification';
  /** Justificación colapsable (Fase 27): cerrada por defecto si está vacía. */
  const justificationExpanded = justificationPreference ?? justification.trim().length > 0;
  const isDesktopLayout = useMinWidth(768);
  const isCreateMode = presentation === 'create-mode';
  const isMobileCreateFlow = isCreateMode && !isDesktopLayout;
  const isEditMode = Boolean(onUpdate);

  const { captureSection, draftSection } = usePurchaseLinesEditorSections({
    draft,
    onDraftChange: setDraft,
    catalogOptions,
    supplierLabels,
    isCatalogSearching,
    isSubmitting,
    searchInputId: 'purchase-composer-product-search',
    onLineAdded: () => {
      if (isMobileCreateFlow) {
        setMobileStep('review');
      }
    },
    ...(onCatalogSearch ? { onCatalogSearch } : {}),
  });

  const unitCostByItemId = useMemo(() => buildCatalogUnitCostMap(catalogOptions), [catalogOptions]);

  const draftEstimate = useMemo(
    () => estimatePurchaseDraftTotal(draft.lines, unitCostByItemId),
    [draft.lines, unitCostByItemId],
  );

  const summaryLabel = useMemo(() => {
    const estimateSuffix =
      draftEstimate.coveredLines > 0
        ? ` · Total estimado: ${formatInventoryCurrency(draftEstimate.total)}`
        : '';

    return `${getPurchaseRequestTypeLabel(requestType)} · ${getPurchaseRequestPriorityLabel(priority)} · ${draft.lines.length} linea${draft.lines.length === 1 ? '' : 's'}${estimateSuffix}`;
  }, [requestType, priority, draft.lines.length, draftEstimate]);

  const hasUnsavedChanges = useMemo(
    () =>
      Boolean(
        title.trim() ||
        requestingArea.trim() ||
        justification.trim() ||
        neededByDate ||
        draft.lines.length > 0,
      ),
    [title, requestingArea, justification, neededByDate, draft.lines.length],
  );

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    onDraftLineCountChange?.(draft.lines.length);
  }, [draft.lines.length, onDraftLineCountChange]);

  function resetComposer() {
    setTitle('');
    setRequestingArea('');
    setJustification('');
    setJustificationPreference(null);
    setNeededByDate('');
    setDraft(createEmptyPurchaseDraft());
    setValidationError(null);
    setMobileStep('capture');
  }

  /** Fase 27: el alert resume el error y el foco va al campo a corregir. */
  function focusSubmitError(target: 'title' | 'area' | 'justification' | 'lines' | 'lineDetail') {
    switch (target) {
      case 'title':
        focusElementById('purchase-title');
        break;
      case 'area':
        focusElementById('purchase-area');
        break;
      case 'justification':
        setJustificationPreference(true);
        focusElementById(justificationId);
        break;
      case 'lines':
        focusElementById('purchase-composer-product-search');
        break;
      case 'lineDetail':
        focusFirstMatchingInput('purchase-draft-qty-');
        break;
    }
  }

  async function handleSubmit() {
    if (onUpdate) {
      if (draft.lines.length === 0) {
        setValidationError('La solicitud debe tener al menos una línea.');
        focusSubmitError('lines');
        return;
      }
      const updatePayload: UpdatePurchaseRequestDto = {
        priority,
        neededByDate: neededByDate || null,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(requestingArea.trim() ? { requestingArea: requestingArea.trim() } : {}),
        ...(justification.trim() ? { justification: justification.trim() } : {}),
        lines: mapDraftLinesToUpdatePayload(draft.lines),
      };
      setValidationError(null);
      const updateResult = await onUpdate(updatePayload);
      if (updateResult.ok) {
        resetComposer();
      }
      return;
    }

    const result = buildCreatePurchaseRequestPayload({
      title,
      requestType,
      priority,
      requestingArea,
      justification,
      neededByDate,
      lines: draft.lines.map((line) => ({
        sourceKind: line.sourceKind,
        inventoryItemId: line.inventoryItemId,
        productLabel: line.productLabel,
        freeTextDescription: line.productLabel,
        quantityRequested: line.quantityRequested,
        unitOfMeasure: line.unitOfMeasure,
        suggestedPartyRefId: line.suggestedPartyRefId,
        notes: line.notes,
      })),
    });

    if (!result.payload) {
      setValidationError(result.error);
      if (result.error === 'Indica un título para la solicitud.') {
        focusSubmitError('title');
      } else if (result.error === 'Indica el área solicitante.') {
        focusSubmitError('area');
      } else if (result.error === 'La justificación debe tener al menos 10 caracteres.') {
        focusSubmitError('justification');
      } else if (result.error === 'Agrega al menos una línea a la solicitud.') {
        focusSubmitError('lines');
      } else {
        focusSubmitError('lineDetail');
      }
      return;
    }

    setValidationError(null);
    const submitResult = await onSubmit(result.payload);
    if (!submitResult.ok) {
      return;
    }

    resetComposer();
  }

  const requestContextSection = (
    <section className="space-y-3">
      <PortalSectionHeader
        eyebrow="Solicitud"
        title="Datos de la solicitud"
        description="Contexto minimo para capturar la compra sin convertir esta vista en un formulario largo."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_0.5fr_1fr_1fr]">
        <Input
          id="purchase-title"
          label="Título"
          placeholder="Ej. Reposición de routers — Bodega Norte"
          helperText="Nombre corto para identificar la solicitud."
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Select
          id="purchase-type"
          label="Tipo de compra"
          value={requestType}
          helperText={getPurchaseRequestTypeHelperLabel(requestType)}
          onChange={(event) => setRequestType(event.target.value as PurchaseRequestType)}
          options={TYPE_OPTIONS}
          disabled={isEditMode}
        />
        <Select
          id="purchase-priority"
          label="Prioridad"
          value={priority}
          onChange={(event) => setPriority(event.target.value as PurchaseRequestPriority)}
          options={PRIORITY_OPTIONS}
        />
        <Input
          id="purchase-area"
          label="Área solicitante"
          value={requestingArea}
          onChange={(event) => setRequestingArea(event.target.value)}
        />
        <DatePicker
          id="purchase-needed-by"
          label="Fecha requerida"
          placeholder="Seleccionar fecha"
          value={toDateFromLocalDateValue(neededByDate)}
          onChange={(date) => setNeededByDate(toLocalDateValue(date))}
          disabled={isSubmitting}
        />
      </div>
    </section>
  );

  const justificationSection = (
    <section className="space-y-4">
      <PortalSectionHeader
        eyebrow="Control"
        title="Justificación"
        description="Explica la necesidad que respalda la solicitud."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={justificationExpanded}
            aria-controls={justificationId}
            onClick={() => setJustificationPreference(!justificationExpanded)}
          >
            {justificationExpanded ? 'Ocultar justificación' : 'Agregar justificación (opcional)'}
          </Button>
        }
      />
      {justificationExpanded ? (
        <label className="block space-y-1 text-sm" htmlFor={justificationId}>
          <span className="font-medium text-gray-900 dark:text-white">Justificación</span>
          <textarea
            id={justificationId}
            className={portalTextareaClassName}
            rows={3}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
          />
        </label>
      ) : null}
    </section>
  );

  const summaryFooter = (
    <CreateModeSummaryFooter
      summary={summaryLabel}
      secondaryAction={
        isMobileCreateFlow && mobileStep === 'review' ? (
          <Button type="button" variant="secondary" onClick={() => setMobileStep('capture')}>
            Volver a productos
          </Button>
        ) : undefined
      }
      primaryLabel={isEditMode ? 'Actualizar solicitud' : 'Crear solicitud'}
      primaryLoadingLabel={isEditMode ? 'Actualizando...' : 'Creando solicitud...'}
      loading={isSubmitting}
      disabled={draft.lines.length === 0}
      onPrimaryClick={() => void handleSubmit()}
    />
  );

  const content = (
    <div className="space-y-6">
      {error || validationError ? (
        <PortalAlert
          variant="error"
          title={
            isEditMode ? 'No se pudo actualizar la solicitud' : 'No se pudo crear la solicitud'
          }
          description={validationError ?? error ?? ''}
        />
      ) : null}

      {isMobileCreateFlow ? (
        <div className="space-y-6">
          <CreateModeMobileStepIndicator currentStep={mobileStep === 'capture' ? 1 : 2} />
          {requestContextSection}
          {mobileStep === 'capture' ? (
            <>
              {captureSection}
              <CreateModeMobileCaptureFooter
                summary={summaryLabel}
                disabled={draft.lines.length === 0}
                onReview={() => setMobileStep('review')}
              />
            </>
          ) : (
            <>
              {draftSection}
              {justificationSection}
              {summaryFooter}
            </>
          )}
        </div>
      ) : isCreateMode ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-start">
          <div className="min-w-0 space-y-6">
            {requestContextSection}
            {captureSection}
            {draftSection}
          </div>
          <aside
            aria-label="Resumen de la solicitud"
            className="space-y-4 rounded-2xl border border-gray-200 p-4 dark:border-dark-border lg:sticky lg:top-2"
          >
            {justificationSection}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Resumen de la solicitud
              </p>
              <dl className="space-y-1 rounded-2xl border border-gray-200 p-3 text-sm dark:border-dark-border">
                <div className="flex justify-between gap-2">
                  <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">Líneas</dt>
                  <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                    {draft.lines.length}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2 dark:border-dark-border">
                  <dt className="font-medium text-gray-900 dark:text-white">Total estimado</dt>
                  <dd className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                    {draftEstimate.coveredLines > 0
                      ? formatInventoryCurrency(draftEstimate.total)
                      : '—'}
                  </dd>
                </div>
              </dl>
            </div>
            {summaryFooter}
          </aside>
        </div>
      ) : (
        <>
          {requestContextSection}
          {captureSection}
          {draftSection}
          {justificationSection}
          {summaryFooter}
        </>
      )}
    </div>
  );

  if (layout === 'embedded') {
    return content;
  }

  return (
    <PortalPanel
      eyebrow="Nueva solicitud"
      title="Nueva solicitud de compra"
      description="Combina sugerencias, catálogo o líneas manuales en una sola solicitud."
    >
      {content}
    </PortalPanel>
  );
}
