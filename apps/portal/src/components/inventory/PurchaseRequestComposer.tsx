'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select } from '@iwana/ui';
import { PurchaseRequestPriority, PurchaseRequestType } from '@iwana/shared';
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

function useMinWidth(minWidth: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setMatches(true);
      return;
    }

    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [minWidth]);

  return matches;
}

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
    setNeededByDate('');
    setDraft(createEmptyPurchaseDraft());
    setValidationError(null);
    setMobileStep('capture');
  }

  async function handleSubmit() {
    if (onUpdate) {
      if (draft.lines.length === 0) {
        setValidationError('La solicitud debe tener al menos una línea.');
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Select
          id="purchase-type"
          label="Tipo de compra"
          value={requestType}
          helperText={getPurchaseRequestTypeHelperLabel(requestType)}
          onChange={(event) => setRequestType(event.target.value as PurchaseRequestType)}
          options={TYPE_OPTIONS}
          disabled={isEditMode}
        />
        <Input
          id="purchase-area"
          label="Área solicitante"
          value={requestingArea}
          onChange={(event) => setRequestingArea(event.target.value)}
        />
        <Select
          id="purchase-priority"
          label="Prioridad"
          value={priority}
          onChange={(event) => setPriority(event.target.value as PurchaseRequestPriority)}
          options={PRIORITY_OPTIONS}
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
      <div className="grid gap-3">
        <Input
          id="purchase-title"
          label="Título"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
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
      />
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-gray-900 dark:text-white">Justificación</span>
        <textarea
          className={portalTextareaClassName}
          rows={3}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </label>
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
        <>
          {requestContextSection}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="space-y-6">{captureSection}</div>
            <div className="space-y-6">
              {draftSection}
              {justificationSection}
              {summaryFooter}
            </div>
          </div>
        </>
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
