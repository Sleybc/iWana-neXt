'use client';

import { cloneElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit2,
  MapPin,
  PauseCircle,
  PlayCircle,
  Save,
  Trash2,
  X,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import { Badge, Button, Input, ModalLayer, Select, overlayEdgeClassName, cn } from '@iwana/ui';
import {
  CustomerSegment,
  PersonType,
  ServiceUsage,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';
import type { BillingCycleOption, Contract, ContractStatus } from '@/lib/api-client';
import { ApiError, contractsApi } from '@/lib/api-client';
import type { LifecycleAction } from '@iwana/shared';
import type { ContractUpdateInput } from '@iwana/shared';
import {
  PortalAlert,
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  portalFieldClassName,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { BillingCycleField } from './BillingCycleField';
import { useContractPlan } from './use-contract-plan';
import { ChangeContractPlanDialog, ContractPlanSummary } from './ChangeContractPlanDialog';
import { findBillingCycle, formatBillingDate } from './billing-cycle-ui';
import { PrivacyAnonymizedBadge } from '@/components/privacy/PrivacyAnonymizedBadge';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { ServicePointFields } from './CreateContractDialog';
import { stratumEvidenceUploadErrorMessage } from './stratum-evidence';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { CONTRACT_STATUS_META, formatContractAlias, formatLocationLabel } from './subscriber-ui';

// ── Constantes de UI ──────────────────────────────────────────────────────────

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
  billingCycleDay: string;
  fiscalName: string;
  fiscalDocument: string;
  fiscalAddress: string;
}

function buildEditForm(contract: Contract): EditForm {
  return {
    alias: contract.titularAnonymizedAt ? '' : contract.alias,
    installationAddress: contract.titularAnonymizedAt ? '' : (contract.installationAddress ?? ''),
    installationCity: contract.installationCity ?? '',
    installationDepartment: contract.installationDepartment ?? '',
    installationPostalCode: contract.titularAnonymizedAt
      ? ''
      : (contract.installationPostalCode ?? ''),
    installationNotes: contract.titularAnonymizedAt ? '' : (contract.installationNotes ?? ''),
    customerSegment: contract.customerSegment ?? '',
    paymentMethod: contract.paymentMethod ?? '',
    billingCycleDay: contract.billingCycleDay == null ? '' : String(contract.billingCycleDay),
    fiscalName: contract.titularAnonymizedAt ? '' : (contract.fiscalName ?? ''),
    fiscalDocument: contract.titularAnonymizedAt ? '' : (contract.fiscalDocument ?? ''),
    fiscalAddress: contract.titularAnonymizedAt ? '' : (contract.fiscalAddress ?? ''),
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContractDetailDrawerProps {
  contract: Contract;
  billingCycles?: BillingCycleOption[];
  billingCyclesLoading?: boolean;
  billingCyclesError?: boolean;
  onRetryBillingCycles?: () => void;
  personType?: PersonType;
  customerSegment?: CustomerSegment;
  privacyRestricted?: boolean;
  anonymizedRequestId?: string | null;
  canReadPrivacy?: boolean;
  onClose: () => void;
  onReload: () => Promise<void>;
  onContractUpdated?: (contract: Contract) => void;
  onOpenLifecycle?: (action: LifecycleAction, contractId: string) => void;
  onActivate?: (contract: Contract) => void;
  onRemove?: (id: string) => Promise<void>;
}

/**
 * Props del detalle en página (spec MOD05 UISP §3 E): mismo estado y acciones que el
 * panel lateral; solo cambia la composición. `onClose` no aplica: la página no se cierra.
 */
export interface ContractDetailViewProps extends Omit<ContractDetailDrawerProps, 'onClose'> {
  layout: 'drawer' | 'page';
  onClose?: () => void;
  /** Página: acción de la cabecera (volver a los servicios del suscriptor). */
  pageBackAction?: ReactNode;
  /** Página: mapa del punto de servicio dentro de «Servicio e instalación». */
  installationMap?: ReactNode;
  /** Página: bloques extra al final de la columna derecha (aprovisionamiento). */
  pageAside?: ReactNode;
}

// ── Subcomponente campo de detalle ────────────────────────────────────────────

function DetailField({
  label,
  value,
  emptyValue,
}: {
  label: string;
  value: string | null | undefined;
  emptyValue?: string | undefined;
}) {
  if (!value && !emptyValue) return null;
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">
        {privacyDisplayValue(value, { emptyValue })}
      </p>
    </div>
  );
}

// ── Subcomponente sección ─────────────────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  /** Solo lo usa la variante densa: en edición el cuerpo pasa a rejilla de campos. */
  editing?: boolean;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <section className="border-b border-gray-100 pb-5 last:border-0 dark:border-dark-border">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        {icon}
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

// ── Variante densa para la página (spec MOD05 UISP §8) ──────────────────────

function DenseSection({ title, editing = false, children }: SectionProps) {
  return (
    <PortalPanel as="section" labelled density="dense" title={title}>
      <div
        className={
          editing
            ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
            : 'divide-y divide-gray-100 dark:divide-dark-border'
        }
      >
        {children}
      </div>
    </PortalPanel>
  );
}

function DenseDetailField({
  label,
  value,
  emptyValue,
}: {
  label: string;
  value: string | null | undefined;
  emptyValue?: string | undefined;
}) {
  if (!value && !emptyValue) return null;
  return (
    <PortalFieldList>
      <PortalFieldRow label={label}>{privacyDisplayValue(value, { emptyValue })}</PortalFieldRow>
    </PortalFieldList>
  );
}

// ── Campo de formulario en modo edición ───────────────────────────────────────

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}

const inputCls = portalFieldClassName;

function vatTreatmentLabel(treatment: VatTreatment): string {
  switch (treatment) {
    case VatTreatment.EXEMPT:
      return 'Exento';
    case VatTreatment.EXCLUDED:
      return 'Excluido';
    default:
      return 'Gravado';
  }
}

function vatLegalBasisLabel(basis: VatLegalBasis): string {
  switch (basis) {
    case VatLegalBasis.ET_481_H:
      return 'Estatuto Tributario, artículo 481, literal h';
    case VatLegalBasis.ET_476_7:
      return 'Estatuto Tributario, artículo 476, numeral 7';
    default:
      return 'Estatuto Tributario, artículo 468';
  }
}

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

export function ContractDetailDrawer(props: ContractDetailDrawerProps) {
  return <ContractDetailView layout="drawer" {...props} />;
}

/** Estado y acciones del contrato, compuestos como panel lateral o como página. */
export function ContractDetailView({
  layout,
  pageBackAction,
  installationMap,
  pageAside,
  contract,
  billingCycles = [],
  billingCyclesLoading = false,
  billingCyclesError = false,
  onRetryBillingCycles,
  personType = PersonType.NATURAL,
  customerSegment = CustomerSegment.RESIDENTIAL,
  privacyRestricted = false,
  anonymizedRequestId,
  canReadPrivacy = false,
  onClose = () => undefined,
  onReload,
  onContractUpdated,
  onOpenLifecycle = () => undefined,
  onActivate,
  onRemove,
}: ContractDetailViewProps) {
  const isPage = layout === 'page';
  const [changingPlan, setChangingPlan] = useState(false);
  // La secuencia remonta el texto dentro de la región viva: un segundo éxito con
  // el mismo mensaje también se anuncia (el texto por sí solo no cambiaría).
  const [announcement, setAnnouncement] = useState({ text: '', sequence: 0 });
  const announce = (text: string) =>
    setAnnouncement((previous) => ({ text, sequence: previous.sequence + 1 }));
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingServicePoint, setIsEditingServicePoint] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  // Estos diálogos se montan/desmontan desde el padre, así que su apertura es su
  // propia presencia: se difunde `true` mientras vivan y el hook libera el estado
  // al desmontar. Sin esto el chrome queda bajo el velo pero NO inerte y el foco
  // escapa (mismo defecto que M9 corrigió en `PortalSidePeek`).
  usePortalModalDrawerBroadcast(!isPage);

  const [form, setForm] = useState<EditForm>(() => buildEditForm(contract));
  const [serviceUsage, setServiceUsage] = useState<ServiceUsage | ''>(contract.serviceUsage ?? '');
  const [installationStratum, setInstallationStratum] = useState(
    contract.installationStratum?.toString() ?? '',
  );
  const [hasStratumEvidence, setHasStratumEvidence] = useState(
    Boolean(contract.stratumEvidenceMediaId),
  );
  const [pendingEvidenceFile, setPendingEvidenceFile] = useState<File | null>(null);
  const [evidenceUploadError, setEvidenceUploadError] = useState<string | null>(null);
  const [servicePointError, setServicePointError] = useState<string | null>(null);
  const [serviceUsageError, setServiceUsageError] = useState<string | undefined>();
  const [stratumError, setStratumError] = useState<string | undefined>();
  const [currentContract, setCurrentContract] = useState(contract);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<{
    title: string;
    description: string;
    action?: 'close';
  } | null>(null);

  // La página recibe el contrato recargado del padre tras una acción (archivar,
  // ciclo de vida, activación); fuera de edición, el estado local lo adopta.
  useEffect(() => {
    if (isEditing || isEditingServicePoint) return;
    setCurrentContract(contract);
    setHasStratumEvidence(Boolean(contract.stratumEvidenceMediaId));
    // Solo cuando cambia el contrato recibido; el modo de edición no debe reiniciarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  const statusMeta = CONTRACT_STATUS_META[contract.status];
  const plan = useContractPlan(currentContract);
  const { priceFromCatalog } = plan;
  const originalForm = buildEditForm(currentContract);
  const hasPendingChanges =
    (Object.keys(form) as (keyof EditForm)[]).some((key) => form[key] !== originalForm[key]) ||
    serviceUsage !== (currentContract.serviceUsage ?? '') ||
    installationStratum !== (currentContract.installationStratum?.toString() ?? '') ||
    pendingEvidenceFile !== null;
  const planEligible = currentContract.status === 'DRAFT' || currentContract.status === 'ACTIVE';
  const editedCycle = findBillingCycle(
    billingCycles,
    form.billingCycleDay ? Number(form.billingCycleDay) : null,
  );
  const currentCycle = findBillingCycle(billingCycles, currentContract.billingCycleDay);

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

  // El primer campo inválido del punto de servicio recibe el foco; los selects
  // del DS exponen el trigger con este id.
  const focusServiceField = (field: 'usage' | 'stratum') => {
    (isPage ? pageRef : panelRef).current
      ?.querySelector<HTMLElement>(`#contract-${field}`)
      ?.focus();
  };

  const handleSave = async () => {
    setServiceUsageError(undefined);
    setStratumError(undefined);
    setSaveError(null);
    const nextStratum =
      serviceUsage === ServiceUsage.RESIDENTIAL && installationStratum
        ? Number(installationStratum)
        : null;
    const servicePointChanged =
      serviceUsage !== (currentContract.serviceUsage ?? '') ||
      nextStratum !== currentContract.installationStratum;
    if (
      contract.status === 'DRAFT' &&
      servicePointChanged &&
      serviceUsage === ServiceUsage.RESIDENTIAL &&
      !installationStratum
    ) {
      setStratumError('Selecciona el estrato del predio de instalación.');
      focusServiceField('stratum');
      setSaveError('Selecciona el estrato del predio de instalación.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setEvidenceUploadError(null);
    try {
      const payload: ContractUpdateInput = {
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
        ...(form.billingCycleDay ? { billingCycleDay: Number(form.billingCycleDay) } : {}),
        ...(form.fiscalName !== undefined ? { fiscalName: form.fiscalName } : {}),
        ...(form.fiscalDocument !== undefined ? { fiscalDocument: form.fiscalDocument } : {}),
        ...(form.fiscalAddress !== undefined ? { fiscalAddress: form.fiscalAddress } : {}),
        ...(contract.status === 'DRAFT' && servicePointChanged && serviceUsage
          ? {
              serviceUsage,
              installationStratum:
                serviceUsage === ServiceUsage.RESIDENTIAL ? Number(installationStratum) : null,
            }
          : {}),
      };
      const changedPayload = Object.fromEntries(
        Object.entries(payload).filter(([key, value]) => {
          const previous = currentContract[key as keyof Contract];
          return value !== (typeof value === 'string' ? (previous ?? '') : previous);
        }),
      ) as ContractUpdateInput;
      let updatedContract = await contractsApi.update(contract.id, changedPayload);
      setCurrentContract(updatedContract);
      onContractUpdated?.(updatedContract);
      if (pendingEvidenceFile) {
        try {
          updatedContract = await contractsApi.uploadStratumEvidence(
            contract.id,
            pendingEvidenceFile,
          );
        } catch (uploadError) {
          // El contrato ya quedó actualizado; la edición sigue abierta para reintentar la carga.
          setEvidenceUploadError(stratumEvidenceUploadErrorMessage(uploadError));
          return;
        }
        setCurrentContract(updatedContract);
        onContractUpdated?.(updatedContract);
        setHasStratumEvidence(Boolean(updatedContract.stratumEvidenceMediaId));
        setPendingEvidenceFile(null);
      }
      setIsEditing(false);
      announce('Cambios guardados');
      setForm(buildEditForm(updatedContract));
      await onReload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const detail = `${err.message} ${JSON.stringify(err.details ?? '')}`.toLowerCase();
        if (detail.includes('installationstratum')) {
          setStratumError('Revisa el estrato del predio de instalación.');
          setSaveError('Revisa el estrato del predio de instalación.');
          focusServiceField('stratum');
        } else if (detail.includes('serviceusage')) {
          setServiceUsageError('Selecciona el uso del servicio para continuar.');
          setSaveError('Selecciona el uso del servicio para continuar.');
          focusServiceField('usage');
        } else {
          setSaveError(err.message);
        }
      } else {
        setSaveError(err instanceof ApiError ? err.message : 'Error al guardar cambios.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm(buildEditForm(currentContract));
    setServiceUsage(currentContract.serviceUsage ?? '');
    setInstallationStratum(currentContract.installationStratum?.toString() ?? '');
    setHasStratumEvidence(Boolean(currentContract.stratumEvidenceMediaId));
    setPendingEvidenceFile(null);
    setEvidenceUploadError(null);
    setIsEditing(false);
    setSaveError(null);
    setServiceUsageError(undefined);
    setStratumError(undefined);
  };

  const handleSaveServicePoint = async () => {
    setServiceUsageError(undefined);
    setStratumError(undefined);
    if (!serviceUsage) {
      setServiceUsageError('Selecciona el uso del servicio para actualizar el contrato.');
      focusServiceField('usage');
      return;
    }
    if (serviceUsage === ServiceUsage.RESIDENTIAL && !installationStratum) {
      setStratumError('Selecciona el estrato del predio de instalación.');
      focusServiceField('stratum');
      return;
    }

    setSaving(true);
    setServicePointError(null);
    setEvidenceUploadError(null);
    try {
      let updatedContract = await contractsApi.updateServicePoint(contract.id, {
        serviceUsage,
        installationStratum:
          serviceUsage === ServiceUsage.RESIDENTIAL ? Number(installationStratum) : null,
      });
      setCurrentContract(updatedContract);
      if (pendingEvidenceFile) {
        try {
          updatedContract = await contractsApi.uploadStratumEvidence(
            contract.id,
            pendingEvidenceFile,
          );
        } catch (uploadError) {
          // El punto de servicio ya se recalculó; el formulario queda abierto para reintentar la carga.
          setEvidenceUploadError(stratumEvidenceUploadErrorMessage(uploadError));
          return;
        }
        setCurrentContract(updatedContract);
        setPendingEvidenceFile(null);
      }
      setServiceUsage(updatedContract.serviceUsage ?? '');
      setInstallationStratum(updatedContract.installationStratum?.toString() ?? '');
      setHasStratumEvidence(Boolean(updatedContract.stratumEvidenceMediaId));
      setIsEditingServicePoint(false);
      await onReload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const detail = `${err.message} ${JSON.stringify(err.details ?? '')}`.toLowerCase();
        if (detail.includes('installationstratum')) {
          setStratumError('Revisa el estrato del predio de instalación.');
          focusServiceField('stratum');
        } else if (detail.includes('serviceusage')) {
          setServiceUsageError('Selecciona el uso del servicio para continuar.');
          focusServiceField('usage');
        } else {
          setServicePointError(err.message);
        }
      } else {
        setServicePointError(
          err instanceof ApiError ? err.message : 'No se pudo actualizar el punto de servicio.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancelServicePoint = () => {
    setServiceUsage(currentContract.serviceUsage ?? '');
    setInstallationStratum(currentContract.installationStratum?.toString() ?? '');
    setHasStratumEvidence(Boolean(currentContract.stratumEvidenceMediaId));
    setPendingEvidenceFile(null);
    setEvidenceUploadError(null);
    setIsEditingServicePoint(false);
    setServicePointError(null);
    setServiceUsageError(undefined);
    setStratumError(undefined);
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
  usePortalSideDrawerA11y(
    !isPage,
    panelRef,
    isEditing ? handleCancelEdit : isEditingServicePoint ? handleCancelServicePoint : onClose,
  );

  // ── Transiciones de estado ───────────────────────────────────────────────

  const handleTransition = async (action: TransitionAction) => {
    if (action === 'activate') {
      onActivate?.(contract);
      return;
    }
    if (action === 'suspend' || action === 'reactivate' || action === 'terminate') {
      onClose();
      onOpenLifecycle(
        action === 'suspend' ? 'SUSPEND' : action === 'reactivate' ? 'REACTIVATE' : 'TERMINATE',
        contract.id,
      );
      return;
    }
    setTransitioning(true);
    setTransitionError(null);
    try {
      await contractsApi[action](contract.id);
      await onReload();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'SUBSCRIBER_CANCELLED') {
        setTransitionError({
          title: 'No puedes crear ni activar servicios',
          description: 'No puedes crear ni activar servicios para un suscriptor cancelado.',
          action: 'close',
        });
      } else {
        setTransitionError({
          title: 'No fue posible cambiar el servicio',
          description: err instanceof ApiError ? err.message : 'Error al cambiar estado.',
        });
      }
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
  const SectionC = isPage ? DenseSection : Section;
  const FieldC = isPage ? DenseDetailField : DetailField;
  const isEditingAny = isEditing || isEditingServicePoint;
  const contractTitle = privacyDisplayValue(
    privacyRestricted || currentContract.titularAnonymizedAt
      ? null
      : formatContractAlias(contract.alias) || null,
    {
      privacyRestricted,
      anonymizedAt: currentContract.titularAnonymizedAt,
    },
  );

  // ── Bloques compartidos por el panel lateral y la página ──────────────────

  const transitionErrorAlert = transitionError && (
    <PortalAlert
      variant="error"
      live="assertive"
      title={transitionError.title}
      description={transitionError.description}
      action={
        transitionError.action ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={() => setTransitionError(null)}
          >
            Cerrar
          </Button>
        ) : undefined
      }
    />
  );

  const planSection = (
    <SectionC
      editing={isEditing}
      icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
      title="Plan contratado"
    >
      <div className="sm:col-span-2">
        <ContractPlanSummary plan={plan} />
        {priceFromCatalog ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">Precio actual del plan</p>
        ) : null}
      </div>
      {isEditing ? (
        <div className="space-y-2 sm:col-span-2">
          <Button
            variant="secondary"
            disabled={!planEligible || hasPendingChanges || saving}
            onClick={() => setChangingPlan(true)}
          >
            Cambiar plan
          </Button>
          {hasPendingChanges ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Guarda o cancela los cambios pendientes antes de cambiar el plan.
            </p>
          ) : null}
          {!planEligible ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Solo puedes cambiar el plan de un contrato en borrador o activo.
            </p>
          ) : null}
        </div>
      ) : null}
      {!isEditing && (
        <>
          <FieldC
            label="Segmento"
            value={
              contract.customerSegment
                ? (SEGMENT_LABELS[contract.customerSegment] ?? contract.customerSegment)
                : null
            }
          />
          <FieldC label="Creado" value={createdDate} />
        </>
      )}
      {isEditing && (
        <Select
          label="Segmento del cliente"
          value={form.customerSegment}
          onChange={handleField('customerSegment')}
        >
          <option value="">— Sin especificar —</option>
          {Object.entries(SEGMENT_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </Select>
      )}
    </SectionC>
  );

  const installationSection = (
    <SectionC
      editing={isEditing}
      icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
      title="Servicio e instalación"
    >
      {!isEditing ? (
        <>
          <FieldC
            label="Alias"
            value={
              currentContract.titularAnonymizedAt
                ? null
                : privacyDisplayValue(contract.alias, {
                    anonymizedAt: currentContract.titularAnonymizedAt,
                  })
            }
            emptyValue={currentContract.titularAnonymizedAt ? 'Anonimizado' : undefined}
          />
          <FieldC
            label="Dirección"
            value={currentContract.titularAnonymizedAt ? null : contract.installationAddress}
            emptyValue={currentContract.titularAnonymizedAt ? 'Anonimizado' : undefined}
          />
          <FieldC label="Ciudad" value={formatLocationLabel(contract.installationCity)} />
          <FieldC
            label="Departamento"
            value={formatLocationLabel(contract.installationDepartment)}
          />
          <FieldC
            label="Código postal"
            value={currentContract.titularAnonymizedAt ? null : contract.installationPostalCode}
            emptyValue={currentContract.titularAnonymizedAt ? 'Anonimizado' : undefined}
          />
          {(contract.installationNotes || currentContract.titularAnonymizedAt) && (
            <div className="sm:col-span-2">
              <FieldC
                label="Notas de instalación"
                value={currentContract.titularAnonymizedAt ? null : contract.installationNotes}
                emptyValue={currentContract.titularAnonymizedAt ? 'Anonimizado' : undefined}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <Input
            label="Alias del servicio"
            type="text"
            value={form.alias}
            onChange={handleField('alias')}
            readOnly={Boolean(currentContract.titularAnonymizedAt)}
            placeholder={currentContract.titularAnonymizedAt ? 'Anonimizado' : 'Alias del servicio'}
            className={inputCls}
          />
          <div className="sm:col-span-2">
            <Input
              label="Dirección de instalación"
              type="text"
              value={form.installationAddress}
              onChange={handleField('installationAddress')}
              readOnly={Boolean(currentContract.titularAnonymizedAt)}
              placeholder={
                currentContract.titularAnonymizedAt ? 'Anonimizado' : 'Dirección de instalación'
              }
              className={inputCls}
            />
          </div>
          <Input
            label="Ciudad"
            type="text"
            value={form.installationCity}
            onChange={handleField('installationCity')}
            placeholder="Bogotá"
            className={inputCls}
          />
          <Input
            label="Departamento"
            type="text"
            value={form.installationDepartment}
            onChange={handleField('installationDepartment')}
            placeholder="Cundinamarca"
            className={inputCls}
          />
          <Input
            label="Código postal"
            type="text"
            value={form.installationPostalCode}
            onChange={handleField('installationPostalCode')}
            readOnly={Boolean(currentContract.titularAnonymizedAt)}
            placeholder={currentContract.titularAnonymizedAt ? 'Anonimizado' : 'Código postal'}
            className={inputCls}
          />
          <div className="sm:col-span-2">
            <FormField label="Notas de instalación">
              <textarea
                value={form.installationNotes}
                onChange={handleField('installationNotes')}
                readOnly={Boolean(currentContract.titularAnonymizedAt)}
                rows={2}
                placeholder={
                  currentContract.titularAnonymizedAt
                    ? 'Anonimizado'
                    : 'Instrucciones de acceso, referencias, etc.'
                }
                className={[inputCls, 'resize-none'].join(' ')}
              />
            </FormField>
          </div>
        </>
      )}
      {isPage && !isEditing && installationMap ? (
        <div className="pt-3">{installationMap}</div>
      ) : null}
    </SectionC>
  );

  const billingSection = (
    <SectionC
      editing={isEditing}
      icon={<CreditCard className="h-3.5 w-3.5" aria-hidden />}
      title="Facturación"
    >
      {!isEditing ? (
        <>
          <FieldC label="Método de pago" value={contract.paymentMethod} />
          {currentContract.status === 'ACTIVE' ? (
            currentContract.billingCycleDay == null ? (
              <FieldC label="Ciclo de facturación" value="Sin ciclo de facturación" />
            ) : (
              <>
                <FieldC
                  label="Ciclo de facturación"
                  value={`Ciclo: día ${currentContract.billingCycleDay}`}
                />
                <FieldC
                  label="Próximo corte"
                  value={
                    currentCycle
                      ? formatBillingDate(currentCycle.nextCutoffDate)
                      : billingCyclesLoading
                        ? 'Cargando fecha…'
                        : 'No disponible'
                  }
                />
              </>
            )
          ) : (
            <FieldC
              label="Ciclo de facturación"
              value={
                currentContract.billingCycleDay == null
                  ? 'Sin asignar'
                  : `Día ${currentContract.billingCycleDay}`
              }
            />
          )}
          {currentContract.billingCycle ? (
            <div className="sm:col-span-2">
              <FieldC label="Dato anterior de facturación" value={currentContract.billingCycle} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Este dato no asigna un ciclo.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Select
            label="Método de pago"
            value={form.paymentMethod}
            onChange={handleField('paymentMethod')}
          >
            <option value="">— Sin especificar —</option>
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <BillingCycleField
            cycles={billingCycles}
            value={form.billingCycleDay}
            onChange={(value) => setForm((current) => ({ ...current, billingCycleDay: value }))}
            loading={billingCyclesLoading}
            catalogError={billingCyclesError}
            onRetry={onRetryBillingCycles}
            disabled={saving}
            allowUnassigned={currentContract.billingCycleDay == null}
            id="edit-contract-billing-cycle"
          />
          {currentContract.status === 'ACTIVE' ? (
            form.billingCycleDay ? (
              <>
                <FieldC label="Ciclo de facturación" value={`Ciclo: día ${form.billingCycleDay}`} />
                <FieldC
                  label="Próximo corte"
                  value={
                    editedCycle ? formatBillingDate(editedCycle.nextCutoffDate) : 'No disponible'
                  }
                />
              </>
            ) : (
              <FieldC label="Ciclo de facturación" value="Sin ciclo de facturación" />
            )
          ) : null}
          {currentContract.billingCycle ? (
            <div className="sm:col-span-2">
              <FieldC label="Dato anterior de facturación" value={currentContract.billingCycle} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Este dato no asigna un ciclo.
              </p>
            </div>
          ) : null}
        </>
      )}
    </SectionC>
  );

  const servicePointSection = (
    <SectionC
      editing={isEditingServicePoint || (isEditing && contract.status === 'DRAFT')}
      icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
      title="Punto de servicio"
    >
      {isEditingServicePoint || (isEditing && contract.status === 'DRAFT') ? (
        <div className="sm:col-span-2 space-y-3">
          <ServicePointFields
            fieldIdPrefix="contract"
            personType={personType}
            serviceUsage={serviceUsage}
            onServiceUsageChange={(value) => {
              setServiceUsage(value);
              setServiceUsageError(undefined);
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
            {...(evidenceUploadError ? { uploadErrorMessage: evidenceUploadError } : {})}
            onRemoveEvidence={async () => {
              const updated = await contractsApi.deleteStratumEvidence(contract.id);
              setCurrentContract(updated);
              setHasStratumEvidence(Boolean(updated.stratumEvidenceMediaId));
              setPendingEvidenceFile(null);
              await onReload();
            }}
            {...(serviceUsageError ? { usageError: serviceUsageError } : {})}
            {...(stratumError ? { stratumError } : {})}
            disabled={saving}
          />
          {servicePointError ? (
            <PortalAlert
              variant="error"
              title="No fue posible actualizar el punto de servicio"
              description={servicePointError}
            />
          ) : null}
        </div>
      ) : (
        <>
          <FieldC
            label="Uso del servicio"
            value={
              currentContract.serviceUsage === ServiceUsage.RESIDENTIAL
                ? 'Residencial'
                : currentContract.serviceUsage === ServiceUsage.NON_RESIDENTIAL
                  ? 'No residencial'
                  : 'Pendiente de definir'
            }
          />
          {currentContract.serviceUsage === ServiceUsage.RESIDENTIAL ? (
            <FieldC
              label="Estrato del predio de instalación"
              value={
                currentContract.installationStratum != null
                  ? `Estrato ${currentContract.installationStratum}`
                  : 'Pendiente de definir'
              }
            />
          ) : null}
          {hasStratumEvidence ? (
            <FieldC label="Soporte del estrato" value="Soporte cargado" />
          ) : null}
          {contract.status === 'ACTIVE' ? (
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setServiceUsage(currentContract.serviceUsage ?? '');
                  setInstallationStratum(currentContract.installationStratum?.toString() ?? '');
                  setHasStratumEvidence(Boolean(currentContract.stratumEvidenceMediaId));
                  setPendingEvidenceFile(null);
                  setEvidenceUploadError(null);
                  setIsEditingServicePoint(true);
                }}
                className={cn(
                  'min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-iwana-secondary-700 transition hover:border-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface dark:text-iwana-secondary-300',
                  interactiveFocusClassName,
                )}
              >
                Actualizar punto de servicio
              </button>
            </div>
          ) : null}
        </>
      )}
    </SectionC>
  );

  const vatSection = (
    <SectionC
      editing={false}
      icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
      title="IVA del contrato"
    >
      {currentContract.vatSnapshot ? (
        <>
          <FieldC
            label="Tratamiento y tarifa"
            value={`${vatTreatmentLabel(currentContract.vatSnapshot.treatment)} · ${currentContract.vatSnapshot.ratePercent} %`}
          />
          <FieldC
            label="Fundamento"
            value={vatLegalBasisLabel(currentContract.vatSnapshot.legalBasis)}
          />
          {currentContract.vatSnapshot.resolvedAt ? (
            <FieldC
              label="Fecha de cálculo"
              value={`Calculado el ${new Date(currentContract.vatSnapshot.resolvedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`}
            />
          ) : null}
          {currentContract.vatSnapshot.requiresAccountantReview ? (
            <div className="sm:col-span-2">
              <PortalAlert
                variant="warning"
                title="Este concepto requiere revisión del contador."
                live="off"
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="sm:col-span-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {currentContract.status === 'DRAFT'
              ? 'El cálculo de IVA estará disponible cuando se active el contrato.'
              : 'El cálculo de IVA no está disponible para este contrato.'}
          </p>
        </div>
      )}
    </SectionC>
  );

  const fiscalSection = Boolean(
    contract.fiscalName ||
    contract.fiscalDocument ||
    contract.fiscalAddress ||
    (isEditing && personType !== PersonType.NATURAL) ||
    currentContract.titularAnonymizedAt,
  ) && (
    <SectionC
      editing={isEditing}
      icon={<Building2 className="h-3.5 w-3.5" aria-hidden />}
      title="Datos fiscales"
    >
      {!isEditing ? (
        <>
          <FieldC
            label="Nombre fiscal"
            value={currentContract.titularAnonymizedAt ? null : contract.fiscalName}
            emptyValue={currentContract.titularAnonymizedAt ? 'Anonimizado' : undefined}
          />
          <FieldC
            label="Documento fiscal"
            value={currentContract.titularAnonymizedAt ? null : contract.fiscalDocument}
            emptyValue={currentContract.titularAnonymizedAt ? 'Anonimizado' : undefined}
          />
          {(contract.fiscalAddress || currentContract.titularAnonymizedAt) && (
            <div className="sm:col-span-2">
              <FieldC
                label="Dirección fiscal"
                value={currentContract.titularAnonymizedAt ? null : contract.fiscalAddress}
                emptyValue={currentContract.titularAnonymizedAt ? 'Anonimizado' : undefined}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <Input
            label="Nombre fiscal"
            type="text"
            value={form.fiscalName}
            onChange={handleField('fiscalName')}
            readOnly={Boolean(currentContract.titularAnonymizedAt)}
            placeholder={
              currentContract.titularAnonymizedAt ? 'Anonimizado' : 'Razón social o nombre'
            }
            className={inputCls}
          />
          <Input
            label="Documento / NIT"
            type="text"
            value={form.fiscalDocument}
            onChange={handleField('fiscalDocument')}
            readOnly={Boolean(currentContract.titularAnonymizedAt)}
            placeholder={currentContract.titularAnonymizedAt ? 'Anonimizado' : 'Documento fiscal'}
            className={inputCls}
          />
          <div className="sm:col-span-2">
            <Input
              label="Dirección fiscal"
              type="text"
              value={form.fiscalAddress}
              onChange={handleField('fiscalAddress')}
              readOnly={Boolean(currentContract.titularAnonymizedAt)}
              placeholder={
                currentContract.titularAnonymizedAt ? 'Anonimizado' : 'Dirección de facturación'
              }
              className={inputCls}
            />
          </div>
        </>
      )}
    </SectionC>
  );

  const metaSection = !isEditing && (
    <SectionC
      editing={false}
      icon={<Calendar className="h-3.5 w-3.5" aria-hidden />}
      title="Información del contrato"
    >
      <FieldC label="Fecha de creación" value={createdDate} />
      {contract.startDate && (
        <FieldC
          label="Fecha de inicio"
          value={new Date(contract.startDate).toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        />
      )}
      {contract.endDate && (
        <FieldC
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
          <FieldC
            label={`Productos adicionales (${contract.additionalProductIds.length})`}
            value={contract.additionalProductIds.join(', ')}
          />
        </div>
      )}
      {contract.additionalServiceIds.length > 0 && (
        <div className="sm:col-span-2">
          <FieldC
            label={`Servicios adicionales (${contract.additionalServiceIds.length})`}
            value={contract.additionalServiceIds.join(', ')}
          />
        </div>
      )}
    </SectionC>
  );

  const saveErrorAlert = saveError ? (
    <div className="mb-3">
      <PortalAlert
        variant="error"
        live="assertive"
        title="No fue posible guardar los cambios"
        description={saveError}
      />
    </div>
  ) : null;

  const footerActions =
    isEditing || isEditingServicePoint ? (
      /* Modo edición: guardar / cancelar */
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isEditingServicePoint ? handleCancelServicePoint : handleCancelEdit}
          disabled={saving}
          className={cn(
            interactiveFocusClassName,
            'min-h-11 flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 dark:border-dark-border dark:bg-dark-surface dark:text-gray-300',
          )}
        >
          Cancelar
        </button>
        <Button
          loading={saving}
          type="button"
          onClick={isEditingServicePoint ? handleSaveServicePoint : handleSave}
          disabled={saving}
          className="min-h-11 flex-1"
        >
          {!saving && <Save className="h-4 w-4" aria-hidden />}
          {isEditingServicePoint ? 'Actualizar punto de servicio' : 'Guardar cambios'}
        </Button>
      </div>
    ) : (
      /* Modo lectura: editar + transiciones */
      <div className="space-y-3">
        {/* Transiciones de estado */}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map(({ label, action, icon, variant }) => (
              <Button
                loading={transitioning}
                key={action}
                type="button"
                disabled={transitioning}
                onClick={() => handleTransition(action)}
                variant={variant === 'danger' ? 'softDestructive' : 'secondary'}
                className="min-h-11"
              >
                {!transitioning && icon}
                {label}
              </Button>
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
            onClick={() => {
              setForm(buildEditForm(currentContract));
              setIsEditing(true);
            }}
            className={cn(
              interactiveFocusClassName,
              'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 transition hover:border-iwana-secondary-700 hover:text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface dark:text-gray-200',
            )}
          >
            <Edit2 className="h-4 w-4" aria-hidden />
            Editar contrato
          </button>
        )}
      </div>
    );

  const announcer = (
    <p role="status" className="sr-only">
      <span key={announcement.sequence}>{announcement.text}</span>
    </p>
  );

  const planDialog = changingPlan ? (
    <ChangeContractPlanDialog
      contract={currentContract}
      customerSegment={currentContract.customerSegment ?? customerSegment}
      onClose={() => setChangingPlan(false)}
      onUpdated={(updated, changed) => {
        setCurrentContract(updated);
        setForm(buildEditForm(updated));
        setServiceUsage(updated.serviceUsage ?? '');
        setInstallationStratum(updated.installationStratum?.toString() ?? '');
        onContractUpdated?.(updated);
        announce(changed ? 'Plan actualizado' : 'Datos del contrato actualizados');
        void onReload().catch(() =>
          setSaveError('El contrato se actualizó, pero no fue posible refrescar la lista.'),
        );
      }}
    />
  ) : null;

  // ── Render en página (spec MOD05 UISP §3 E) ───────────────────────────────

  if (isPage) {
    return (
      <div className="space-y-4">
        {announcer}
        <div ref={pageRef} inert={changingPlan || undefined} className="space-y-4">
          <PageHeader
            title={contractTitle}
            subtitle={
              <span className="flex flex-wrap items-center gap-2">
                <span>Contrato de servicio</span>
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                <PrivacyAnonymizedBadge
                  anonymizedAt={currentContract.titularAnonymizedAt}
                  anonymizedRequestId={anonymizedRequestId}
                  canReadPrivacy={canReadPrivacy}
                />
              </span>
            }
            actions={pageBackAction}
          />
          {privacyRestricted ? (
            <PortalAlert
              variant="warning"
              title="Datos bloqueados"
              description="La información personal de este contrato no está disponible para este perfil."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
                <div className="flex min-w-0 flex-col gap-4">
                  <PortalPanel
                    as="section"
                    labelled
                    density="dense"
                    title="Estado del servicio"
                    titleAddon={<Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>}
                  >
                    <div className="space-y-3">
                      {transitionErrorAlert}
                      {saveErrorAlert}
                      {footerActions}
                    </div>
                  </PortalPanel>
                  {planSection}
                  {billingSection}
                  {servicePointSection}
                  {vatSection}
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  {installationSection}
                  {fiscalSection}
                  {metaSection}
                  {pageAside}
                </div>
              </div>
              {isEditingAny ? (
                <div className="flex justify-end">
                  <div className="w-full sm:max-w-md">{footerActions}</div>
                </div>
              ) : null}
            </>
          )}
        </div>
        {planDialog}
      </div>
    );
  }

  // ── Render en panel lateral ───────────────────────────────────────────────

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
    <ModalLayer align="end" {...(isEditingAny ? {} : { onVeilClick: onClose })}>
      {announcer}
      {/* Drawer */}
      <aside
        ref={panelRef}
        inert={changingPlan || undefined}
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
              {contractTitle}
            </h2>
            <PrivacyAnonymizedBadge
              anonymizedAt={currentContract.titularAnonymizedAt}
              anonymizedRequestId={anonymizedRequestId}
              canReadPrivacy={canReadPrivacy}
            />
          </div>
          {/* Badge estado */}
          <Badge variant={statusMeta.variant} className="shrink-0">
            {statusMeta.label}
          </Badge>
          {/* Botón cerrar */}
          <button
            type="button"
            onClick={
              isEditing
                ? handleCancelEdit
                : isEditingServicePoint
                  ? handleCancelServicePoint
                  : onClose
            }
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-border"
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {privacyRestricted ? (
            <PortalAlert
              variant="warning"
              title="Datos bloqueados"
              description="La información personal de este contrato no está disponible para este perfil."
            />
          ) : (
            <>
              {transitionErrorAlert}
              {planSection}
              {installationSection}
              {billingSection}
              {servicePointSection}
              {vatSection}
              {fiscalSection}
              {metaSection}
            </>
          )}
        </div>

        {/* Footer con acciones */}
        {!privacyRestricted && (
          <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4 dark:border-dark-border dark:bg-dark-surface-2">
            {saveErrorAlert}
            {footerActions}
          </div>
        )}
      </aside>
      {planDialog}
    </ModalLayer>
  );
}
