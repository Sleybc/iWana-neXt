'use client';

import { Clock3, Wrench } from 'lucide-react';
import { Badge, cn } from '@iwana/ui';
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
    variant: 'success',
  },
  [SettingsSectionStatus.COMING_SOON]: {
    label: 'Próximamente',
    icon: Clock3,
    variant: 'warning',
  },
  [SettingsSectionStatus.NOT_CONFIGURED]: {
    label: 'No configurado',
    icon: Wrench,
    variant: 'neutral',
  },
} satisfies Record<
  SettingsSectionStatus,
  { label: string; icon: typeof Wrench; variant: 'success' | 'warning' | 'neutral' }
>;

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
          <Badge variant={config.variant} className="gap-2">
            <Icon className="h-3.5 w-3.5" aria-hidden={true} />
            {config.label}
          </Badge>
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-white">{title}</p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
        {SETTINGS_HUB_COPY.unavailableDescription}
      </p>
    </div>
  );
}
