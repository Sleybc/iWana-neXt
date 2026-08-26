'use client';

import { Badge, ProgressMeter, cn } from '@iwana/ui';
import { ArrowLeft, CalendarPlus, Radio, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
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
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => router.push('/dashboard/crm/expedientes')}
            className={cn(
              'mb-2 flex items-center text-sm font-medium text-gray-500 transition-colors hover:text-iwana-primary',
              interactiveFocusClassName,
            )}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Volver a oportunidades
          </button>

          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white md:text-2xl">
              {fullName}
            </h2>
            <Badge
              variant={statusMeta.variant}
              className="rounded-full px-3 py-1 text-[10px] font-bold tracking-wide uppercase"
            >
              {statusMeta.label}
            </Badge>
          </div>

          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}

          {(createdAt || createdBy || acquisitionChannel) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {createdAt && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-400">
                  <CalendarPlus className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {new Date(createdAt).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                </span>
              )}
              {createdBy && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-400">
                  <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {createdBy}
                </span>
              )}
              {acquisitionChannel && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-400">
                  <Radio className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {acquisitionChannel}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 px-5 py-4 dark:border-dark-border dark:bg-dark-surface-3 lg:min-w-[260px]">
          <ProgressMeter value={overallProgress} {...(dimensions ? { dimensions } : {})} />
        </div>
      </div>
    </div>
  );
}
