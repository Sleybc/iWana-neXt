'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  CustomerSegment,
  PersonType,
  ServiceUsage,
  type SubscriberFiscalMissingField,
} from '@iwana/shared';
import {
  Button,
  FormField,
  FormStatus,
  ModalLayer,
  SectionAccordion,
  Select,
  overlayEdgeClassName,
  cn,
} from '@iwana/ui';
import type { PlanCatalogItem } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi, mapPickerSearchResponse } from '@/lib/api-client';
import {
  PortalSkeletonBlock,
  PortalAlert,
  PortalPanel,
  interactiveFocusClassName,
  portalPanelDenseBodyClassName,
  portalPanelDenseClassName,
} from '@/components/shared/portal-ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { FirstChargePreview } from './FirstChargePreview';
import { FiscalDataIncompleteAlert } from './FiscalDataIncompleteAlert';
import { readFiscalDataIncompleteError } from './subscriber-fiscal';
import { BillingCycleField } from './BillingCycleField';
import { useBillingCycles } from './use-billing-cycles';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import {
  SearchableMultiPicker,
  SearchablePicker,
  type SearchablePickerItem,
} from '@/components/shared/SearchablePicker';
import {
  STRATUM_EVIDENCE_ACCEPT,
  STRATUM_EVIDENCE_FORMATS_LABEL,
  stratumEvidenceFileError,
  stratumEvidenceUploadErrorMessage,
} from './stratum-evidence';

// ── Opciones estáticas ────────────────────────────────────────────────────────

const SEGMENT_OPTIONS = [
  { value: CustomerSegment.RESIDENTIAL, label: 'Residencial' },
  { value: CustomerSegment.SOHO, label: 'SOHO' },
  { value: CustomerSegment.PYME, label: 'Pyme' },
  { value: CustomerSegment.CORPORATE, label: 'Corporativo' },
  { value: CustomerSegment.GOVERNMENT, label: 'Gobierno' },
  { value: CustomerSegment.WHOLESALE, label: 'Mayorista' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'PSE', label: 'PSE' },
  { value: 'Efectivo', label: 'Efectivo' },
  { value: 'Tarjeta débito', label: 'Tarjeta débito' },
  { value: 'Tarjeta crédito', label: 'Tarjeta crédito' },
  { value: 'Domiciliación bancaria', label: 'Domiciliación bancaria' },
];

// ── Estilos base ──────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-iwana-secondary-700 focus:ring-1 focus:ring-iwana-secondary-700/30 dark:border-dark-border dark:bg-dark-surface dark:text-white';

const selectCls = inputCls;

const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

const sectionTitleCls =
  'mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateContractDialogProps {
  subscriberId: string;
  personType?: PersonType;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

/** Alta en panel (`dialog`) o en página completa (`page`, spec MOD05 UISP §3 E). */
export interface CreateContractFormProps extends CreateContractDialogProps {
  layout: 'dialog' | 'page';
}

// ── Estado del formulario ─────────────────────────────────────────────────────

interface FormState {
  planId: string | null;
  selectedPlan: PlanCatalogItem | null;
  selectedPlanItem: Pick<SearchablePickerItem, 'label' | 'sublabel'> | null;
  alias: string;
  installationAddress: string;
  installationCity: string;
  installationDepartment: string;
  installationPostalCode: string;
  installationNotes: string;
  customerSegment: string;
  additionalProducts: SearchablePickerItem[];
  additionalServices: SearchablePickerItem[];
  paymentMethod: string;
  billingCycleDay: string;
  fiscalName: string;
  fiscalDocument: string;
  fiscalAddress: string;
}

const INITIAL_FORM: FormState = {
  planId: null,
  selectedPlan: null,
  selectedPlanItem: null,
  alias: '',
  installationAddress: '',
  installationCity: '',
  installationDepartment: '',
  installationPostalCode: '',
  installationNotes: '',
  customerSegment: '',
  additionalProducts: [],
  additionalServices: [],
  paymentMethod: '',
  billingCycleDay: '',
  fiscalName: '',
  fiscalDocument: '',
  fiscalAddress: '',
};

// ── Componente ────────────────────────────────────────────────────────────────

export function CreateContractDialog(props: CreateContractDialogProps) {
  return <CreateContractForm layout="dialog" {...props} />;
}

