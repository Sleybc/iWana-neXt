'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { CustomerSegment } from '@iwana/shared';
import type { AdditionalProduct, AdditionalService, PlanCatalogItem } from '@/lib/api-client';
import { ApiError, commercialApi, contractsApi } from '@/lib/api-client';
import { CatalogPicker, MultiCatalogPicker } from '@/components/shared/CatalogPicker';

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
  alias: string;
  installationAddress: string;
  installationCity: string;
  installationDepartment: string;
  installationPostalCode: string;
  installationNotes: string;
  customerSegment: string;
  additionalProductIds: string[];
  additionalServiceIds: string[];
  paymentMethod: string;
  billingCycle: string;
  fiscalName: string;
  fiscalDocument: string;
  fiscalAddress: string;
}

const INITIAL_FORM: FormState = {
  planId: null,
  selectedPlan: null,
  alias: '',
  installationAddress: '',
  installationCity: '',
  installationDepartment: '',
  installationPostalCode: '',
  installationNotes: '',
  customerSegment: '',
  additionalProductIds: [],
  additionalServiceIds: [],
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
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [products, setProducts] = useState<AdditionalProduct[]>([]);
  const [services, setServices] = useState<AdditionalService[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cargar catálogo al montar
  useEffect(() => {
    const load = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const [p, pr, sv] = await Promise.all([
          commercialApi.getPlans(),
          commercialApi.getAdditionalProducts(),
          commercialApi.getAdditionalServices(),
        ]);
        setPlans(p.filter((item) => item.isActive));
        setProducts(pr.filter((item) => item.isActive));
        setServices(sv.filter((item) => item.isActive));
      } catch (err) {
        setCatalogError(err instanceof ApiError ? err.message : 'Error al cargar catálogo.');
      } finally {
        setCatalogLoading(false);
      }
    };

    void load();
  }, []);

  // ── Helpers del formulario ───────────────────────────────────────────────

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handlePlanSelect = (plan: PlanCatalogItem | null) => {
    setForm((prev) => ({
      ...prev,
      planId: plan?.id ?? null,
      selectedPlan: plan,
    }));
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
      // Construir snapshot del plan seleccionado
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
        ...(form.additionalProductIds.length > 0
          ? { additionalProductIds: form.additionalProductIds }
          : {}),
        ...(form.additionalServiceIds.length > 0
          ? { additionalServiceIds: form.additionalServiceIds }
          : {}),
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

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-contract-title"
        className="fixed inset-x-4 inset-y-0 z-50 flex items-center justify-center sm:inset-0"
      >
        <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-surface-2">
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
          <form
            onSubmit={handleSubmit}
            id="create-contract-form"
            className="flex-1 overflow-y-auto"
          >
            <div className="space-y-6 p-6">
              {/* Estado de carga del catálogo */}
              {catalogLoading && (
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:bg-dark-surface">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Cargando catálogo...
                </div>
              )}

              {catalogError && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {catalogError}
                </div>
              )}

              {saveError && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  {saveError}
                </div>
              )}

              {/* ── Plan ─────────────────────────────────────────────────── */}
              <div>
                <p className={sectionTitleCls}>Plan de conectividad</p>
                <div>
                  <label className={labelCls}>
                    Plan <span className="text-red-500">*</span>
                  </label>
                  <CatalogPicker<PlanCatalogItem>
                    items={plans}
                    selectedId={form.planId}
                    onChange={handlePlanSelect}
                    getKey={(p) => p.id}
                    getLabel={(p) => p.name}
                    getDescription={(p) =>
                      [
                        p.technology,
                        `↓${p.downloadSpeedMbps}Mbps`,
                        `↑${p.uploadSpeedMbps}Mbps`,
                        p.basePrice
                          ? new Intl.NumberFormat('es-CO', {
                              style: 'currency',
                              currency: 'COP',
                              maximumFractionDigits: 0,
                            }).format(p.basePrice)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }
                    placeholder="Seleccionar plan..."
                    disabled={catalogLoading}
                  />
                  {form.selectedPlan && (
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {form.selectedPlan.technology} · ↓{form.selectedPlan.downloadSpeedMbps} Mbps ·
                      ↑{form.selectedPlan.uploadSpeedMbps} Mbps
                    </p>
                  )}
                </div>
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
              {(products.length > 0 || services.length > 0) && (
                <div>
                  <p className={sectionTitleCls}>Complementos del plan</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {products.length > 0 && (
                      <div>
                        <label className={labelCls}>Productos adicionales</label>
                        <MultiCatalogPicker<AdditionalProduct>
                          items={products}
                          selectedIds={form.additionalProductIds}
                          onChange={(ids) =>
                            setForm((prev) => ({ ...prev, additionalProductIds: ids }))
                          }
                          getKey={(p) => p.id}
                          getLabel={(p) => p.name}
                          getDescription={(p) => p.description ?? null}
                          placeholder="Sin productos adicionales"
                          disabled={catalogLoading}
                        />
                      </div>
                    )}
                    {services.length > 0 && (
                      <div>
                        <label className={labelCls}>Servicios adicionales</label>
                        <MultiCatalogPicker<AdditionalService>
                          items={services}
                          selectedIds={form.additionalServiceIds}
                          onChange={(ids) =>
                            setForm((prev) => ({ ...prev, additionalServiceIds: ids }))
                          }
                          getKey={(s) => s.id}
                          getLabel={(s) => s.name}
                          getDescription={(s) => s.description ?? null}
                          placeholder="Sin servicios adicionales"
                          disabled={catalogLoading}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

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
              disabled={saving || catalogLoading || !form.planId}
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
      </div>
    </>
  );
}
