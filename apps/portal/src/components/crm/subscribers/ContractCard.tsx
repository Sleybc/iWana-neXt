'use client';

import { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  MapPin,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { Contract, ContractStatus } from '@/lib/api-client';
import { formatLocationLabel } from './subscriber-ui';

// ── Colores y labels por estado ───────────────────────────────────────────────

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

// ── Acciones disponibles por estado ──────────────────────────────────────────

type TransitionAction = 'activate' | 'suspend' | 'reactivate' | 'terminate' | 'archive';

const ACTIONS_BY_STATUS: Record<
  ContractStatus,
  Array<{ label: string; action: TransitionAction; icon: React.ReactNode }>
> = {
  DRAFT: [
    {
      label: 'Activar',
      action: 'activate',
      icon: <PlayCircle className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  ACTIVE: [
    {
      label: 'Suspender',
      action: 'suspend',
      icon: <PauseCircle className="h-3.5 w-3.5" aria-hidden />,
    },
    {
      label: 'Terminar',
      action: 'terminate',
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  SUSPENDED: [
    {
      label: 'Reactivar',
      action: 'reactivate',
      icon: <PlayCircle className="h-3.5 w-3.5" aria-hidden />,
    },
    {
      label: 'Terminar',
      action: 'terminate',
      icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
    },
    {
      label: 'Archivar',
      action: 'archive',
      icon: <Archive className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  TERMINATED: [
    {
      label: 'Archivar',
      action: 'archive',
      icon: <Archive className="h-3.5 w-3.5" aria-hidden />,
    },
  ],
  ARCHIVED: [],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContractCardProps {
  contract: Contract;
  onTransition: (id: string, action: TransitionAction) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onViewDetail: (contract: Contract) => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ContractCard({
  contract,
  onTransition,
  onRemove,
  onViewDetail,
}: ContractCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const colors = STATUS_COLORS[contract.status];
  const actions = ACTIONS_BY_STATUS[contract.status];

  const handleAction = async (action: TransitionAction) => {
    setMenuOpen(false);
    setBusy(true);
    try {
      await onTransition(contract.id, action);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setMenuOpen(false);
    setBusy(true);
    try {
      await onRemove(contract.id);
    } finally {
      setBusy(false);
    }
  };

  // Nombre del plan desde snapshot
  const planName = (contract.planSnapshotJson?.name as string | undefined) ?? contract.planId;

  const locationLine = [
    formatLocationLabel(contract.installationCity),
    contract.installationAddress,
  ]
    .filter(Boolean)
    .join(' · ');

  const billingLine = [contract.paymentMethod, contract.billingCycle].filter(Boolean).join(' · ');

  const createdDate = new Date(contract.createdAt).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div
      className={[
        'relative rounded-[20px] border bg-white p-5 shadow-[var(--shadow-sm)] transition dark:bg-dark-surface-2',
        contract.status === 'ARCHIVED'
          ? 'border-gray-100 [&_p]:text-gray-500 dark:border-dark-border dark:[&_p]:text-gray-400'
          : 'border-gray-100 dark:border-dark-border',
      ].join(' ')}
    >
      {/* Cabecera */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Alias */}
          <p className="truncate font-semibold text-gray-900 dark:text-white">{contract.alias}</p>
          {/* Plan */}
          <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">{planName}</p>
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

        {/* Menú de acciones */}
        <div className="relative">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-dark-border dark:hover:text-gray-300"
            aria-label="Acciones del contrato"
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </button>

          {menuOpen && (
            <>
              {/*
                Cazador de clic exterior y menú comparten el escalón `--z-popover`
                (ADR-075 §2). El cazador NO es una capa visible: es una superficie
                transparente de captura, y por eso no reclama un escalón propio —
                sube al mismo que el menú al que sirve, exactamente como el velo y
                el panel comparten `--z-modal` en la gramática de capa única. Dentro
                de ese escalón el orden de documento decide: el menú va después, así
                que pinta encima.

                Sin z el cazador quedaba por debajo de cualquier hermano posicionado
                posterior con z > 0 y un clic sobre esa zona dejaba de cerrar el menú
                (el contrato implícito de orden de documento que el ADR vino a matar).
              */}
              <div
                className="fixed inset-0 z-(--z-popover)"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 top-9 z-(--z-popover) min-w-[160px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-dark-border dark:bg-dark-surface">
                {/* Acciones de transición */}
                {actions.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    onClick={() => void handleAction(a.action)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-dark-border"
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}

                {/* Separador + eliminar solo en DRAFT */}
                {contract.status === 'DRAFT' && (
                  <>
                    <div className="my-1 border-t border-gray-100 dark:border-dark-border" />
                    <button
                      type="button"
                      onClick={() => void handleRemove()}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Eliminar borrador
                    </button>
                  </>
                )}

                {/* Estado final sin acciones */}
                {actions.length === 0 && contract.status !== 'DRAFT' && (
                  <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-400">
                    Sin acciones disponibles
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detalles */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {locationLine && (
          <DetailLine icon={<MapPin className="h-3.5 w-3.5" />} text={locationLine} />
        )}
        {billingLine && (
          <DetailLine icon={<ChevronDown className="h-3.5 w-3.5" />} text={billingLine} />
        )}
        {contract.customerSegment && (
          <DetailLine
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            text={contract.customerSegment}
          />
        )}
      </div>

      {/* Fecha + acciones rápidas */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400 dark:text-gray-400">Creado {createdDate}</p>
        <button
          type="button"
          onClick={() => onViewDetail(contract)}
          className="text-xs font-medium text-iwana-secondary-700 transition hover:underline dark:text-iwana-secondary-300"
        >
          Ver detalle →
        </button>
      </div>
    </div>
  );
}

// ── Subcomponente línea de detalle ────────────────────────────────────────────

function DetailLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span className="shrink-0 text-gray-400 dark:text-gray-400">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}