export function CreateContractForm({
  layout,
  subscriberId,
  personType = PersonType.NATURAL,
  onClose,
  onSuccess,
}: CreateContractFormProps) {
  const isPage = layout === 'page';
  const fieldId = useId();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const billingCycles = useBillingCycles();
  // Estos diálogos se montan/desmontan desde el padre, así que su apertura es su
  // propia presencia: se difunde `true` mientras vivan y el hook libera el estado
  // al desmontar. Sin esto el chrome queda bajo el velo pero NO inerte y el foco
  // escapa (mismo defecto que M9 corrigió en `PortalSidePeek`).
  usePortalModalDrawerBroadcast(!isPage);

  const [planResolving, setPlanResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fiscalMissing, setFiscalMissing] = useState<SubscriberFiscalMissingField[] | null>(null);
  const [serviceUsage, setServiceUsage] = useState<ServiceUsage | ''>('');
  const [installationStratum, setInstallationStratum] = useState('');
  const [hasStratumEvidence, setHasStratumEvidence] = useState(false);
  const [pendingEvidenceFile, setPendingEvidenceFile] = useState<File | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [evidenceUploadError, setEvidenceUploadError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | undefined>();
  const [stratumError, setStratumError] = useState<string | undefined>();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape, trampa de foco, foco inicial y retorno al disparador. Es
  // PRERREQUISITO del velo, no un extra: el velo dejó de ser un `<button>`
  // etiquetado, así que Escape y el botón «Cerrar» de la cabecera son el único
  // affordance de cierre para teclado y AT (contrato del velo §2).
  //
  // Escape replica el botón de la cabecera, que está `disabled` mientras
  // `saving`: no se descarta un alta en vuelo, igual que el velo inerte.
  usePortalSideDrawerA11y(!isPage, dialogRef, () => {
    if (saving) {
      return;
    }
    onClose();
  });

  const searchPlans = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await commercialApi.searchPlansForPicker(
      { q: query, isActive: true },
      { signal },
    );
    return mapPickerSearchResponse(response);
  }, []);

  const searchProducts = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await commercialApi.searchAdditionalProductsForPicker(
      { q: query, isActive: true },
      { signal },
    );
    return mapPickerSearchResponse(response);
  }, []);

  const searchServices = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await commercialApi.searchAdditionalServicesForPicker(
      { q: query, isActive: true },
      { signal },
    );
    return mapPickerSearchResponse(response);
  }, []);

  // ── Helpers del formulario ───────────────────────────────────────────────

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handlePlanSelect = async (item: SearchablePickerItem | null) => {
    if (!item) {
      setForm((prev) => ({
        ...prev,
        planId: null,
        selectedPlan: null,
        selectedPlanItem: null,
      }));
      return;
    }

    setPlanResolving(true);
    setSaveError(null);
    try {
      const plan = await commercialApi.getPlanById(item.id);
      setForm((prev) => ({
        ...prev,
        planId: plan.id,
        selectedPlan: plan,
        selectedPlanItem: { label: item.label, sublabel: item.sublabel },
      }));
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : 'No fue posible cargar el detalle del plan.',
      );
      setForm((prev) => ({
        ...prev,
        planId: null,
        selectedPlan: null,
        selectedPlanItem: null,
      }));
    } finally {
      setPlanResolving(false);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsageError(undefined);
    setStratumError(undefined);

    if (savedDraftId) {
      if (!pendingEvidenceFile) {
        await onSuccess();
        return;
      }

      setSaving(true);
      setEvidenceUploadError(null);
      try {
        const updated = await contractsApi.uploadStratumEvidence(savedDraftId, pendingEvidenceFile);
        setHasStratumEvidence(Boolean(updated.stratumEvidenceMediaId));
        setPendingEvidenceFile(null);
        await onSuccess();
      } catch (uploadError) {
        setEvidenceUploadError(stratumEvidenceUploadErrorMessage(uploadError));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (serviceUsage === ServiceUsage.RESIDENTIAL && !installationStratum) {
      setStratumError('Selecciona el estrato del predio de instalación.');
      return;
    }
    if (!form.planId || !form.selectedPlan) {
      setSaveError('Selecciona un plan antes de continuar.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setFiscalMissing(null);
    try {
      const planSnapshotJson: Record<string, unknown> = {
        id: form.selectedPlan.id,
        name: form.selectedPlan.name,
        technology: form.selectedPlan.technology,
        downloadSpeedMbps: form.selectedPlan.downloadSpeedMbps,
        uploadSpeedMbps: form.selectedPlan.uploadSpeedMbps,
        basePrice: form.selectedPlan.basePrice,
        installationFee: form.selectedPlan.installationFee,
        currentPrice: form.selectedPlan.currentPrice,
      };

      const additionalProductIds = form.additionalProducts.map((item) => item.id);
      const additionalServiceIds = form.additionalServices.map((item) => item.id);

      const created = await contractsApi.createForSubscriber(subscriberId, {
        planId: form.planId,
        planSnapshotJson,
        ...(form.alias ? { alias: form.alias } : {}),
        ...(form.installationAddress ? { installationAddress: form.installationAddress } : {}),
        ...(form.installationCity ? { installationCity: form.installationCity } : {}),
        ...(form.installationDepartment
          ? { installationDepartment: form.installationDepartment }
          : {}),
        ...(form.installationPostalCode
          ? { installationPostalCode: form.installationPostalCode }
          : {}),
        ...(form.installationNotes ? { installationNotes: form.installationNotes } : {}),
        ...(form.customerSegment
          ? { customerSegment: form.customerSegment as CustomerSegment }
          : {}),
        ...(serviceUsage ? { serviceUsage } : {}),
        installationStratum:
          serviceUsage === ServiceUsage.RESIDENTIAL ? Number(installationStratum) : null,
        ...(additionalProductIds.length > 0 ? { additionalProductIds } : {}),
        ...(additionalServiceIds.length > 0 ? { additionalServiceIds } : {}),
        ...(form.paymentMethod ? { paymentMethod: form.paymentMethod } : {}),
        ...(form.billingCycleDay ? { billingCycleDay: Number(form.billingCycleDay) } : {}),
        ...(form.fiscalName ? { fiscalName: form.fiscalName } : {}),
        ...(form.fiscalDocument ? { fiscalDocument: form.fiscalDocument } : {}),
        ...(form.fiscalAddress ? { fiscalAddress: form.fiscalAddress } : {}),
      });

      if (pendingEvidenceFile) {
        setSavedDraftId(created.id);
        try {
          const updated = await contractsApi.uploadStratumEvidence(created.id, pendingEvidenceFile);
          setHasStratumEvidence(Boolean(updated.stratumEvidenceMediaId));
          setPendingEvidenceFile(null);
        } catch (uploadError) {
          setEvidenceUploadError(stratumEvidenceUploadErrorMessage(uploadError));
          return;
        }
      }

      await onSuccess();
    } catch (err) {
      const fiscalMissingFields = readFiscalDataIncompleteError(err);
      if (fiscalMissingFields) {
        setFiscalMissing(fiscalMissingFields);
      } else if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.code === 'SUBSCRIBER_CANCELLED'
      ) {
        setSaveError('No puedes crear ni activar servicios para un suscriptor cancelado.');
      } else if (err instanceof ApiError && err.status === 422) {
        const detail = `${err.message} ${JSON.stringify(err.details ?? '')}`.toLowerCase();
        if (detail.includes('installationstratum')) {
          setStratumError('Revisa el estrato del predio de instalación.');
        } else if (detail.includes('serviceusage')) {
          setUsageError('Selecciona el uso del servicio para continuar.');
        } else {
          setSaveError(err.message);
        }
      } else {
        setSaveError(err instanceof ApiError ? err.message : 'Error al crear el contrato.');
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Bloques compartidos por el panel y la página ─────────────────────────

  const planInner = (
    <>
      <SearchablePicker
        label={
          <>
            Plan <span className="text-red-500">*</span>
          </>
        }
        resource={{ singular: 'plan', plural: 'planes' }}
        value={form.planId}
        selectedItem={form.selectedPlanItem}
        onChange={(item) => {
          void handlePlanSelect(item);
        }}
        onSearch={searchPlans}
        placeholder="Buscar plan…"
        disabled={saving || planResolving}
      />
      {planResolving && (
        <div role="status" aria-label="Cargando detalle del plan" className="mt-1.5">
          <PortalSkeletonBlock className="h-4 w-48 rounded" />
        </div>
      )}
      {form.selectedPlan && !planResolving && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {form.selectedPlan.technology} · ↓{form.selectedPlan.downloadSpeedMbps} Mbps · ↑
          {form.selectedPlan.uploadSpeedMbps} Mbps
        </p>
      )}
    </>
  );

  const identInner = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-alias`} className={labelCls}>
          Alias del servicio
        </label>
        <input
          id={`${fieldId}-alias`}
          type="text"
          value={form.alias}
          onChange={set('alias')}
          placeholder="Ej: Hogar Cra 10 · se autogenera si se deja en blanco"
          className={inputCls}
          maxLength={120}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-customerSegment`} className={labelCls}>
          Segmento del cliente
        </label>
        <select
          id={`${fieldId}-customerSegment`}
          value={form.customerSegment}
          onChange={set('customerSegment')}
          className={selectCls}
        >
          <option value="">— Hereda del suscriptor —</option>
          {SEGMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const addressInner = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-installationAddress`} className={labelCls}>
          Dirección
        </label>
        <input
          id={`${fieldId}-installationAddress`}
          type="text"
          value={form.installationAddress}
          onChange={set('installationAddress')}
          placeholder="Cra 10 #23-45"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-installationCity`} className={labelCls}>
          Ciudad
        </label>
        <input
          id={`${fieldId}-installationCity`}
          type="text"
          value={form.installationCity}
          onChange={set('installationCity')}
          placeholder="Bogotá"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-installationDepartment`} className={labelCls}>
          Departamento
        </label>
        <input
          id={`${fieldId}-installationDepartment`}
          type="text"
          value={form.installationDepartment}
          onChange={set('installationDepartment')}
          placeholder="Cundinamarca"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-installationPostalCode`} className={labelCls}>
          Código postal
        </label>
        <input
          id={`${fieldId}-installationPostalCode`}
          type="text"
          value={form.installationPostalCode}
          onChange={set('installationPostalCode')}
          placeholder="110111"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-installationNotes`} className={labelCls}>
          Notas de instalación
        </label>
        <textarea
          id={`${fieldId}-installationNotes`}
          value={form.installationNotes}
          onChange={set('installationNotes')}
          rows={2}
          placeholder="Instrucciones de acceso, referencias, etc."
          className={[inputCls, 'resize-none'].join(' ')}
        />
      </div>
    </div>
  );

  const servicePoint = (
    <ServicePointFields
      fieldIdPrefix="create-contract"
      personType={personType}
      serviceUsage={serviceUsage}
      onServiceUsageChange={(value) => {
        setServiceUsage(value);
        setUsageError(undefined);
        if (value !== ServiceUsage.RESIDENTIAL) {
          setInstallationStratum('');
          setPendingEvidenceFile(null);
          setEvidenceUploadError(null);
          setStratumError(undefined);
        }
      }}
      installationStratum={installationStratum}
      onInstallationStratumChange={(value) => {
        setInstallationStratum(value);
        setStratumError(undefined);
        if (!['1', '2', '3'].includes(value)) {
          setPendingEvidenceFile(null);
          setEvidenceUploadError(null);
        }
      }}
      hasStratumEvidence={hasStratumEvidence}
      pendingEvidenceFile={pendingEvidenceFile}
      onPendingEvidenceFileChange={(file) => {
        setPendingEvidenceFile(file);
        setEvidenceUploadError(null);
      }}
      {...(savedDraftId
        ? {
            onRemoveEvidence: async () => {
              if (hasStratumEvidence) {
                const updated = await contractsApi.deleteStratumEvidence(savedDraftId);
                setHasStratumEvidence(Boolean(updated.stratumEvidenceMediaId));
              }
              setPendingEvidenceFile(null);
              setEvidenceUploadError(null);
            },
          }
        : {})}
      {...(evidenceUploadError ? { uploadErrorMessage: evidenceUploadError } : {})}
      disabled={saving}
      {...(usageError ? { usageError } : {})}
      {...(stratumError ? { stratumError } : {})}
    />
  );

  const addonsInner = (
    <div className="grid gap-4 sm:grid-cols-2">
      <SearchableMultiPicker
        label="Productos adicionales"
        resource={{ singular: 'producto adicional', plural: 'productos adicionales' }}
        value={form.additionalProducts}
        onChange={(next) => setForm((prev) => ({ ...prev, additionalProducts: next }))}
        onSearch={searchProducts}
        placeholder="Buscar producto adicional…"
        disabled={saving}
      />
      <SearchableMultiPicker
        label="Servicios adicionales"
        resource={{ singular: 'servicio adicional', plural: 'servicios adicionales' }}
        value={form.additionalServices}
        onChange={(next) => setForm((prev) => ({ ...prev, additionalServices: next }))}
        onSearch={searchServices}
        placeholder="Buscar servicio adicional…"
        disabled={saving}
      />
    </div>
  );

  const billingInner = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${fieldId}-paymentMethod`} className={labelCls}>
          Método de pago
        </label>
        <select
          id={`${fieldId}-paymentMethod`}
          value={form.paymentMethod}
          onChange={set('paymentMethod')}
          className={selectCls}
        >
          <option value="">— Sin especificar —</option>
          {PAYMENT_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <BillingCycleField
        cycles={billingCycles.cycles}
        value={form.billingCycleDay}
        onChange={(value) => setForm((current) => ({ ...current, billingCycleDay: value }))}
        loading={billingCycles.loading}
        catalogError={billingCycles.error}
        onRetry={billingCycles.retry}
        disabled={saving}
        allowUnassigned
        id="create-contract-billing-cycle"
      />
    </div>
  );

  const fiscalInner = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${fieldId}-fiscalName`} className={labelCls}>
          Nombre fiscal
        </label>
        <input
          id={`${fieldId}-fiscalName`}
          type="text"
          value={form.fiscalName}
          onChange={set('fiscalName')}
          placeholder="Razón social o nombre"
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-fiscalDocument`} className={labelCls}>
          Documento / NIT
        </label>
        <input
          id={`${fieldId}-fiscalDocument`}
          type="text"
          value={form.fiscalDocument}
          onChange={set('fiscalDocument')}
          placeholder="900.123.456-7"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-fiscalAddress`} className={labelCls}>
          Dirección fiscal
        </label>
        <input
          id={`${fieldId}-fiscalAddress`}
          type="text"
          value={form.fiscalAddress}
          onChange={set('fiscalAddress')}
          placeholder="Dirección de facturación"
          className={inputCls}
        />
      </div>
    </div>
  );

  const firstChargePreview = isPage ? (
    <FirstChargePreview
      plan={form.selectedPlan}
      billingCycleDay={form.billingCycleDay ? Number(form.billingCycleDay) : null}
    />
  ) : null;

  const submitDisabled = saving || planResolving || (!form.planId && !savedDraftId);

  const formStatus = (
    <>
      {fiscalMissing && <FiscalDataIncompleteAlert missing={fiscalMissing} />}
      <FormStatus status={saveError ? 'error' : 'idle'} message={saveError ?? undefined} />
    </>
  );

  // ── Render en página (spec MOD05 UISP §3 E y §4) ──────────────────────────

  if (isPage) {
    const pageActions = (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className={cn(
            'min-h-11 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-surface dark:text-gray-300',
            interactiveFocusClassName,
          )}
        >
          Cancelar
        </button>
        <Button
          loading={saving}
          type="submit"
          form="create-contract-form"
          disabled={submitDisabled}
          className="min-h-11"
        >
          {!saving && <Plus className="h-4 w-4" aria-hidden />}
          Crear servicio en borrador
        </Button>
      </div>
    );
    const accordionItems = [
      {
        id: 'complementos',
        label: 'Complementos del plan',
        description: 'Productos y servicios adicionales',
        children: addonsInner,
      },
      ...(personType !== PersonType.NATURAL
        ? [
            {
              id: 'datos-fiscales',
              label: 'Datos fiscales (opcional)',
              description: 'Solo si el contrato se factura con otros datos',
              children: fiscalInner,
            },
          ]
        : []),
    ];
    return (
      <div className="space-y-4">
        <PageHeader
          title="Nuevo servicio contratado"
          subtitle={
            <>
              Se creará un contrato en estado <strong>Borrador</strong>
            </>
          }
          actions={pageActions}
        />
        <form onSubmit={handleSubmit} id="create-contract-form" className="space-y-4">
          {formStatus}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <PortalPanel as="section" labelled density="dense" title="Plan de conectividad">
                {planInner}
              </PortalPanel>
              <PortalPanel
                as="section"
                labelled
                density="dense"
                title="Identificación del servicio"
              >
                {identInner}
              </PortalPanel>
              <PortalPanel as="section" labelled density="dense" title="Dirección de instalación">
                {addressInner}
              </PortalPanel>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <div className={cn(portalPanelDenseClassName, portalPanelDenseBodyClassName)}>
                {servicePoint}
              </div>
              <PortalPanel as="section" labelled density="dense" title="Facturación">
                {billingInner}
              </PortalPanel>
              {firstChargePreview}
            </div>
          </div>
          <SectionAccordion variant="card" keepMounted items={accordionItems} />
          <div className="flex justify-end">{pageActions}</div>
        </form>
      </div>
    );
  }

  // ── Render en panel ───────────────────────────────────────────────────────

  // Capa única ADR-075 **portalada a `document.body`** (enmienda C-DS-04 §2bis):
  // velo y diálogo comparten UNA capa `--z-modal`, por encima del chrome. El
  // velo vive dentro de la capa y el panel es hermano posterior posicionado:
  // pinta sobre el velo por orden de documento.
  //
  // El velo queda INERTE mientras `saving`: no se descarta un alta en vuelo con
  // un clic fuera. Sin handler no hay elemento accionable que anunciar.
  //
  // Velo /40 → /45 (token `--color-veil`): el /40 fallaba WCAG 1.4.11 con
  // 2,85:1 entre el borde del panel blanco y el fondo velado.
  return (
    <ModalLayer
      align="center"
      className="px-4 sm:px-0"
      {...(saving ? {} : { onVeilClick: onClose })}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-contract-title"
        className={cn(
          overlayEdgeClassName,
          'border relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none dark:bg-dark-surface-2',
        )}
      >
        {/* Cabecera */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iwana-secondary/15 text-iwana-secondary-700">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="create-contract-title" className="font-bold text-gray-900 dark:text-white">
              Nuevo servicio contratado
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Se creará un contrato en estado <strong>Borrador</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-dark-border"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} id="create-contract-form" className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {formStatus}

            <div>
              <p className={sectionTitleCls}>Plan de conectividad</p>
              {planInner}
            </div>

            <div>
              <p className={sectionTitleCls}>Identificación del servicio</p>
              {identInner}
            </div>

            <div>
              <p className={sectionTitleCls}>Dirección de instalación</p>
              {addressInner}
            </div>

            {servicePoint}

            <div>
              <p className={sectionTitleCls}>Complementos del plan</p>
              {addonsInner}
            </div>

            <div>
              <p className={sectionTitleCls}>Facturación</p>
              {billingInner}
            </div>

            {/* Persona natural: el nombre y el documento ya son los del suscriptor. */}
            {personType !== PersonType.NATURAL && (
              <div>
                <p className={sectionTitleCls}>Datos fiscales (opcional)</p>
                {fiscalInner}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-gray-100 px-6 py-4 dark:border-dark-border">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-surface dark:text-gray-300"
          >
            Cancelar
          </button>
          <Button
            loading={saving}
            type="submit"
            form="create-contract-form"
            disabled={submitDisabled}
            className="min-h-11 flex-1"
          >
            {!saving && <Plus className="h-4 w-4" aria-hidden />}
            Crear servicio en borrador
          </Button>
        </div>
      </div>
    </ModalLayer>
  );
}

/** Campos compartidos del punto de servicio para crear, convertir y editar. */
export function ServicePointFields({
  fieldIdPrefix = 'service-point',
  personType,
  serviceUsage,
  onServiceUsageChange,
  installationStratum,
  onInstallationStratumChange,
  hasStratumEvidence,
  pendingEvidenceFile,
  onPendingEvidenceFileChange,
  onRemoveEvidence,
  uploadErrorMessage,
  usageError,
  stratumError,
  disabled = false,
}: {
  /** Prefijo estable de ids para enfocar los campos desde el formulario que los usa. */
  fieldIdPrefix?: string;
  personType: PersonType;
  serviceUsage: ServiceUsage | '';
  onServiceUsageChange: (value: ServiceUsage | '') => void;
  installationStratum: string;
  onInstallationStratumChange: (value: string) => void;
  hasStratumEvidence: boolean;
  pendingEvidenceFile: File | null;
  onPendingEvidenceFileChange: (file: File | null) => void;
  onRemoveEvidence?: () => Promise<void>;
  uploadErrorMessage?: string | null;
  usageError?: string;
  stratumError?: string;
  disabled?: boolean;
}) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const requiresEvidence =
    serviceUsage === ServiceUsage.RESIDENTIAL && ['1', '2', '3'].includes(installationStratum);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const fileError = stratumEvidenceFileError(file);
    if (fileError) {
      setUploadError(fileError);
      return;
    }

    setUploadError(null);
    onPendingEvidenceFileChange(file);
  }

  async function handleRemoveEvidence() {
    setUploadError(null);
    try {
      if (hasStratumEvidence && onRemoveEvidence) await onRemoveEvidence();
      onPendingEvidenceFileChange(null);
    } catch {
      setUploadError('No se pudo cargar el soporte. Intenta de nuevo.');
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="service-point-title">
      <div>
        <p id="service-point-title" className={sectionTitleCls}>
          Punto de servicio
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          El uso del predio determina el tratamiento de IVA de este contrato. Si allí también
          funciona un negocio, selecciona No residencial mientras el contador no indique otra
          clasificación.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Select
            id={`${fieldIdPrefix}-usage`}
            label="Uso del servicio"
            helperText="Puedes dejarlo pendiente si aún no conoces el uso; será necesario al activar el contrato."
            value={serviceUsage}
            onChange={(event) => onServiceUsageChange(event.target.value as ServiceUsage | '')}
            disabled={disabled}
            {...(usageError ? { error: usageError } : {})}
            className="h-11"
            placeholder="Selecciona el uso"
          >
            <option value={ServiceUsage.RESIDENTIAL} disabled={personType === PersonType.JURIDICA}>
              Residencial
            </option>
            <option value={ServiceUsage.NON_RESIDENTIAL}>No residencial</option>
          </Select>
          {personType === PersonType.JURIDICA ? (
            <PortalAlert
              variant="info"
              title="Las personas jurídicas no pueden registrar un servicio como residencial. Selecciona No residencial."
              live="off"
            />
          ) : null}
        </div>

        {serviceUsage === ServiceUsage.RESIDENTIAL ? (
          <Select
            id={`${fieldIdPrefix}-stratum`}
            label="Estrato del predio de instalación"
            value={installationStratum}
            onChange={(event) => onInstallationStratumChange(event.target.value)}
            disabled={disabled}
            {...(stratumError ? { error: stratumError } : {})}
            className="h-11"
            placeholder="Selecciona el estrato"
            options={[1, 2, 3, 4, 5, 6].map((stratum) => ({
              value: String(stratum),
              label: `Estrato ${stratum}`,
            }))}
          />
        ) : null}
      </div>

      {requiresEvidence ? (
        <div className="space-y-3">
          <FormField
            label={hasStratumEvidence ? 'Reemplazar soporte' : 'Soporte del estrato'}
            hint={`Adjunta un recibo de un servicio público o el certificado municipal de estratificación de la dirección de instalación. Formatos admitidos: ${STRATUM_EVIDENCE_FORMATS_LABEL}.`}
          >
            <input
              type="file"
              accept={STRATUM_EVIDENCE_ACCEPT}
              disabled={disabled}
              onChange={(event) => void handleFileChange(event)}
              className={cn(
                'min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-dark-border dark:bg-dark-surface dark:text-gray-200',
                interactiveFocusClassName,
              )}
            />
          </FormField>
          {hasStratumEvidence || pendingEvidenceFile ? (
            <div className="flex flex-wrap items-center gap-3">
              {hasStratumEvidence ? (
                <p role="status" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Soporte cargado
                </p>
              ) : null}
              <button
                type="button"
                disabled={disabled}
                onClick={() => void handleRemoveEvidence()}
                className={cn(
                  'min-h-11 rounded-lg px-3 text-sm font-medium text-iwana-secondary-700 underline underline-offset-2 dark:text-iwana-secondary-300',
                  interactiveFocusClassName,
                )}
              >
                Quitar soporte
              </button>
            </div>
          ) : pendingEvidenceFile ? null : (
            <PortalAlert
              variant="warning"
              title="Sin soporte del estrato, a este servicio se le aplicará IVA del 19 %."
              live="off"
            />
          )}
          {uploadError || uploadErrorMessage ? (
            <PortalAlert
              variant="error"
              title="No se guardó el soporte"
              description={uploadError ?? uploadErrorMessage ?? undefined}
              live="assertive"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
