'use client';

import { useCallback, useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { CustomerSegment } from '@iwana/shared';
import { FormStatus, ModalLayer, overlayEdgeClassName, cn } from '@iwana/ui';
import type { PlanCatalogItem } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi, mapPickerSearchResponse } from '@/lib/api-client';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import {
  SearchableMultiPicker,
  SearchablePicker,
  type SearchablePickerItem,
} from '@/components/shared/SearchablePicker';

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

const BILLING_CYCLE_OPTIONS = [
  { value: 'Mensual', label: 'Mensual' },
  { value: 'Bimestral', label: 'Bimestral' },
  { value: 'Trimestral', label: 'Trimestral' },
  { value: 'Semestral', label: 'Semestral' },
  { value: 'Anual', label: 'Anual' },
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
  onClose: () => void;
  onSuccess: () => Promise<void>;
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
  billingCycle: string;
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
  billingCycle: '',
  fiscalName: '',
  fiscalDocument: '',
  fiscalAddress: '',
};

// ── Componente ────────────────────────────────────────────────────────────────

export function CreateContractDialog({
  subscriberId,
  onClose,
  onSuccess,
}: CreateContractDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  // Estos diálogos se montan/desmontan desde el padre, así que su apertura es su
  // propia presencia: se difunde `true` mientras vivan y el hook libera el estado
  // al desmontar. Sin esto el chrome queda bajo el velo pero NO inerte y el foco
  // escapa (mismo defecto que M9 corrigió en `PortalSidePeek`).
  usePortalModalDrawerBroadcast(true);

  const [planResolving, setPlanResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape, trampa de foco, foco inicial y retorno al disparador. Es
  // PRERREQUISITO del velo, no un extra: el velo dejó de ser un `<button>`
  // etiquetado, así que Escape y el botón «Cerrar» de la cabecera son el único
  // affordance de cierre para teclado y AT (contrato del velo §2).
  //
  // Escape replica el botón de la cabecera, que está `disabled` mientras
  // `saving`: no se descarta un alta en vuelo, igual que el velo inerte.
  usePortalSideDrawerA11y(true, dialogRef, () => {
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
    if (!form.planId || !form.selectedPlan) {
      setSaveError('Selecciona un plan antes de continuar.');
      return;
    }

    setSaving(true);
    setSaveError(null);
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

      await contractsApi.createForSubscriber(subscriberId, {
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
        ...(additionalProductIds.length > 0 ? { additionalProductIds } : {}),
        ...(additionalServiceIds.length > 0 ? { additionalServiceIds } : {}),
        ...(form.paymentMethod ? { paymentMethod: form.paymentMethod } : {}),
        ...(form.billingCycle ? { billingCycle: form.billingCycle } : {}),
        ...(form.fiscalName ? { fiscalName: form.fiscalName } : {}),
        ...(form.fiscalDocument ? { fiscalDocument: form.fiscalDocument } : {}),
        ...(form.fiscalAddress ? { fiscalAddress: form.fiscalAddress } : {}),
      });

      await onSuccess();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Error al crear el contrato.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

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
            <FormStatus status={saveError ? 'error' : 'idle'} message={saveError ?? undefined} />

            {/* ── Plan ─────────────────────────────────────────────────── */}
            <div>
              <p className={sectionTitleCls}>Plan de conectividad</p>
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
                <p className="mt-1.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Cargando detalle del plan…
                </p>
              )}
              {form.selectedPlan && !planResolving && (
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {form.selectedPlan.technology} · ↓{form.selectedPlan.downloadSpeedMbps} Mbps · ↑
                  {form.selectedPlan.uploadSpeedMbps} Mbps
                </p>
              )}
            </div>

            {/* ── Alias ────────────────────────────────────────────────── */}
            <div>
              <p className={sectionTitleCls}>Identificación del servicio</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Alias del servicio</label>
                  <input
                    type="text"
                    value={form.alias}
                    onChange={set('alias')}
                    placeholder="Ej: Hogar Cra 10 · se autogenera si se deja en blanco"
                    className={inputCls}
                    maxLength={120}
                  />
                </div>
                <div>
                  <label className={labelCls}>Segmento del cliente</label>
                  <select
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
            </div>

            {/* ── Dirección de instalación ──────────────────────────────── */}
            <div>
              <p className={sectionTitleCls}>Dirección de instalación</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Dirección</label>
                  <input
                    type="text"
                    value={form.installationAddress}
                    onChange={set('installationAddress')}
                    placeholder="Cra 10 #23-45"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Ciudad</label>
                  <input
                    type="text"
                    value={form.installationCity}
                    onChange={set('installationCity')}
                    placeholder="Bogotá"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Departamento</label>
                  <input
                    type="text"
                    value={form.installationDepartment}
                    onChange={set('installationDepartment')}
                    placeholder="Cundinamarca"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Código postal</label>
                  <input
                    type="text"
                    value={form.installationPostalCode}
                    onChange={set('installationPostalCode')}
                    placeholder="110111"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Notas de instalación</label>
                  <textarea
                    value={form.installationNotes}
                    onChange={set('installationNotes')}
                    rows={2}
                    placeholder="Instrucciones de acceso, referencias, etc."
                    className={[inputCls, 'resize-none'].join(' ')}
                  />
                </div>
              </div>
            </div>

            {/* ── Productos y servicios adicionales ────────────────────── */}
            <div>
              <p className={sectionTitleCls}>Complementos del plan</p>
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
            </div>

            {/* ── Facturación ───────────────────────────────────────────── */}
            <div>
              <p className={sectionTitleCls}>Facturación</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Método de pago</label>
                  <select
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
                <div>
                  <label className={labelCls}>Ciclo de facturación</label>
                  <select
                    value={form.billingCycle}
                    onChange={set('billingCycle')}
                    className={selectCls}
                  >
                    <option value="">— Sin especificar —</option>
                    {BILLING_CYCLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Datos fiscales (opcional) ──────────────────────────────── */}
            <div>
              <p className={sectionTitleCls}>Datos fiscales (opcional)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Nombre fiscal</label>
                  <input
                    type="text"
                    value={form.fiscalName}
                    onChange={set('fiscalName')}
                    placeholder="Razón social o nombre"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Documento / NIT</label>
                  <input
                    type="text"
                    value={form.fiscalDocument}
                    onChange={set('fiscalDocument')}
                    placeholder="900.123.456-7"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Dirección fiscal</label>
                  <input
                    type="text"
                    value={form.fiscalAddress}
                    onChange={set('fiscalAddress')}
                    placeholder="Dirección de facturación"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
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
          <button
            type="submit"
            form="create-contract-form"
            disabled={saving || planResolving || !form.planId}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-iwana-secondary-700 py-2.5 text-sm font-semibold text-white transition hover:bg-iwana-secondary-700/90 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Crear servicio en borrador
          </button>
        </div>
      </div>
    </ModalLayer>
  );
}
