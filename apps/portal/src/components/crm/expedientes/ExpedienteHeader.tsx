'use client';

import { Badge, ProgressMeter } from '@iwana/ui';
import { ArrowLeft, CalendarPlus, Radio, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getStatusMeta } from './expediente-ui';
import { ExpedienteStatus } from '@/lib/api-client';

interface DimensionProgress {
  label: string;
  value: number;
}

interface ExpedienteHeaderProps {
  fullName: string;
  status: ExpedienteStatus;
  overallProgress: number;
  subtitle?: string;
  dimensions?: DimensionProgress[];
  /** Metadata operativa permanente */
  createdAt?: string;
  createdBy?: string | null;
  acquisitionChannel?: string | null;
}

export function ExpedienteHeader({
  fullName,
  status,
  overallProgress,
  subtitle,
  dimensions,
  createdAt,
  createdBy,
  acquisitionChannel,
}: ExpedienteHeaderProps) {
  const router = useRouter();
  const statusMeta = getStatusMeta(status);

  return (
    <div className="bg-white rounded-[20px] p-6 shadow-[var(--shadow-iwana-soft)] border border-gray-100 dark:bg-dark-surface-2 dark:border-dark-border">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        {/* Info izquierda */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => router.push('/dashboard/crm/expedientes')}
            className="mb-2 flex items-center text-sm text-gray-500 hover:text-iwana-primary transition-colors font-medium"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Volver al listado
          </button>

          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-iwana-primary dark:text-white md:text-3xl">
              {fullName}
            </h1>
            <Badge
              variant={statusMeta.variant}
              className="rounded-full px-3 py-1 text-[10px] font-bold tracking-wide uppercase"
            >
              {statusMeta.label}
            </Badge>
          </div>

          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}

          {/* Metadata operativa inmutable — siempre visible */}
          {(createdAt || createdBy || acquisitionChannel) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {createdAt && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                  <CalendarPlus className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {new Date(createdAt).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                </span>
              )}
              {createdBy && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                  <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {createdBy}
                </span>
              )}
              {acquisitionChannel && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                  <Radio className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {acquisitionChannel}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Progreso derecha */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 px-5 py-4 dark:border-dark-border dark:bg-dark-surface-3 lg:min-w-[260px]">
          <ProgressMeter value={overallProgress} {...(dimensions ? { dimensions } : {})} />
        </div>
      </div>
    </div>
  );
}
