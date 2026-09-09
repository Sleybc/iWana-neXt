'use client';

import { useRef, useState } from 'react';
import {
  Archive,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit2,
  Loader2,
  MapPin,
  PauseCircle,
  PlayCircle,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { ModalLayer, overlayEdgeClassName, cn } from '@iwana/ui';
import { CustomerSegment } from '@iwana/shared';
import type { Contract, ContractStatus } from '@/lib/api-client';
import { ApiError, contractsApi } from '@/lib/api-client';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { formatLocationLabel } from './subscriber-ui';

// ── Constantes de UI ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  TERMINATED: 'Terminado',
  ARCHIVED: 'Archivado',
};

const STATUS_COLORS: Record<ContractStatus, { bg: string; text: string; dot: string }> = {
  DRAFT: {
    bg: 'bg-gray-100 dark:bg-dark-surface-3',
    text: 'text-gray-600 dark:text-gray-300',
    dot: 'bg-gray-400',
  },
  ACTIVE: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    dot: 'bg-green-500',
  },
  SUSPENDED: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    text: 'text-yellow-700 dark:text-yellow-400',
    dot: 'bg-yellow-400',
  },
  TERMINATED: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
  },
  ARCHIVED: {
    bg: 'bg-gray-100 dark:bg-dark-surface-4/40',
    text: 'text-gray-500 dark:text-gray-400',
    dot: 'bg-gray-400',
  },
};

type TransitionAction = 'activate' | 'suspend' | 'reactivate' | 'terminate' | 'archive';

const ACTIONS_BY_STATUS: Record<
  ContractStatus,
  Array<{
    label: string;
    action: TransitionAction;
    icon: React.ReactNode;
    variant: 'primary' | 'warning' | 'danger' | 'neutral';
  }>
> = {
  DRAFT: [
    {
      label: 'Activar',
      action: 'activate',
      icon: <PlayCircle className="h-3.5 w-3.5" aria-hidden />,
      variant: 'primary',
    },
  ],
  ACTIVE: [
    {
      label: 'Suspender',
      action: 'suspend',
      icon: <PauseCircle className="h-3.5 w-3.5" aria-hidden />,
      variant: 'warning',
    },
    {
      label: 'Terminar',
      action: 'terminate',
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
      variant: 'danger',
    },
  ],
  SUSPENDED: [
    {
      label: 'Reactivar',
      action: 'reactivate',
      icon: <PlayCircle className="h-3.5 w-3.5" aria-hidden />,
      variant: 'primary',
    },
    {
      label: 'Terminar',
      action: 'terminate',
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
      variant: 'danger',
    },
    {
      label: 'Archivar',
      action: 'archive',
      icon: <Archive className="h-3.5 w-3.5" aria-hidden />,
      variant: 'neutral',
    },
  ],
  TERMINATED: [
    {
      label: 'Archivar',
      action: 'archive',
      icon: <Archive className="h-3.5 w-3.5" aria-hidden />,
      variant: 'neutral',
    },
  ],
  ARCHIVED: [],
};

const SEGMENT_LABELS: Record<string, string> = {
  [CustomerSegment.RESIDENTIAL]: 'Residencial',
  [CustomerSegment.SOHO]: 'SOHO',
  [CustomerSegment.PYME]: 'Pyme',
  [CustomerSegment.CORPORATE]: 'Corporativo',
  [CustomerSegment.GOVERNMENT]: 'Gobierno',
  [CustomerSegment.WHOLESALE]: 'Mayorista',
};

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

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface EditForm {
  alias: string;
  installationAddress: string;
  installationCity: string;
  installationDepartment: string;
  installationPostalCode: string;
  installationNotes: string;
  customerSegment: string;
  paymentMethod: string;
  billingCycle: string;
  fiscalName: string;
  fiscalDocument: string;
  fiscalAddress: string;
}

