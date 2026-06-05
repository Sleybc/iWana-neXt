'use client';

import { Clock3, Wrench } from 'lucide-react';
import { cn } from '@iwana/ui';
import { SettingsSectionStatus } from '@iwana/shared';
import { SETTINGS_HUB_COPY } from './mod00-settings-labels';

interface SettingsUnavailableStateProps {
  title: string;
  description: string;
  status: SettingsSectionStatus;
  className?: string;
}

const statusCopy = {
  [SettingsSectionStatus.AVAILABLE]: {
    label: 'Disponible',
    icon: Wrench,
    tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  [SettingsSectionStatus.COMING_SOON]: {
    label: 'Próximamente',
    icon: Clock3,
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  [SettingsSectionStatus.NOT_CONFIGURED]: {
    label: 'No configurado',
    icon: Wrench,
    tone: 'bg-slate-200 text-slate-700 dark:bg-dark-surface-2 dark:text-slate-200',
  },
};

export function SettingsUnavailableState({
  title,
  description,
  status,
  className,
}: SettingsUnavailableStateProps) {
  const config = statusCopy[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-gray-200 bg-iwana-surface-soft/80 p-4 dark:border-dark-border dark:bg-dark-surface-3/80',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
              config.tone,
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden={true} />
            {config.label}
          </span>
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-white">{title}</p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2/80">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {SETTINGS_HUB_COPY.unavailableDescription}
        </p>
      </div>
    </div>
  );
}