function buildEditForm(contract: Contract): EditForm {
  return {
    alias: contract.alias,
    installationAddress: contract.installationAddress ?? '',
    installationCity: contract.installationCity ?? '',
    installationDepartment: contract.installationDepartment ?? '',
    installationPostalCode: contract.installationPostalCode ?? '',
    installationNotes: contract.installationNotes ?? '',
    customerSegment: contract.customerSegment ?? '',
    paymentMethod: contract.paymentMethod ?? '',
    billingCycle: contract.billingCycle ?? '',
    fiscalName: contract.fiscalName ?? '',
    fiscalDocument: contract.fiscalDocument ?? '',
    fiscalAddress: contract.fiscalAddress ?? '',
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContractDetailDrawerProps {
  contract: Contract;
  onClose: () => void;
  onReload: () => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}

// ── Subcomponente campo de detalle ────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  );
}

// ── Subcomponente sección ─────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-dark-border dark:bg-dark-surface/40">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

// ── Campo de formulario en modo edición ───────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-iwana-secondary-700 focus:ring-1 focus:ring-iwana-secondary-700/30 dark:border-dark-border dark:bg-dark-surface dark:text-white';

const selectCls = inputCls;

// ── Variantes de botón de acción ──────────────────────────────────────────────

const ACTION_BTN: Record<string, string> = {
  primary:
    'flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100 disabled:opacity-40 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400',
  warning:
    'flex items-center gap-1.5 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-xs font-semibold text-yellow-700 transition hover:bg-yellow-100 disabled:opacity-40 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  danger:
    'flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-40 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400',
  neutral:
    'flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 dark:border-dark-border dark:bg-dark-surface dark:text-gray-300',
};

// ── Componente principal ──────────────────────────────────────────────────────

export function ContractDetailDrawer({
  contract,
  onClose,
  onReload,
  onRemove,
}: ContractDetailDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  // Estos diálogos se montan/desmontan desde el padre, así que su apertura es su
  // propia presencia: se difunde `true` mientras vivan y el hook libera el estado
  // al desmontar. Sin esto el chrome queda bajo el velo pero NO inerte y el foco
  // escapa (mismo defecto que M9 corrigió en `PortalSidePeek`).
  usePortalModalDrawerBroadcast(true);

  const [form, setForm] = useState<EditForm>(() => buildEditForm(contract));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const colors = STATUS_COLORS[contract.status];
  const planName = (contract.planSnapshotJson?.name as string | undefined) ?? contract.planId;
  const planPrice = contract.planSnapshotJson?.basePrice as number | undefined;
  const planDown = contract.planSnapshotJson?.downloadSpeedMbps as number | undefined;
  const planUp = contract.planSnapshotJson?.uploadSpeedMbps as number | undefined;

  const createdDate = new Date(contract.createdAt).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // ── Manejo del formulario ────────────────────────────────────────────────

  const handleField =
    (field: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await contractsApi.update(contract.id, {
        ...(form.alias ? { alias: form.alias } : {}),
        ...(form.installationAddress !== undefined
          ? { installationAddress: form.installationAddress }
          : {}),
        ...(form.installationCity !== undefined ? { installationCity: form.installationCity } : {}),
        ...(form.installationDepartment !== undefined
          ? { installationDepartment: form.installationDepartment }
          : {}),
        ...(form.installationPostalCode !== undefined
          ? { installationPostalCode: form.installationPostalCode }
          : {}),
        ...(form.installationNotes !== undefined
          ? { installationNotes: form.installationNotes }
          : {}),
        ...(form.customerSegment
          ? { customerSegment: form.customerSegment as CustomerSegment }
          : {}),
        ...(form.paymentMethod !== undefined ? { paymentMethod: form.paymentMethod } : {}),
        ...(form.billingCycle !== undefined ? { billingCycle: form.billingCycle } : {}),
        ...(form.fiscalName !== undefined ? { fiscalName: form.fiscalName } : {}),
        ...(form.fiscalDocument !== undefined ? { fiscalDocument: form.fiscalDocument } : {}),
        ...(form.fiscalAddress !== undefined ? { fiscalAddress: form.fiscalAddress } : {}),
      });
      setIsEditing(false);
      await onReload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Error al guardar cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(buildEditForm(contract));
    setIsEditing(false);
    setSaveError(null);
  };

  // Escape, trampa de foco, foco inicial y retorno al disparador. Es
  // PRERREQUISITO del velo, no un extra: el velo dejó de ser un `<button>`
  // etiquetado, así que Escape y el botón «Cerrar» de la cabecera son el único
  // affordance de cierre para teclado y AT (contrato del velo §2). Sin el hook,
  // quitar el botón dejaba el panel sin salida por teclado.
  //
  // Escape replica exactamente el botón de la cabecera: con edición en curso
  // cancela la edición en lugar de descartar el panel — la misma razón por la
  // que el velo queda inerte mientras `isEditing`.
  usePortalSideDrawerA11y(true, panelRef, isEditing ? handleCancelEdit : onClose);

  // ── Transiciones de estado ───────────────────────────────────────────────

  const handleTransition = async (action: TransitionAction) => {
    setTransitioning(true);
    setTransitionError(null);
    try {
      await contractsApi[action](contract.id);
      await onReload();
      onClose();
    } catch (err) {
      setTransitionError(err instanceof ApiError ? err.message : 'Error al cambiar estado.');
    } finally {
      setTransitioning(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setTransitioning(true);
    try {
      await onRemove(contract.id);
      onClose();
    } finally {
      setTransitioning(false);
    }
  };

  const actions = ACTIONS_BY_STATUS[contract.status];

  // ── Render ────────────────────────────────────────────────────────────────

  // Capa única ADR-075 **portalada a `document.body`** (enmienda C-DS-04 §2bis):
  // velo y panel comparten UNA capa `--z-modal`, por encima del chrome. El velo
  // vive dentro de la capa y el panel es hermano posterior posicionado: pinta
  // sobre el velo por orden de documento.
  //
  // El velo queda INERTE mientras `isEditing`: no se descarta una edición en
  // curso por un clic fuera. Sin handler no hay elemento accionable que
  // anunciar — la razón por la que el velo dejó de ser un `<button>`.
  //
  // Velo /30 → /45 (token `--color-veil`): el /30 fallaba WCAG 1.4.11 con
  // 2,10:1 entre el borde del panel blanco y el fondo velado.
  return (
    <ModalLayer align="end" {...(isEditing ? {} : { onVeilClick: onClose })}>
      {/* Drawer */}
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-contract-title"
        className={cn(
          overlayEdgeClassName,
          'border-l relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl outline-none dark:bg-dark-surface-2',
        )}
      >
        {/* Cabecera */}
        <div className="flex items-start gap-3 border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-400">
              Contrato de servicio
            </p>
            <h2
              id="drawer-contract-title"
              className="mt-0.5 truncate text-lg font-bold text-gray-900 dark:text-white"
            >
              {contract.alias}
            </h2>
          </div>
          {/* Badge estado */}
          <span
            className={[
              'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              colors.bg,
              colors.text,
            ].join(' ')}
          >
            <span className={['h-1.5 w-1.5 rounded-full', colors.dot].join(' ')} />
            {STATUS_LABELS[contract.status]}
          </span>
          {/* Botón cerrar */}
          <button
            type="button"
            onClick={isEditing ? handleCancelEdit : onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-border"
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Errores */}
          {(saveError ?? transitionError) && (
            <div className="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <span className="flex-1">{saveError ?? transitionError}</span>
              <button
                type="button"
                onClick={() => {
                  setSaveError(null);
                  setTransitionError(null);
                }}
                className="text-red-400 hover:text-red-600"
                aria-label="Cerrar error"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}

          {/* ── Plan contratado ───────────────────────────────────────────── */}
          <Section
            icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            title="Plan contratado"
          >
            <div className="sm:col-span-2">
              <p className="font-semibold text-gray-900 dark:text-white">{planName}</p>
              {(planDown ?? planUp) && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {planDown && `↓ ${planDown} Mbps`}
                  {planDown && planUp && ' · '}
                  {planUp && `↑ ${planUp} Mbps`}
                </p>
              )}
              {planPrice !== undefined && (
                <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    maximumFractionDigits: 0,
                  }).format(planPrice)}
                  /mes
                </p>
              )}
            </div>
            {!isEditing && (
              <>
                <DetailField
                  label="Segmento"
                  value={
                    contract.customerSegment
                      ? (SEGMENT_LABELS[contract.customerSegment] ?? contract.customerSegment)
                      : null
                  }
                />
                <DetailField label="Creado" value={createdDate} />
              </>
            )}
            {isEditing && (
              <FormField label="Segmento del cliente">
                <select
                  value={form.customerSegment}
                  onChange={handleField('customerSegment')}
                  className={selectCls}
                >
                  <option value="">— Sin especificar —</option>
                  {Object.entries(SEGMENT_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </Section>

          {/* ── Instalación ───────────────────────────────────────────────── */}
          <Section icon={<MapPin className="h-3.5 w-3.5" aria-hidden />} title="Instalación">
            {!isEditing ? (
              <>
                <DetailField label="Alias" value={contract.alias} />
                <DetailField label="Dirección" value={contract.installationAddress} />
                <DetailField
                  label="Ciudad"
                  value={formatLocationLabel(contract.installationCity)}
                />
                <DetailField
                  label="Departamento"
                  value={formatLocationLabel(contract.installationDepartment)}
                />
                <DetailField label="Código postal" value={contract.installationPostalCode} />
                {contract.installationNotes && (
                  <div className="sm:col-span-2">
                    <DetailField label="Notas de instalación" value={contract.installationNotes} />
                  </div>
                )}
              </>
            ) : (
              <>
                <FormField label="Alias del servicio">
                  <input
                    type="text"
                    value={form.alias}
                    onChange={handleField('alias')}
                    placeholder="Ej: Hogar Cra 10"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Dirección de instalación">
                  <input
                    type="text"
                    value={form.installationAddress}
                    onChange={handleField('installationAddress')}
                    placeholder="Cra 10 #23-45"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Ciudad">
                  <input
                    type="text"
                    value={form.installationCity}
                    onChange={handleField('installationCity')}
                    placeholder="Bogotá"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Departamento">
                  <input
                    type="text"
                    value={form.installationDepartment}
                    onChange={handleField('installationDepartment')}
                    placeholder="Cundinamarca"
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Código postal">
                  <input
                    type="text"
                    value={form.installationPostalCode}
                    onChange={handleField('installationPostalCode')}
                    placeholder="110111"
                    className={inputCls}
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Notas de instalación">
                    <textarea
                      value={form.installationNotes}
                      onChange={handleField('installationNotes')}
                      rows={2}
                      placeholder="Instrucciones de acceso, referencias, etc."
                      className={[inputCls, 'resize-none'].join(' ')}
                    />
                  </FormField>
                </div>
              </>
            )}
          </Section>

          {/* ── Facturación ───────────────────────────────────────────────── */}
          <Section icon={<CreditCard className="h-3.5 w-3.5" aria-hidden />} title="Facturación">
            {!isEditing ? (
              <>
                <DetailField label="Método de pago" value={contract.paymentMethod} />
                <DetailField label="Ciclo de facturación" value={contract.billingCycle} />
              </>
            ) : (
              <>
                <FormField label="Método de pago">
                  <select
                    value={form.paymentMethod}
                    onChange={handleField('paymentMethod')}
                    className={selectCls}
                  >
                    <option value="">— Sin especificar —</option>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Ciclo de facturación">
                  <select
                    value={form.billingCycle}
                    onChange={handleField('billingCycle')}
                    className={selectCls}
                  >
                    <option value="">— Sin especificar —</option>
                    {BILLING_CYCLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </>
            )}
          </Section>

          {/* ── Datos fiscales ────────────────────────────────────────────── */}
          {(contract.fiscalName ??
            contract.fiscalDocument ??
            contract.fiscalAddress ??
            isEditing) && (
            <Section
              icon={<Building2 className="h-3.5 w-3.5" aria-hidden />}
              title="Datos fiscales"
            >
              {!isEditing ? (
                <>
                  <DetailField label="Nombre fiscal" value={contract.fiscalName} />
                  <DetailField label="Documento fiscal" value={contract.fiscalDocument} />
                  {contract.fiscalAddress && (
                    <div className="sm:col-span-2">
                      <DetailField label="Dirección fiscal" value={contract.fiscalAddress} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <FormField label="Nombre fiscal">
                    <input
                      type="text"
                      value={form.fiscalName}
                      onChange={handleField('fiscalName')}
                      placeholder="Razón social o nombre"
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="Documento / NIT">
                    <input
                      type="text"
                      value={form.fiscalDocument}
                      onChange={handleField('fiscalDocument')}
                      placeholder="900.123.456-7"
                      className={inputCls}
                    />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="Dirección fiscal">
                      <input
                        type="text"
                        value={form.fiscalAddress}
                        onChange={handleField('fiscalAddress')}
                        placeholder="Dirección de facturación"
                        className={inputCls}
                      />
                    </FormField>
                  </div>
                </>
              )}
            </Section>
          )}

          {/* ── Metadatos ────────────────────────────────────────────────── */}
          {!isEditing && (
            <Section
              icon={<Calendar className="h-3.5 w-3.5" aria-hidden />}
              title="Información del contrato"
            >
              <DetailField label="Fecha de creación" value={createdDate} />
              {contract.startDate && (
                <DetailField
                  label="Fecha de inicio"
                  value={new Date(contract.startDate).toLocaleDateString('es-CO', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                />
              )}
              {contract.endDate && (
                <DetailField
                  label="Fecha de fin"
                  value={new Date(contract.endDate).toLocaleDateString('es-CO', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                />
              )}
              {contract.additionalProductIds.length > 0 && (
                <div className="sm:col-span-2">
                  <DetailField
                    label={`Productos adicionales (${contract.additionalProductIds.length})`}
                    value={contract.additionalProductIds.join(', ')}
                  />
                </div>
              )}
              {contract.additionalServiceIds.length > 0 && (
                <div className="sm:col-span-2">
                  <DetailField
                    label={`Servicios adicionales (${contract.additionalServiceIds.length})`}
                    value={contract.additionalServiceIds.join(', ')}
                  />
                </div>
              )}
            </Section>
          )}
        </div>

        {/* Footer con acciones */}
        <div className="border-t border-gray-100 px-6 py-4 dark:border-dark-border">
          {isEditing ? (
            /* Modo edición: guardar / cancelar */
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-surface dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-iwana-secondary-700 py-2.5 text-sm font-semibold text-white transition hover:bg-iwana-secondary-700/90 disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                Guardar cambios
              </button>
            </div>
          ) : (
            /* Modo lectura: editar + transiciones */
            <div className="space-y-3">
              {/* Transiciones de estado */}
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {actions.map(({ label, action, icon, variant }) => (
                    <button
                      key={action}
                      type="button"
                      disabled={transitioning}
                      onClick={() => handleTransition(action)}
                      className={ACTION_BTN[variant]}
                    >
                      {transitioning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        icon
                      )}
                      {label}
                    </button>
                  ))}
                  {contract.status === 'DRAFT' && onRemove && (
                    <button
                      type="button"
                      disabled={transitioning}
                      onClick={handleRemove}
                      className={ACTION_BTN.danger}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Eliminar borrador
                    </button>
                  )}
                </div>
              )}
              {/* Botón editar */}
              {contract.status !== 'ARCHIVED' && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:border-iwana-secondary-700 hover:text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface dark:text-gray-200"
                >
                  <Edit2 className="h-4 w-4" aria-hidden />
                  Editar contrato
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </ModalLayer>
  );
}
